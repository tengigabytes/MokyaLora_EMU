/**
 * SensorsScreen — live readings for the six MokyaLora sensors.
 *
 * Mirrors the firmware sensor_task.c poll loop (~10 Hz) — for each
 * sensor we keep a small ring buffer of recent samples and a base value
 * that drifts via random walk so the EMU shows plausibly noisy data
 * without needing a real device. Once IPC is wired the seed/update path
 * is replaced with `IPC_MSG_SENSOR_*` handlers.
 *
 * Sensors:
 *   1. 氣壓計   LPS22HH    (pressure hPa, temp °C)
 *   2. 磁力計   LIS2MDL    (mag X/Y/Z µT, internal temp)
 *   3. 6 軸 IMU LSM6DSV16X (accel X/Y/Z g, gyro X/Y/Z dps, temp)
 *   4. 燃料計   BQ27441    (V, mA, SoC%, temp)
 *   5. 充電器   BQ25622    (VBUS, IBAT, TS%, TDIE)
 *   6. GNSS    Teseo-LIV3FL (fix/no-fix, sats, hdop)
 *
 * Layout: 6 stacked cards, ~26 px each in y=44..220, current value on
 * the right. UP/DOWN moves selection; OK opens a sub-screen with a
 * sparkline chart of the primary metric. BACK returns to menu.
 */

import { BaseScreen } from '../screen-manager.js';

const SAMPLES = 40;            // sparkline buffer length per metric
const ROW_H   = 28;
const VISIBLE = 6;
const TOP_Y   = 44;

// Per-sensor state. Each sensor exposes:
//   id     short id
//   title  zh label
//   unit   primary metric unit
//   range  [min, max] for sparkline
//   read() returns { primary, secondary?, tertiary? } for the row text
//   tick() advances the random walk
function makeSensors() {
  // Random walk helpers
  const drift = (cur, step, lo, hi) =>
    Math.max(lo, Math.min(hi, cur + (Math.random() - 0.5) * step));

  const baro = { p: 101325, t: 24.5, hist: [] };
  const mag  = { x: 21.0, y: -3.5, z: 38.2, t: 24.0, hist: [] };
  const imu  = { ax: 0.02, ay: -0.04, az: 1.00,
                 gx: 0.5, gy: -0.7, gz: 0.2, t: 25.5, hist: [] };
  const gas  = { v: 4060, i: -85, soc: 78, t: 28.0, hist: [] };
  const chg  = { vbus: 5050, ibat: 320, ts: 28.5, tdie: 32.5, hist: [] };
  const gnss = { fix: true, sats: 9, hdop: 1.2, hist: [] };

  return [
    {
      id: 'baro', title: '氣壓計  LPS22HH', unit: 'hPa', range: [990, 1030],
      read: () => ({ primary: (baro.p / 100).toFixed(1) + ' hPa',
                     secondary: baro.t.toFixed(1) + ' °C' }),
      sample: () => baro.p / 100,
      tick: () => {
        baro.p = drift(baro.p, 8, 99000, 103000);
        baro.t = drift(baro.t, 0.05, 18, 30);
        push(baro.hist, baro.p / 100);
      },
      hist: () => baro.hist,
    },
    {
      id: 'mag', title: '磁力計  LIS2MDL', unit: 'µT', range: [-60, 60],
      read: () => ({ primary: `${mag.x.toFixed(1)},${mag.y.toFixed(1)},${mag.z.toFixed(1)} µT`,
                     secondary: mag.t.toFixed(1) + ' °C' }),
      sample: () => mag.x,
      tick: () => {
        mag.x = drift(mag.x, 0.3, -50, 50);
        mag.y = drift(mag.y, 0.3, -50, 50);
        mag.z = drift(mag.z, 0.3, -50, 50);
        mag.t = drift(mag.t, 0.05, 18, 30);
        push(mag.hist, mag.x);
      },
      hist: () => mag.hist,
    },
    {
      id: 'imu', title: '6 軸 IMU  LSM6DSV16X', unit: 'g', range: [-1.5, 1.5],
      read: () => ({ primary: `A ${imu.ax.toFixed(2)},${imu.ay.toFixed(2)},${imu.az.toFixed(2)} g`,
                     secondary: `G ${imu.gx.toFixed(1)},${imu.gy.toFixed(1)},${imu.gz.toFixed(1)} °/s` }),
      sample: () => Math.sqrt(imu.ax * imu.ax + imu.ay * imu.ay + imu.az * imu.az),
      tick: () => {
        imu.ax = drift(imu.ax, 0.02, -1.2, 1.2);
        imu.ay = drift(imu.ay, 0.02, -1.2, 1.2);
        imu.az = drift(imu.az, 0.02, 0.7, 1.3);
        imu.gx = drift(imu.gx, 0.5, -30, 30);
        imu.gy = drift(imu.gy, 0.5, -30, 30);
        imu.gz = drift(imu.gz, 0.5, -30, 30);
        imu.t  = drift(imu.t, 0.05, 18, 35);
        push(imu.hist, Math.sqrt(imu.ax * imu.ax + imu.ay * imu.ay + imu.az * imu.az));
      },
      hist: () => imu.hist,
    },
    {
      id: 'gas', title: '燃料計  BQ27441', unit: 'V', range: [3.2, 4.4],
      read: () => ({ primary: (gas.v / 1000).toFixed(2) + ' V',
                     secondary: `${gas.i} mA · ${gas.soc}%` }),
      sample: () => gas.v / 1000,
      tick: () => {
        gas.v = drift(gas.v, 4, 3300, 4250);
        gas.i = drift(gas.i, 12, -900, 1500) | 0;
        gas.soc = Math.max(0, Math.min(100, drift(gas.soc, 0.05, 0, 100))) | 0;
        gas.t = drift(gas.t, 0.05, 18, 40);
        push(gas.hist, gas.v / 1000);
      },
      hist: () => gas.hist,
    },
    {
      id: 'chg', title: '充電器  BQ25622', unit: 'mV', range: [4500, 5500],
      read: () => ({ primary: `VBUS ${chg.vbus} mV`,
                     secondary: `IBAT ${chg.ibat | 0} mA · TDIE ${chg.tdie.toFixed(1)} °C` }),
      sample: () => chg.vbus,
      tick: () => {
        chg.vbus = drift(chg.vbus, 8, 4800, 5200);
        chg.ibat = drift(chg.ibat, 15, -200, 1200);
        chg.ts   = drift(chg.ts, 0.1, 20, 80);
        chg.tdie = drift(chg.tdie, 0.05, 22, 50);
        push(chg.hist, chg.vbus);
      },
      hist: () => chg.hist,
    },
    {
      id: 'gnss', title: 'GNSS  Teseo-LIV3FL', unit: 'sats', range: [0, 16],
      read: () => ({ primary: gnss.fix ? `Fix · ${gnss.sats} sats` : '搜尋中…',
                     secondary: gnss.fix ? `HDOP ${gnss.hdop.toFixed(1)}` : '—' }),
      sample: () => gnss.sats,
      tick: () => {
        gnss.sats = Math.max(0, Math.min(16, drift(gnss.sats, 0.4, 0, 16))) | 0;
        gnss.fix  = gnss.sats >= 4;
        gnss.hdop = drift(gnss.hdop, 0.05, 0.6, 4.0);
        push(gnss.hist, gnss.sats);
      },
      hist: () => gnss.hist,
    },
  ];

  function push(arr, v) {
    arr.push(v);
    if (arr.length > SAMPLES) arr.shift();
  }
}

export class SensorsScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sensors = makeSensors();
    // Pre-fill history so charts don't start empty.
    for (let i = 0; i < SAMPLES; i++) for (const s of this._sensors) s.tick();
    this._sel = 0;
    this._lastTick = 0;
    this._detailMode = false;     // false = list view; true = single-sensor chart
  }

  render(now) {
    const r = this.r;
    r.clear();

    // Drive the random walk at ~5 Hz regardless of frame rate.
    if (now - this._lastTick > 200) {
      for (const s of this._sensors) s.tick();
      this._lastTick = now;
    }

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    if (this._detailMode) { this._renderDetail(r, this._sensors[this._sel]); return; }

    r.drawLabel(r.W / 2, 32, '感測器', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    for (let i = 0; i < this._sensors.length; i++) {
      const s = this._sensors[i];
      const y = TOP_Y + i * ROW_H;
      const isSel = (i === this._sel);
      r.drawCard(8, y, r.W - 16, ROW_H - 4, {
        radius: 4,
        bg:     isSel ? r.C.GREEN_MUTED : r.C.SURFACE,
        border: isSel ? r.C.GREEN       : r.C.BORDER,
      });
      const reading = s.read();
      r.drawLabel(14, y + 11, s.title, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : r.C.TEXT,
      });
      r.drawLabel(r.W - 14, y + 11, reading.primary, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : r.C.TEXT, align: 'right',
      });
      if (reading.secondary) {
        r.drawLabel(14, y + 22, reading.secondary, {
          font: r.F.XS, color: r.C.TEXT_DIM,
        });
      }
    }

    r.drawLabel(r.W / 2, 235, '▲▼ 選擇 · OK 細節 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  _renderDetail(r, s) {
    r.drawLabel(r.W / 2, 32, s.title, {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    const reading = s.read();
    r.drawCard(8, 44, r.W - 16, 50, {
      radius: 6, bg: r.C.SURFACE, border: r.C.GREEN,
    });
    r.drawLabel(r.W / 2, 70, reading.primary, {
      font: r.F.ZH_LG, color: r.C.GREEN, align: 'center',
    });
    if (reading.secondary) {
      r.drawLabel(r.W / 2, 88, reading.secondary, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
      });
    }

    // Sparkline
    const hist = s.hist();
    r.drawCard(8, 102, r.W - 16, 100, {
      radius: 4, bg: r.C.SURFACE, border: r.C.BORDER,
    });
    r.drawLineChart(12, 108, r.W - 24, 88, hist, {
      lineColor: r.C.GREEN, fillColor: 'rgba(48,209,88,0.10)',
      minVal: s.range[0], maxVal: s.range[1], gridLines: 4,
    });
    r.drawLabel(14, 116, s.range[1].toString(), { font: r.F.XS, color: r.C.TEXT_DIM });
    r.drawLabel(14, 196, s.range[0].toString(), { font: r.F.XS, color: r.C.TEXT_DIM });

    r.drawLabel(r.W / 2, 235, 'BACK 返回清單', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    if (this._detailMode) {
      if (fn === 'BACK') { this._detailMode = false; return; }
      return;
    }
    const N = this._sensors.length;
    if (fn === 'UP')   { this._sel = (this._sel - 1 + N) % N; return; }
    if (fn === 'DOWN') { this._sel = (this._sel + 1) % N;     return; }
    if (fn === 'OK')   { this._detailMode = true; return; }
    if (fn === 'BACK') { this.goBack(); return; }
  }
}
