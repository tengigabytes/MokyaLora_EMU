/**
 * BatteryScreen — power subsystem dashboard.
 *
 * Surfaces fields from BQ27441 (fuel gauge) and BQ25622 (charger), the
 * two power-management ICs on Rev A. Mock values run a slow random walk
 * with a charge-state machine (CHARGING ↔ IDLE ↔ FULL ↔ FAULT) so the
 * dashboard tells a believable story without a connected device.
 *
 * Once IPC is wired the mock state machine is replaced by
 * `IPC_MSG_POWER_*` handlers.
 */

import { BaseScreen } from '../screen-manager.js';

const STATES = ['CHARGING', 'IDLE', 'FULL', 'FAULT'];

export class BatteryScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._t0 = performance.now();
    this._state = {
      charge_state: 'CHARGING',
      soc:          72,           // %
      voltage:      4080,         // mV
      current:      350,          // mA  (positive = into battery)
      temp:         29.5,         // °C
      vbus:         5050,         // mV
      ibus:         420,          // mA
      vsys:         4280,         // mV
      vpmid:        4980,         // mV
      tdie:         32.5,         // °C
      remaining:    1320,         // mAh remaining
      full_cap:     2000,         // mAh design capacity
      cycle_count:  47,
      mfg_id:       0x6B,         // BQ25622
      fg_id:        0x55,         // BQ27441 device address
    };
    this._lastTick = 0;
    this._scrollY  = 0;
  }

  render(now) {
    const r = this.r;
    r.clear();

    if (now - this._lastTick > 500) { this._tick(); this._lastTick = now; }

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: this._state.soc,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, '電池', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    // ── Big battery glyph ────────────────────────────────────────
    this._drawBatteryGlyph(r, 12, 46, 110, 56, this._state.soc, this._state.charge_state);

    // ── Numbers next to glyph ────────────────────────────────────
    const stateColor = this._stateColor(this._state.charge_state, r.C);
    r.drawLabel(132, 60, `${this._state.soc}%`, {
      font: r.F.ZH_LG, color: stateColor,
    });
    r.drawLabel(132, 80, this._state.charge_state, {
      font: r.F.ZH_SM, color: stateColor,
    });
    r.drawLabel(132, 96, `${this._state.remaining} / ${this._state.full_cap} mAh`, {
      font: r.F.XS, color: r.C.TEXT_DIM,
    });

    // ── Detail rows ──────────────────────────────────────────────
    const rows = [
      ['電壓 (Battery)',  `${(this._state.voltage / 1000).toFixed(2)} V`],
      ['電流 (Battery)',  this._formatCurrent(this._state.current) + ' mA'],
      ['電池溫度',        this._state.temp.toFixed(1) + ' °C'],
      ['VBUS',           `${this._state.vbus} mV`],
      ['IBUS',           `${this._state.ibus} mA`],
      ['VSYS',           `${this._state.vsys} mV`],
      ['VPMID',          `${this._state.vpmid} mV`],
      ['TDIE 溫度',       this._state.tdie.toFixed(1) + ' °C'],
      ['循環次數',        String(this._state.cycle_count)],
      ['Charger I²C',    '0x' + this._state.mfg_id.toString(16).toUpperCase()],
      ['FuelGauge I²C',  '0x' + this._state.fg_id.toString(16).toUpperCase()],
    ];

    const ROW_H = 14;
    const TOP   = 116;
    const bottomLimit = 220;
    const visibleRows = Math.min(rows.length, ((bottomLimit - TOP) / ROW_H) | 0);
    const maxScroll = Math.max(0, rows.length - visibleRows);
    if (this._scrollY > maxScroll) this._scrollY = maxScroll;
    if (this._scrollY < 0)         this._scrollY = 0;

    for (let i = 0; i < visibleRows; i++) {
      const idx = this._scrollY + i;
      if (idx >= rows.length) break;
      const [label, value] = rows[idx];
      const y = TOP + i * ROW_H;
      r.ctx.fillStyle = (i & 1) ? '#161618' : r.C.SURFACE;
      r.ctx.fillRect(8, y, r.W - 16, ROW_H);
      r.drawLabel(12, y + 11, label, { font: r.F.XS, color: r.C.TEXT_DIM });
      r.drawLabel(r.W - 12, y + 11, value, { font: r.F.XS, color: r.C.TEXT, align: 'right' });
    }

    // Scroll indicator
    if (rows.length > visibleRows) {
      const trackH = visibleRows * ROW_H;
      r.ctx.fillStyle = r.C.SURFACE2;
      r.ctx.fillRect(r.W - 4, TOP, 2, trackH);
      const thumbH = Math.max(8, ((visibleRows / rows.length) * trackH) | 0);
      const thumbY = TOP + (((this._scrollY / maxScroll) * (trackH - thumbH)) | 0);
      r.ctx.fillStyle = r.C.GREEN;
      r.ctx.fillRect(r.W - 4, thumbY, 2, thumbH);
    }

    r.drawLabel(r.W / 2, 235, '▲▼ 捲動 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  _drawBatteryGlyph(r, x, y, w, h, soc, state) {
    const TIP_W = 6;
    const bodyW = w - TIP_W;
    // Battery body
    r.drawCard(x, y, bodyW, h, { radius: 4, bg: r.C.SURFACE, border: r.C.BORDER });
    // Battery tip
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(x + bodyW, y + h * 0.25, TIP_W, h * 0.5);

    // Fill
    const innerX = x + 4;
    const innerY = y + 4;
    const innerW = bodyW - 8;
    const innerH = h - 8;
    const fillW  = (innerW * Math.max(0, Math.min(100, soc)) / 100) | 0;
    const fillColor = soc > 50 ? r.C.GREEN
                    : soc > 20 ? r.C.WARNING
                                : r.C.DANGER;
    r.ctx.fillStyle = fillColor;
    r.ctx.fillRect(innerX, innerY, fillW, innerH);

    // Charging bolt overlay
    if (state === 'CHARGING') {
      r.ctx.fillStyle = '#0A0A0A';
      r.ctx.font = r.F.ZH_LG;
      r.ctx.textAlign = 'center';
      r.ctx.textBaseline = 'middle';
      r.ctx.fillText('⚡', x + bodyW / 2, y + h / 2 + 2);
      r.ctx.textAlign = 'left';
      r.ctx.textBaseline = 'alphabetic';
    }
  }

  _stateColor(state, C) {
    switch (state) {
      case 'CHARGING': return C.GREEN;
      case 'FULL':     return C.GREEN;
      case 'IDLE':     return C.TEXT;
      case 'FAULT':    return C.DANGER;
      default:         return C.TEXT_DIM;
    }
  }

  _formatCurrent(mA) {
    if (mA > 0) return `+${mA | 0}`;
    return String(mA | 0);
  }

  /** Drive the charge-state machine forward by one tick. */
  _tick() {
    const s = this._state;
    const drift = (cur, step, lo, hi) =>
      Math.max(lo, Math.min(hi, cur + (Math.random() - 0.5) * step));

    if (s.charge_state === 'CHARGING') {
      s.soc = Math.min(100, s.soc + 0.1);
      if (s.soc >= 100) { s.charge_state = 'FULL'; s.current = 0; }
      else { s.current = drift(s.current, 30, 200, 1100) | 0; }
      s.voltage = drift(s.voltage, 4, 3950, 4250);
    } else if (s.charge_state === 'FULL') {
      s.current = drift(s.current, 4, -10, 10) | 0;
      s.voltage = drift(s.voltage, 1, 4180, 4220);
      // Occasionally fall back to IDLE if user unplugs (mock)
      if (Math.random() < 0.001) { s.charge_state = 'IDLE'; s.vbus = 0; s.ibus = 0; }
    } else if (s.charge_state === 'IDLE') {
      s.soc = Math.max(0, s.soc - 0.02);
      s.current = drift(s.current, 8, -300, -50) | 0;
      s.voltage = drift(s.voltage, 2, 3500, 4100);
      if (Math.random() < 0.002) { s.charge_state = 'CHARGING'; s.vbus = 5050; s.ibus = 420; }
    } else { /* FAULT */
      // recover quickly in mock
      if (Math.random() < 0.05) s.charge_state = 'IDLE';
    }

    s.remaining = ((s.soc / 100) * s.full_cap) | 0;
    s.temp  = drift(s.temp, 0.05, 18, 45);
    s.vbus  = drift(s.vbus,  3, s.charge_state === 'IDLE' ? 0 : 4900, 5200);
    s.ibus  = drift(s.ibus,  10, s.charge_state === 'IDLE' ? 0 : 200, 600) | 0;
    s.vsys  = drift(s.vsys,  3, 4100, 4400);
    s.vpmid = drift(s.vpmid, 3, 4900, 5100);
    s.tdie  = drift(s.tdie, 0.05, 22, 50);
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    if (fn === 'UP')   { this._scrollY = Math.max(0, this._scrollY - 1); return; }
    if (fn === 'DOWN') { this._scrollY += 1; return; }
    if (fn === 'BACK') { this.goBack(); return; }
  }
}
