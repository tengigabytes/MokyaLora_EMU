/**
 * MeshModulesScreen — list of all 13 module configs (MQTT, Serial,
 * External Notification, Store & Forward, Range Test, Telemetry,
 * Canned Message, Audio, Remote Hardware, Neighbor Info, Ambient
 * Lighting, Detection Sensor, PAX Counter). Mirrors the Python CLI's
 * `module_config.<module>` namespace.
 */

import { BaseScreen } from '../screen-manager.js';
import { MODULE_GROUPS } from './mesh-settings-data.js';

const ROW_H        = 22;
const VISIBLE_ROWS = 8;
const LIST_TOP_Y   = 44;

const MODULE_KEYS = Object.keys(MODULE_GROUPS);

export class MeshModulesScreen extends BaseScreen {
  constructor(renderer, mie, serial, deps) {
    super(renderer, mie, serial);
    this._sel  = 0;
    this._top  = 0;
    this._deps = deps;            // { settingsList }
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, '模組設定', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });
    r.drawLabel(r.W - 6, 32, `${this._sel + 1}/${MODULE_KEYS.length}`, {
      font: r.F.XS, color: r.C.TEXT_DIM, align: 'right',
    });

    const rows = Math.min(VISIBLE_ROWS, MODULE_KEYS.length - this._top);

    for (let i = 0; i < rows; i++) {
      const idx = this._top + i;
      const k   = MODULE_KEYS[idx];
      const grp = MODULE_GROUPS[k];
      const y   = LIST_TOP_Y + i * ROW_H;
      const isSel = (idx === this._sel);

      r.ctx.fillStyle = isSel ? r.C.GREEN_MUTED : '#161618';
      r.ctx.fillRect(4, y, r.W - 8, ROW_H - 2);

      r.drawLabel(8, y + 16, grp.title, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : r.C.TEXT,
      });
      r.drawLabel(r.W - 8, y + 16, `${grp.fields.length} 項 ▶`, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : r.C.TEXT_DIM, align: 'right',
      });
    }

    if (MODULE_KEYS.length > VISIBLE_ROWS) {
      const trackH = VISIBLE_ROWS * ROW_H;
      const trackX = r.W - 2;
      r.ctx.fillStyle = r.C.SURFACE2;
      r.ctx.fillRect(trackX, LIST_TOP_Y, 2, trackH);
      const thumbH = Math.max(8, ((VISIBLE_ROWS / MODULE_KEYS.length) * trackH) | 0);
      const thumbY = LIST_TOP_Y +
        (((this._top / Math.max(1, MODULE_KEYS.length - VISIBLE_ROWS)) * (trackH - thumbH)) | 0);
      r.ctx.fillStyle = r.C.GREEN;
      r.ctx.fillRect(trackX, thumbY, 2, thumbH);
    }

    r.drawLabel(r.W / 2, 235, '▲▼ 選擇 · OK 進入 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N  = MODULE_KEYS.length;
    if (fn === 'UP')   { this._sel = (this._sel - 1 + N) % N; this._ensureVisible(); return; }
    if (fn === 'DOWN') { this._sel = (this._sel + 1) % N;     this._ensureVisible(); return; }
    if (fn === 'OK') {
      const k   = MODULE_KEYS[this._sel];
      const grp = MODULE_GROUPS[k];
      this._deps.settingsList.setData(grp.title, grp.fields);
      this.goto('mesh-settings-list', 'slide_l');
      return;
    }
    if (fn === 'BACK') { this.goBack(); return; }
  }

  _ensureVisible() {
    if (this._sel < this._top) this._top = this._sel;
    else if (this._sel >= this._top + VISIBLE_ROWS) this._top = this._sel - VISIBLE_ROWS + 1;
    if (this._top < 0) this._top = 0;
    if (this._top > MODULE_KEYS.length - VISIBLE_ROWS)
      this._top = Math.max(0, MODULE_KEYS.length - VISIBLE_ROWS);
  }
}
