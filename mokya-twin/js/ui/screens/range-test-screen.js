/**
 * RangeTestScreen — T-2 Range Test(對齊 firmware range_test_view.c)
 *
 * Layout(panel 320 × 224):
 *   y   0..15   title  "T-2 Range Test  total=N  mod:ON/OFF"
 *   y  16..31   header "Peer       hits last  SNR    RSSI"
 *   y  32..199  data   7 peer rows × 24 px(RANGE_TEST_PEERS_MAX = 7)
 *   y 200..223  hint   "BACK 工具  (S-7.3 設定模組開關 + 間隔)"
 *
 * EMU 端模擬:從 NODES 表抓最多 7 個 peer,生 mock hits / seq / SNR / RSSI。
 *
 * Keys: BACK 回 T-0
 */

import { BaseScreen } from '../screen-manager.js';
import { NODES }     from './nodes-data.js';

const ROW_H = 24;
const ROW_TOP = 64;     // status bar 16 + title 16 + col header 16 = 48 + status pad

export class RangeTestScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._mockHits = null;
    this._totalHits = 0;
  }

  onEnter(from) {
    super.onEnter(from);
    // Generate mock per-peer counters once on entry.
    this._mockHits = NODES.slice(0, 7).map((p, i) => ({
      peer: p.user?.short_name ?? `?${i}`,
      hits: 4 + ((i * 7 + 3) % 12),
      seq:  100 + ((i * 23 + 7) % 200),
      snr:  +((i * 1.7) % 6 - 3 + Math.random() * 2 - 1).toFixed(2),
      rssi: -90 - ((i * 3) % 25),
    }));
    this._totalHits = this._mockHits.reduce((acc, e) => acc + e.hits, 0);
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75, rssi: -82,
    });

    // Title
    r.drawLabel(4, 30, `T-2 Range Test  total=${this._totalHits}  mod:OFF`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // Column header — monospace alignment
    r.drawLabel(4, 50, 'Peer       hits last  SNR    RSSI', {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // Rows
    for (let i = 0; i < 7; i++) {
      const e = this._mockHits?.[i];
      if (!e) continue;
      const y = ROW_TOP + i * ROW_H;
      const snrSign = e.snr >= 0 ? '+' : '';
      const snrStr = `${snrSign}${e.snr.toFixed(2)}`;
      const line = `${e.peer.padEnd(9)} ${String(e.hits).padStart(4)} ${String(e.seq).padStart(4)}  ${snrStr.padEnd(6)} ${e.rssi}`;
      r.drawLabel(4, y, line, {
        font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
      });
    }

    // Hint at bottom
    r.drawLabel(4, 218, 'BACK 工具    (S-7.3 設定模組開關 + 間隔)', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
