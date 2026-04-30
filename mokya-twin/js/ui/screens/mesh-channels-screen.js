/**
 * MeshChannelsScreen — Meshtastic supports up to 8 channel slots
 * (index 0 is PRIMARY, 1..7 are SECONDARY). Each slot has its own
 * settings (name, PSK, role, uplink/downlink toggles, module settings).
 *
 * Renders an 8-row list. Each row shows index, role, and channel name.
 * OK enters that channel's field list via the shared SettingsListScreen.
 */

import { BaseScreen } from '../screen-manager.js';
import { CHANNELS }    from './mesh-settings-data.js';

const ROW_H        = 26;
const VISIBLE_ROWS = 7;
const LIST_TOP_Y   = 44;

export class MeshChannelsScreen extends BaseScreen {
  constructor(renderer, mie, serial, deps) {
    super(renderer, mie, serial);
    this._sel  = 0;
    this._top  = 0;
    this._deps = deps;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, '頻道', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    const rows = Math.min(VISIBLE_ROWS, CHANNELS.length - this._top);

    for (let i = 0; i < rows; i++) {
      const idx = this._top + i;
      const ch  = CHANNELS[idx];
      const y   = LIST_TOP_Y + i * ROW_H;
      const isSel = (idx === this._sel);

      r.drawCard(8, y, r.W - 16, ROW_H - 4, {
        radius: 4,
        bg:     isSel ? r.C.GREEN_MUTED : r.C.SURFACE,
        border: isSel ? r.C.GREEN       : r.C.BORDER,
      });

      const role = ch.fields.find(f => f.key.endsWith('.role'))?.value ?? 'DISABLED';
      const name = ch.fields.find(f => f.key.endsWith('.settings.name'))?.value ?? '';
      const roleColor = role === 'PRIMARY'   ? r.C.GREEN
                      : role === 'SECONDARY' ? r.C.WARNING
                                              : r.C.TEXT_DIM;

      r.drawLabel(14, y + 16, `[${idx}] ${name || '(未設定)'}`, {
        font: r.F.ZH_MD, color: isSel ? r.C.GREEN : r.C.TEXT,
      });
      r.drawLabel(r.W - 14, y + 16, role, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : roleColor, align: 'right',
      });
    }

    if (CHANNELS.length > VISIBLE_ROWS) {
      const trackH = VISIBLE_ROWS * ROW_H - 4;
      const trackX = r.W - 4;
      r.ctx.fillStyle = r.C.SURFACE2;
      r.ctx.fillRect(trackX, LIST_TOP_Y, 2, trackH);
      const thumbH = Math.max(8, ((VISIBLE_ROWS / CHANNELS.length) * trackH) | 0);
      const thumbY = LIST_TOP_Y +
        (((this._top / Math.max(1, CHANNELS.length - VISIBLE_ROWS)) * (trackH - thumbH)) | 0);
      r.ctx.fillStyle = r.C.GREEN;
      r.ctx.fillRect(trackX, thumbY, 2, thumbH);
    }

    r.drawLabel(r.W / 2, 235, 'OK 編輯 · SET 分享 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N  = CHANNELS.length;
    if (fn === 'UP')   { this._sel = (this._sel - 1 + N) % N; this._ensureVisible(); return; }
    if (fn === 'DOWN') { this._sel = (this._sel + 1) % N;     this._ensureVisible(); return; }
    if (fn === 'OK') {
      const ch = CHANNELS[this._sel];
      const role = ch.fields.find(f => f.key.endsWith('.role'))?.value ?? 'DISABLED';
      // Empty slot → B-3 channel add; populated → B-2 edit (existing path).
      if (role === 'DISABLED') {
        this._deps.channelAdd?.setSlot?.(ch.index);
        this.goto('channel-join', 'slide_l');
        return;
      }
      this._deps.settingsList.setData(`頻道 #${ch.index}`, ch.fields);
      this.goto('mesh-settings-list', 'slide_l');
      return;
    }
    if (fn === 'SET') {
      // B-4 share — only valid on populated channels.
      const ch = CHANNELS[this._sel];
      const role = ch.fields.find(f => f.key.endsWith('.role'))?.value ?? 'DISABLED';
      if (role === 'DISABLED') return;
      const name = ch.fields.find(f => f.key.endsWith('.settings.name'))?.value ?? '';
      this._deps.channelShare?.setChannel?.({ idx: ch.index, name });
      this.goto('channel-share', 'slide_l');
      return;
    }
    if (fn === 'BACK') { this.goBack(); return; }
  }

  _ensureVisible() {
    if (this._sel < this._top) this._top = this._sel;
    else if (this._sel >= this._top + VISIBLE_ROWS) this._top = this._sel - VISIBLE_ROWS + 1;
    if (this._top < 0) this._top = 0;
    if (this._top > CHANNELS.length - VISIBLE_ROWS)
      this._top = Math.max(0, CHANNELS.length - VISIBLE_ROWS);
  }
}
