/**
 * ChannelAddScreen — B-3 加入頻道(對齊 firmware channel_add_view.c)
 *
 * 4 列:Name / Role / PSK(read-only) / Save & broadcast
 *   Header: "B-3 加入頻道  slot=N"
 *   Status row at y=130 (dim, 2-line area)
 *
 * Keys: UP/DOWN 移 cursor / LEFT/RIGHT 切 Role / OK 編 Name 或 送出
 *       BACK 回 channels view
 */

import { BaseScreen } from '../screen-manager.js';

const ROW_H = 24;
const ROW_TOP = 50;
const ROLES = ['PRIMARY', 'SECONDARY'];

function genRandomPsk() {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = (Math.random() * 256) | 0;
  return Array.from(bytes, b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

export class ChannelAddScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = 0;
    this._slot = 1;             // first available slot
    this._name = '';
    this._roleIdx = 1;          // SECONDARY by default for new channels
    this._psk = genRandomPsk();
    this._status = '';
  }

  setSlot(idx) { this._slot = idx; }

  onEnter(from) {
    super.onEnter(from);
    this._status = '';
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75, rssi: -82,
    });

    r.drawLabel(4, 30, `B-3 加入頻道  slot=${this._slot}`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    const rows = [
      { label: 'Name :', value: this._name || '(tap OK to enter)', editable: true },
      { label: 'Role :', value: `${ROLES[this._roleIdx]}  (LEFT/RIGHT)`, editable: true },
      { label: 'PSK  :', value: `random 32 B`, editable: false },
      { label: '>>> Save & broadcast <<<', value: '', editable: true },
    ];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const focused = (i === this._sel);
      const y = ROW_TOP + i * ROW_H + 14;
      const prefix = focused ? '>' : ' ';
      const text = row.value
        ? `${prefix}${row.label.padEnd(7)} ${row.value}`
        : `${prefix}${row.label}`;
      r.drawLabel(4, y, text, {
        font: r.F.ZH_SM,
        color: focused ? r.C.FOCUS : (row.editable ? r.C.TEXT : r.C.TEXT_DIM),
      });
    }

    if (this._status) {
      r.drawLabel(4, 156, this._status, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      });
    }

    r.drawLabel(r.W / 2, 235, 'UP/DN 移動 · OK 進入/送出 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    if (fn === 'UP')   { if (this._sel > 0) this._sel--; return; }
    if (fn === 'DOWN') { if (this._sel < 3) this._sel++; return; }
    if (fn === 'LEFT' || fn === 'RIGHT') {
      if (this._sel === 1) {
        this._roleIdx = (this._roleIdx + (fn === 'LEFT' ? -1 : 1) + ROLES.length) % ROLES.length;
      }
      return;
    }
    if (fn === 'OK') {
      if (this._sel === 0) {
        // Mock IME entry — set a sample name
        this._name = `Ch${this._slot}`;
        this._status = '名稱已設(模擬)';
      } else if (this._sel === 3) {
        if (!this._name) {
          this._status = 'Set a name first (cursor->Name, OK)';
        } else {
          const pid = 0x9000 | ((Math.random() * 0xFFF) | 0);
          this._status = `set_channel sent pid=0x${pid.toString(16)} (apply pending)`;
          setTimeout(() => this.goBack(), 800);
        }
      }
      return;
    }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }
}
