import { ICONS } from './icons.js';
import { C as TOKENS } from './colors.js';
import { drawHintBar } from './components/hint-bar.js';

/**
 * MokyaRenderer — LVGL-compatible Canvas Renderer
 *
 * All drawing functions use LVGL naming conventions so Phase 4
 * replacement with real LVGL WASM flush_cb is straightforward.
 *
 * Coordinate system: (0,0) = top-left, 240 × 320 logical pixels.
 *
 * LVGL equivalent mapping:
 *   drawLabel()     → lv_label_set_text()  + lv_obj_set_pos()
 *   drawBtn()       → lv_btn_create()      + lv_label
 *   drawCard()      → lv_obj_create()      with style radius/bg
 *   drawBar()       → lv_bar_create()
 *   drawLineChart() → lv_chart_create()
 *   drawStatusBar() → custom lv_obj header
 *   drawTabBar()    → lv_tabview equivalent
 *
 * Phase 4: replace body of each function with lv_xxx() WASM calls,
 * keeping the JS signature identical.
 */

export class MokyaRenderer {
  /** @param {import('../hal/display-hal.js').DisplayHAL} display */
  constructor(display) {
    this.d   = display;
    this.ctx = display.getContext();
    this.W   = display.WIDTH;   // 240
    this.H   = display.HEIGHT;  // 320

    // ── Color palette ───────────────────────────────────────────
    // 對齊 doc/ui/00-design-charter.md 全域配色 token。舊 key 名稱
    // (BG/SURFACE/GREEN…)保留以免大量 screen 改動,但 hex 值已換為
    // 規格 token。新焦點/IME 用色請走 FOCUS / FOCUS_BG。
    this.C = {
      // 基底
      BG:          TOKENS.bg_primary,         // #0B0F14
      SURFACE:     TOKENS.bg_secondary,       // #161C24
      SURFACE2:    TOKENS.bg_secondary2,      // #1F2731
      SURFACE3:    TOKENS.border_normal,      // #30363D
      BORDER:      TOKENS.border_normal,      // #30363D

      // 文字
      TEXT:        TOKENS.text_primary,       // #E6EDF3
      TEXT_DIM:    TOKENS.text_secondary,     // #7D8590
      TEXT_MUTED:  TOKENS.text_muted,         // #30363D

      // 狀態色
      GREEN:       TOKENS.accent_success,     // #39D353 (success / 未讀 / 3D Fix)
      GREEN_DIM:   TOKENS.accent_success_dim, // #1A7A36
      GREEN_MUTED: '#0D3A1C',                 // 暗綠底(成功項背景)
      GREEN_GLOW:  'rgba(57,211,83,0.12)',
      DANGER:      TOKENS.warn_red,           // #F85149
      WARNING:     TOKENS.warn_yellow,        // #F1E05A
      INFO:        TOKENS.info_blue,          // #64D2FF
      LORA:        TOKENS.lora_purple,        // #BF5AF2
      BLUE:        TOKENS.info_blue,
      ACCENT:      TOKENS.accent_focus,       // 通用強調 → 統一橙

      // 焦點 / IME(全新)
      FOCUS:       TOKENS.accent_focus,       // #FFA657
      FOCUS_BG:    TOKENS.bg_preedit,         // #2A2018(深橙底)
      FOCUS_DIM:   TOKENS.accent_focus_dim,   // #8B5A2B

      // 警告整條覆蓋
      ALERT_BG_CRIT: TOKENS.alert_bg_critical, // #8B1A1A
      ALERT_BG_WARN: TOKENS.alert_bg_warning,  // #6E1A1A

      // Chat bubbles
      BUBBLE_OUT:  TOKENS.bubble_out,         // #1C3A24
      BUBBLE_IN:   TOKENS.bubble_in,          // #161C24
    };

    // ── Font stack (mirrors LV_FONT_MONTSERRAT sizes) ────────────
    this.F = {
      XS:     '10px system-ui,sans-serif',
      SM:     '12px system-ui,sans-serif',
      MD:     '14px system-ui,sans-serif',
      LG:     '17px system-ui,sans-serif',
      XL:     '21px system-ui,sans-serif',
      MONO:   '11px "Courier New",monospace',
      ZH_SM:  '13px "Noto Sans TC","PingFang TC",system-ui,sans-serif',
      ZH_MD:  '16px "Noto Sans TC","PingFang TC",system-ui,sans-serif',
      ZH_LG:  '20px "Noto Sans TC","PingFang TC",system-ui,sans-serif',
    };

    // Track dirty regions to avoid full redraws (future optimization)
    this._dirtyRects = [];

    // Per-(icon, color) tinted offscreen tile cache, mirrors MiefFont's
    // approach so a 1bpp blit keeps its alpha shape under drawImage.
    this._iconCache = new Map();

    // Display-pages computed by _drawCandRow each frame from the current
    // candidate widths; UP/DOWN flip _displayPage. Each entry: { start, count }.
    this._displayPages = [];
    this._displayPage  = 0;
  }

  /**
   * Snapshot of the candidate display-pagination state, computed on the most
   * recent _drawCandRow call. Used by chat-screen to translate UP/DOWN into
   * page-flip + firmware selection navigation.
   * @returns {{ page: number, pageCount: number, pages: { start: number, count: number }[] }}
   */
  getDisplayPageInfo() {
    return {
      page:      this._displayPage,
      pageCount: this._displayPages.length,
      pages:     this._displayPages.slice(),
    };
  }

  /** Set the active display-page index (clamped). Caller is responsible for
   *  also moving the firmware selection (e.g. via mie.navigateToCandidate). */
  setDisplayPage(idx) {
    if (this._displayPages.length === 0) { this._displayPage = 0; return; }
    const n = this._displayPages.length;
    this._displayPage = ((idx % n) + n) % n;
  }

  // ── Full screen clear ────────────────────────────────────────
  clear(color = this.C.BG) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.W, this.H);
  }

  // ── Status Bar (y: 0–15, h: 16) ─────────────────────────────
  /**
   * 9 元素全域常駐 Status Bar(對齊 doc/ui/10-status-bar.md v2.0)。
   *
   * 規格的 x 字位表假設等寬 8px 半形字位,但實際 Unifont 渲染下
   * `●▲▼⚠✉▣◌✕○⚡` 等符號是 16px 全形,直接套用會重疊。本實作改以
   * measureText 動態量測:左半從 x=0 順序排列(時間→TX/RX→警告→Mesh
   * →GPS→未讀),右半從 x=W 反向排列(模式←電量),兩側中間留空。
   *
   * @param {object} opts(欄位同前)
   */
  drawStatusBar(opts = {}) {
    const {
      time = '--:--', battery = 0, charging = false, mode = 'Op',
      mesh = 0, gps = 'off', unread = 0, warn = false,
      tx = false, rx = false, alert, alertText,
    } = opts;
    const y = 0, h = 16;
    const C = this.C;
    const ctx = this.ctx;

    // ── 警告態整條覆蓋(優先序:sos > sosRecv > lowBatt > 正常) ──
    if (alert === 'sos' || alert === 'sosRecv' || alert === 'lowBatt') {
      const bg = alert === 'lowBatt' ? C.ALERT_BG_WARN : C.ALERT_BG_CRIT;
      ctx.fillStyle = bg;
      ctx.fillRect(0, y, this.W, h);
      ctx.fillStyle = C.TEXT;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(alertText || (alert === 'sos' ? '🚨 SOS 廣播中' : '⚠ 警告'), 4, y);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    // 一般態
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, y, this.W, h);
    ctx.fillStyle = C.BORDER;
    ctx.fillRect(0, h, this.W, 1);

    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';
    ctx.font         = this.F.SM;

    // 動態量測 + 推進的 helper
    const drawAt = (x, str, color) => {
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
      return x + ctx.measureText(str).width;
    };
    const GAP_S = 4;   // 元素間小間距
    const GAP_M = 8;   // 區段間中間距

    // ── 左半:時間 → TX/RX → ⚠ → ●Mesh:N → ●GPS → ✉N ──────────
    let lx = 0;

    // 1. 時間
    lx = drawAt(lx, time, C.TEXT);
    lx += GAP_M;

    // 2. TX/RX 動作燈
    lx = drawAt(lx, '▲', tx ? C.FOCUS : C.SURFACE3);
    lx = drawAt(lx, '▼', rx ? C.GREEN : C.SURFACE3);
    lx += GAP_S;

    // 3. 警告燈(條件;位置不保留以節省空間)
    if (warn) {
      lx = drawAt(lx, '⚠', C.WARNING);
      lx += GAP_S;
    }

    // 4. 鄰居節點 ●Mesh:N
    {
      const meshAge = (typeof mesh === 'object') ? mesh.lastHeardSec : null;
      const meshN   = (typeof mesh === 'object') ? (mesh.count | 0)  : (mesh | 0);
      let dotColor = C.TEXT_MUTED;
      if (meshN >= 1) {
        if (meshAge === null || meshAge < 300)   dotColor = C.GREEN;
        else if (meshAge < 900)                  dotColor = C.WARNING;
        else                                     dotColor = C.DANGER;
      }
      lx = drawAt(lx, '●', dotColor);
      const meshStr = meshN > 99 ? '99+' : String(meshN);
      lx = drawAt(lx, 'Mesh:' + meshStr, C.TEXT);
      lx += GAP_M;
    }

    // 5. GPS
    {
      const map = {
        '3d':        { glyph: '●', color: C.GREEN     },
        '2d':        { glyph: '●', color: C.WARNING   },
        'searching': { glyph: '◌', color: C.TEXT_DIM  },
        'lost':      { glyph: '✕', color: C.DANGER    },
        'off':       { glyph: '○', color: C.TEXT_MUTED },
      };
      const g = map[gps] || map.off;
      lx = drawAt(lx, g.glyph, g.color);
      lx = drawAt(lx, 'GPS', (gps === '3d' || gps === '2d') ? C.TEXT : C.TEXT_DIM);
      lx += GAP_M;
    }

    // 6. 未讀訊息(條件)
    if (unread > 0) {
      lx = drawAt(lx, '✉', C.GREEN);
      lx = drawAt(lx, unread > 9 ? '9+' : String(unread), C.GREEN);
      lx += GAP_S;
    }

    // ── 右半:從右往左排(模式 → 電量) ──────────────────────────
    const drawAtRight = (rx_, str, color) => {
      const w = ctx.measureText(str).width;
      ctx.fillStyle = color;
      ctx.fillText(str, rx_ - w, y);
      return rx_ - w;
    };

    let rxEdge = this.W - 4;

    // 8. 模式(最右)
    {
      const isIme = (mode !== 'Op');
      rxEdge = drawAtRight(rxEdge, mode, isIme ? C.FOCUS : C.TEXT);
      rxEdge -= GAP_M;
    }

    // 7. 電量(模式左側)
    {
      let batColor = C.TEXT;
      if (battery <= 15)       batColor = C.DANGER;
      else if (battery <= 30)  batColor = C.WARNING;
      const glyph  = charging ? '⚡' : (battery >= 99 ? '▪' : '▣');
      const pctStr = Math.max(0, Math.min(100, battery | 0)) + '%';
      rxEdge = drawAtRight(rxEdge, pctStr, batColor);
      rxEdge = drawAtRight(rxEdge, glyph, batColor);
    }

    // 防呆:左半若擠到右半,右半已先繪,左半於前面繪完(自然在右半文字之上)。
    // 由於兩側獨立,實務上中間留白即可,過度時最右側元素優先保留(模式/電量)。

    ctx.textBaseline = 'alphabetic';
  }

  // ── Hint Bar (y: H-16, h: 16) — G-2 動態鍵位提示 ────────────
  /**
   * @param {{key:string,label:string}[]} hints
   * @param {{y?:number}} [opts]
   */
  drawHintBar(hints, opts) {
    drawHintBar(this, hints, opts);
  }

  // ── Tab Bar (y: H-20, h: 20) ─────────────────────────────────
  /**
   * @param {string[]} tabs  tab labels
   * @param {number}   activeIdx
   */
  drawTabBar(tabs, activeIdx) {
    const th = 22, ty = this.H - th;
    // Background
    this.ctx.fillStyle = '#111113';
    this.ctx.fillRect(0, ty, this.W, th);
    // Top border
    this.ctx.fillStyle = this.C.BORDER;
    this.ctx.fillRect(0, ty, this.W, 1);

    const tabW = this.W / tabs.length;
    tabs.forEach((label, i) => {
      const tx = i * tabW;
      const isActive = i === activeIdx;
      // Active indicator line
      if (isActive) {
        this.ctx.fillStyle = this.C.FOCUS;
        this.ctx.fillRect(tx + 4, ty, tabW - 8, 2);
      }
      // Label
      this.ctx.font = this.F.SM;
      this.ctx.fillStyle = isActive ? this.C.FOCUS : this.C.TEXT_DIM;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(label, tx + tabW / 2, ty + th / 2 + 1);
    });
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }

  // ── IME Bar ──────────────────────────────────────────────────
  /**
   * 對齊 doc/ui/12-ime.md §IME Bar v1.0
   *
   * 18px 單列,顯隱條件:有候選字才畫,無則完全省略。
   *
   *   ►鐘 中 種 眾 重 仲 鍾 終 ‹1/3›
   *
   * 規格配色:
   *   行背景      #161C24 (bg_secondary)
   *   上邊框      #30363D (border_normal)  1px
   *   ► 標記      #FFA657 (accent_focus)
   *   選中候選字  #FFA657 (accent_focus)
   *   其他候選字  #E6EDF3 (text_primary)
   *   ‹n/N› 頁碼  #7D8590 (text_secondary)
   *
   * Preedit 不在此繪製 — 規格 §Preedit 視覺要求 preedit 必須 **inline 顯示在文字
   * 框內、游標位置**;由 screen 自行在自己的輸入框中呼叫 drawInlinePreedit()。
   *
   * Picker(SYM 長按符號表)維持原行為,接管整個 IME Bar 區。
   *
   * 位置:y = H - 22(tab bar) - 18 = H - 40
   *
   * 為了保留既有 caller 的呼叫簽名(chat-screen / field-edit-screen),
   * 函式名仍為 drawCompositionBar;state.committedLeft / committedRight /
   * pending / cursorBlink 在新版本被忽略(由 caller 自行 inline 畫 preedit)。
   *
   * @param {{
   *   candidates:     string[],
   *   allCandidates:  string[],
   *   selectedAbs:    number,
   *   selIdx:         number,
   *   picker:         { active, cells, cols, selected },
   * }} state
   */
  drawCompositionBar(state) {
    const BAR_H = 18;
    // 規格:IME Bar 緊貼螢幕底,與 Hint Bar 互斥(同位置)。
    // Caller 負責在 IME Bar 顯示時不再呼叫 drawHintBar。
    const BAR_Y = this.H - BAR_H;

    // 顯隱:無候選且非 picker → 不繪(規格)
    const all = (state.allCandidates && state.allCandidates.length)
                ? state.allCandidates
                : (state.candidates ?? []);
    const pickerActive = !!state.picker?.active;
    if (all.length === 0 && !pickerActive) return;

    // 行背景 + 上邊框
    this.ctx.fillStyle = this.C.SURFACE;
    this.ctx.fillRect(0, BAR_Y, this.W, BAR_H);
    this.ctx.fillStyle = this.C.BORDER;
    this.ctx.fillRect(0, BAR_Y, this.W, 1);

    // Picker 接管(SYM 長按);否則畫候選列
    if (pickerActive) {
      this._drawPickerRow(state.picker, 4, BAR_Y, BAR_H);
    } else {
      this._drawCandRow(state, BAR_Y, BAR_H);
    }

    this.ctx.textAlign    = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }

  /**
   * Inline preedit + 游標 — 在 screen 的文字框內呼叫。
   *
   * 對齊 doc/ui/12-ime.md §Preedit 視覺。
   *   - 已確認文本由 caller 自畫(主色,無背景)
   *   - 此 helper 畫 preedit 字串 + 背景塊 + 游標
   *
   * @param {number} x      起始 x(已確認文本之後的位置)
   * @param {number} yBase  baseline y(配 'alphabetic' 對齊;呼叫端常用 row mid+5)
   * @param {{ str: string, matchedPrefixBytes: number, style: number }} pending
   * @param {{ font?: string, cursorBlink?: boolean, height?: number }} [opts]
   * @returns {number} 已使用的水平寬度(含 preedit + 游標)
   */
  drawInlinePreedit(x, yBase, pending, opts = {}) {
    const ctx     = this.ctx;
    const C       = this.C;
    const font    = opts.font   ?? this.F.ZH_MD;
    const blink   = opts.cursorBlink !== false;
    const blockH  = opts.height ?? 18;
    const blockTop = yBase - blockH + 4;

    ctx.font          = font;
    ctx.textAlign     = 'left';
    ctx.textBaseline  = 'alphabetic';

    let used = 0;
    const pv = pending ?? { str: '', matchedPrefixBytes: 0, style: 0 };
    const s  = pv.str ?? '';
    if (s.length > 0) {
      const w = ctx.measureText(s).width;
      // 規格背景塊:深橙低飽和(bg_preedit #2A2018)
      ctx.fillStyle = C.FOCUS_BG;
      this._roundRectFill(x - 2, blockTop, w + 4, blockH, 1);

      if (pv.style === 1 /* PrefixBold */) {
        const mp = pv.matchedPrefixBytes | 0;
        const prefix = mp > 0 ? this._utf8Slice(s, 0, mp) : '';
        const rest   = mp > 0 ? this._utf8Slice(s, mp)    : s;
        let cx = x;
        if (prefix) {
          ctx.font = 'bold ' + font;
          ctx.fillStyle = C.FOCUS;
          ctx.fillText(prefix, cx, yBase);
          cx += ctx.measureText(prefix).width;
          ctx.font = font;
        }
        if (rest) {
          ctx.fillStyle = C.FOCUS_DIM;
          ctx.fillText(rest, cx, yBase);
        }
      } else {
        // None / Inverted 都用 preedit 橙(規格沒列 Inverted 變體,簡化處理)
        ctx.fillStyle = C.FOCUS;
        ctx.fillText(s, x, yBase);
      }
      used += w;
    }

    // 游標 ▌ 1Hz 閃爍 — 規格指此游標亦為橙色
    const curW = 2;
    if (blink) {
      ctx.fillStyle = C.FOCUS;
      ctx.fillRect(x + used, blockTop + 2, curW, blockH - 4);
    }
    used += curW + 1;
    return used;
  }

  /** 圓角矩形 fill 便利方法。 */
  _roundRectFill(x, y, w, h, r) {
    this.ctx.beginPath();
    this._roundRect(x, y, w, h, r);
    this.ctx.fill();
  }

  _drawTextRow_LEGACY_UNUSED({ committedLeft, committedRight, pending, cursorBlink }, y, h) {
    const midY   = y + h / 2;
    const labelX = 2;
    const TAG_W  = 26;  // "文字" label column width

    // Label gutter "文字"
    this.ctx.font        = this.F.XS;
    this.ctx.fillStyle   = this.C.TEXT_DIM;
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('文字', labelX, midY);

    // Vertical separator
    this.ctx.fillStyle = this.C.BORDER;
    this.ctx.fillRect(TAG_W, y + 3, 1, h - 6);

    // Text content
    const startX = TAG_W + 5;
    let x = startX;
    this.ctx.font = this.F.ZH_MD;

    // ── committed-left (normal) ──
    this.ctx.fillStyle = this.C.TEXT;
    if (committedLeft) {
      this.ctx.fillText(committedLeft, x, midY);
      x += this.ctx.measureText(committedLeft).width;
    }

    // ── pending (styled) ──
    const pv = pending ?? { str: '', matchedPrefixBytes: 0, style: 0 };
    const pendingStr = pv.str ?? '';
    if (pendingStr.length > 0) {
      const w = this.ctx.measureText(pendingStr).width;
      if (pv.style === 2 /* Inverted */) {
        // Reverse-video: focus-orange fill, bg-color text
        this.ctx.fillStyle = this.C.FOCUS;
        this.ctx.fillRect(x - 1, y + 3, w + 2, h - 6);
        this.ctx.fillStyle = this.C.BG;
        this.ctx.fillText(pendingStr, x, midY);
      } else if (pv.style === 1 /* PrefixBold */) {
        // Underline the whole pending; bold the matched prefix.
        const mp = pv.matchedPrefixBytes | 0;
        const prefixStr = mp > 0 ? this._utf8Slice(pendingStr, 0, mp) : '';
        const restStr   = mp > 0 ? this._utf8Slice(pendingStr, mp)    : pendingStr;

        // Prefix: bold focus-orange
        if (prefixStr) {
          this.ctx.font = 'bold ' + this.F.ZH_MD;
          this.ctx.fillStyle = this.C.FOCUS;
          this.ctx.fillText(prefixStr, x, midY);
          const pw = this.ctx.measureText(prefixStr).width;
          this._underline(x, y + h - 4, pw);
          x += pw;
          this.ctx.font = this.F.ZH_MD;
        }
        // Rest: dim focus-orange
        if (restStr) {
          this.ctx.fillStyle = this.C.FOCUS_DIM;
          this.ctx.fillText(restStr, x, midY);
          const rw = this.ctx.measureText(restStr).width;
          this._underline(x, y + h - 4, rw);
          x += rw;
        }
      } else {
        // None — preedit text 橙
        this.ctx.fillStyle = this.C.FOCUS;
        this.ctx.fillText(pendingStr, x, midY);
        x += w;
      }
    }

    // ── cursor block (reverse-video) ──
    const curW = 2;
    if (cursorBlink !== false) {
      this.ctx.fillStyle = this.C.FOCUS;
      this.ctx.fillRect(x, y + 4, curW, h - 8);
    }
    x += curW + 1;

    // ── committed-right (normal) ──
    if (committedRight) {
      this.ctx.fillStyle = this.C.TEXT;
      this.ctx.font = this.F.ZH_MD;
      this.ctx.fillText(committedRight, x, midY);
    }
  }

  /**
   * 對齊 doc/ui/12-ime.md §IME Bar 候選字列版面:
   *   ►鐘 中 種 眾 重 仲 鍾 終 ‹1/3›
   * - ► 領頭橙色;選中候選字橙色;其他主色;頁碼 ‹n/N› 次色靠右
   * - 候選間距使用 1 全形空白(視覺上)
   */
  _drawCandRow(state, y, h) {
    const midY = y + h / 2;
    const ctx  = this.ctx;
    const C    = this.C;

    ctx.font          = this.F.ZH_MD;
    ctx.textBaseline  = 'middle';
    ctx.textAlign     = 'left';

    // 候選來源:優先 allCandidates 用以做 width-pack 分頁
    const all = (state.allCandidates && state.allCandidates.length)
                ? state.allCandidates
                : (state.candidates ?? []);
    const sel = (state.selectedAbs !== undefined && state.selectedAbs !== null)
                ? state.selectedAbs
                : (state.selIdx ?? 0);

    // 預留右側頁碼欄位寬度
    const PAGE_GUTTER = 36;
    const startX = 4;
    const endX   = this.W - 3 - PAGE_GUTTER;

    // ► 領頭(規格)
    const leadW = ctx.measureText('►').width + 4;
    ctx.fillStyle = C.FOCUS;
    ctx.fillText('►', startX, midY);

    const candStartX = startX + leadW;
    const SPACE_W    = ctx.measureText(' ').width;  // 半形空白寬

    // 預先量度所有候選字寬度;間距使用 1 全形空白(等於 2 個半形)
    const gap    = SPACE_W * 2;
    const widths = all.map(c => ctx.measureText(c).width);

    // Width-packed pagination
    const pages = [];
    {
      let i = 0;
      while (i < all.length) {
        const start = i;
        let x = candStartX;
        let n = 0;
        for (; i < all.length; i++) {
          const w = widths[i] + (n > 0 ? gap : 0);
          if (x + w > endX && n > 0) break;
          x += w;
          n++;
        }
        pages.push({ start, count: Math.max(n, 1) });
      }
    }
    this._displayPages = pages;

    // Auto-snap to page containing selection
    const cur = pages[this._displayPage];
    const inCur = cur && sel >= cur.start && sel < cur.start + cur.count;
    if (!inCur) {
      const containing = pages.findIndex(p => sel >= p.start && sel < p.start + p.count);
      this._displayPage = containing >= 0 ? containing : 0;
    }
    if (this._displayPage >= pages.length) this._displayPage = 0;

    // 繪製當前頁候選字
    const page = pages[this._displayPage];
    if (!page) return;
    let x = candStartX;
    for (let k = 0; k < page.count; k++) {
      const i = page.start + k;
      if (k > 0) x += gap;
      const isSel = (i === sel);
      ctx.fillStyle = isSel ? C.FOCUS : C.TEXT;
      ctx.fillText(all[i], x, midY);
      x += widths[i];
    }

    // 頁碼 ‹n/N›(規格;只在多頁時顯示)
    if (pages.length > 1) {
      ctx.font      = this.F.ZH_SM;
      ctx.fillStyle = C.TEXT_DIM;
      ctx.textAlign = 'right';
      ctx.fillText(`‹${this._displayPage + 1}/${pages.length}›`, this.W - 3, midY);
      ctx.textAlign = 'left';
    }
  }

  _drawPickerRow(picker, startX, y, h) {
    const cells = picker.cells ?? [];
    const cols  = Math.max(1, picker.cols | 0 || 4);
    const sel   = picker.selected | 0;
    const endX  = this.W - 3;
    const rowW  = endX - startX;
    const slotW = Math.max(16, Math.floor(rowW / cols) - 2);
    const slotH = h - 6;
    const midY  = y + h / 2;

    this.ctx.font         = this.F.ZH_MD;
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign    = 'center';

    // First `cols` cells occupy the single candidate row (the picker grid
    // wraps across multiple visual rows on the real hardware's 4×4 layout;
    // the composition bar only has space for one row here, so we slide the
    // window to keep the selected cell visible).
    const row        = Math.floor(sel / cols);
    const windowStart = row * cols;
    for (let c = 0; c < cols; c++) {
      const idx = windowStart + c;
      if (idx >= cells.length) break;
      const cx = startX + c * (slotW + 2);
      const isSel = (idx === sel);
      if (isSel) {
        this.ctx.fillStyle = this.C.FOCUS;
        this.ctx.fillRect(cx, y + 3, slotW, slotH);
        this.ctx.fillStyle = this.C.BG;
      } else {
        this.ctx.fillStyle = this.C.SURFACE3 ?? '#2A2A2E';
        this.ctx.fillRect(cx, y + 3, slotW, slotH);
        this.ctx.fillStyle = this.C.TEXT;
      }
      this.ctx.fillText(cells[idx] || '', cx + slotW / 2, midY);
    }

    this.ctx.textAlign = 'left';
  }

  _underline(x, y, w) {
    this.ctx.fillStyle = this.C.FOCUS_DIM;
    this.ctx.fillRect(x, y, w, 1);
  }

  _measureWith(font, text) {
    const prev = this.ctx.font;
    this.ctx.font = font;
    const w = this.ctx.measureText(text).width;
    this.ctx.font = prev;
    return w;
  }

  /** Slice a UTF-8 string by *byte* offsets, returning a JS substring. */
  _utf8Slice(str, startByte, endByte) {
    const bytes = new TextEncoder().encode(str);
    const slice = bytes.subarray(startByte, endByte ?? bytes.length);
    return new TextDecoder().decode(slice);
  }

  // ── Card / Container ─────────────────────────────────────────
  /**
   * lv_obj with rounded corners + optional shadow.
   */
  drawCard(x, y, w, h, { radius = 8, bg = this.C.SURFACE, border = null, shadow = false } = {}) {
    this.ctx.beginPath();
    this._roundRect(x, y, w, h, radius);

    if (shadow) {
      this.ctx.shadowColor   = 'rgba(0,0,0,0.6)';
      this.ctx.shadowBlur    = 8;
      this.ctx.shadowOffsetY = 2;
    }

    this.ctx.fillStyle = bg;
    this.ctx.fill();

    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur  = 0;
    this.ctx.shadowOffsetY = 0;

    if (border) {
      this.ctx.strokeStyle = border;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
  }

  // ── Label ─────────────────────────────────────────────────────
  /**
   * lv_label equivalent.
   * @param {string} align  'left'|'center'|'right'
   */
  drawLabel(x, y, text, {
    font  = this.F.MD,
    color = this.C.TEXT,
    align = 'left',
    baseline = 'alphabetic',
    maxWidth,
  } = {}) {
    this.ctx.font         = font;
    this.ctx.fillStyle    = color;
    this.ctx.textAlign    = align;
    this.ctx.textBaseline = baseline;
    if (maxWidth) this.ctx.fillText(text, x, y, maxWidth);
    else          this.ctx.fillText(text, x, y);
    this.ctx.textAlign    = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }

  // ── Button ────────────────────────────────────────────────────
  drawBtn(x, y, w, h, label, {
    bg      = this.C.GREEN_MUTED,
    fg      = this.C.GREEN,
    radius  = 6,
    font    = this.F.MD,
    border  = this.C.GREEN_DIM,
    active  = false,
  } = {}) {
    this.drawCard(x, y, w, h, {
      radius, bg: active ? this.C.GREEN_DIM : bg, border
    });
    this.ctx.font         = font;
    this.ctx.fillStyle    = active ? this.C.BG : fg;
    this.ctx.textAlign    = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(label, x + w / 2, y + h / 2);
    this.ctx.textAlign    = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }

  // ── Progress Bar (lv_bar) ────────────────────────────────────
  drawBar(x, y, w, h, value, maxVal, {
    fgColor = this.C.GREEN,
    bgColor = this.C.SURFACE2,
    radius  = 2,
    label   = null,
  } = {}) {
    // Background track
    this.ctx.beginPath(); this._roundRect(x, y, w, h, radius);
    this.ctx.fillStyle = bgColor; this.ctx.fill();

    // Fill
    const fillW = Math.max(radius * 2, Math.floor(w * Math.min(value, maxVal) / maxVal));
    if (fillW > 0) {
      this.ctx.beginPath(); this._roundRect(x, y, fillW, h, radius);
      this.ctx.fillStyle = fgColor; this.ctx.fill();
    }

    if (label) {
      this.ctx.font = this.F.XS;
      this.ctx.fillStyle = this.C.TEXT_DIM;
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(label, x + w, y + h / 2);
      this.ctx.textAlign = 'left';
    }
  }

  // ── Line Chart (lv_chart) ────────────────────────────────────
  drawLineChart(x, y, w, h, data, {
    lineColor = this.C.GREEN,
    fillColor = this.C.GREEN_GLOW,
    minVal    = -120,
    maxVal    = -50,
    gridLines = 3,
  } = {}) {
    if (!data || data.length < 2) return;

    // Grid
    this.ctx.strokeStyle = this.C.SURFACE3;
    this.ctx.lineWidth   = 0.5;
    for (let i = 1; i < gridLines; i++) {
      const gy = y + Math.floor(h * i / gridLines);
      this.ctx.beginPath(); this.ctx.moveTo(x, gy); this.ctx.lineTo(x + w, gy); this.ctx.stroke();
    }

    const step  = w / (data.length - 1);
    const range = maxVal - minVal;

    // Fill area
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + h);
    data.forEach((v, i) => {
      const px = x + i * step;
      const py = y + h - Math.floor(h * (Math.min(maxVal, Math.max(minVal, v)) - minVal) / range);
      if (i === 0) this.ctx.lineTo(px, py); else this.ctx.lineTo(px, py);
    });
    this.ctx.lineTo(x + w, y + h);
    this.ctx.closePath();
    this.ctx.fillStyle = fillColor;
    this.ctx.fill();

    // Line
    this.ctx.beginPath();
    this.ctx.strokeStyle = lineColor;
    this.ctx.lineWidth   = 1.5;
    this.ctx.lineJoin    = 'round';
    data.forEach((v, i) => {
      const px = x + i * step;
      const py = y + h - Math.floor(h * (Math.min(maxVal, Math.max(minVal, v)) - minVal) / range);
      if (i === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
    });
    this.ctx.stroke();
  }

  // ── Chat bubble ──────────────────────────────────────────────
  /**
   * @param {{ from, text, time, rssi, sent }} msg
   */
  drawMessageBubble(msg, x, y, maxW) {
    const isSent = msg.sent || msg.from === 'ME';
    const bg     = isSent ? this.C.BUBBLE_OUT : this.C.BUBBLE_IN;
    const border = isSent ? this.C.GREEN_DIM  : this.C.BORDER;
    const nameColor = isSent ? this.C.GREEN : this.C.INFO;

    // Measure text (wrap at maxW - 16)
    this.ctx.font = this.F.ZH_SM;
    const words   = msg.text;
    const lineH   = 14;
    const padX    = 6, padY = 5;
    const textW   = Math.min(maxW - 16, this.ctx.measureText(words).width + padX * 2);
    const lines   = this._wrapText(msg.text, textW - padX * 2, this.F.ZH_SM);
    const boxH    = padY * 2 + (isSent ? 0 : 12) + lines.length * lineH + (msg.rssi ? 10 : 0);

    const bx = isSent ? (x + maxW - textW - 2) : x + 2;
    this.drawCard(bx, y, textW, boxH, { radius: 6, bg, border });

    let ty = y + padY;
    // Sender name (incoming only)
    if (!isSent) {
      this.drawLabel(bx + padX, ty + 9, msg.from ?? 'UNKNOWN', {
        font: this.F.XS, color: nameColor
      });
      ty += 12;
    }
    // Message text
    for (const line of lines) {
      this.drawLabel(bx + padX, ty + 10, line, { font: this.F.ZH_SM, color: this.C.TEXT });
      ty += lineH;
    }
    // RSSI / time
    if (msg.rssi || msg.time) {
      const meta = [msg.time, msg.rssi ? `${msg.rssi}dBm` : null].filter(Boolean).join(' ');
      this.drawLabel(bx + padX, ty + 8, meta, { font: this.F.XS, color: this.C.TEXT_DIM });
    }
    return boxH + 4;
  }

  // ── List item ────────────────────────────────────────────────
  drawListItem(x, y, w, h, { title, subtitle, time, badge, active = false } = {}) {
    if (active) {
      this.ctx.fillStyle = this.C.FOCUS;
      this.ctx.fillRect(x, y, 2, h);
    }
    this.ctx.fillStyle = active ? this.C.FOCUS_BG : 'transparent';
    this.ctx.fillRect(x, y, w, h);

    // Avatar circle
    this.ctx.beginPath();
    this.ctx.arc(x + 16, y + h / 2, 10, 0, Math.PI * 2);
    this.ctx.fillStyle = active ? this.C.FOCUS_DIM : this.C.SURFACE2;
    this.ctx.fill();
    if (active) { this.ctx.strokeStyle = this.C.FOCUS; this.ctx.lineWidth = 1; this.ctx.stroke(); }
    this.drawLabel(x + 16, y + h / 2, (title ?? '?')[0], {
      font: '11px system-ui', color: active ? this.C.FOCUS : this.C.TEXT_DIM,
      align: 'center', baseline: 'middle',
    });

    // Title + subtitle
    this.drawLabel(x + 32, y + h / 2 - 5, title ?? '', {
      font: this.F.ZH_SM, color: this.C.TEXT, maxWidth: w - 64
    });
    if (subtitle) {
      this.drawLabel(x + 32, y + h / 2 + 7, subtitle, {
        font: this.F.XS, color: this.C.TEXT_DIM, maxWidth: w - 64
      });
    }
    // Time
    if (time) {
      this.drawLabel(x + w - 4, y + 10, time, {
        font: this.F.XS, color: this.C.TEXT_DIM, align: 'right'
      });
    }
    // Badge
    if (badge) {
      const bx = x + w - 12, by = y + h - 14;
      this.ctx.beginPath(); this.ctx.arc(bx, by, 7, 0, Math.PI * 2);
      this.ctx.fillStyle = this.C.GREEN; this.ctx.fill();
      this.drawLabel(bx, by, String(badge), {
        font: '8px system-ui', color: this.C.BG, align: 'center', baseline: 'middle'
      });
    }
    // Divider
    this.ctx.fillStyle = this.C.BORDER;
    this.ctx.fillRect(x + 32, y + h - 1, w - 32, 1);
  }

  // ── LoRa waveform animation ───────────────────────────────────
  drawLoraWaveform(x, y, w, h, phase, amplitude = 0.7) {
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.C.LORA;
    this.ctx.lineWidth   = 1;
    this.ctx.shadowColor = this.C.LORA;
    this.ctx.shadowBlur  = 3;
    for (let i = 0; i <= w; i++) {
      const t  = (i / w) * Math.PI * 4 + phase;
      const py = y + h / 2 + Math.sin(t) * (h / 2 - 1) * amplitude;
      if (i === 0) this.ctx.moveTo(x + i, py);
      else         this.ctx.lineTo(x + i, py);
    }
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  // ── Node map dot ──────────────────────────────────────────────
  drawNodeDot(x, y, label, { color = this.C.GREEN, pulse = false, size = 4 } = {}) {
    if (pulse) {
      // Pulsing ring
      this.ctx.beginPath();
      this.ctx.arc(x, y, size + 4, 0, Math.PI * 2);
      this.ctx.strokeStyle = color + '40';
      this.ctx.lineWidth   = 1;
      this.ctx.stroke();
    }
    this.ctx.beginPath();
    this.ctx.arc(x, y, size, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur  = 6;
    this.ctx.fill();
    this.ctx.shadowBlur  = 0;
    if (label) {
      this.drawLabel(x + size + 2, y + 4, label, {
        font: this.F.XS, color: this.C.TEXT_DIM
      });
    }
  }

  // ── Internal helpers ──────────────────────────────────────────

  _roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.arcTo(x + w, y,     x + w, y + r,     r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.arcTo(x,      y + h, x,      y + h - r, r);
    this.ctx.lineTo(x, y + r);
    this.ctx.arcTo(x,      y,     x + r,  y,         r);
    this.ctx.closePath();
  }

  _wrapText(text, maxW, font) {
    this.ctx.font = font;
    const words = Array.from(text); // CJK: each char is a word
    const lines = [];
    let cur = '';
    for (const ch of words) {
      const test = cur + ch;
      if (this.ctx.measureText(test).width > maxW && cur) {
        lines.push(cur); cur = ch;
      } else { cur = test; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ── Icons & menu grid ────────────────────────────────────────
  /**
   * Blit a 1bpp icon from `icons.js` at (x, y) tinted with `color`.
   * Caches a per-(name, color) offscreen canvas so subsequent draws are
   * a single drawImage call.
   */
  drawIcon(name, x, y, color = this.C.GREEN) {
    const ic = ICONS[name];
    if (!ic) return;
    const key = `${name}|${color}`;
    let tile = this._iconCache.get(key);
    if (!tile) {
      const c = document.createElement('canvas');
      c.width = ic.w; c.height = ic.h;
      const cctx = c.getContext('2d');
      const img  = cctx.createImageData(ic.w, ic.h);
      const data = img.data;
      const [r, g, b, a] = parseHexColor(color);
      const rowBytes = (ic.w + 7) >> 3;
      for (let py = 0; py < ic.h; py++) {
        for (let px = 0; px < ic.w; px++) {
          const bit = (ic.bitmap[py * rowBytes + (px >> 3)] >> (7 - (px & 7))) & 1;
          if (bit) {
            const o = (py * ic.w + px) * 4;
            data[o]     = r;
            data[o + 1] = g;
            data[o + 2] = b;
            data[o + 3] = a;
          }
        }
      }
      cctx.putImageData(img, 0, 0);
      tile = c;
      this._iconCache.set(key, tile);
    }
    this.ctx.drawImage(tile, x | 0, y | 0);
  }

  /**
   * Render a 3×N icon grid centered in (originX, originY, totalW, totalH).
   * `items` is an array of `{ icon, label }`. The cell at `selectedIdx`
   * gets a green border + muted-green fill highlight.
   */
  drawMenuGrid(items, selectedIdx, originX, originY, totalW, totalH) {
    const COLS  = 3;
    const ROWS  = Math.ceil(items.length / COLS);
    const GAP_X = 6;
    const GAP_Y = 6;
    const cellW = Math.floor((totalW - GAP_X * (COLS + 1)) / COLS);
    const cellH = Math.floor((totalH - GAP_Y * (ROWS + 1)) / ROWS);

    for (let i = 0; i < items.length; i++) {
      const r = (i / COLS) | 0;
      const c = i % COLS;
      const x = originX + GAP_X + c * (cellW + GAP_X);
      const y = originY + GAP_Y + r * (cellH + GAP_Y);

      const isSel = (i === selectedIdx);
      this.drawCard(x, y, cellW, cellH, {
        radius: 6,
        bg:     isSel ? this.C.FOCUS_BG : this.C.SURFACE,
        border: isSel ? this.C.FOCUS    : this.C.BORDER,
      });

      const item = items[i];
      const ic   = ICONS[item.icon];
      if (ic) {
        const ix = x + ((cellW - ic.w) >> 1);
        const iy = y + 8;
        this.drawIcon(item.icon, ix, iy, isSel ? this.C.FOCUS : this.C.TEXT);
      }
      if (item.label) {
        this.drawLabel(x + cellW / 2, y + cellH - 8, item.label, {
          font:     this.F.ZH_MD,
          color:    isSel ? this.C.FOCUS : this.C.TEXT,
          align:    'center',
          baseline: 'alphabetic',
        });
      }
    }
  }
}

function parseHexColor(s) {
  if (typeof s === 'string' && s[0] === '#' && s.length === 7) {
    return [
      parseInt(s.slice(1, 3), 16),
      parseInt(s.slice(3, 5), 16),
      parseInt(s.slice(5, 7), 16),
      255,
    ];
  }
  // Fallback to white
  return [255, 255, 255, 255];
}
