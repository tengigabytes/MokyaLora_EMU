/**
 * NodeDetailScreen — per-node info and admin actions.
 *
 * Two tabs (LEFT/RIGHT to switch):
 *   • 資訊 — read-only NodeInfo / Position / DeviceMetrics fields
 *           (mirrors `meshtastic --info`)
 *   • 動作 — selectable actions mirrored on the CLI:
 *             send-dm, ping, traceroute, request_position,
 *             request_telemetry, toggle-favorite, toggle-ignored,
 *             remove. Real IPC isn't wired so each action shows a
 *             toast with a plausible CLI-style result line.
 *
 * Toggle actions mutate the in-memory NodeInfo (is_favorite,
 * is_ignored) so the UI reflects the change immediately. Remove also
 * splices NODES.
 */

import { BaseScreen } from '../screen-manager.js';
import {
  NODES, NODE_ACTIONS, buildNodeInfoFields,
  pushAckResult, pushTracerouteResult, pushSignalSample, formatRelativeTime,
} from './nodes-data.js';
import { SerialState } from '../../serial/meshtastic-serial.js';

const TAB_INFO    = 0;
const TAB_ACTIONS = 1;
const TAB_HISTORY = 2;

const INFO_ROW_H        = 18;
const INFO_VISIBLE_ROWS = 9;
const INFO_LIST_TOP_Y   = 70;

const ACT_ROW_H        = 26;
const ACT_VISIBLE_ROWS = 6;
const ACT_LIST_TOP_Y   = 70;

export class NodeDetailScreen extends BaseScreen {
  constructor(renderer, mie, serial, deps) {
    super(renderer, mie, serial);
    this._node = null;
    this._tab  = TAB_INFO;
    this._infoSel = 0; this._infoTop = 0;
    this._actSel  = 0; this._actTop  = 0;
    this._toast = null;       // { text, until }
    this._deps = deps ?? null;          // { chatScreen }
  }

  setNode(node) {
    this._node = node;
    this._tab  = TAB_INFO;
    this._infoSel = 0; this._infoTop = 0;
    this._actSel  = 0; this._actTop  = 0;
    this._histScroll = 0;        // 0 = top of history view
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

    if (!this._node) {
      r.drawLabel(r.W / 2, 120, '(無節點)', {
        font: r.F.ZH_MD, color: r.C.TEXT_DIM, align: 'center',
      });
      return;
    }
    const n = this._node;

    // Header: name + ID
    const star = n.is_favorite ? '★ ' : '';
    r.drawLabel(8, 30, star + n.user.long_name, {
      font: r.F.ZH_MD, color: r.C.TEXT,
    });
    r.drawLabel(r.W - 8, 30, n.user.id, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
    });

    // Tab strip
    const tabs = ['資訊', '動作', '歷史'];
    const tabY = 42, tabH = 22;
    const tabW = r.W / tabs.length;
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

    if      (this._tab === TAB_INFO)    this._renderInfo(r, n);
    else if (this._tab === TAB_ACTIONS) this._renderActions(r, n);
    else                                this._renderHistory(r, n);

    // Toast
    if (this._toast && now < this._toast.until) {
      r.drawCard(20, 200, r.W - 40, 22, { radius: 6, bg: r.C.SURFACE2, border: r.C.GREEN });
      r.drawLabel(r.W / 2, 215, this._toast.text, {
        font: r.F.ZH_SM, color: r.C.GREEN, align: 'center', maxWidth: r.W - 60,
      });
    } else {
      let hint;
      if      (this._tab === TAB_INFO)    hint = '◀▶ 切換 · ▲▼ 捲動 · BACK 返回';
      else if (this._tab === TAB_ACTIONS) hint = '◀▶ 切換 · ▲▼ 選擇 · OK 執行 · BACK 返回';
      else                                hint = '◀▶ 切換 · ▲▼ 捲動 · BACK 返回';
      r.drawLabel(r.W / 2, 235, hint, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
      });
    }
  }

  _renderInfo(r, n) {
    const fields = buildNodeInfoFields(n);
    const top    = this._infoTop;
    const rows   = Math.min(INFO_VISIBLE_ROWS, fields.length - top);
    for (let i = 0; i < rows; i++) {
      const idx = top + i;
      const f   = fields[idx];
      const y   = INFO_LIST_TOP_Y + i * INFO_ROW_H;
      const isSel = (idx === this._infoSel);
      r.ctx.fillStyle = isSel ? r.C.GREEN_MUTED : '#161618';
      r.ctx.fillRect(4, y, r.W - 8, INFO_ROW_H - 2);
      r.drawLabel(8, y + 13, f.label, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : r.C.TEXT_DIM,
      });
      r.drawLabel(r.W - 8, y + 13, f.value, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : r.C.TEXT, align: 'right',
        maxWidth: r.W - 100,
      });
    }
    if (fields.length > INFO_VISIBLE_ROWS) {
      const trackH = INFO_VISIBLE_ROWS * INFO_ROW_H;
      const trackX = r.W - 2;
      r.ctx.fillStyle = r.C.SURFACE2;
      r.ctx.fillRect(trackX, INFO_LIST_TOP_Y, 2, trackH);
      const thumbH = Math.max(8, ((INFO_VISIBLE_ROWS / fields.length) * trackH) | 0);
      const thumbY = INFO_LIST_TOP_Y +
        (((this._infoTop / Math.max(1, fields.length - INFO_VISIBLE_ROWS)) * (trackH - thumbH)) | 0);
      r.ctx.fillStyle = r.C.GREEN;
      r.ctx.fillRect(trackX, thumbY, 2, thumbH);
    }
  }

  _renderActions(r, n) {
    const top  = this._actTop;
    const rows = Math.min(ACT_VISIBLE_ROWS, NODE_ACTIONS.length - top);
    for (let i = 0; i < rows; i++) {
      const idx = top + i;
      const a   = NODE_ACTIONS[idx];
      const y   = ACT_LIST_TOP_Y + i * ACT_ROW_H;
      const isSel = (idx === this._actSel);

      r.drawCard(8, y, r.W - 16, ACT_ROW_H - 4, {
        radius: 4,
        bg:     isSel ? r.C.GREEN_MUTED : r.C.SURFACE,
        border: isSel ? r.C.GREEN       : r.C.BORDER,
      });

      // Action label (with current state for toggles)
      let label = a.label;
      if (a.id === 'toggle-fav') label = n.is_favorite ? '取消最愛'  : '加入最愛';
      if (a.id === 'toggle-ign') label = n.is_ignored  ? '取消忽略'  : '加入忽略';
      r.drawLabel(14, y + 14, label, {
        font: r.F.ZH_MD, color: isSel ? r.C.GREEN : r.C.TEXT,
      });
      if (isSel) {
        r.drawLabel(r.W - 14, y + 14, '►', {
          font: r.F.ZH_SM, color: r.C.GREEN, align: 'right',
        });
      }
    }
  }

  // ── History tab ─────────────────────────────────────────────
  _renderHistory(r, n) {
    // Layout (y=64..220 content area):
    //   64..104  RSSI sparkline (h=40)
    //   106..120 RSSI stats line
    //   122..136 SNR stats line
    //   140..150 Section divider + label
    //   150..220 Traceroute history (scrollable, ~3 rows × 22 px)
    const samples = n.signal_history ?? [];
    if (samples.length < 2) {
      r.drawLabel(r.W / 2, 130, '(尚無歷史資料)', {
        font: r.F.ZH_MD, color: r.C.TEXT_DIM, align: 'center',
      });
      return;
    }

    // RSSI chart
    const rssiArr = samples.map(s => s.rssi);
    r.drawCard(4, 64, r.W - 8, 40, { radius: 4, bg: r.C.SURFACE, border: r.C.BORDER });
    r.drawLineChart(8, 68, r.W - 16, 32, rssiArr, {
      lineColor: r.C.GREEN, fillColor: 'rgba(48,209,88,0.10)',
      minVal: -120, maxVal: -50, gridLines: 3,
    });
    r.drawLabel(7, 76, 'RSSI', { font: r.F.XS, color: r.C.TEXT_DIM });
    r.drawLabel(r.W - 8, 76, `${samples.length} 筆`, {
      font: r.F.XS, color: r.C.TEXT_DIM, align: 'right',
    });

    // Stats
    const rssiStats = stats(rssiArr);
    const snrStats  = stats(samples.map(s => s.snr));
    r.drawLabel(8, 116, `RSSI 現${rssiStats.last} / 平均${rssiStats.avg} / 最低${rssiStats.min} dBm`, {
      font: r.F.ZH_SM, color: rssiColor(rssiStats.last, r.C),
    });
    r.drawLabel(8, 132, `SNR  現${fmtSnr(snrStats.last)} / 平均${fmtSnr(snrStats.avg)} / 最低${fmtSnr(snrStats.min)} dB`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // Traceroute / ACK 測試 section header
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(4, 144, r.W - 8, 1);
    r.drawLabel(8, 158, 'Traceroute · sendtext --ack', {
      font: r.F.ZH_SM, color: r.C.GREEN_DIM,
    });

    // Combined recent activity: traceroutes + sendtext ACKs, time desc.
    const events = [
      ...(n.traceroute_history ?? []).map(e => ({ kind: 'tr', t_ms: e.t_ms, e })),
      ...(n.ack_history        ?? []).map(e => ({ kind: 'ak', t_ms: e.t_ms, e })),
    ].sort((a, b) => b.t_ms - a.t_ms);

    const ROW_H = 16;
    const VISIBLE = 4;
    const startY = 162;
    const top = Math.max(0, Math.min(this._histScroll, events.length - VISIBLE));
    const rows = Math.min(VISIBLE, events.length - top);
    for (let i = 0; i < rows; i++) {
      const ev = events[top + i];
      const y = startY + i * ROW_H;
      const rel = formatRelativeTime(ev.t_ms);
      if (ev.kind === 'tr') {
        const e = ev.e;
        const path = e.hops.map(h => h.replace(/^!/, '')).join('→');
        r.drawLabel(8, y + 12, `TR ${rel}`, { font: r.F.XS, color: r.C.GREEN });
        r.drawLabel(50, y + 12, path, {
          font: r.F.XS, color: r.C.TEXT, maxWidth: r.W - 60,
        });
      } else {
        // ACK row: latency from sendtext --ack; the ACK comes from the
        // first hop only, so for hops_away≥2 it's not an end-to-end
        // confirmation. Annotate accordingly.
        const e = ev.e;
        const ico = e.ok ? '✓' : '✗';
        const lat = e.ok ? `${e.latency_ms} ms` : '逾時';
        const hopNote = e.hop > 1 ? ` (hop ${e.hop})` : '';
        r.drawLabel(8, y + 12, `AK ${rel}`, { font: r.F.XS, color: e.ok ? r.C.GREEN : r.C.DANGER });
        r.drawLabel(50, y + 12, `${ico} ${lat}${hopNote}`, {
          font: r.F.XS, color: e.ok ? r.C.TEXT : r.C.DANGER,
        });
      }
    }
    if (events.length > VISIBLE) {
      const trackH = VISIBLE * ROW_H;
      const trackX = r.W - 2;
      r.ctx.fillStyle = r.C.SURFACE2;
      r.ctx.fillRect(trackX, startY, 2, trackH);
      const thumbH = Math.max(8, ((VISIBLE / events.length) * trackH) | 0);
      const thumbY = startY +
        (((top / Math.max(1, events.length - VISIBLE)) * (trackH - thumbH)) | 0);
      r.ctx.fillStyle = r.C.GREEN;
      r.ctx.fillRect(trackX, thumbY, 2, thumbH);
    }
    if (events.length === 0) {
      r.drawLabel(r.W / 2, 188, '(尚未執行 ACK 測試 / Traceroute)', {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
      });
    }
  }

  // ── Key handling ────────────────────────────────────────────
  handleKeyTap({ key }) {
    const fn = key.fn;
    if (!this._node) { if (fn === 'BACK') this.goBack(); return; }

    if (fn === 'BACK') { this.goBack(); return; }

    if (fn === 'LEFT')  { this._tab = (this._tab - 1 + 3) % 3; return; }
    if (fn === 'RIGHT') { this._tab = (this._tab + 1) % 3;     return; }

    if (this._tab === TAB_INFO) {
      const fields = buildNodeInfoFields(this._node);
      const N = fields.length;
      if (fn === 'UP')   { this._infoSel = (this._infoSel - 1 + N) % N; this._ensureInfoVisible(N); return; }
      if (fn === 'DOWN') { this._infoSel = (this._infoSel + 1) % N;     this._ensureInfoVisible(N); return; }
      return;
    }

    if (this._tab === TAB_ACTIONS) {
      const N = NODE_ACTIONS.length;
      if (fn === 'UP')   { this._actSel = (this._actSel - 1 + N) % N; this._ensureActVisible(); return; }
      if (fn === 'DOWN') { this._actSel = (this._actSel + 1) % N;     this._ensureActVisible(); return; }
      if (fn === 'OK')   { this._runAction(NODE_ACTIONS[this._actSel].id); return; }
      return;
    }

    // History tab
    if (fn === 'UP')   { this._histScroll = Math.max(0, this._histScroll - 1); return; }
    if (fn === 'DOWN') { this._histScroll += 1; return; }
  }

  _runAction(id) {
    const n = this._node;
    const idShort = n.user.id;
    const live = this.serial?.state === SerialState.CONNECTED;
    let msg;
    switch (id) {
      case 'send-dm':
        if (this._deps?.chatScreen) {
          this._deps.chatScreen.setRecipient(n.user.id, n.user.long_name);
        }
        this.goto('chat', 'slide_l');
        return;

      case 'sendtext-ack':
        if (live) {
          this.serial.sendTextMessage('ping', { to: n.user.id, wantAck: true })
            .catch(err => this._setToast(`✗ ${err.message}`));
          msg = `→ sendtext "ping" --ack ${idShort}  …等待 ACK`;
        } else {
          msg = this._mockSendtextAck(n);
        }
        break;

      case 'traceroute':
        if (live) {
          this.serial.sendTraceroute(n.user.id)
            .catch(err => this._setToast(`✗ ${err.message}`));
          msg = `→ traceroute ${idShort}  …等待回應`;
        } else {
          msg = this._mockTraceroute(n);
        }
        break;

      case 'req-pos':
        if (live) {
          this.serial.requestPosition(n.user.id)
            .catch(err => this._setToast(`✗ ${err.message}`));
        }
        msg = `→ request-position ${idShort}  ${live ? '✓ 已送出' : '(mock)'}`;
        break;

      case 'req-tel':
        if (live) {
          this.serial.requestTelemetry(n.user.id)
            .catch(err => this._setToast(`✗ ${err.message}`));
        }
        msg = `→ request-telemetry ${idShort}  ${live ? '✓ 已送出' : '(mock)'}`;
        break;

      case 'reboot':
        if (live) {
          this.serial.adminReboot(n.user.id, 5)
            .catch(err => this._setToast(`✗ ${err.message}`));
          msg = `→ reboot ${idShort}  ✓ 已送出 (admin)`;
        } else {
          msg = `→ reboot ${idShort}  ⚠ 需連線 + admin 通道`;
        }
        break;

      case 'shutdown':
        if (live) {
          this.serial.adminShutdown(n.user.id, 5)
            .catch(err => this._setToast(`✗ ${err.message}`));
          msg = `→ shutdown ${idShort}  ✓ 已送出 (admin)`;
        } else {
          msg = `→ shutdown ${idShort}  ⚠ 需連線 + admin 通道`;
        }
        break;

      case 'toggle-fav':
        n.is_favorite = !n.is_favorite;
        if (live) {
          this.serial.adminSetFavorite(n.user.id, n.is_favorite)
            .catch(err => this._setToast(`✗ ${err.message}`));
        }
        msg = n.is_favorite
          ? `→ set-favorite-node ${idShort}${live ? '' : ' (本地)'}`
          : `→ remove-favorite-node ${idShort}${live ? '' : ' (本地)'}`;
        break;

      case 'toggle-ign':
        n.is_ignored = !n.is_ignored;
        if (live) {
          this.serial.adminSetIgnored(n.user.id, n.is_ignored)
            .catch(err => this._setToast(`✗ ${err.message}`));
        }
        msg = n.is_ignored
          ? `→ set-ignored-node ${idShort}${live ? '' : ' (本地)'}`
          : `→ remove-ignored-node ${idShort}${live ? '' : ' (本地)'}`;
        break;

      case 'remove': {
        if (live) {
          this.serial.adminRemoveNode(n.user.id)
            .catch(err => this._setToast(`✗ ${err.message}`));
        }
        const i = NODES.indexOf(n);
        if (i >= 0) NODES.splice(i, 1);
        this.goBack();
        return;
      }

      default: msg = `${id}: ?`;
    }
    this._setToast(msg);
  }

  _setToast(text) {
    this._toast = { text, until: performance.now() + 2000 };
  }

  // ── Mock fallback (used when not connected) ──────────────
  _mockSendtextAck(n) {
    const directNeighbour = n.hops_away <= 1;
    const base = directNeighbour ? 80 : 60;
    const jit  = directNeighbour ? 200 : 140;
    const latency = base + Math.floor(Math.random() * jit);
    const ok      = n.rssi !== null && Math.random() > 0.05;
    pushAckResult(n, latency, 1, ok);
    if (ok) {
      const rssi = (n.rssi + ((Math.random() - 0.5) * 4)) | 0;
      const snr  = Math.round((n.snr + (Math.random() - 0.5) * 1.5) * 10) / 10;
      pushSignalSample(n, rssi, snr);
    }
    const tag = directNeighbour ? '' : ' (next-hop)';
    return ok ? `→ sendtext --ack ✓ ${latency} ms${tag} (mock)`
              : `→ sendtext --ack ✗ 逾時 (mock)`;
  }
  _mockTraceroute(n) {
    const myId   = '!MOKYA-LOC';
    const others = NODES.filter(o => o !== n).map(o => o.user.id);
    const intermediates = shuffle(others).slice(0, Math.max(0, n.hops_away - 1));
    const hops = [myId, ...intermediates, n.user.id];
    const snr_per_hop = hops.slice(1).map(() => Math.round((n.snr + (Math.random() - 0.5) * 2) * 10) / 10);
    pushTracerouteResult(n, hops, snr_per_hop);
    const path = hops.map(h => h.replace(/^!/, '')).join('→');
    return `→ traceroute  ${path} (mock)`;
  }

  _ensureInfoVisible(total) {
    if (this._infoSel < this._infoTop) this._infoTop = this._infoSel;
    else if (this._infoSel >= this._infoTop + INFO_VISIBLE_ROWS)
      this._infoTop = this._infoSel - INFO_VISIBLE_ROWS + 1;
    if (this._infoTop < 0) this._infoTop = 0;
    if (this._infoTop > total - INFO_VISIBLE_ROWS)
      this._infoTop = Math.max(0, total - INFO_VISIBLE_ROWS);
  }

  _ensureActVisible() {
    const N = NODE_ACTIONS.length;
    if (this._actSel < this._actTop) this._actTop = this._actSel;
    else if (this._actSel >= this._actTop + ACT_VISIBLE_ROWS)
      this._actTop = this._actSel - ACT_VISIBLE_ROWS + 1;
    if (this._actTop < 0) this._actTop = 0;
    if (this._actTop > N - ACT_VISIBLE_ROWS)
      this._actTop = Math.max(0, N - ACT_VISIBLE_ROWS);
  }
}

// ── Local helpers ────────────────────────────────────────────
function stats(arr) {
  if (!arr || arr.length === 0) return { last: 0, avg: 0, min: 0, max: 0 };
  const valid = arr.filter(v => v !== null && !Number.isNaN(v));
  if (valid.length === 0) return { last: 0, avg: 0, min: 0, max: 0 };
  const last = valid[valid.length - 1];
  let sum = 0, min = Infinity, max = -Infinity;
  for (const v of valid) { sum += v; if (v < min) min = v; if (v > max) max = v; }
  const avg = Math.round((sum / valid.length) * 10) / 10;
  return { last, avg, min, max };
}

function fmtSnr(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1);
}

function rssiColor(v, C) {
  if (v === null || v === undefined) return C.TEXT_DIM;
  if (v > -90)  return C.GREEN;
  if (v > -105) return C.WARNING;
  return C.DANGER;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
