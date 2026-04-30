/**
 * SosConfigScreen — Z-3 SOS 設定(對齊 doc/ui/01-page-architecture.md Z-3)
 *
 * 4 列設定:廣播間隔 / 目標頻道 / 附加感測器 / 啟動長按時間
 *
 * Keys: UP/DOWN 移 · LEFT/RIGHT 改 · BACK 回 Z-1
 */

import { BaseScreen } from '../screen-manager.js';

const ROW_H = 26;
const ROW_TOP = 50;

const INTERVALS = [10, 15, 30, 60, 120];
const CHANNELS  = ['PRIMARY', 'EMERGENCY', 'ALL'];

export class SosConfigScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = 0;
    this._intervalIdx = 2;       // 30s
    this._channelIdx  = 0;
    this._attachSensors = true;
    this._holdSecs = 5;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75, rssi: -82,
    });

    r.drawLabel(4, 30, 'Z-3 SOS 設定', {
      font: r.F.ZH_SM, color: r.C.WARNING,
    });

    const rows = [
      { label: '廣播間隔',   value: `${INTERVALS[this._intervalIdx]} 秒` },
      { label: '目標頻道',   value: CHANNELS[this._channelIdx] },
      { label: '附加感測器', value: this._attachSensors ? '✓ 開' : '— 關' },
      { label: 'Power 長按', value: `${this._holdSecs} 秒` },
    ];
    for (let i = 0; i < rows.length; i++) {
      const focused = (i === this._sel);
      const y = ROW_TOP + i * ROW_H + 16;
      r.ctx.fillStyle = focused ? r.C.GREEN_MUTED : '#161618';
      r.ctx.fillRect(4, y - 14, r.W - 8, ROW_H - 4);
      r.drawLabel(8, y, rows[i].label, {
        font: r.F.ZH_SM, color: focused ? r.C.GREEN : r.C.TEXT,
      });
      r.drawLabel(r.W - 8, y, rows[i].value, {
        font: r.F.ZH_SM, color: focused ? r.C.GREEN : r.C.TEXT, align: 'right',
      });
    }

    r.drawLabel(r.W / 2, 235, '◀ ▶ 改值 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N = 4;
    if (fn === 'UP')   { if (this._sel > 0) this._sel--; return; }
    if (fn === 'DOWN') { if (this._sel + 1 < N) this._sel++; return; }
    if (fn === 'LEFT' || fn === 'RIGHT') {
      const dir = fn === 'LEFT' ? -1 : 1;
      switch (this._sel) {
        case 0:
          this._intervalIdx = (this._intervalIdx + dir + INTERVALS.length) % INTERVALS.length;
          break;
        case 1:
          this._channelIdx = (this._channelIdx + dir + CHANNELS.length) % CHANNELS.length;
          break;
        case 2:
          this._attachSensors = !this._attachSensors;
          break;
        case 3:
          this._holdSecs = Math.max(3, Math.min(10, this._holdSecs + dir));
          break;
      }
      return;
    }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }
}
