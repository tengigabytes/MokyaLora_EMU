/**
 * NodeOpsScreen — C-3 節點操作(對齊 firmware node_ops_view.c)
 *
 * Header: "Ops: <name> !<peer-hex>" 或 "Ops: (no node)"
 * 8 列操作:
 *   DM / Set alias / Favorite [on|off] / Ignore [on|off] /
 *   Traceroute (send) / Request position / Remote admin (reboot/reset) /
 *   Navigate to map (D-6)
 *
 * Keys: UP/DOWN 移 cursor · OK fire op · BACK 回 C-2
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const ROW_H = 24;
const ROW_TOP = 50;

export class NodeOpsScreen extends BaseScreen {
  constructor(renderer, mie, serial, deps = {}) {
    super(renderer, mie, serial);
    this._sel = 0;
    this._node = null;
    this._feedback = null;
    this._deps = deps;
  }

  setNode(node) { this._node = node; this._feedback = null; }

  onEnter(from) { super.onEnter(from); this._feedback = null; }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    const n = this._node;
    let header;
    if (this._feedback) {
      header = this._feedback;
    } else if (!n) {
      header = 'Ops: (no node)';
    } else {
      const nm = n.user?.short_name ?? '?';
      header = `Ops: ${nm} ${n.user?.id ?? '!?'}`;
    }
    r.drawLabel(4, 24, header, {
      font: r.F.ZH_SM,
      color: this._feedback ? r.C.GREEN : r.C.FOCUS,
    });

    const ops = this._buildOps();
    for (let i = 0; i < ops.length; i++) {
      const focused = (i === this._sel);
      const y = ROW_TOP + i * ROW_H + 14;
      r.drawLabel(4, y, `${focused ? '>' : ' '}${ops[i]}`, {
        font: r.F.ZH_SM,
        color: focused ? r.C.FOCUS : r.C.TEXT,
      });
    }

    r.drawHintBar([
      { key: 'OK', label: '執行' },
      { key: 'BACK', label: '詳情' }
    ]);
  }

  _buildOps() {
    const n = this._node;
    const fav = n?.is_favorite ? '[on]' : '[off]';
    const ign = n?.is_ignored  ? '[on]' : '[off]';
    return [
      'DM (open conversation)',
      'Set alias',
      `Favorite  ${fav}`,
      `Ignore    ${ign}`,
      'Traceroute (send)',
      'Request position',
      'Remote admin (reboot/reset)',
      'Navigate to map (D-6)',
    ];
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N = 8;
    if (fn === 'UP')   { if (this._sel > 0) this._sel--; return; }
    if (fn === 'DOWN') { if (this._sel + 1 < N) this._sel++; return; }
    if (fn === 'OK') { this._fire(); return; }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }

  _fire() {
    const n = this._node;
    if (!n) { this._feedback = 'no target'; return; }
    const pid = (0x1000 + ((Math.random() * 0x9000) | 0)).toString(16).toUpperCase();
    switch (this._sel) {
      case 0:
        // DM
        if (this._deps.chatScreen) {
          this._deps.chatScreen.setActivePeer?.(n);
        }
        this.goto('chat', 'slide_l');
        break;
      case 1:
        this._feedback = 'Alias edit (mocked, IME not wired)';
        break;
      case 2:
        n.is_favorite = !n.is_favorite;
        this._feedback = `${n.is_favorite ? 'Set' : 'Cleared'} favorite (pid=0x${pid})`;
        break;
      case 3:
        n.is_ignored = !n.is_ignored;
        this._feedback = `${n.is_ignored ? 'Set' : 'Cleared'} ignored (pid=0x${pid})`;
        break;
      case 4:
        this._feedback = `Traceroute sent (pid=0x${pid}) — see RTT for reply`;
        break;
      case 5:
        this._feedback = `Position request sent (pid=0x${pid})`;
        break;
      case 6:
        if (this._deps.remoteAdmin) {
          this._deps.remoteAdmin.setNode?.(n);
        }
        this.goto('remote-admin', 'slide_l');
        break;
      case 7:
        if (this._deps.mapNav) {
          this._deps.mapNav.setTarget?.(n);
        }
        this.goto('waypoint-nav', 'slide_l');
        break;
    }
  }
}
