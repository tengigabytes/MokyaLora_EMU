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

    // ── Color palette (Meshtastic green-tech) ────────────────────
    // Maps to lv_palette / lv_color_hex() in LVGL
    this.C = {
      BG:          '#0A0A0A',
      SURFACE:     '#1C1C1E',
      SURFACE2:    '#2C2C2E',
      SURFACE3:    '#3A3A3C',
      BORDER:      '#38383A',
      GREEN:       '#30D158',
      GREEN_DIM:   '#1A7A36',
      GREEN_MUTED: '#0D3A1C',
      GREEN_GLOW:  'rgba(48,209,88,0.12)',
      ACCENT:      '#00FF88',
      TEXT:        '#EBEBF5',
      TEXT_DIM:    '#8E8E93',
      TEXT_MUTED:  '#3A3A3C',
      DANGER:      '#FF453A',
      WARNING:     '#FFD60A',
      INFO:        '#64D2FF',
      LORA:        '#BF5AF2',
      BLUE:        '#0A84FF',
      // Chat bubbles
      BUBBLE_OUT:  '#1C3A24',
      BUBBLE_IN:   '#2C2C2E',
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
  }

  // ── Full screen clear ────────────────────────────────────────
  clear(color = this.C.BG) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.W, this.H);
  }

  // ── Status Bar (y: 0–17, h: 18) ─────────────────────────────
  /**
   * @param {{ time: string, battery: number, rssi: number, mode: string }} opts
   */
  drawStatusBar({ time, battery, rssi, mode = 'LoRa', charging = false }) {
    const y = 0, h = 18;
    // Background
    this.ctx.fillStyle = '#111113';
    this.ctx.fillRect(0, y, this.W, h);
    // Bottom border
    this.ctx.fillStyle = this.C.BORDER;
    this.ctx.fillRect(0, h - 1, this.W, 1);

    // ── Left: mode badge ────────────────────────────────────────
    this.ctx.font = this.F.XS;
    this.ctx.fillStyle = this.C.GREEN;
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(mode, 4, y + h / 2);

    // ── Center: time ────────────────────────────────────────────
    this.ctx.font = '10px system-ui,sans-serif';
    this.ctx.fillStyle = this.C.TEXT;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(time, this.W / 2, y + h / 2);

    // ── Right: RSSI + battery ────────────────────────────────────
    this._drawSignalBars(this.W - 38, y + 4, rssi);
    this._drawBatteryIcon(this.W - 18, y + 4, battery, charging);

    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }

  _drawSignalBars(x, y, rssi) {
    // RSSI: > -70 = 4 bars, > -85 = 3, > -100 = 2, > -115 = 1, else 0
    const bars = rssi > -70 ? 4 : rssi > -85 ? 3 : rssi > -100 ? 2 : rssi > -115 ? 1 : 0;
    const heights = [3, 5, 7, 9];
    for (let i = 0; i < 4; i++) {
      const bh = heights[i];
      const bx = x + i * 4;
      const by = y + (9 - bh);
      this.ctx.fillStyle = i < bars ? this.C.GREEN : this.C.SURFACE3;
      this.ctx.fillRect(bx, by, 3, bh);
    }
  }

  _drawBatteryIcon(x, y, pct, charging) {
    const w = 14, h = 8;
    // Outer rect
    this.ctx.strokeStyle = this.C.TEXT_DIM;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    // Terminal nub
    this.ctx.fillStyle = this.C.TEXT_DIM;
    this.ctx.fillRect(x + w + 1, y + 2, 2, 4);
    // Fill
    const fillW = Math.max(1, Math.floor((w - 2) * pct / 100));
    const color = pct > 40 ? this.C.GREEN : pct > 15 ? this.C.WARNING : this.C.DANGER;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x + 1, y + 1, fillW, h - 2);
    // Charging bolt
    if (charging) {
      this.ctx.fillStyle = '#FFD60A';
      this.ctx.font = '8px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('⚡', x + w / 2, y + h / 2);
    }
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
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
        this.ctx.fillStyle = this.C.GREEN;
        this.ctx.fillRect(tx + 4, ty, tabW - 8, 2);
      }
      // Label
      this.ctx.font = this.F.SM;
      this.ctx.fillStyle = isActive ? this.C.GREEN : this.C.TEXT_DIM;
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
        // Reverse-video: green fill, background-color text
        this.ctx.fillStyle = this.C.GREEN;
        this.ctx.fillRect(x - 1, y + 3, w + 2, h - 6);
        this.ctx.fillStyle = '#0A0A0A';
        this.ctx.fillText(pendingStr, x, midY);
      } else if (pv.style === 1 /* PrefixBold */) {
        // Underline the whole pending; bold the matched prefix.
        const mp = pv.matchedPrefixBytes | 0;
        const prefixStr = mp > 0 ? this._utf8Slice(pendingStr, 0, mp) : '';
        const restStr   = mp > 0 ? this._utf8Slice(pendingStr, mp)    : pendingStr;

        // Prefix: bold green
        if (prefixStr) {
          this.ctx.font = 'bold ' + this.F.ZH_MD;
          this.ctx.fillStyle = this.C.GREEN;
          this.ctx.fillText(prefixStr, x, midY);
          const pw = this.ctx.measureText(prefixStr).width;
          this._underline(x, y + h - 4, pw);
          x += pw;
          this.ctx.font = this.F.ZH_MD;
        }
        // Rest: normal green
        if (restStr) {
          this.ctx.fillStyle = this.C.GREEN_DIM;
          this.ctx.fillText(restStr, x, midY);
          const rw = this.ctx.measureText(restStr).width;
          this._underline(x, y + h - 4, rw);
          x += rw;
        }
      } else {
        // None
        this.ctx.fillStyle = this.C.GREEN;
        this.ctx.fillText(pendingStr, x, midY);
        x += w;
      }
    }

    // ── cursor block (reverse-video) ──
    const curW = 2;
    if (cursorBlink !== false) {
      this.ctx.fillStyle = this.C.GREEN;
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
    const TAG_W = 26;

    this.ctx.font        = this.F.XS;
    this.ctx.fillStyle   = this.C.TEXT_DIM;
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('候選', 2, midY);

    this.ctx.fillStyle = this.C.BORDER;
    this.ctx.fillRect(TAG_W, y + 3, 1, h - 6);

    this.ctx.font = this.F.ZH_MD;

    // Prefer the full list so the row can overflow firmware's 5-per-page.
    // Fall back to the page slice if the full list isn't provided.
    const all = (state.allCandidates && state.allCandidates.length)
                ? state.allCandidates
                : (state.candidates ?? []);
    if (all.length === 0) {
      this.ctx.fillStyle = this.C.TEXT_MUTED;
      this.ctx.fillText('(按鍵開始輸入)', TAG_W + 5, midY);
      this._candWindowStart = 0;
      return;
    }

    // Absolute selection; fall back to page-relative when the full list
    // isn't available (JS fallback path).
    const sel = (state.selectedAbs !== undefined && state.selectedAbs !== null)
                ? state.selectedAbs
                : (state.selIdx ?? 0);

    // Width budget. Reserve a small gutter on each side; no page indicator.
    const startX = TAG_W + 5;
    const endX   = this.W - 3;
    const PAD    = 6;   // space between candidates (in px)
    const SLOT_X_PAD = 6; // horizontal padding inside each candidate slot

    // Compute candidate widths once.
    const widths = all.map(c => this.ctx.measureText(c).width + SLOT_X_PAD);

    // Maintain a sliding window start so the selected candidate is visible.
    if (this._candWindowStart === undefined) this._candWindowStart = 0;
    let ws = this._candWindowStart;
    if (sel < ws) ws = sel;                       // scroll left to reveal sel

    // Scroll right until sel fits within [ws .. ws+fit).
    // Compute how many from ws fit in the row width; if sel outside, advance ws.
    const fitFrom = (from) => {
      let x = startX, n = 0;
      for (let i = from; i < all.length; i++) {
        const w = widths[i] + (n > 0 ? PAD : 0);
        if (x + w > endX) break;
        x += w; n++;
      }
      return n;
    };
    while (sel >= ws + fitFrom(ws) && ws < all.length - 1) ws++;
    this._candWindowStart = ws;

    // Render the visible slice.
    let x = startX;
    for (let i = ws; i < all.length; i++) {
      const w = widths[i] + (i > ws ? PAD : 0);
      if (x + w > endX) break;
      const slotX = x + (i > ws ? PAD : 0);
      const slotW = widths[i];
      const isSel = (i === sel);
      if (isSel) {
        this.ctx.fillStyle = this.C.GREEN_MUTED;
        this.ctx.fillRect(slotX - 1, y + 3, slotW + 1, h - 6);
      }
      this.ctx.fillStyle = isSel ? this.C.GREEN : this.C.TEXT;
      this.ctx.fillText(all[i], slotX + SLOT_X_PAD / 2, midY);
      x += w;
    }
  }

  _underline(x, y, w) {
    this.ctx.fillStyle = this.C.GREEN_DIM;
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
      this.ctx.fillStyle = this.C.GREEN_MUTED;
      this.ctx.fillRect(x, y, 2, h);
    }
    this.ctx.fillStyle = active ? this.C.SURFACE2 : 'transparent';
    this.ctx.fillRect(x, y, w, h);

    // Avatar circle
    this.ctx.beginPath();
    this.ctx.arc(x + 16, y + h / 2, 10, 0, Math.PI * 2);
    this.ctx.fillStyle = active ? this.C.GREEN_DIM : this.C.SURFACE2;
    this.ctx.fill();
    if (active) { this.ctx.strokeStyle = this.C.GREEN; this.ctx.lineWidth = 1; this.ctx.stroke(); }
    this.drawLabel(x + 16, y + h / 2, (title ?? '?')[0], {
      font: '11px system-ui', color: active ? this.C.GREEN : this.C.TEXT_DIM,
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
}
