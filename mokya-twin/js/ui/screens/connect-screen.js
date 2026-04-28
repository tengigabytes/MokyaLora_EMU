/**
 * ConnectScreen — manage the Web Serial / BLE / TCP link to a real
 * Meshtastic device. Replaces the earlier 'connect' placeholder.
 *
 * Layout (320×240 landscape):
 *   y=0..17    Status bar
 *   y=22..38   Title
 *   y=44..104  Big status panel (state · port · baud)
 *   y=108..136 Action card (Connect / Disconnect / Retry)
 *   y=140..148 Section divider + "連接方式"
 *   y=152..220 Method list (USB Serial active, BLE/TCP placeholder)
 *   y=224..238 Footer hint
 *
 * The user picks a row with ▲▼ and presses OK; the action row triggers
 * serial.connect() / serial.disconnect(). Other rows are informational.
 */

import { BaseScreen } from '../screen-manager.js';
import { SerialState } from '../../serial/meshtastic-serial.js';

const ROW_ACTION  = 0;
const ROW_USB     = 1;
const ROW_BLE     = 2;
const ROW_TCP     = 3;
const N_ROWS      = 4;

export class ConnectScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = ROW_ACTION;
    this._toast = null;     // { text, until }
    this._connectedAt = 0;  // ms timestamp when state went CONNECTED
    this._lastError   = '';
    this._onState = (e) => {
      if (e.detail.state === SerialState.CONNECTED)    this._connectedAt = Date.now();
      if (e.detail.state === SerialState.DISCONNECTED) this._connectedAt = 0;
    };
    this._onError = (e) => {
      this._lastError = e.detail?.message ?? '未知錯誤';
      this._toast = { text: this._lastError, until: performance.now() + 3000 };
    };
  }

  onEnter(from) {
    super.onEnter(from);
    this.serial.addEventListener('serial:state', this._onState);
    this.serial.addEventListener('serial:error', this._onError);
  }

  onLeave(to) {
    this.serial.removeEventListener('serial:state', this._onState);
    this.serial.removeEventListener('serial:error', this._onError);
  }

  render(now) {
    const r = this.r;
    const s = this.serial;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, '連接', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    // ── Big status panel ────────────────────────────────────────
    const panelColor = stateColor(s.state, r.C);
    r.drawCard(8, 44, r.W - 16, 60, {
      radius: 8, bg: r.C.SURFACE, border: panelColor,
    });

    // Status indicator dot + label
    r.ctx.fillStyle = panelColor;
    r.ctx.beginPath(); r.ctx.arc(22, 64, 5, 0, Math.PI * 2); r.ctx.fill();
    r.drawLabel(34, 70, stateText(s.state), {
      font: r.F.ZH_MD, color: panelColor,
    });

    // Sub-line: method · baud / message
    let sub;
    if (s.state === SerialState.CONNECTED) {
      const upS = ((Date.now() - (this._connectedAt || Date.now())) / 1000) | 0;
      sub = `USB Serial · ${s.baudRate} baud · uptime ${formatUptime(upS)}`;
    } else if (s.state === SerialState.CONNECTING) {
      sub = '請在瀏覽器選擇序列埠…';
    } else if (s.state === SerialState.ERROR) {
      sub = this._lastError || '連線失敗';
    } else {
      sub = s.isSupported ? '選擇連線方式並按 OK' : 'Web Serial 不支援於此瀏覽器';
    }
    r.drawLabel(34, 90, sub, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, maxWidth: r.W - 50,
    });

    // ── Action card ─────────────────────────────────────────────
    const actLabel = this._actionLabel();
    const actEnabled = this._actionEnabled();
    const actSel = (this._sel === ROW_ACTION);
    r.drawCard(16, 108, r.W - 32, 26, {
      radius: 6,
      bg:     actSel ? r.C.GREEN_MUTED : r.C.SURFACE,
      border: actSel ? r.C.GREEN       : r.C.BORDER,
    });
    const actColor = !actEnabled ? r.C.TEXT_MUTED
                    : actSel      ? r.C.GREEN
                                   : r.C.TEXT;
    r.drawLabel(r.W / 2, 126, actLabel, {
      font: r.F.ZH_MD, color: actColor, align: 'center',
    });

    // ── Method list section ─────────────────────────────────────
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(8, 144, r.W - 16, 1);
    r.drawLabel(12, 156, '連接方式', {
      font: r.F.ZH_SM, color: r.C.GREEN_DIM,
    });

    const methodRows = [
      { row: ROW_USB, label: 'USB Serial', enabled: s.isSupported, note: s.isSupported ? '可用' : '不支援' },
      { row: ROW_BLE, label: 'BLE',        enabled: false,         note: '尚未實作' },
      { row: ROW_TCP, label: 'TCP',        enabled: false,         note: '尚未實作' },
    ];
    const ROW_H = 18;
    const baseY = 162;
    methodRows.forEach((m, i) => {
      const y = baseY + i * ROW_H;
      const isSel = (this._sel === m.row);
      r.ctx.fillStyle = isSel ? r.C.GREEN_MUTED : '#161618';
      r.ctx.fillRect(8, y, r.W - 16, ROW_H - 2);
      const main   = m.enabled ? r.C.TEXT : r.C.TEXT_DIM;
      const accent = isSel ? r.C.GREEN : r.C.TEXT_DIM;
      r.drawLabel(14, y + 13, m.label, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : main,
      });
      r.drawLabel(r.W - 14, y + 13, m.note, {
        font: r.F.ZH_SM, color: accent, align: 'right',
      });
    });

    // ── Toast / hint ────────────────────────────────────────────
    if (this._toast && now < this._toast.until) {
      r.drawCard(20, 222, r.W - 40, 16, { radius: 4, bg: r.C.SURFACE2, border: r.C.DANGER });
      r.drawLabel(r.W / 2, 234, this._toast.text, {
        font: r.F.XS, color: r.C.DANGER, align: 'center', maxWidth: r.W - 60,
      });
    } else {
      r.drawLabel(r.W / 2, 235, '▲▼ 選擇 · OK 執行 · BACK 返回', {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
      });
    }
  }

  _actionLabel() {
    const s = this.serial.state;
    if (s === SerialState.CONNECTED)  return '中斷連線';
    if (s === SerialState.CONNECTING) return '連線中…';
    if (s === SerialState.ERROR)      return '重試連線';
    return '連線';
  }

  _actionEnabled() {
    const s = this.serial.state;
    if (s === SerialState.CONNECTING) return false;
    if (s === SerialState.DISCONNECTED || s === SerialState.ERROR)
      return this.serial.isSupported;
    return true; // CONNECTED → disconnect always allowed
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    if (fn === 'BACK') { this.goBack(); return; }
    if (fn === 'UP')   { this._sel = (this._sel - 1 + N_ROWS) % N_ROWS; return; }
    if (fn === 'DOWN') { this._sel = (this._sel + 1) % N_ROWS;          return; }
    if (fn === 'OK') {
      if (this._sel === ROW_ACTION && this._actionEnabled()) {
        this._runAction();
      } else if (this._sel === ROW_USB && this.serial.isSupported &&
                 this.serial.state === SerialState.DISCONNECTED) {
        // OK on USB row also triggers connect when disconnected
        this._runAction();
      } else if (this._sel === ROW_BLE || this._sel === ROW_TCP) {
        this._toast = { text: '此連接方式尚未實作', until: performance.now() + 1500 };
      }
    }
  }

  async _runAction() {
    const s = this.serial.state;
    try {
      if (s === SerialState.CONNECTED) {
        await this.serial.disconnect();
      } else {
        await this.serial.connect();
      }
    } catch (err) {
      // serial:error event will populate _lastError; show toast as well.
      this._toast = { text: err.message, until: performance.now() + 3000 };
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────
function stateText(s) {
  switch (s) {
    case SerialState.CONNECTED:    return '● 已連線';
    case SerialState.CONNECTING:   return '○ 連線中';
    case SerialState.ERROR:        return '✗ 連線錯誤';
    default:                       return '— 未連線';
  }
}

function stateColor(s, C) {
  if (s === SerialState.CONNECTED)  return C.GREEN;
  if (s === SerialState.CONNECTING) return C.WARNING;
  if (s === SerialState.ERROR)      return C.DANGER;
  return C.TEXT_DIM;
}

function formatUptime(secs) {
  if (!secs || secs < 0) return '00:00';
  const h = (secs / 3600) | 0;
  const m = ((secs % 3600) / 60) | 0;
  const s = (secs % 60) | 0;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
