/**
 * TracerouteScreen — T-1 Traceroute(對齊 firmware traceroute_view.c)
 *
 * 對 MIE Unifont 重排 — 16 px glyph + ascender 13:每段給 3-5 px breathing
 * room 避免 glyph 邊到邊互相貼到看似重疊。
 *
 *   y   0..15   status bar(全域)
 *   y  17..33   header glyph    baseline 30
 *   y  34..36   3 px pad
 *   y  36..132  5 list rows × 20 px,baselines 49/69/89/109/129
 *               glyphs 36..52, 56..72, 76..92, 96..112, 116..132
 *   y 133..139  pad + divider y=140
 *   y 143..219  4 result rows × 20 px,baselines 156/176/196/216
 *   y 224..239  hint bar(全域)
 *
 * Keys: UP/DOWN 選 peer · OK 送出 traceroute · BACK 回 T-0
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';
import { NODES }     from './nodes-data.js';

const HEADER_Y          = 30;     // glyph top y=17(1 px clear of status border)
const LIST_FIRST_BASE   = 49;     // row 0 box y=36, glyph top y=36
const LIST_ROW_H        = 20;
const LIST_ROWS         = 5;
const DIVIDER_Y         = 140;    // 8 px below row 4 glyph bottom
const RESULT_FIRST_BASE = 156;    // box y=143, glyph top y=143
const RESULT_ROW_H      = 20;

export class TracerouteScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = 0;
    this._scroll = 0;
    this._pending = null;
    this._routes = new Map();
  }

  onEnter(from) {
    super.onEnter(from);
  }

  _peers() {
    return NODES.filter(n => n.user?.id && n.user.id !== this.serial?.myNodeId);
  }

  _clampScroll(total) {
    if (total === 0) { this._sel = 0; this._scroll = 0; return; }
    if (this._sel >= total) this._sel = total - 1;
    if (this._sel < this._scroll) this._scroll = this._sel;
    if (this._sel >= this._scroll + LIST_ROWS) this._scroll = this._sel - LIST_ROWS + 1;
    if (this._scroll + LIST_ROWS > total) {
      this._scroll = Math.max(0, total - LIST_ROWS);
    }
  }

  _checkPending() {
    if (!this._pending) return;
    const dt = performance.now() - this._pending.sentMs;
    if (dt < 2000) return;
    const peers = this._peers();
    const targetIdx = peers.findIndex(p => p.user.id === this._pending.peer);
    if (targetIdx < 0) { this._pending = null; return; }
    const candidates = peers.filter(p => p.user.id !== this._pending.peer).slice(0, 4);
    const hopCount = Math.min(candidates.length, 1 + ((Math.random() * 3) | 0));
    const hops = candidates.slice(0, hopCount).map(p => p.user.short_name ?? '?');
    const snrs = hops.map(() => +(Math.random() * 12 - 4).toFixed(1));
    this._routes.set(this._pending.peer, {
      fwd:   hops.map((n, i) => ({ name: n, snr: snrs[i] })),
      back:  hops.slice().reverse().map((n, i) => ({ name: n, snr: -snrs[snrs.length - 1 - i] / 2 })),
      epoch: Math.floor(performance.now() / 1000),
    });
    this._pending = null;
  }

  render(now) {
    this._checkPending();
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    const peers = this._peers();
    this._clampScroll(peers.length);

    // Header
    let header;
    if (this._pending) {
      const ageS = ((performance.now() - this._pending.sentMs) / 1000) | 0;
      header = `T-1 Traceroute  pending pid=0x${this._pending.pid.toString(16)}  ${ageS}s`;
    } else {
      header = `T-1 Traceroute  (${peers.length} peer)`;
    }
    r.drawLabel(4, HEADER_Y, header, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // List
    for (let i = 0; i < LIST_ROWS; i++) {
      const idx = this._scroll + i;
      if (idx >= peers.length) continue;
      const y = LIST_FIRST_BASE + i * LIST_ROW_H;
      const p = peers[idx];
      const focused = (idx === this._sel);
      const hops = p.hops_away ?? '?';
      const hasRoute = this._routes.has(p.user.id);
      const text = `${focused ? '>' : ' '}${(p.user.short_name ?? '?').padEnd(9)} hops=${hops}${hasRoute ? '  [route OK]' : ''}`;
      r.drawLabel(4, y, text, {
        font: r.F.ZH_SM,
        color: focused ? r.C.FOCUS : r.C.TEXT,
      });
    }

    // Divider — 1 px line above result panel
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(4, DIVIDER_Y, r.W - 8, 1);

    // Result panel
    const peer = peers[this._sel];
    if (!peer) {
      r.drawLabel(4, RESULT_FIRST_BASE, '(no peer)', { font: r.F.ZH_SM, color: r.C.TEXT });
    } else {
      const route = this._routes.get(peer.user.id);
      const nm = peer.user.short_name ?? '?';
      if (!route) {
        r.drawLabel(4, RESULT_FIRST_BASE, `Peer ${nm}  (no route reply yet)`, {
          font: r.F.ZH_SM, color: r.C.TEXT,
        });
      } else {
        r.drawLabel(4, RESULT_FIRST_BASE, `Peer ${nm}  fwd=${route.fwd.length}  back=${route.back.length}  ep=${route.epoch}`, {
          font: r.F.ZH_SM, color: r.C.TEXT,
        });
        const fwdLine = route.fwd.length
          ? `fwd: ${route.fwd.map(h => h.name).join(' -> ')}  (${route.fwd.map(h => (h.snr >= 0 ? '+' : '') + h.snr.toFixed(1)).join(',')} dB)`
          : 'fwd: (direct, 0 hops)';
        const backLine = route.back.length
          ? `back: ${route.back.map(h => h.name).join(' -> ')}  (${route.back.map(h => (h.snr >= 0 ? '+' : '') + h.snr.toFixed(1)).join(',')} dB)`
          : 'back: (no return path)';
        r.drawLabel(4, RESULT_FIRST_BASE + RESULT_ROW_H,     fwdLine.slice(0, 50), { font: r.F.ZH_SM, color: r.C.TEXT });
        r.drawLabel(4, RESULT_FIRST_BASE + RESULT_ROW_H * 2, backLine.slice(0, 50), { font: r.F.ZH_SM, color: r.C.TEXT });
      }
      const hint = route ? 'OK 重發  UP/DOWN 選人' : 'OK 發送  UP/DOWN 選人';
      r.drawLabel(4, RESULT_FIRST_BASE + RESULT_ROW_H * 3, hint, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      });
    }

    r.drawHintBar([
      { key: 'OK',   label: '送出' },
      { key: 'BACK', label: '工具' },
    ]);
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const peers = this._peers();
    const N = peers.length;
    if (fn === 'UP')   { if (this._sel > 0) { this._sel--; this._clampScroll(N); } return; }
    if (fn === 'DOWN') { if (this._sel + 1 < N) { this._sel++; this._clampScroll(N); } return; }
    if (fn === 'OK') {
      const peer = peers[this._sel];
      if (!peer) return;
      this._pending = {
        peer:   peer.user.id,
        pid:    0x1000 + ((Math.random() * 0xFFF) | 0),
        sentMs: performance.now(),
      };
      return;
    }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }
}
