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
   * 字位佈局(8px 半形 Unifont):
   *   時間 0–40, TX/RX 48–64, ⚠ 64–72, ●Mesh 80–136,
   *   GPS 144–176, ✉ 184–208, 電量 216–256, 模式 288–304
   *
   * @param {object} opts
   * @param {string} opts.time         "HH:MM"(已格式化)
   * @param {number} opts.battery      0–100
   * @param {boolean} opts.charging    true → 充電中
   * @param {string}  [opts.mode='Op'] Op | 注 | EN | Ab | Num
   * @param {number}  [opts.mesh=0]    鄰居節點數
   * @param {string}  [opts.gps='off'] '3d'|'2d'|'searching'|'lost'|'off'
   * @param {number}  [opts.unread=0]  未讀訊息總數
   * @param {boolean} [opts.warn=false] 系統警告燈
   * @param {boolean} [opts.tx=false]  TX 動作中(100ms 脈衝)
   * @param {boolean} [opts.rx=false]  RX 動作中(100ms 脈衝)
   * @param {string}  [opts.alert]     'sos' | 'sosRecv' | 'lowBatt' | undefined
   * @param {string}  [opts.alertText] 整條覆蓋文字(配合 alert)
   */
  drawStatusBar(opts = {}) {
    const {
      time = '--:--', battery = 0, charging = false, mode = 'Op',
      mesh = 0, gps = 'off', unread = 0, warn = false,
      tx = false, rx = false, alert, alertText,
    } = opts;
    const y = 0, h = 16;
    const C = this.C;

    // ── 警告態整條覆蓋(優先序:sos > sosRecv > lowBatt > 正常) ──
    if (alert === 'sos' || alert === 'sosRecv' || alert === 'lowBatt') {
      const bg = alert === 'lowBatt' ? C.ALERT_BG_WARN : C.ALERT_BG_CRIT;
      this.ctx.fillStyle = bg;
      this.ctx.fillRect(0, y, this.W, h);
      this.ctx.fillStyle = C.TEXT;
      this.ctx.textBaseline = 'top';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(alertText || (alert === 'sos' ? '🚨 SOS 廣播中' : '⚠ 警告'), 4, y);
      this.ctx.textBaseline = 'alphabetic';
      return;
    }

    // 一般態
    this.ctx.fillStyle = C.BG;
    this.ctx.fillRect(0, y, this.W, h);
    this.ctx.fillStyle = C.BORDER;
    this.ctx.fillRect(0, h, this.W, 1);

    this.ctx.textBaseline = 'top';
    this.ctx.textAlign    = 'left';

    // 1. 時間 x=0..40
    this.ctx.fillStyle = C.TEXT;
    this.ctx.fillText(time, 0, y);

    // 2. TX/RX 動作燈 x=48..64
    this.ctx.fillStyle = tx ? C.FOCUS : C.SURFACE3;
    this.ctx.fillText('▲', 48, y);
    this.ctx.fillStyle = rx ? C.GREEN : C.SURFACE3;
    this.ctx.fillText('▼', 56, y);

    // 3. 警告燈 x=64..72(條件,位置永遠保留)
    if (warn) {
      this.ctx.fillStyle = C.WARNING;
      this.ctx.fillText('⚠', 64, y);
    }

    // 4. 鄰居節點 x=80..136
    {
      const meshAge = (typeof mesh === 'object') ? mesh.lastHeardSec : null;
      const meshN   = (typeof mesh === 'object') ? (mesh.count | 0)  : (mesh | 0);
      let dotColor = C.TEXT_MUTED;
      if (meshN >= 1) {
        if (meshAge === null || meshAge < 300)        dotColor = C.GREEN;
        else if (meshAge < 900)                       dotColor = C.WARNING;
        else                                          dotColor = C.DANGER;
      }
      this.ctx.fillStyle = dotColor;
      this.ctx.fillText('●', 80, y);
      this.ctx.fillStyle = C.TEXT;
      const meshStr = meshN > 99 ? '99+' : String(meshN);
      this.ctx.fillText('Mesh:' + meshStr, 88, y);
    }

    // 5. GPS x=144..176
    {
      const map = {
        '3d':        { glyph: '●', color: C.GREEN     },
        '2d':        { glyph: '●', color: C.WARNING   },
        'searching': { glyph: '◌', color: C.TEXT_DIM  },
        'lost':      { glyph: '✕', color: C.DANGER    },
        'off':       { glyph: '○', color: C.TEXT_MUTED },
      };
      const g = map[gps] || map.off;
      this.ctx.fillStyle = g.color;
      this.ctx.fillText(g.glyph, 144, y);
      this.ctx.fillStyle = (gps === '3d' || gps === '2d') ? C.TEXT : C.TEXT_DIM;
      this.ctx.fillText('GPS', 152, y);
    }

    // 6. 未讀訊息 x=184..208(條件)
    if (unread > 0) {
      this.ctx.fillStyle = C.GREEN;
      this.ctx.fillText('✉', 184, y);
      this.ctx.fillStyle = C.GREEN;
      this.ctx.fillText(unread > 9 ? '9+' : String(unread), 192, y);
    }

    // 7. 電量 x=216..256
    {
      let batColor = C.TEXT;
      if (battery <= 5)        batColor = C.DANGER;
      else if (battery <= 15)  batColor = C.DANGER;
      else if (battery <= 30)  batColor = C.WARNING;
      const glyph = charging ? '⚡' : (battery >= 99 ? '▪' : '▣');
      this.ctx.fillStyle = batColor;
      this.ctx.fillText(glyph, 216, y);
      const pctStr = Math.max(0, Math.min(100, battery | 0)) + '%';
      this.ctx.fillText(pctStr, 224, y);
    }

    // 8. 模式 x=288..304
    {
      const isIme = (mode !== 'Op');
      this.ctx.fillStyle = isIme ? C.FOCUS : C.TEXT;
      this.ctx.fillText(mode, 288, y);
    }

    this.ctx.textBaseline = 'alphabetic';
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

  // ── Composition / IME Bar ─────────────────────────────────────
  /**
   * Draw the MIE input composition area.
   * Sits just above the tab bar: y=H-22-28=H-50, h=28
   * @param {string}   committed  already-committed text
   * @param {string[]} buffer     active phoneme sequence e.g. ["ㄅ","ㄚ"]
   * @param {string[]} candidates candidate characters
   * @param {number}   selIdx     selected candidate index
   * @param {string}   mode       input mode label
   */
  /**
   * Two-row MIE display inspired by firmware mie_repl.cpp.
   * Row order (top → bottom): 候選, 文字.
   *
   * The 候選 row no longer numbers entries (the user navigates with
   * ←/→) and it packs as many candidates as will fit in the row's
   * width; the sliding window keeps the selected candidate visible
   * when the full list overflows.
   *
   * @param {{
   *   committedLeft:  string,
   *   committedRight: string,
   *   pending:        { str: string, matchedPrefixBytes: number, style: number },
   *   allCandidates:  string[],     // full merged list
   *   candidates:     string[],     // firmware page slice (fallback)
   *   selectedAbs:    number,       // absolute index into allCandidates
   *   selIdx:         number,       // within-page index (fallback)
   *   cursorBlink:    boolean,
   * }} state
   */
  drawCompositionBar(state) {
    const CAND_H = 22;
    const TEXT_H = 22;
    const BAR_Y  = this.H - 22 /* tab bar */ - CAND_H - TEXT_H;

    // ── Backdrop ───────────────────────────────────────────────────
    this.ctx.fillStyle = '#161618';
    this.ctx.fillRect(0, BAR_Y, this.W, CAND_H + TEXT_H);
    this.ctx.fillStyle = this.C.BORDER;
    this.ctx.fillRect(0, BAR_Y, this.W, 1);
    this.ctx.fillRect(0, BAR_Y + CAND_H, this.W, 1);

    // ── Row 1 (top): 候選 ───────────────────────────────────────────
    this._drawCandRow(state, BAR_Y, CAND_H);

    // ── Row 2 (bottom): 文字 ────────────────────────────────────────
    this._drawTextRow(state, BAR_Y + CAND_H, TEXT_H);

    this.ctx.textAlign   = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }

  _drawTextRow({ committedLeft, committedRight, pending, cursorBlink }, y, h) {
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

  _drawCandRow(state, y, h) {
    const midY  = y + h / 2;
    const TAG_W = 30;

    // Mode chip (replaces the 候選 label; shows the active IME mode so the
    // user can tell SmartZh / SmartEn / Direct apart at a glance).
    const modeStr = state.mode || '';
    this.ctx.font        = this.F.XS;
    this.ctx.textBaseline = 'middle';
    if (modeStr) {
      const w = this.ctx.measureText(modeStr).width + 8;
      const cx = 2, cy = y + 3;
      this.ctx.fillStyle = this.C.FOCUS;
      this.ctx.fillRect(cx, cy, w, h - 6);
      this.ctx.fillStyle = this.C.BG;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(modeStr, cx + w / 2, midY);
      this.ctx.textAlign = 'left';
    }

    this.ctx.fillStyle = this.C.BORDER;
    this.ctx.fillRect(TAG_W, y + 3, 1, h - 6);

    // SYM1 long-press symbol picker takes over the candidate area while
    // active. Firmware intercepts all DPAD/OK/SYM1 routing — we just
    // render the current snapshot.
    if (state.picker && state.picker.active) {
      this._drawPickerRow(state.picker, TAG_W + 5, y, h);
      return;
    }

    this.ctx.font = this.F.ZH_MD;

    // Prefer the full list so we can pack our own width-fit pages.
    // Fall back to the page slice if the full list isn't provided.
    const all = (state.allCandidates && state.allCandidates.length)
                ? state.allCandidates
                : (state.candidates ?? []);
    if (all.length === 0) {
      this.ctx.fillStyle = this.C.TEXT_MUTED;
      this.ctx.fillText('(按鍵開始輸入)', TAG_W + 5, midY);
      this._displayPages = [];
      this._displayPage  = 0;
      return;
    }

    // Absolute selection; fall back to page-relative when the full list
    // isn't available (JS fallback path).
    const sel = (state.selectedAbs !== undefined && state.selectedAbs !== null)
                ? state.selectedAbs
                : (state.selIdx ?? 0);

    // Width budget. Reserve room on the right for a "n/N" page indicator.
    const startX     = TAG_W + 5;
    const PAD        = 6;   // gap between candidate slots
    const SLOT_X_PAD = 6;   // horizontal padding inside each slot
    const IND_W      = 26;  // reserved gutter for page indicator
    const endX       = this.W - 3 - IND_W;

    // Pre-measure all candidate slot widths.
    const widths = all.map(c => this.ctx.measureText(c).width + SLOT_X_PAD);

    // Greedy width-packed pagination: each page fits as many candidates as
    // the row width allows, in order. A candidate that exceeds the row on
    // its own gets its own page (forced).
    const pages = [];
    {
      let i = 0;
      while (i < all.length) {
        const start = i;
        let x = startX;
        let n = 0;
        for (; i < all.length; i++) {
          const w = widths[i] + (n > 0 ? PAD : 0);
          if (x + w > endX && n > 0) break;
          x += w; n++;
        }
        pages.push({ start, count: Math.max(n, 1) });
      }
    }
    this._displayPages = pages;

    // Auto-snap: if sel is outside the current page, jump to the page that
    // contains it (covers LEFT/RIGHT/TAB-driven selection moves).
    const cur = this._displayPages[this._displayPage];
    const inCur = cur && sel >= cur.start && sel < cur.start + cur.count;
    if (!inCur) {
      const containing = pages.findIndex(p => sel >= p.start && sel < p.start + p.count);
      this._displayPage = containing >= 0 ? containing : 0;
    }
    if (this._displayPage >= pages.length) this._displayPage = 0;

    // Render the active page only.
    const page = pages[this._displayPage];
    let x = startX;
    for (let k = 0; k < page.count; k++) {
      const i = page.start + k;
      const w = widths[i] + (k > 0 ? PAD : 0);
      const slotX = x + (k > 0 ? PAD : 0);
      const slotW = widths[i];
      const isSel = (i === sel);
      if (isSel) {
        this.ctx.fillStyle = this.C.FOCUS_BG;
        this.ctx.fillRect(slotX - 1, y + 3, slotW + 1, h - 6);
      }
      this.ctx.fillStyle = isSel ? this.C.FOCUS : this.C.TEXT;
      this.ctx.fillText(all[i], slotX + SLOT_X_PAD / 2, midY);
      x += w;
    }

    // Page indicator "n/N" on the right when more than one page exists.
    if (pages.length > 1) {
      this.ctx.font = this.F.XS;
      this.ctx.fillStyle = this.C.TEXT_DIM;
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`${this._displayPage + 1}/${pages.length}`,
                        this.W - 3, midY);
      this.ctx.textAlign = 'left';
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
