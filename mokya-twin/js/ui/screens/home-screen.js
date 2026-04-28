/**
 * HomeScreen — boot-time landing page.
 *
 * Layout (320×240 landscape):
 *   y=0..17    Status bar
 *   y=22..58   Big clock (HH:MM, Unifont blitted at 2× via drawImage scale)
 *   y=62..78   Date row (yyyy/MM/dd · 週X)
 *   y=84..136  LoRa status card
 *   y=140..192 GNSS status card
 *   y=200..220 Last message preview
 *   y=224..238 Footer hint "按 OK 開啟選單"
 *
 * Keys: OK → menu (fade). Everything else ignored.
 */

import { BaseScreen } from '../screen-manager.js';
import { SerialState } from '../../serial/meshtastic-serial.js';

export class HomeScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    // Mock GNSS fix until IPC GPS plumbing is in place.
    this._fakeFix = { valid: true, lat: 25.0330, lon: 121.5654, hdop: 1.2 };
  }

  render(now) {
    const r = this.r;
    r.clear();

    const bat = 70 + ((Math.sin(now / 60000) * 10) | 0);
    r.drawStatusBar({
      time:    timeStr(),
      battery: bat,
      rssi:    -82,
    });

    // ── Big clock (Unifont 16px upscaled 2×) ──────────────────────
    const t = timeStr();
    const ctx = r.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(2, 2);
    ctx.fillStyle = r.C.GREEN;
    // After scale(2,2) the canvas treats (x, y) as half-coords.
    // We want 32-px-tall text drawn at y≈54 baseline.
    ctx.fillText(t, 8, 26);
    ctx.restore();

    r.drawLabel(r.W - 5, 30, dateStr(), {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right', baseline: 'alphabetic',
    });
    r.drawLabel(r.W - 5, 48, weekdayStr(), {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right', baseline: 'alphabetic',
    });

    // ── LoRa status card ──────────────────────────────────────────
    r.drawCard(8, 70, r.W - 16, 50, { radius: 6, bg: r.C.SURFACE, border: r.C.BORDER });
    r.drawLabel(14, 86, 'LoRa', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
    const stateText = this._serialStateText();
    const stateColor = this._serialStateColor();
    r.drawLabel(14, 106, stateText, { font: r.F.ZH_MD, color: stateColor });
    r.drawLabel(r.W - 14, 106, 'CH: LongFast', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
    });

    // ── GNSS status card ──────────────────────────────────────────
    r.drawCard(8, 128, r.W - 16, 50, { radius: 6, bg: r.C.SURFACE, border: r.C.BORDER });
    r.drawLabel(14, 144, 'GNSS', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
    if (this._fakeFix.valid) {
      r.drawLabel(14, 164, `Fix · HDOP ${this._fakeFix.hdop.toFixed(1)}`, {
        font: r.F.ZH_MD, color: r.C.GREEN,
      });
      r.drawLabel(r.W - 14, 164,
        `${this._fakeFix.lat.toFixed(3)}, ${this._fakeFix.lon.toFixed(3)}`, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
      });
    } else {
      r.drawLabel(14, 164, '搜尋衛星中…', { font: r.F.ZH_MD, color: r.C.WARNING });
    }

    // ── Last message preview ──────────────────────────────────────
    const last = this._lastMessage();
    if (last) {
      r.drawLabel(14, 198, `${last.from}:`, { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
      r.drawLabel(14, 216, last.text, {
        font: r.F.ZH_MD, color: r.C.TEXT, maxWidth: r.W - 28,
      });
    }

    // ── Footer hint ───────────────────────────────────────────────
    r.drawLabel(r.W / 2, 235, '按 OK 開啟選單', {
      font: r.F.ZH_SM, color: r.C.GREEN_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    if (key.fn === 'OK') this.goto('menu', 'fade');
  }

  _serialStateText() {
    const s = this.serial.state;
    if (s === SerialState.CONNECTED)    return '已連線';
    if (s === SerialState.CONNECTING)   return '連線中…';
    if (s === SerialState.ERROR)        return '錯誤';
    return '模擬模式';
  }

  _serialStateColor() {
    const s = this.serial.state;
    if (s === SerialState.CONNECTED)    return this.r.C.GREEN;
    if (s === SerialState.CONNECTING)   return this.r.C.WARNING;
    if (s === SerialState.ERROR)        return this.r.C.DANGER;
    return this.r.C.TEXT;
  }

  _lastMessage() {
    const msgs = this.serial.getSimMessages?.() ?? [];
    return msgs[msgs.length - 1];
  }
}

function timeStr() {
  return new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

function dateStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${m}/${day}`;
}

function weekdayStr() {
  return ['週日','週一','週二','週三','週四','週五','週六'][new Date().getDay()];
}
