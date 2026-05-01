/**
 * SnifferScreen — T-4 封包嗅探(對齊 firmware sniffer_view.c)
 *
 * Layout(panel 320 × 224):
 *   y   0..15   header  "T-4 嗅探  N/16  total=M"
 *   y  16..183  7 rows × 24 px(16-entry ring,newest first)
 *   y 184..207  detail line for cursor packet
 *   y 208..223  hint    "UP/DN 翻包  BACK 工具"
 *
 * Row format: ">FROM8  PN  16-hex-chars  ±SNR" — PN mnemonic
 * (TXT/POS/NDI/ROU/ADM/RNG/TLM/TR/NBR)。
 *
 * Keys: UP/DOWN 翻 cursor · BACK 回 T-0
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const HEADER_Y = 30;
const ROW_FIRST_BASE = 47;        // panel y=31, glyph top y=34
const ROW_H = 24;
const VISIBLE_ROWS = 6;           // 6 rows × 24 = 144 (panel y=31..175)
const DETAIL_BASE = 195;          // detail line baseline (panel y=179)

// PortNum mnemonic table (subset).
const PORTNUM_MAP = {
  1: 'TXT', 2: 'RMT', 3: 'POS', 4: 'NDI', 5: 'ROU', 6: 'ADM',
  66: 'RNG', 67: 'TLM', 70: 'TR',  71: 'NBR',
};

function genMockPackets(count = 16) {
  const peers = ['TNGB-50ca', 'BASE-09', 'rpoc-12', 'a3c8'];
  const ports = [1, 3, 4, 5, 6, 67, 71];
  const ring = [];
  let ep = 1745923100;
  for (let i = 0; i < count; i++) {
    const port = ports[(i * 3) % ports.length];
    const bytes = new Uint8Array(8 + ((i * 5) % 8));
    for (let j = 0; j < bytes.length; j++) bytes[j] = (i * 17 + j * 31) & 0xff;
    const more = new Uint8Array(Math.max(0, ((i * 5) % 8)));
    for (let j = 0; j < more.length; j++) more[j] = (i * 41 + j * 13) & 0xff;
    ring.push({
      from: peers[i % peers.length],
      port,
      hex:  Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
      moreHex: Array.from(more).map(b => b.toString(16).padStart(2, '0')).join(''),
      snr:  +((Math.random() * 12 - 4)).toFixed(1),
      rssi: -90 - (i * 3) % 25,
      ep:   ep - i * 17,
    });
  }
  return ring;
}

export class SnifferScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._cursor = 0;
    this._ring = [];
    this._total = 0;
  }

  onEnter(from) {
    super.onEnter(from);
    this._ring = genMockPackets(16);
    this._total = 1247;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    r.drawLabel(4, HEADER_Y, `T-4 嗅探  ${this._ring.length}/16  total=${this._total}`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // List — show VISIBLE_ROWS rows starting at cursor scroll window
    const top = Math.max(0, Math.min(this._cursor - 2, this._ring.length - VISIBLE_ROWS));
    for (let i = 0; i < VISIBLE_ROWS; i++) {
      const idx = top + i;
      if (idx >= this._ring.length) break;
      const e = this._ring[idx];
      const focused = (idx === this._cursor);
      const y = ROW_FIRST_BASE + i * ROW_H;
      const portM = PORTNUM_MAP[e.port] ?? String(e.port).padStart(3, '0');
      const snrStr = (e.snr >= 0 ? '+' : '') + e.snr.toFixed(1);
      const line = `${focused ? '>' : ' '}${e.from.slice(0, 8).padEnd(8)} ${portM.padEnd(3)} ${e.hex.slice(0, 16)} ${snrStr}`;
      r.drawLabel(4, y, line, {
        font: r.F.MONO_MD ?? r.F.ZH_SM,
        color: focused ? r.C.FOCUS : r.C.TEXT,
      });
    }

    // Detail line — y=195 baseline (glyph 182..198) clear of last row (162..178)
    const cur = this._ring[this._cursor];
    const detail = cur
      ? (cur.moreHex
          ? `more: ${cur.moreHex}  RSSI=${cur.rssi}  ep=${cur.ep}`
          : `(none)  RSSI=${cur.rssi}  ep=${cur.ep}`)
      : '(no packets — wait for cascade RX)';
    r.drawLabel(4, DETAIL_BASE, detail, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });

    r.drawHintBar([
      { key: 'UP', label: '' },
      { key: 'DN', label: '翻包  BACK 工具' }
    ]);
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N = this._ring.length;
    if (fn === 'UP')   { if (this._cursor > 0) this._cursor--; return; }
    if (fn === 'DOWN') { if (this._cursor + 1 < N) this._cursor++; return; }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }
}
