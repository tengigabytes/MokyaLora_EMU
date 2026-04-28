/**
 * MessagesScreen — Meshtastic message inbox split into two sections:
 *   • 頻道 — public/group channel feeds
 *   • 私訊 — direct messages from individual nodes
 *
 * LEFT/RIGHT switches between the two sections; UP/DOWN scrolls within
 * the active list; OK opens the selected thread (currently routes to
 * the existing chat-screen — context plumbing is a future change);
 * BACK returns to the MESHTASTIC sub-menu.
 *
 * Lists are mocked until IPC plumbing wires real data through.
 */

import { BaseScreen } from '../screen-manager.js';

const CHANNEL_FEED = [
  { id: 'LongFast',  last: '陽明山訊號穩定', from: 'BM-7388', time: '09:16', unread: 2 },
  { id: 'Emergency', last: '無新訊息',       from: '—',        time: '—',     unread: 0 },
  { id: 'Local',     last: 'tx test 73',     from: 'VK2-101',  time: '08:42', unread: 0 },
];

const PRIVATE_FEED = [
  { from: 'BM-7388',  last: '收到 -82 dBm',    time: '09:16', unread: 1 },
  { from: 'VK2-101',  last: 'SNR +3.8 from Sydney', time: '09:14', unread: 0 },
  { from: 'JA1-Mokya', last: 'こんにちは',      time: '昨天',  unread: 0 },
];

const TAB_CHANNEL = 0;
const TAB_PRIVATE = 1;

export class MessagesScreen extends BaseScreen {
  constructor(renderer, mie, serial, deps) {
    super(renderer, mie, serial);
    this._tab = TAB_CHANNEL;
    this._sel = [0, 0];   // selected row per tab
    this._deps = deps ?? null;     // { chatScreen }
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    // ── Tab strip (頻道 / 私訊) ───────────────────────────────────
    const tabs = ['頻道', '私訊'];
    const tabY = 22, tabH = 22;
    const tabW = r.W / 2;
    for (let i = 0; i < tabs.length; i++) {
      const x = i * tabW;
      const isSel = (i === this._tab);
      r.ctx.fillStyle = isSel ? r.C.GREEN_MUTED : r.C.SURFACE;
      r.ctx.fillRect(x, tabY, tabW, tabH);
      r.drawLabel(x + tabW / 2, tabY + tabH / 2 + 5, tabs[i], {
        font: r.F.ZH_MD, color: isSel ? r.C.GREEN : r.C.TEXT_DIM, align: 'center',
      });
      if (isSel) {
        r.ctx.fillStyle = r.C.GREEN;
        r.ctx.fillRect(x, tabY + tabH - 2, tabW, 2);
      }
    }

    // ── Active list ──────────────────────────────────────────────
    const list = (this._tab === TAB_CHANNEL) ? CHANNEL_FEED : PRIVATE_FEED;
    const sel  = this._sel[this._tab];
    const listY  = tabY + tabH + 4;
    const ROW_H  = 38;

    if (list.length === 0) {
      r.drawLabel(r.W / 2, listY + 40, '(無訊息)', {
        font: r.F.ZH_MD, color: r.C.TEXT_DIM, align: 'center',
      });
    }

    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const y  = listY + i * ROW_H;
      const isSel = (i === sel);

      r.drawCard(6, y, r.W - 12, ROW_H - 4, {
        radius: 4,
        bg:     isSel ? r.C.GREEN_MUTED : r.C.SURFACE,
        border: isSel ? r.C.GREEN       : r.C.BORDER,
      });

      const title = (this._tab === TAB_CHANNEL) ? `# ${it.id}` : it.from;
      r.drawLabel(14, y + 16, title, {
        font: r.F.ZH_MD, color: isSel ? r.C.GREEN : r.C.TEXT,
      });
      r.drawLabel(r.W - 14, y + 16, it.time, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
      });

      const sub = (this._tab === TAB_CHANNEL) ? `${it.from}: ${it.last}` : it.last;
      r.drawLabel(14, y + 30, sub, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, maxWidth: r.W - 60,
      });

      if (it.unread && it.unread > 0) {
        // Unread badge on right
        const bx = r.W - 30, by = y + 22, bw = 20, bh = 14;
        r.drawCard(bx, by, bw, bh, { radius: 7, bg: r.C.GREEN, border: null });
        r.drawLabel(bx + bw / 2, by + bh / 2 + 5, String(it.unread), {
          font: r.F.XS, color: '#0A0A0A', align: 'center',
        });
      }
    }

    r.drawLabel(r.W / 2, 235, '◄► 切換 · OK 開啟 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    if (fn === 'LEFT')  { this._tab = (this._tab + 1) % 2; return; }
    if (fn === 'RIGHT') { this._tab = (this._tab + 1) % 2; return; }
    const list = (this._tab === TAB_CHANNEL) ? CHANNEL_FEED : PRIVATE_FEED;
    if (fn === 'UP') {
      if (list.length === 0) return;
      this._sel[this._tab] = (this._sel[this._tab] - 1 + list.length) % list.length;
      return;
    }
    if (fn === 'DOWN') {
      if (list.length === 0) return;
      this._sel[this._tab] = (this._sel[this._tab] + 1) % list.length;
      return;
    }
    if (fn === 'OK') {
      const chat = this._deps?.chatScreen;
      const i = this._sel[this._tab];
      if (chat) {
        if (this._tab === TAB_CHANNEL) {
          const it = CHANNEL_FEED[i];
          if (it) chat.setChannel(i, it.id);
        } else {
          const it = PRIVATE_FEED[i];
          if (it) chat.setRecipient('!' + it.from.toLowerCase().replace(/\s/g, ''), it.from);
        }
      }
      this.goto('chat', 'slide_l');
      return;
    }
    if (fn === 'BACK') { this.goBack(); return; }
  }
}
