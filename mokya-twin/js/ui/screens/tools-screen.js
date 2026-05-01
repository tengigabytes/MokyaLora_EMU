/**
 * ToolsScreen — T-0 工具主選單(對齊 firmware tools_view.c)
 *
 * 11 列文字選單(8 個 spec 工具 + 3 個 debug 入口)。游標在當前選中
 * 列前綴 ">"，焦點橙色;placeholder 列顯示為 dim 灰且 OK 不導航。
 *
 * Keys: UP/DOWN 移動 · OK 進入 · BACK 回桌面
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const ROW_H = 18;
const HEADER_Y = 30;

// 順序與韌體 tools_view.c s_entries[] 相同。
// EMU 沒有 RF debug overlay / Font test 對應，標記為 placeholder。
const ENTRIES = [
  { label: 'T-1 Traceroute',     target: 'traceroute' },
  { label: 'T-2 Range Test',     target: 'range-test' },
  { label: 'T-3 Spectrum',       target: 'rssi-scan' },
  { label: 'T-4 Sniffer',        target: 'packet-sniff' },
  { label: 'T-5 LoRa Self-test', target: 'lora-self-test' },
  { label: 'T-6 GNSS Sat',       target: 'gnss-sky' },
  { label: 'T-7 Pairing Code',   target: 'admin-pair' },
  { label: 'T-8 Firmware Info',  target: 'fw-info' },
  // EMU 專屬 debug 入口(韌體 release build 同樣是 placeholder)
  { label: 'Dbg: EMU dashboard', target: 'meshtastic' },
  { label: 'Dbg: RF (release)',  placeholder: true },
  { label: 'Dbg: Font (release)',placeholder: true },
];

export class ToolsScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = 0;
  }

  onEnter(from) {
    super.onEnter(from);
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    // Header row(對齊韌體 panel y=0..15 帶 = 螢幕 y=16..31)
    r.drawLabel(6, 28, 'Tools / Diagnostics', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // Rows
    const top = 32;
    for (let i = 0; i < ENTRIES.length; i++) {
      const e = ENTRIES[i];
      const y = top + i * ROW_H + 14;
      const isSel = (i === this._sel);
      const isPh  = !!e.placeholder;
      const prefix = isSel ? '>' : ' ';
      const color = isSel && !isPh
        ? r.C.FOCUS
        : (isPh ? r.C.TEXT_DIM : r.C.TEXT);
      r.drawLabel(6, y, `${prefix} ${e.label}`, {
        font: r.F.ZH_SM, color,
      });
    }

    r.drawHintBar([
      { key: '▲▼',   label: '選擇' },
      { key: 'OK',   label: '進入' },
      { key: 'BACK', label: '返回' },
    ]);
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N = ENTRIES.length;
    if (fn === 'UP')   { if (this._sel > 0) this._sel--; return; }
    if (fn === 'DOWN') { if (this._sel + 1 < N) this._sel++; return; }
    if (fn === 'OK') {
      const e = ENTRIES[this._sel];
      if (e.placeholder || !e.target) return;
      this.goto(e.target, 'slide_l');
      return;
    }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }
}
