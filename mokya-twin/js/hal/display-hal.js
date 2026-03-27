/**
 * DisplayHAL — Canvas 2D wrapper mimicking RP2350 + ILI9341 display driver
 *
 * Provides the same interface as the firmware's display HAL:
 *   hal_display_flush(x1, y1, x2, y2, color_buf)  — LVGL flush_cb
 *   hal_display_fill_rect(x, y, w, h, color565)    — fast fill
 *   hal_display_draw_pixel(x, y, color565)          — single pixel
 *   hal_display_set_brightness(0–255)               — PWM backlight
 *   hal_display_clear(color565)                     — full clear
 *
 * Hardware specs:
 *   Controller : ILI9341
 *   Resolution : 320 × 240 (landscape)
 *   Color depth: 16-bit RGB565
 *   Interface  : SPI @ 40 MHz
 *   Backlight  : RP2350 PWM GPIO
 *
 * Phase 4: replace draw calls with WASM framebuffer memcpy.
 */
export class DisplayHAL {
  /**
   * @param {HTMLCanvasElement} canvas  The 320×240 landscape canvas element
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d', { alpha: false });
    /** Hardware framebuffer dimensions (landscape) */
    this.WIDTH  = 320;
    this.HEIGHT = 240;
    /** Backlight 0–255 (mirrors RP2350 PWM) */
    this._brightness = 255;
    /** Global alpha applied to all draws (simulates backlight PWM) */
    this._globalAlpha = 1.0;

    // Simulate hardware uint8_t frame_buffer[320*240*2] in SRAM
    // Each pixel = 2 bytes (RGB565). Kept in sync for WASM hand-off.
    this._frameBuffer = new Uint16Array(this.WIDTH * this.HEIGHT);

    // Lock rendering during LVGL flush to prevent torn frames
    this._flushing = false;

    this._initCanvas();
  }

  _initCanvas() {
    // Fill with black on init (matches ILI9341 reset state)
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
  }

  // ── LVGL flush_cb equivalent ─────────────────────────────────
  /**
   * Copy a rectangular region of the LVGL color buffer to canvas.
   * Called by lv_disp_flush_cb in firmware.
   *
   * @param {number} x1  Left edge (inclusive)
   * @param {number} y1  Top edge  (inclusive)
   * @param {number} x2  Right edge (inclusive)
   * @param {number} y2  Bottom edge (inclusive)
   * @param {Uint16Array|null} colorBuf  RGB565 pixel data, or null to use internal buffer
   */
  flush(x1, y1, x2, y2, colorBuf = null) {
    if (x1 > x2 || y1 > y2) return;
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    if (!colorBuf) return; // Nothing to flush

    const imageData = this.ctx.createImageData(w, h);
    const data      = imageData.data;

    for (let i = 0; i < w * h; i++) {
      const c565 = colorBuf[i];
      // RGB565 → RGBA8888
      data[i * 4 + 0] = ((c565 >> 11) & 0x1F) << 3;        // R
      data[i * 4 + 1] = ((c565 >>  5) & 0x3F) << 2;        // G
      data[i * 4 + 2] =  (c565        & 0x1F) << 3;        // B
      data[i * 4 + 3] = this._brightness;                   // A (backlight)
    }

    this.ctx.putImageData(imageData, x1, y1);
    // Signal LVGL: lv_disp_flush_ready(&disp_drv)  — no-op in JS
  }

  // ── Direct drawing (used by renderer.js) ────────────────────

  /** Fill a rectangle with a CSS color string (fast path) */
  fillRect(x, y, w, h, cssColor) {
    this.ctx.fillStyle = cssColor;
    this.ctx.globalAlpha = this._globalAlpha;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalAlpha = 1.0;
  }

  /** Draw a single pixel (slow, for compatibility) */
  drawPixel(x, y, cssColor) {
    this.ctx.fillStyle = cssColor;
    this.ctx.fillRect(x, y, 1, 1);
  }

  /** Clear full screen */
  clear(cssColor = '#000000') {
    this.ctx.fillStyle = cssColor;
    this.ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
  }

  /** Set backlight brightness 0–255 (mirrors RP2350 PWM duty cycle) */
  setBrightness(level) {
    this._brightness   = Math.max(0, Math.min(255, level));
    this._globalAlpha  = this._brightness / 255;
    // Apply dim overlay to simulate reduced backlight
    if (this._brightness < 255) {
      this.ctx.fillStyle = `rgba(0,0,0,${1 - this._globalAlpha})`;
      this.ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
    }
  }

  /**
   * Convert CSS hex color to RGB565 uint16 (for WASM buffer writes)
   * @param {string} hex  e.g. "#30D158"
   * @returns {number} RGB565
   */
  static cssToRgb565(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
  }

  /**
   * Convert RGB565 to CSS hex string
   * @param {number} c565
   * @returns {string}
   */
  static rgb565ToCss(c565) {
    const r = ((c565 >> 11) & 0x1F) << 3;
    const g = ((c565 >>  5) & 0x3F) << 2;
    const b =  (c565        & 0x1F) << 3;
    return `rgb(${r},${g},${b})`;
  }

  /** Raw 2D context for advanced drawing (renderer.js) */
  getContext() { return this.ctx; }

  get brightness() { return this._brightness; }
}
