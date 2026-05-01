/**
 * GnssSkyScreen — T-6 GNSS 衛星圖(對齊 firmware gnss_sky_view.c)
 *
 * Header: "T-6 GNSS Sky  view=N"
 * 極座標 sky chart:3 同心環(elev 30/60/90),中心 (160, 88),半徑 ~70。
 * N/E/S/W 標在外環外。每顆衛星以 PRN 數字標在極座標上,顏色對應 C/N0:
 *   ≥40 綠 / 30..39 白 / <30 黃 / =0 灰
 *
 * 三行 summary:
 *   FIX OK  q=N  used=N  view=N  hdop=N.N
 *   C/N0  >=40:N  30-39:N  <30:N  none:N
 *   BACK 工具
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const CX = 160, CY = 100;
const R_OUT = 70;

function genSats() {
  // 12 mock satellites with deterministic-ish placement.
  const list = [];
  for (let i = 0; i < 12; i++) {
    const elev = 8 + ((i * 13) % 75);     // 8..82°
    const azim = (i * 47) % 360;
    const cn0 = i < 8 ? (28 + ((i * 7) % 25)) : (i < 10 ? 0 : 22);
    list.push({
      prn: 5 + i,
      elev,
      azim,
      cn0,
      used: cn0 >= 30 && i < 6,
    });
  }
  return list;
}

export class GnssSkyScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sats = genSats();
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    const view = this._sats.length;
    r.drawLabel(4, 24, `T-6 GNSS Sky  view=${view}`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // Sky chart — 3 concentric rings
    const ctx = r.ctx;
    ctx.strokeStyle = r.C.BORDER;
    ctx.lineWidth = 1;
    for (const factor of [1, 2/3, 1/3]) {
      ctx.beginPath();
      ctx.arc(CX, CY, R_OUT * factor, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cardinal labels
    r.drawLabel(CX,         CY - R_OUT - 6,  'N', { font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center' });
    r.drawLabel(CX + R_OUT + 8, CY + 4,      'E', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
    r.drawLabel(CX,         CY + R_OUT + 14, 'S', { font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center' });
    r.drawLabel(CX - R_OUT - 12, CY + 4,     'W', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });

    // Sat dots + PRN labels
    const colorFor = (cn0) => {
      if (cn0 === 0) return r.C.TEXT_DIM;
      if (cn0 >= 40) return r.C.GREEN;
      if (cn0 >= 30) return r.C.TEXT;
      return r.C.WARNING;
    };
    for (const s of this._sats) {
      const rad = ((90 - s.elev) / 90) * R_OUT;
      const ang = (s.azim - 90) * Math.PI / 180; // North = up
      const sx = CX + Math.cos(ang) * rad;
      const sy = CY + Math.sin(ang) * rad;
      ctx.fillStyle = colorFor(s.cn0);
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      r.drawLabel(sx + 4, sy + 3, String(s.prn), {
        font: r.F.XS, color: colorFor(s.cn0),
      });
    }

    // Summary rows
    const used = this._sats.filter(s => s.used).length;
    const cn40 = this._sats.filter(s => s.cn0 >= 40).length;
    const cn30 = this._sats.filter(s => s.cn0 >= 30 && s.cn0 < 40).length;
    const cnLo = this._sats.filter(s => s.cn0 > 0 && s.cn0 < 30).length;
    const cn0  = this._sats.filter(s => s.cn0 === 0).length;
    const fix  = used >= 4 ? 'FIX OK' : (used > 0 ? 'Searching' : 'GNSS offline');
    const hdop = (1.0 + Math.random() * 0.5).toFixed(1);
    r.drawLabel(4, 188, `${fix}  q=3  used=${used}  view=${view}  hdop=${hdop}`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 208, `C/N0  >=40:${cn40}  30-39:${cn30}  <30:${cnLo}  none:${cn0}`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    r.drawHintBar([
      { key: 'BACK', label: '工具' }
    ]);
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
