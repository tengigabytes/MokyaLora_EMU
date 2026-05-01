/**
 * RemoteAdminScreen — C-3 sub OP_REMOTE_ADMIN(對齊 firmware remote_admin_view.c)
 *
 * 5 個操作 + 兩段式 arm/confirm(3 秒 timeout):
 *   Reboot 5s / Shutdown 5s / Factory reset config / Factory reset device /
 *   NodeDB reset
 *
 * 第一次 OK 武裝(* prefix + 黃色),3 秒內第二次 OK 確認執行;
 * UP/DOWN/BACK 或超時取消武裝。
 *
 * Keys: UP/DOWN 選 · OK 武裝/確認 · BACK 取消/返回
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const ACTIONS = [
  { label: 'Reboot 5s',           warn: '節點將在 5 秒後重啟' },
  { label: 'Shutdown 5s',         warn: '節點將在 5 秒後關機' },
  { label: 'Factory reset config',warn: '重置設定 (BLE 保留)' },
  { label: 'Factory reset device',warn: '重置全部 (含 BLE)' },
  { label: 'NodeDB reset',        warn: '清節點表 (保留 favorites)' },
];
const ROW_H = 24;
const ROW_TOP = 38;
const ARM_TIMEOUT_MS = 3000;

export class RemoteAdminScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = 0;
    this._node = null;
    this._armed = -1;          // index of armed action; -1 = none
    this._armedAt = 0;
    this._status = '';
  }

  setNode(node) { this._node = node; this._armed = -1; this._status = ''; }

  onEnter(from) { super.onEnter(from); this._armed = -1; this._status = ''; }

  render(now) {
    // Auto-disarm on timeout
    if (this._armed >= 0 && performance.now() - this._armedAt > ARM_TIMEOUT_MS) {
      this._armed = -1;
      this._status = '';
    }

    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    const target = this._node?.user?.short_name ?? '(no target)';
    r.drawLabel(4, 30, `C-3 Remote Admin -> ${target}`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    for (let i = 0; i < ACTIONS.length; i++) {
      const focused = (i === this._sel);
      const isArmed = (i === this._armed);
      const prefix = isArmed ? '*' : (focused ? '>' : ' ');
      const color = isArmed ? r.C.WARNING : (focused ? r.C.FOCUS : r.C.TEXT);
      r.drawLabel(4, ROW_TOP + i * ROW_H + 14, `${prefix}${ACTIONS[i].label}`, {
        font: r.F.ZH_SM, color,
      });
    }

    // Status / hint at y=176
    if (this._status) {
      r.drawLabel(4, 184, this._status, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      });
    } else if (this._armed >= 0) {
      r.drawLabel(4, 184, `ARM: OK 確認 / BACK 取消 (${ACTIONS[this._armed].warn})`, {
        font: r.F.ZH_SM, color: r.C.WARNING,
      });
    } else {
      r.drawLabel(4, 184, 'UP/DN 選動作  OK 武裝  BACK 返回', {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      });
    }

    // Yellow warning footer at y=200
    r.drawLabel(4, 210, '需 admin channel 啟用或 target admin_key 含本機 pubkey', {
      font: r.F.ZH_SM, color: r.C.WARNING,
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N = ACTIONS.length;
    if (fn === 'UP')   { if (this._sel > 0) this._sel--; this._armed = -1; this._status = ''; return; }
    if (fn === 'DOWN') { if (this._sel + 1 < N) this._sel++; this._armed = -1; this._status = ''; return; }
    if (fn === 'OK') {
      if (this._armed === this._sel) {
        // Confirm fire
        const pid = (0xC000 | ((Math.random() * 0x0FFF) | 0)).toString(16).toUpperCase();
        this._status = `${ACTIONS[this._sel].label} sent (pid=0x${pid})`;
        this._armed = -1;
      } else {
        this._armed = this._sel;
        this._armedAt = performance.now();
        this._status = '';
      }
      return;
    }
    if (fn === 'BACK' || fn === 'FUNC') {
      if (this._armed >= 0) {
        this._armed = -1;
        this._status = '';
      } else {
        this.goBack();
      }
      return;
    }
  }
}
