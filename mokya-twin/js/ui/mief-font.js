/**
 * MiefFont — MIEF v1 binary font loader and 1bpp glyph blitter.
 *
 * Format (matches firmware/mie/tools/gen_font.py):
 *   Header (12 B LE):  "MIEF" ver(1) px_height(16) bpp(1) flags num_glyphs:u32
 *     flags bit 0 = per-glyph RLE (count,value pairs)
 *   Index (num_glyphs × 8 B):  codepoint:u32 data_offset:u32
 *   Glyph descriptor (5 B): adv_w:u8 box_w:u8 box_h:u8 ofs_x:i8 ofs_y:i8
 *   Bitmap (variable): 1bpp MSB-first, each row padded to whole bytes.
 *
 * Coordinates: ofs_y is the bottom bearing from baseline; positive means
 * the glyph sits above baseline. baselineFromTop = px_height - 3 (descender).
 *
 * Codepoints not in the font are passed to a caller-supplied fallback that
 * renders them with the canvas's native text API (used for emoji etc.).
 */
export class MiefFont {
  constructor() {
    this.pxHeight        = 16;
    this.baselineFromTop = 13;            // px_height − 3-px descender
    this._rle    = false;
    this._data   = null;                  // Uint8Array of the whole file
    this._index  = new Map();             // codepoint → byte-offset into glyph data
    this._glyphs = new Map();             // codepoint → decoded descriptor + bitmap
    this._tinted = new Map();             // `${cp}|${color}` → offscreen HTMLCanvasElement
  }

  async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MIEF fetch failed: HTTP ${res.status}`);
    this._parse(new Uint8Array(await res.arrayBuffer()));
  }

  _parse(u8) {
    if (u8.length < 12 || u8[0] !== 0x4D || u8[1] !== 0x49 ||
        u8[2] !== 0x45 || u8[3] !== 0x46) {
      throw new Error('Not a MIEF binary (magic mismatch)');
    }
    const ver       = u8[4];
    const px        = u8[5];
    const bpp       = u8[6];
    const flags     = u8[7];
    if (ver !== 1 || bpp !== 1) throw new Error(`Unsupported MIEF v${ver} bpp=${bpp}`);

    const dv         = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const numGlyphs  = dv.getUint32(8, true);
    const indexBytes = numGlyphs * 8;
    const dataStart  = 12 + indexBytes;

    for (let i = 0; i < numGlyphs; i++) {
      const cp  = dv.getUint32(12 + i * 8, true);
      const off = dv.getUint32(12 + i * 8 + 4, true);
      this._index.set(cp, dataStart + off);
    }

    this.pxHeight        = px;
    this.baselineFromTop = px - 3;
    this._rle            = (flags & 1) !== 0;
    this._data           = u8;
  }

  has(cp)        { return this._index.has(cp); }
  get loaded()   { return this._data !== null; }
  get glyphCount() { return this._index.size; }

  _decode(cp) {
    const cached = this._glyphs.get(cp);
    if (cached) return cached;
    const off = this._index.get(cp);
    if (off === undefined) return null;

    const u8    = this._data;
    const adv_w = u8[off];
    const box_w = u8[off + 1];
    const box_h = u8[off + 2];
    // i8 sign extend
    const ofs_x = (u8[off + 3] << 24) >> 24;
    const ofs_y = (u8[off + 4] << 24) >> 24;
    let bitmap = null;
    if (box_w > 0 && box_h > 0) {
      const rowBytes = (box_w + 7) >> 3;
      const total    = rowBytes * box_h;
      if (this._rle) {
        bitmap = new Uint8Array(total);
        let src = off + 5, dst = 0;
        while (dst < total) {
          const cnt = u8[src++];
          const val = u8[src++];
          for (let k = 0; k < cnt && dst < total; k++) bitmap[dst++] = val;
        }
      } else {
        bitmap = u8.subarray(off + 5, off + 5 + total);
      }
    }
    const g = { adv_w, box_w, box_h, ofs_x, ofs_y, bitmap };
    this._glyphs.set(cp, g);
    return g;
  }

  /**
   * Total horizontal advance for `text`. Codepoints not in the font are
   * delegated to `fallbackMeasure(ch)` which must return a pixel width.
   */
  measure(text, fallbackMeasure) {
    let w = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      const g  = this._decode(cp);
      if (g)        w += g.adv_w;
      else if (fallbackMeasure) w += fallbackMeasure(ch);
      else          w += this.pxHeight;
    }
    return w;
  }

  /**
   * Draw `text` with baseline at (x, y) in `color`. Returns total advance.
   * Codepoints not in the font invoke `fallbackDraw(ch, cx, y, color)` which
   * must paint the glyph and return its advance width.
   */
  draw(ctx, text, x, y, color, fallbackDraw) {
    let cx = x;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      const g  = this._decode(cp);
      if (g) {
        if (g.bitmap) {
          const tile = this._tint(cp, color, g);
          const dx = (cx + g.ofs_x) | 0;
          const dy = (y - g.ofs_y - g.box_h) | 0;
          ctx.drawImage(tile, dx, dy);
        }
        cx += g.adv_w;
      } else if (fallbackDraw) {
        cx += fallbackDraw(ch, cx, y, color);
      } else {
        cx += this.pxHeight;
      }
    }
    return cx - x;
  }

  /** Build (and cache) an offscreen canvas containing the glyph painted in `color`. */
  _tint(cp, color, g) {
    const key = `${cp}|${color}`;
    let tile = this._tinted.get(key);
    if (tile) return tile;

    const w = g.box_w, h = g.box_h;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cctx = c.getContext('2d');
    const id   = cctx.createImageData(w, h);
    const data = id.data;
    const [r, gr, b, a] = parseColor(color);
    const rowBytes = (w + 7) >> 3;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const bit = (g.bitmap[py * rowBytes + (px >> 3)] >> (7 - (px & 7))) & 1;
        if (bit) {
          const o = (py * w + px) * 4;
          data[o]     = r;
          data[o + 1] = gr;
          data[o + 2] = b;
          data[o + 3] = a;
        }
      }
    }
    cctx.putImageData(id, 0, 0);
    this._tinted.set(key, c);
    return c;
  }
}

function parseColor(s) {
  if (typeof s !== 'string') return [255, 255, 255, 255];
  const t = s.trim();
  if (t[0] === '#') {
    if (t.length === 7) {
      return [
        parseInt(t.slice(1, 3), 16),
        parseInt(t.slice(3, 5), 16),
        parseInt(t.slice(5, 7), 16),
        255,
      ];
    }
    if (t.length === 4) {
      const r = parseInt(t[1] + t[1], 16);
      const g = parseInt(t[2] + t[2], 16);
      const b = parseInt(t[3] + t[3], 16);
      return [r, g, b, 255];
    }
  }
  let m = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    return [+m[1], +m[2], +m[3], m[4] === undefined ? 255 : Math.round(+m[4] * 255)];
  }
  // Fallback: ask the browser via a temp canvas
  const tmp = parseColor._tmp || (parseColor._tmp = document.createElement('canvas').getContext('2d'));
  tmp.fillStyle = '#000';
  tmp.fillStyle = s;
  return parseColor(tmp.fillStyle);
}

/**
 * Patch a CanvasRenderingContext2D so fillText/measureText route through the
 * MIEF bitmap font; codepoints outside the font fall back to the original
 * canvas text API (so emoji, CJK Ext B, etc. still display).
 *
 * Honors textAlign (left/center/right/start/end) and textBaseline (top,
 * middle, alphabetic, bottom). Ignores font size — output is always 16 px.
 */
export function installMiefFont(ctx, font, fallbackFontStr = '14px system-ui,"Apple Color Emoji","Segoe UI Emoji",sans-serif') {
  const origFillText    = ctx.fillText.bind(ctx);
  const origMeasureText = ctx.measureText.bind(ctx);

  // Fallback callbacks measure/draw a single non-MIEF codepoint with the
  // browser's native text rasteriser (no recursion: bypasses the patch).
  const fallbackMeasure = (ch) => {
    const oldFont = ctx.font;
    ctx.font = fallbackFontStr;
    const w = origMeasureText(ch).width;
    ctx.font = oldFont;
    return w;
  };
  const fallbackDraw = (ch, cx, by, color) => {
    const oldFont    = ctx.font;
    const oldFill    = ctx.fillStyle;
    const oldAlign   = ctx.textAlign;
    const oldBaseline = ctx.textBaseline;
    ctx.font         = fallbackFontStr;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    origFillText(ch, cx, by);
    const w = origMeasureText(ch).width;
    ctx.font         = oldFont;
    ctx.fillStyle    = oldFill;
    ctx.textAlign    = oldAlign;
    ctx.textBaseline = oldBaseline;
    return w;
  };

  ctx.fillText = function(text, x, y) {
    const str = String(text);
    const totalW = font.measure(str, fallbackMeasure);

    let dx = x;
    const align = this.textAlign;
    if (align === 'center')                       dx -= totalW / 2;
    else if (align === 'right' || align === 'end') dx -= totalW;

    let by = y;
    const bl = this.textBaseline;
    if      (bl === 'top'    || bl === 'hanging')   by += font.baselineFromTop;
    else if (bl === 'middle')                       by += font.baselineFromTop - font.pxHeight / 2;
    else if (bl === 'bottom' || bl === 'ideographic') by -= (font.pxHeight - font.baselineFromTop);
    // 'alphabetic' (default): y is already the baseline

    font.draw(this, str, dx, by, this.fillStyle, fallbackDraw);
  };

  ctx.measureText = function(text) {
    const w = font.measure(String(text), fallbackMeasure);
    return { width: w };
  };
}
