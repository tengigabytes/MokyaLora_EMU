/**
 * NodesScreen — scrollable list of mesh nodes the device has heard
 * recently. Each row shows the node's short name, ID, RSSI / SNR,
 * and last-heard relative time.
 *
 * UP/DOWN — scroll selection
 * OK      — placeholder (will open node detail / DM in a later iteration)
 * BACK    — return to MESHTASTIC sub-menu
 *
 * Mock data until IPC `IPC_MSG_NODE_UPDATE` plumbing is wired.
 */

import { BaseScreen } from '../screen-manager.js';
import { NODES }      from './nodes-data.js';

const ROW_H = 36;
const VISIBLE_ROWS = 5;

export class NodesScreen extends BaseScreen {
  constructor(renderer, mie, serial, deps) {
    super(renderer, mie, serial);
    this._sel  = 0;
    this._top  = 0;
    this._deps = deps ?? null;     // { nodeDetail }
  }

  setDeps(deps) { this._deps = deps; }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, `節點 (${NODES.length})`, {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    const listY = 44;

    for (let i = 0; i < VISIBLE_ROWS; i++) {
      const idx = this._top + i;
      if (idx >= NODES.length) break;
      const n = NODES[idx];
      const y = listY + i * ROW_H;
      const isSel = (idx === this._sel);

      r.drawCard(6, y, r.W - 12, ROW_H - 4, {
        radius: 4,
        bg:     isSel ? r.C.GREEN_MUTED : r.C.SURFACE,
        border: isSel ? r.C.GREEN       : r.C.BORDER,
      });

      const star = n.is_favorite ? '★ ' : '';
      r.drawLabel(12, y + 14, star + n.user.long_name, {
        font: r.F.ZH_MD, color: isSel ? r.C.GREEN : r.C.TEXT,
      });
      r.drawLabel(r.W - 12, y + 14, n.last_heard, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
      });

      // RSSI / SNR / battery row
      const rssiTxt = n.rssi === null ? '— dBm' : `${n.rssi} dBm`;
      const snrTxt  = n.snr  === null ? '— dB'  : `SNR ${n.snr > 0 ? '+' : ''}${n.snr.toFixed(1)}`;
      const batTxt  = `🔋 ${n.device_metrics.battery_level}%`;
      const rssiColor = n.rssi === null ? r.C.TEXT_MUTED
                       : n.rssi > -90  ? r.C.GREEN
                       : n.rssi > -105 ? r.C.WARNING
                                       : r.C.DANGER;
      r.drawLabel(12, y + 28, rssiTxt, { font: r.F.ZH_SM, color: rssiColor });
      r.drawLabel(80, y + 28, snrTxt,  { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
      r.drawLabel(r.W - 12, y + 28, batTxt, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
      });
    }

    // Scroll indicator on the right
    if (NODES.length > VISIBLE_ROWS) {
      const trackX = r.W - 3;
      const trackY = listY;
      const trackH = VISIBLE_ROWS * ROW_H - 4;
      r.ctx.fillStyle = r.C.SURFACE2;
      r.ctx.fillRect(trackX, trackY, 2, trackH);
      const thumbH = Math.max(8, (VISIBLE_ROWS / NODES.length) * trackH | 0);
      const thumbY = trackY + ((this._top / (NODES.length - VISIBLE_ROWS)) * (trackH - thumbH)) | 0;
      r.ctx.fillStyle = r.C.GREEN;
      r.ctx.fillRect(trackX, thumbY, 2, thumbH);
    }

    r.drawLabel(r.W / 2, 235, '▲▼ 選擇 · OK 詳細 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    if (fn === 'UP') {
      this._sel = (this._sel - 1 + NODES.length) % NODES.length;
      this._ensureVisible();
      return;
    }
    if (fn === 'DOWN') {
      this._sel = (this._sel + 1) % NODES.length;
      this._ensureVisible();
      return;
    }
    if (fn === 'OK') {
      if (this._deps?.nodeDetail) {
        this._deps.nodeDetail.setNode(NODES[this._sel]);
        this.goto('node-detail', 'slide_l');
      }
      return;
    }
    if (fn === 'BACK') { this.goBack(); return; }
  }

  _ensureVisible() {
    if (this._sel < this._top)                       this._top = this._sel;
    else if (this._sel >= this._top + VISIBLE_ROWS)  this._top = this._sel - VISIBLE_ROWS + 1;
    if (this._top < 0) this._top = 0;
    if (this._top > NODES.length - VISIBLE_ROWS)
      this._top = Math.max(0, NODES.length - VISIBLE_ROWS);
  }
}
