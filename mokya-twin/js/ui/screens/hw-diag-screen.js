/**
 * HwDiagScreen — 硬體診斷(對齊 firmware hw_diag_view.c, 13 pages)
 *
 * Title: "[硬體診斷] ◀ N/13 name ▶"
 * LEFT/RIGHT 翻頁循環,UP/DOWN/OK 交給 page-specific handler。
 *
 * Pages:
 *   1. GNSS NMEA       — 12 行 raw NMEA scroll + UP 暫停/恢復
 *   2. GNSS Diag       — fix / pos / motion / GST sigma / noise / ANF / sat list
 *   3. GNSS Cfg        — 8 widgets:fix rate / RF debug / cold/warm/hot start / save / SRR / restore
 *   4. GNSS Const      — 9 種 GNSS constellation preset(GPS / GLONASS / Galileo …)
 *   5. GNSS Track      — 7 widgets:tracking / positioning C/N0 / mask angle / integrity / notch / save
 *   6. GNSS NMEA Cfg   — Talker ID / NMEA preset / save
 *   7. GNSS Adv        — Odo / Logger / Geofence / save
 *   8. LED 亮度        — 紅燈 / 綠燈 / 鍵盤背光 / Bank B
 *   9. TFT 背光        — Bank A duty 0..31
 *  10. 按鍵診斷        — 6×6 keypad matrix live
 *  11. 感測器          — IMU / Mag / Baro
 *  12. 充電器讀值      — VBUS/VBAT/VSYS/IBUS/IBAT/TS/TDIE/STAT/Faults/WD
 *  13. 充電控制        — placeholder「尚未實作(Phase 3/4 待補)」
 *
 * Keys: ◀▶ 翻頁 · UP/DOWN/OK 給 page handler · BACK 回 launcher
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const PAGES = [
  'GNSS NMEA',
  'GNSS Diag',
  'GNSS Cfg',
  'GNSS Const',
  'GNSS Track',
  'GNSS NMEA Cfg',
  'GNSS Adv',
  'LED 亮度',
  'TFT 背光',
  '按鍵診斷',
  '感測器',
  '充電器讀值',
  '充電控制',
];

const FIX_RATES = ['OFF', '1Hz', '2Hz', '5Hz', '10Hz'];
const PRESETS_CONST = [
  'GPS only', 'GLONASS only', 'Galileo only', 'BeiDou only', 'QZSS only',
  'GPS + SBAS', 'GPS+GAL+QZSS+GLN', 'GPS+GAL+QZSS+BD', 'GLONASS+BeiDou',
];
const TALKER_IDS    = ['GP', 'GN', 'GA', 'GB', 'GL'];
const NMEA_PRESETS  = ['Minimal', 'Normal', 'Full', 'Debug (+RF)'];
const INTEGRITY     = ['OFF', 'Position', 'Time', 'Both'];
const NOTCH         = ['OFF', 'GPS-normal', 'GLN-normal', 'GPS+GLN-normal', 'Auto-insertion'];

function mockNmeaLine(seq) {
  const t = Date.now() / 1000;
  const lat = (25.0521 + Math.sin(t / 30) * 0.001).toFixed(6);
  const lon = (121.5740 + Math.cos(t / 30) * 0.001).toFixed(6);
  const tid = ['$GNGGA', '$GNRMC', '$GNGSV', '$GNGSA'][seq % 4];
  return `${tid},123519.00,${lat},N,${lon},E,1,08,0.9,42.0,M,16.0,M,,,*47`;
}

export class HwDiagScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._page = 0;

    // Per-page state
    this._nmeaPaused = false;
    this._nmeaSeq    = 0;
    this._nmeaLines  = [];
    this._lastNmea   = 0;

    this._cfgFocus       = 0;
    this._fixRateIdx     = 1;
    this._rfDebugOn      = false;
    this._cfgConfirm     = -1;
    this._cfgConfirmAt   = 0;
    this._cfgStatus      = 'ready';

    this._constFocus = 0;
    this._constActive = 6; // GPS+GAL+QZSS+GLN
    this._constStatus = '↑/↓ select  OK apply (writes NVM + reboot Teseo)';

    this._trackFocus  = 0;
    this._trackVals   = { b1:5, b2:25, b3:30, b4:5, b5:0, e1:0 };
    this._trackDirty  = false;
    this._trackStatus = 'OK adjusts. Apply at bottom to save NVM + SRR.';

    this._nmeaCfgFocus  = 0;
    this._talkerIdx     = 1;
    this._nmeaPresetIdx = 1;
    this._nmeaCfgStatus = '↑/↓ select  OK adjust';

    this._advFocus = 0;
    this._adv = { odoEn: 0, odoNmea: 0, odoAuto: 0, odoAlarm: 0,
                  logEn: 0, logMin: 0 };
    this._advStatus = '↑/↓ select  OK toggle/cycle  (F6 edit deferred)';

    this._ledFocus  = 0;
    this._led = { redOn: 0, redDuty: 1, greenOn: 0, kbdOn: 1, bankB: 16 };

    this._tftDuty = 16;

    this._kpTick   = 0;
    this._kpMatrix = new Array(6 * 6).fill(0);
    this._kpLog    = [];
  }

  onEnter(from) {
    super.onEnter(from);
    if (this._nmeaLines.length === 0) {
      for (let i = 0; i < 12; i++) this._nmeaLines.push(mockNmeaLine(i));
      this._nmeaSeq = 12;
    }
  }

  render(now) {
    const r = this.r;
    r.clear();
    r.drawStatusBar(defaultStatusOpts(this.serial));

    const title = `[硬體診斷] ◀ ${this._page + 1}/${PAGES.length} ${PAGES[this._page]} ▶`;
    r.drawLabel(4, 30, title, { font: r.F.ZH_SM, color: r.C.FOCUS });

    // Refresh NMEA stream
    if (this._page === 0 && !this._nmeaPaused && now - this._lastNmea > 700) {
      this._nmeaLines.shift();
      this._nmeaLines.push(mockNmeaLine(this._nmeaSeq++));
      this._lastNmea = now;
    }
    if (this._page === 9 && now - this._kpTick > 50) {
      this._kpTick = now;
    }

    // Dispatch page renderer
    const fn = ['_p1', '_p2', '_p3', '_p4', '_p5', '_p6', '_p7',
                '_p8', '_p9', '_p10', '_p11', '_p12', '_p13'][this._page];
    this[fn](r);

    r.drawHintBar([
      { key: '◀▶', label: '翻頁' },
      { key: 'OK', label: '互動' },
      { key: 'BACK', label: '返回' },
    ]);
  }

  // ── Page 1: GNSS NMEA ────────────────────────────────────────────
  _p1(r) {
    const F = r.F.MONO_MD ?? r.F.ZH_SM;
    for (let i = 0; i < 12; i++) {
      const y = 56 + i * 14 + 10;
      const line = this._nmeaLines[i] ?? '';
      r.drawLabel(4, y, line.slice(0, 50), { font: r.F.XS, color: r.C.TEXT });
    }
    r.drawLabel(4, 226,
      this._nmeaPaused ? '↑ 已暫停 (再按恢復)' : '↑ 暫停/恢復',
      { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
  }

  // ── Page 2: GNSS Diag ────────────────────────────────────────────
  _p2(r) {
    const F = r.F.MONO_MD ?? r.F.ZH_SM;
    const lines = [
      `Fix=VALID q=3 sats=8  HDOP=0.9  Rate=${FIX_RATES[this._fixRateIdx]}`,
      `Pos 25.0521030, 121.5740390`,
      `UTC 123519  date 010526`,
      `alt=42 m  spd=0.0 km/h  hdg=0.0 deg`,
      `GST sigma lat=1.2 lon=1.4 alt=2.1 m (n=8)`,
      this._rfDebugOn ? 'Noise GPS=42 GLN=39  CPU=18.4% @60MHz'
                      : 'RF debug disabled (see Cfg page)',
      this._rfDebugOn ? 'ANF G f=8190 lk=1 md=1  L f=4096 lk=0 md=2'
                      : '(RF debug disabled)',
      ' PRN  Elev  Az    C/N0',
      '  G05   42°  175°  46 dB-Hz',
      '  G07   38°  201°  44 dB-Hz',
      '  G13   65°  095°  41 dB-Hz',
      '  G30   24°  308°  37 dB-Hz',
    ];
    for (let i = 0; i < lines.length; i++) {
      r.drawLabel(4, 56 + i * 14 + 10, lines[i], { font: r.F.XS, color: r.C.TEXT });
    }
    r.drawLabel(4, 230, `sent=12 i2c_fail=0 rf=4 nz=2 anf=1 cpu=1`,
      { font: r.F.XS, color: r.C.TEXT_DIM });
  }

  // ── Page 3: GNSS Cfg ─────────────────────────────────────────────
  _p3(r) {
    const widgets = [
      `Fix rate : ${FIX_RATES[this._fixRateIdx]}`,
      `RF debug : ${this._rfDebugOn ? 'ON' : 'OFF'}`,
      `Cold start`,
      `Warm start`,
      `Hot start`,
      `Save to NVM`,
      `Engine reboot (SRR)`,
      this._cfgConfirm === 7
        ? `Restore defaults  [OK 再次確認]`
        : `Restore defaults  (DESTRUCTIVE)`,
    ];
    for (let i = 0; i < widgets.length; i++) {
      const focused = (i === this._cfgFocus);
      r.drawLabel(4, 56 + i * 18 + 10,
        `${focused ? '▶ ' : '  '}${widgets[i]}`,
        { font: r.F.ZH_SM, color: focused ? r.C.FOCUS : r.C.TEXT });
    }
    r.drawLabel(4, 220, this._cfgStatus, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  // ── Page 4: GNSS Const ───────────────────────────────────────────
  _p4(r) {
    r.drawLabel(4, 56, `Active: ${PRESETS_CONST[this._constActive]}`, {
      font: r.F.ZH_SM, color: r.C.GREEN,
    });
    for (let i = 0; i < PRESETS_CONST.length; i++) {
      const focused = (i === this._constFocus);
      const active  = (i === this._constActive);
      const text = `${focused ? '▶ ' : '  '}${PRESETS_CONST[i]}${active ? ' ✓' : ''}`;
      r.drawLabel(4, 76 + i * 14 + 10, text, {
        font: r.F.ZH_SM, color: focused ? r.C.FOCUS : (active ? r.C.GREEN : r.C.TEXT),
      });
    }
    r.drawLabel(4, 220, this._constStatus, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  // ── Page 5: GNSS Track ───────────────────────────────────────────
  _p5(r) {
    const widgets = [
      `B1 Mask angle      : ${this._trackVals.b1}°`,
      `B2 Tracking C/N0   : ${this._trackVals.b2} dB`,
      `B3 Positioning C/N0: ${this._trackVals.b3} dB`,
      `B4 Pos mask angle  : ${this._trackVals.b4}°`,
      `B5 Integrity check : ${INTEGRITY[this._trackVals.b5]}`,
      `E1 Notch filter    : ${NOTCH[this._trackVals.e1]}`,
      `Save to NVM + reboot${this._trackDirty ? ' *' : ''}`,
    ];
    for (let i = 0; i < widgets.length; i++) {
      const focused = (i === this._trackFocus);
      r.drawLabel(4, 56 + i * 22 + 10,
        `${focused ? '▶ ' : '  '}${widgets[i]}`,
        { font: r.F.MONO_MD ?? r.F.ZH_SM, color: focused ? r.C.FOCUS : r.C.TEXT });
    }
    r.drawLabel(4, 220, this._trackStatus, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  // ── Page 6: GNSS NMEA Cfg ────────────────────────────────────────
  _p6(r) {
    const widgets = [
      `D4 Talker ID    : ${TALKER_IDS[this._talkerIdx]}`,
      `D5 NMEA preset  : ${NMEA_PRESETS[this._nmeaPresetIdx]}`,
      `Save NVM + reboot Teseo`,
    ];
    for (let i = 0; i < widgets.length; i++) {
      const focused = (i === this._nmeaCfgFocus);
      r.drawLabel(4, 56 + i * 22 + 10,
        `${focused ? '▶ ' : '  '}${widgets[i]}`,
        { font: r.F.MONO_MD ?? r.F.ZH_SM, color: focused ? r.C.FOCUS : r.C.TEXT });
    }
    r.drawLabel(4, 130, this._nmeaCfgStatus, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  // ── Page 7: GNSS Adv ─────────────────────────────────────────────
  _p7(r) {
    const a = this._adv;
    const onOff = (b) => b ? 'ON' : 'OFF';
    const widgets = [
      `F7 Odo enable    : ${onOff(a.odoEn)}`,
      `F7 Odo NMEA out  : ${onOff(a.odoNmea)}`,
      `F7 Odo autostart : ${onOff(a.odoAuto)}`,
      `F7 Odo alarm     : ${[0,100,500,1000,5000,65535][a.odoAlarm]} m`,
      `F8 Logger enable : ${onOff(a.logEn)}`,
      `F8 Log min dist  : ${[1,5,10,50,100,500,1000][a.logMin]} m`,
      `F6 Geofence (read-only)`,
      `Save NVM + reboot Teseo`,
    ];
    for (let i = 0; i < widgets.length; i++) {
      const focused = (i === this._advFocus);
      r.drawLabel(4, 56 + i * 22 + 10,
        `${focused ? '▶ ' : '  '}${widgets[i]}`,
        { font: r.F.MONO_MD ?? r.F.ZH_SM, color: focused ? r.C.FOCUS : r.C.TEXT });
    }
    r.drawLabel(4, 234, this._advStatus, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  // ── Page 8: LED 亮度 ─────────────────────────────────────────────
  _p8(r) {
    const widgets = [
      `紅燈 開關 : ${this._led.redOn ? 'ON' : 'OFF'}`,
      `紅燈 亮度 (Bank C, 0..3) : ${this._led.redDuty}`,
      `綠燈 開關 (gated by Bank B) : ${this._led.greenOn ? 'ON' : 'OFF'}`,
      `鍵盤背光 開關 : ${this._led.kbdOn ? 'ON' : 'OFF'}`,
      `Bank B 亮度 (0..31, 綠+鍵盤共用) : ${this._led.bankB}`,
    ];
    for (let i = 0; i < widgets.length; i++) {
      const focused = (i === this._ledFocus);
      r.drawLabel(4, 56 + i * 18 + 10,
        `${focused ? '▶ ' : '  '}${widgets[i]}`,
        { font: r.F.ZH_SM, color: focused ? r.C.FOCUS : r.C.TEXT });
    }
    r.drawLabel(4, 168, '↑/↓ 移動  OK 切換/+亮度', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  // ── Page 9: TFT 背光 ─────────────────────────────────────────────
  _p9(r) {
    r.drawLabel(4, 56, 'TFT 背光 (Bank A)', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    // Bar widget — 312 wide × 20 tall, range 0..31
    const ctx = r.ctx;
    ctx.fillStyle = r.C.SURFACE;
    ctx.fillRect(4, 76, 312, 20);
    ctx.fillStyle = r.C.GREEN;
    ctx.fillRect(4, 76, (this._tftDuty / 31) * 312, 20);
    ctx.strokeStyle = r.C.BORDER;
    ctx.strokeRect(4, 76, 312, 20);
    r.drawLabel(4, 110, `Duty ${this._tftDuty} / 31`, {
      font: r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 140, '↑/↓ ±1   OK 切換 0/16', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  // ── Page 10: 按鍵診斷 ────────────────────────────────────────────
  _p10(r) {
    const ORIGIN_X = 16, ORIGIN_Y = 56;
    const CELL = 24, GAP = 2;
    const ctx = r.ctx;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        const x = ORIGIN_X + col * (CELL + GAP);
        const y = ORIGIN_Y + row * (CELL + GAP);
        const pressed = !!this._kpMatrix[row * 6 + col];
        ctx.fillStyle = pressed ? r.C.FOCUS : r.C.SURFACE;
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = r.C.BORDER;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      }
    }
    r.drawLabel(4, 222, `scan tick: ${this._kpTick | 0}`, {
      font: r.F.XS, color: r.C.TEXT_DIM,
    });
    const last = this._kpLog.slice(-8).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    r.drawLabel(4, 234, `log: ${last || '--'}`, {
      font: r.F.XS, color: r.C.TEXT_DIM,
    });
  }

  // ── Page 11: 感測器 ──────────────────────────────────────────────
  _p11(r) {
    const t = Date.now() / 1000;
    const lines = [
      `Acc  ${(Math.sin(t) * 30).toFixed(0).padStart(4, ' ')} ${(Math.cos(t) * 30).toFixed(0).padStart(4, ' ')} ${(990 + Math.sin(t * 2) * 8).toFixed(0).padStart(4, ' ')} mg`,
      `Gyr  ${(Math.sin(t * 0.7) * 5).toFixed(0).padStart(4, ' ')} ${(Math.cos(t * 0.5) * 4).toFixed(0).padStart(4, ' ')} ${(Math.sin(t * 0.3) * 2).toFixed(0).padStart(4, ' ')} dps/10`,
      `IMU temp 25.4 C   i2c_fail=0`,
      ``,
      `Mag  ${(Math.cos(t * 0.4) * 120 + 124).toFixed(0).padStart(4, ' ')} ${(Math.sin(t * 0.4) * 80 - 37).toFixed(0).padStart(4, ' ')} ${(440 + Math.sin(t) * 12).toFixed(0).padStart(4, ' ')} uT/10`,
      `Mag temp 24.4 C   i2c_fail=0`,
      ``,
      `Baro  ${(1012.34 + Math.sin(t * 0.1) * 0.4).toFixed(2)} hPa   24.7 C   fail=0`,
    ];
    for (let i = 0; i < lines.length; i++) {
      r.drawLabel(4, 56 + i * 16 + 10, lines[i], {
        font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
      });
    }
  }

  // ── Page 12: 充電器讀值 ──────────────────────────────────────────
  _p12(r) {
    const t = Date.now() / 1000;
    const vbus = 5040 + (Math.sin(t * 0.2) * 8) | 0;
    const vbat = 3920 + (Math.sin(t * 0.13) * 12) | 0;
    const vsys = 4850 + (Math.sin(t * 0.11) * 6) | 0;
    const ibus = 312 + (Math.sin(t * 0.4) * 8) | 0;
    const ibat = -145 + (Math.sin(t * 0.5) * 6) | 0;
    const lines = [
      `VBUS  ${vbus} mV`,
      `VBAT  ${vbat} mV`,
      `VSYS  ${vsys} mV   PMID 4900 mV`,
      `IBUS  ${String(ibus).padStart(4)} mA`,
      `IBAT  ${String(ibat).padStart(4)} mA`,
      `TS 50.2 %   TDIE 31.2 C`,
      `CHG=Taper VBUS=USB-Adap TS=2`,
      `Faults  bat=0 sys=0 tshut=0`,
      `WD 50 s   exp=0   i2c_fail=0`,
    ];
    for (let i = 0; i < lines.length; i++) {
      r.drawLabel(4, 56 + i * 16 + 10, lines[i], {
        font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
      });
    }
  }

  // ── Page 13: 充電控制(placeholder)──────────────────────────────
  _p13(r) {
    r.drawLabel(r.W / 2, 130, '尚未實作（Phase 3/4 待補）', {
      font: r.F.ZH_MD, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  // ── Key dispatch ─────────────────────────────────────────────────
  handleKeyTap({ key }) {
    const fn = key.fn;
    if (fn === 'LEFT')  { this._page = (this._page - 1 + PAGES.length) % PAGES.length; return; }
    if (fn === 'RIGHT') { this._page = (this._page + 1) % PAGES.length; return; }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
    // page-specific handlers
    if (this._page === 0)      this._k1(fn);
    else if (this._page === 2) this._k3(fn);
    else if (this._page === 3) this._k4(fn);
    else if (this._page === 4) this._k5(fn);
    else if (this._page === 5) this._k6(fn);
    else if (this._page === 6) this._k7(fn);
    else if (this._page === 7) this._k8(fn);
    else if (this._page === 8) this._k9(fn);
  }

  _k1(fn) { if (fn === 'UP') this._nmeaPaused = !this._nmeaPaused; }

  _k3(fn) {
    const N = 8;
    if (fn === 'UP')   { if (this._cfgFocus > 0) this._cfgFocus--; this._cfgConfirm = -1; return; }
    if (fn === 'DOWN') { if (this._cfgFocus + 1 < N) this._cfgFocus++; this._cfgConfirm = -1; return; }
    if (fn === 'OK') {
      const f = this._cfgFocus;
      if (f === 0) {
        this._fixRateIdx = (this._fixRateIdx + 1) % FIX_RATES.length;
        this._cfgStatus = `set rate: ${FIX_RATES[this._fixRateIdx]} (NVM+SRR)`;
      } else if (f === 1) {
        this._rfDebugOn = !this._rfDebugOn;
        this._cfgStatus = `RF debug ${this._rfDebugOn ? 'ON' : 'OFF'}: OK (NVM+SRR)`;
      } else if (f >= 2 && f <= 4) {
        const labels = ['cold start', 'warm start', 'hot start'];
        this._cfgStatus = `${labels[f - 2]}: sent`;
      } else if (f === 5) {
        this._cfgStatus = 'save NVM: OK';
      } else if (f === 6) {
        this._cfgStatus = 'SRR sent (engine reboot ~1-2s)';
      } else if (f === 7) {
        if (this._cfgConfirm === 7 && performance.now() - this._cfgConfirmAt < 5000) {
          this._cfgStatus = 'restore: ok, save: ok, SRR sent';
          this._cfgConfirm = -1;
        } else {
          this._cfgConfirm = 7;
          this._cfgConfirmAt = performance.now();
          this._cfgStatus = 'Press OK again within 5s to confirm';
        }
      }
    }
  }

  _k4(fn) {
    if (fn === 'UP')   { if (this._constFocus > 0) this._constFocus--; return; }
    if (fn === 'DOWN') { if (this._constFocus + 1 < PRESETS_CONST.length) this._constFocus++; return; }
    if (fn === 'OK') {
      this._constActive = this._constFocus;
      this._constStatus = `${PRESETS_CONST[this._constActive]} applied (NVM+SRR, ~2s reboot)`;
    }
  }

  _k5(fn) {
    if (fn === 'UP')   { if (this._trackFocus > 0) this._trackFocus--; return; }
    if (fn === 'DOWN') { if (this._trackFocus + 1 < 7) this._trackFocus++; return; }
    if (fn === 'OK') {
      const v = this._trackVals;
      const f = this._trackFocus;
      if (f === 0) v.b1 = (v.b1 + 5) % 35;
      else if (f === 1) v.b2 = (v.b2 + 5) % 45;
      else if (f === 2) v.b3 = (v.b3 + 5) % 45;
      else if (f === 3) v.b4 = (v.b4 + 5) % 35;
      else if (f === 4) v.b5 = (v.b5 + 1) % INTEGRITY.length;
      else if (f === 5) v.e1 = (v.e1 + 1) % NOTCH.length;
      else if (f === 6) {
        this._trackStatus = 'Apply: save OK, SRR sent';
        this._trackDirty  = false;
        return;
      }
      this._trackDirty  = true;
      this._trackStatus = `B${f + 1} 已調整 (RAM)`;
    }
  }

  _k6(fn) {
    if (fn === 'UP')   { if (this._nmeaCfgFocus > 0) this._nmeaCfgFocus--; return; }
    if (fn === 'DOWN') { if (this._nmeaCfgFocus + 1 < 3) this._nmeaCfgFocus++; return; }
    if (fn === 'OK') {
      const f = this._nmeaCfgFocus;
      if (f === 0) { this._talkerIdx = (this._talkerIdx + 1) % TALKER_IDS.length;
                     this._nmeaCfgStatus = `Talker → ${TALKER_IDS[this._talkerIdx]}: OK (RAM)`; }
      else if (f === 1) { this._nmeaPresetIdx = (this._nmeaPresetIdx + 1) % NMEA_PRESETS.length;
                          this._nmeaCfgStatus = `Preset → ${NMEA_PRESETS[this._nmeaPresetIdx]}: OK (NVM+SRR)`; }
      else if (f === 2) { this._nmeaCfgStatus = 'Save: OK, SRR sent'; }
    }
  }

  _k7(fn) {
    if (fn === 'UP')   { if (this._advFocus > 0) this._advFocus--; return; }
    if (fn === 'DOWN') { if (this._advFocus + 1 < 8) this._advFocus++; return; }
    if (fn === 'OK') {
      const a = this._adv, f = this._advFocus;
      if (f === 0) a.odoEn = a.odoEn ? 0 : 1;
      else if (f === 1) a.odoNmea = a.odoNmea ? 0 : 1;
      else if (f === 2) a.odoAuto = a.odoAuto ? 0 : 1;
      else if (f === 3) a.odoAlarm = (a.odoAlarm + 1) % 6;
      else if (f === 4) a.logEn = a.logEn ? 0 : 1;
      else if (f === 5) a.logMin = (a.logMin + 1) % 7;
      else if (f === 6) { this._advStatus = 'F6 edit deferred — use SWD writes for now'; return; }
      else if (f === 7) { this._advStatus = 'saved + SRR'; return; }
      this._advStatus = '已調整 (RAM)';
    }
  }

  _k8(fn) {
    if (fn === 'UP')   { if (this._ledFocus > 0) this._ledFocus--; return; }
    if (fn === 'DOWN') { if (this._ledFocus + 1 < 5) this._ledFocus++; return; }
    if (fn === 'OK') {
      const l = this._led, f = this._ledFocus;
      if (f === 0) l.redOn = l.redOn ? 0 : 1;
      else if (f === 1) l.redDuty = (l.redDuty + 1) % 4;
      else if (f === 2) l.greenOn = l.greenOn ? 0 : 1;
      else if (f === 3) l.kbdOn = l.kbdOn ? 0 : 1;
      else if (f === 4) l.bankB = (l.bankB + 4) % 32;
    }
  }

  _k9(fn) {
    if (fn === 'UP')   { if (this._tftDuty < 31) this._tftDuty++; return; }
    if (fn === 'DOWN') { if (this._tftDuty > 0)  this._tftDuty--; return; }
    if (fn === 'OK')   { this._tftDuty = (this._tftDuty === 0) ? 16 : 0; return; }
  }
}
