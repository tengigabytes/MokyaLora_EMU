/**
 * TelemetryHistScreen — F-4 歷史曲線(對齊 doc/ui/01-page-architecture.md)
 *
 * 對應韌體 `telemetry_view` 的 TELE_PAGE_F4 子頁(commit `692d674` 後三條
 * chart 全到位):
 *   1. 電量 SoC %        (0..100)
 *   2. 最近一次 RX SNR    (-25..+25 dB)
 *   3. 空中時間 air_util_tx % (0..100)
 *
 * 韌體在 .bss 留 256 點 ring(每 30s 一次取樣 = 2 hr 8 min 視窗)。EMU 端
 * 接不上真實的 cascade FR_TAG_NODE_INFO,改以週期性 mock 訊號模擬,純粹
 * 為了驗證 UI 三圖佈局與顏色 token 對齊規範。
 *
 * Keys:
 *   BACK   返回上一層
 *   LEFT   翻到 F-3 鄰居(對齊 firmware F1↔F2↔F3↔F4 循環)
 *   RIGHT  翻回 F-1 本機遙測
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const POINTS = 96;   // 96 點 × 30s = 48 min 視窗(壓縮 EMU 視覺密度)
const TICK_MS = 1000;

// Mock generator — phase-shifted sines + small noise so each chart has its
// own waveform shape. Kept deterministic-ish per boot so UI tests can read
// the chart shape consistently.
function genHistory(seed = 0) {
  const arr = new Array(POINTS);
  for (let i = 0; i < POINTS; i++) {
    const t = i / POINTS * Math.PI * 2;
    arr[i] = { soc: 0, snr: 0, air: 0, t };
  }
  return arr;
}

export class TelemetryHistScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._buf      = genHistory();
    this._tick     = 0;
    this._lastSamp = 0;
    this._frame    = 0;
  }

  onEnter(from) {
    super.onEnter(from);
    this._lastSamp = performance.now();
  }

  /** Push one new sample; drop the oldest. */
  _step() {
    const t = (this._tick++) / 30;
    // SoC 60..95 慢曲線 + 小噪
    const soc = 78 + 14 * Math.sin(t * 0.07) + (Math.random() - 0.5) * 2;
    // SNR -8..+12 變動較快
    const snr = 4 + 8 * Math.sin(t * 0.31 + 1.1) + (Math.random() - 0.5) * 1.5;
    // air_util_tx 0..18 偶有突起
    const burst = ((this._tick % 47) === 0) ? 6 : 0;
    const air = Math.max(0, 6 + 4 * Math.sin(t * 0.19 + 2.0) + burst + (Math.random() - 0.5));

    this._buf.shift();
    this._buf.push({ soc, snr, air });
  }

  render(now) {
    if (now - this._lastSamp >= TICK_MS) {
      this._step();
      this._lastSamp = now;
    }

    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    // Title bar (16px) — matches firmware TITLE_H
    r.drawLabel(r.W / 2, 24, 'F-4 歷史曲線 · 48 min', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    // Three stacked charts — mirror firmware F4_CHART_H = 70 + GAP 2.
    // Available height: y=42..222 (180px) → 3 charts × ~58px + 2 gaps.
    const X = 6, W = r.W - 12;
    const TOP = 44;
    const CH_H = 58;
    const GAP = 4;

    const last = this._buf[this._buf.length - 1] ?? { soc: 0, snr: 0, air: 0 };

    // Chart 1 — SoC %
    this._chart(X, TOP, W, CH_H, this._buf.map(s => s.soc), {
      label: '電量', unit: '%',
      latest: last.soc.toFixed(0),
      lineColor: r.C.GREEN, fillColor: r.C.GREEN_GLOW,
      minVal: 0, maxVal: 100,
    });
    // Chart 2 — last RX SNR (dB)
    const y2 = TOP + CH_H + GAP;
    this._chart(X, y2, W, CH_H, this._buf.map(s => s.snr), {
      label: '訊號 SNR', unit: 'dB',
      latest: last.snr.toFixed(1),
      lineColor: r.C.INFO, fillColor: 'rgba(100,210,255,0.12)',
      minVal: -15, maxVal: 15,
    });
    // Chart 3 — air_util_tx %  (L1 sweep Phase 2 — commit 692d674)
    const y3 = y2 + CH_H + GAP;
    this._chart(X, y3, W, CH_H, this._buf.map(s => s.air), {
      label: '空中時間', unit: '%',
      latest: last.air.toFixed(1),
      lineColor: r.C.FOCUS, fillColor: 'rgba(255,166,87,0.12)',
      minVal: 0, maxVal: 25,
    });

    r.drawHintBar([
      { key: '◀▶', label: '翻頁' },
      { key: 'BACK', label: '返回' }
    ]);
  }

  _chart(x, y, w, h, data, opts) {
    const r = this.r;
    // Frame
    r.drawCard(x, y, w, h, { radius: 4, bg: r.C.SURFACE, border: r.C.BORDER });
    // Inset chart area below the label band (12px)
    const bandH = 12;
    r.drawLineChart(x + 2, y + bandH + 1, w - 4, h - bandH - 3, data, {
      lineColor: opts.lineColor,
      fillColor: opts.fillColor,
      minVal:    opts.minVal,
      maxVal:    opts.maxVal,
      gridLines: 3,
    });
    // Label band
    r.drawLabel(x + 4, y + 11, opts.label, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    r.drawLabel(x + w - 4, y + 11, `${opts.latest} ${opts.unit}`, {
      font: r.F.ZH_SM, color: opts.lineColor, align: 'right',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    if (fn === 'LEFT') {
      // F-4 → F-3:跳到 telemetry 並把 page 設為 3
      this._enterTelemetryAt(3);
      return;
    }
    if (fn === 'RIGHT') {
      // F-4 → F-1
      this._enterTelemetryAt(1);
      return;
    }
    if (fn === 'BACK' || fn === 'FUNC') this.goBack();
  }

  _enterTelemetryAt(page) {
    const tel = this._manager?._screens?.get('telemetry');
    if (tel) tel._page = page;
    this.goto('telemetry', page === 1 ? 'slide_l' : 'slide_r');
  }
}
