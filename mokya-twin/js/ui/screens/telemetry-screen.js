/**
 * TelemetryScreen — F-1/F-2/F-3(對齊 firmware telemetry_view.c)
 *
 * F-1 本機遙測:電池/電壓/電流/充電溫/上線時間/Channel%/Air tx%
 * F-2 環境感測:氣壓/海拔/溫/濕(無)/磁/加速度
 * F-3 鄰居資訊:peer 列表 SNR/Hops/Heard/Nbrs
 *
 * Keys: LEFT/RIGHT 翻 F1↔F2↔F3↔F4(F4 跳到 telemetry-hist) · BACK 回 home
 *       F-3:UP/DOWN 移動 cursor · OK 進 C-2 node detail
 */

import { BaseScreen } from '../screen-manager.js';
import { NODES } from './nodes-data.js';

const ROW_H = 24;
const ROW_TOP = 50;

export class TelemetryScreen extends BaseScreen {
  constructor(renderer, mie, serial, deps = {}) {
    super(renderer, mie, serial);
    this._page = 1;     // 1=F-1, 2=F-2, 3=F-3
    this._cursor = 0;
    this._deps = deps;
  }

  onEnter(from) {
    super.onEnter(from);
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75, rssi: -82,
    });

    if (this._page === 1) this._renderF1();
    else if (this._page === 2) this._renderF2();
    else this._renderF3();

    r.drawLabel(r.W / 2, 235, '◀ ▶ 翻頁 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  _renderF1() {
    const r = this.r;
    r.drawLabel(4, 30, 'F-1 本機遙測 (1/3)', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    const rows = [
      `Battery   chg|bat 78%  3.92V`,
      `Rails     vbus=5.04V  vsys=4.85V`,
      `Current   ibat=-145mA  ibus=312mA`,
      `Chg temp  31.2C  chg_stat=2`,
      `Uptime    0d 02:14:37`,
      `Channel%  4%`,
      `Air tx%   2%`,
      `          [F-4 趨勢圖另案]`,
    ];
    for (let i = 0; i < rows.length; i++) {
      const dim = (i === 7);
      r.drawLabel(4, ROW_TOP + i * ROW_H + 14, rows[i], {
        font: r.F.MONO_MD ?? r.F.ZH_SM, color: dim ? r.C.TEXT_DIM : r.C.TEXT,
      });
    }
  }

  _renderF2() {
    const r = this.r;
    r.drawLabel(4, 30, 'F-2 環境感測 (2/3)', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    const rows = [
      `Pressure  1012.34 hPa`,
      `Altitude  baro=82m  gps=86m`,
      `Temp      baro=24.7C mag=24.4C imu=25.1C`,
      `Humidity  n/a (Rev A 無感測器)`,
      `Mag (uT)  X=+12.4 Y=-3.7 Z=+44.8`,
      `Accel(mg) X=+8 Y=-21 Z=+994`,
      ``,
      `          [Light/Lux 待感測器]`,
    ];
    for (let i = 0; i < rows.length; i++) {
      const dim = (i === 3 || i === 7);
      r.drawLabel(4, ROW_TOP + i * ROW_H + 14, rows[i], {
        font: r.F.MONO_MD ?? r.F.ZH_SM, color: dim ? r.C.TEXT_DIM : r.C.TEXT,
      });
    }
  }

  _renderF3() {
    const r = this.r;
    const peers = NODES.filter(n => n.user?.id !== this.serial?.myNodeId);
    r.drawLabel(4, 30, `F-3 鄰居資訊 (3/3)  共 ${peers.length}`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // Column header
    r.drawLabel(4, 50, 'Peer      SNR     Hops Heard Nbrs', {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    if (peers.length === 0) {
      r.drawLabel(4, 84, '  (尚無鄰居)', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
      return;
    }

    if (this._cursor >= peers.length) this._cursor = peers.length - 1;
    const top = Math.max(0, Math.min(this._cursor - 3, peers.length - 7));
    for (let i = 0; i < 7; i++) {
      const idx = top + i;
      if (idx >= peers.length) break;
      const p = peers[idx];
      const focused = (idx === this._cursor);
      const snr = (p.snr === null || p.snr === undefined) ? '--'
                  : ((p.snr >= 0 ? '+' : '') + p.snr.toFixed(1) + 'dB');
      const hops = p.hops_away === undefined || p.hops_away === 0xFF ? '--' : `${p.hops_away}h`;
      const heard = p.last_heard ?? '--';
      const nbrs  = p.signal_history?.length ?? 0;
      const name = (p.user?.short_name ?? '?').slice(0, 8).padEnd(8);
      const line = `${focused ? '>' : ' '}${name} ${snr.padEnd(7)} ${hops.padEnd(4)} ${String(heard).slice(0, 5).padEnd(5)} ${nbrs}`;
      r.drawLabel(4, 70 + i * ROW_H + 14, line, {
        font: r.F.MONO_MD ?? r.F.ZH_SM,
        color: focused ? r.C.FOCUS : r.C.TEXT,
      });
    }
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    if (fn === 'LEFT')  {
      if (this._page === 1) {
        // wrap to F-4
        this.goto('telemetry-hist', 'slide_r');
      } else this._page--;
      return;
    }
    if (fn === 'RIGHT') {
      if (this._page === 3) {
        this.goto('telemetry-hist', 'slide_l');
      } else this._page++;
      return;
    }
    if (this._page === 3) {
      const peers = NODES.filter(n => n.user?.id !== this.serial?.myNodeId);
      if (fn === 'UP')   { if (this._cursor > 0) this._cursor--; return; }
      if (fn === 'DOWN') { if (this._cursor + 1 < peers.length) this._cursor++; return; }
      if (fn === 'OK') {
        const peer = peers[this._cursor];
        if (peer && this._deps.nodeDetail) {
          this._deps.nodeDetail.setNode?.(peer);
          this.goto('node-detail', 'slide_l');
        }
        return;
      }
    }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }
}
