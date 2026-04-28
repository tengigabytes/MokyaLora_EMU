/**
 * SystemConfigScreen — root of the EMU's system-settings tree.
 * Mirrors MeshConfigScreen's pattern but reads from system-settings-data
 * and uses system-settings-store for persistence. Replaces the legacy
 * settings-screen.js for the top-level menu.
 */

import { BaseScreen } from '../screen-manager.js';
import { SYSTEM_MENU, SYSTEM_GROUPS } from './system-settings-data.js';
import { reset as resetSystem } from './system-settings-store.js';

const ROW_H        = 26;
const VISIBLE_ROWS = 7;
const LIST_TOP_Y   = 44;

export class SystemConfigScreen extends BaseScreen {
  constructor(renderer, mie, serial, deps) {
    super(renderer, mie, serial);
    this._sel  = 0;
    this._top  = 0;
    this._deps = deps;          // { settingsList }
    this._toast = null;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, '系統設定', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    const items = SYSTEM_MENU;
    const rows  = Math.min(VISIBLE_ROWS, items.length - this._top);
    for (let i = 0; i < rows; i++) {
      const idx = this._top + i;
      const it  = items[idx];
      const y   = LIST_TOP_Y + i * ROW_H;
      const isSel = (idx === this._sel);

      r.drawCard(8, y, r.W - 16, ROW_H - 4, {
        radius: 4,
        bg:     isSel ? r.C.GREEN_MUTED : r.C.SURFACE,
        border: isSel ? r.C.GREEN       : r.C.BORDER,
      });
      r.drawLabel(14, y + 16, it.label, {
        font: r.F.ZH_MD, color: isSel ? r.C.GREEN : r.C.TEXT,
      });
      let hint;
      if (it.kind === 'group') {
        const grp = SYSTEM_GROUPS[it.key];
        hint = grp ? `${grp.fields.length} 項 ▶` : '▶';
      } else if (it.kind === 'reset') {
        hint = '⚠';
      } else {
        hint = '▶';
      }
      r.drawLabel(r.W - 14, y + 16, hint, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : r.C.TEXT_DIM, align: 'right',
      });
    }

    if (this._toast && performance.now() < this._toast.until) {
      r.drawCard(20, 200, r.W - 40, 22, { radius: 6, bg: r.C.SURFACE2, border: r.C.GREEN });
      r.drawLabel(r.W / 2, 215, this._toast.text, {
        font: r.F.ZH_SM, color: r.C.GREEN, align: 'center',
      });
    } else {
      r.drawLabel(r.W / 2, 235, '▲▼ 選擇 · OK 進入 · BACK 返回', {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
      });
    }
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N  = SYSTEM_MENU.length;
    if (fn === 'UP')   { this._sel = (this._sel - 1 + N) % N; this._ensureVisible(); return; }
    if (fn === 'DOWN') { this._sel = (this._sel + 1) % N;     this._ensureVisible(); return; }
    if (fn === 'OK') {
      const it = SYSTEM_MENU[this._sel];
      if (it.kind === 'group') {
        const grp = SYSTEM_GROUPS[it.key];
        this._deps.settingsList.setData(grp.title, grp.fields);
        this.goto('system-settings-list', 'slide_l');
      } else if (it.kind === 'reset') {
        resetSystem();
        this._toast = { text: '所有系統設定已重置', until: performance.now() + 1500 };
      }
      return;
    }
    if (fn === 'BACK') { this.goBack(); return; }
  }

  _ensureVisible() {
    if (this._sel < this._top) this._top = this._sel;
    else if (this._sel >= this._top + VISIBLE_ROWS) this._top = this._sel - VISIBLE_ROWS + 1;
    if (this._top < 0) this._top = 0;
    if (this._top > SYSTEM_MENU.length - VISIBLE_ROWS)
      this._top = Math.max(0, SYSTEM_MENU.length - VISIBLE_ROWS);
  }
}
