/**
 * MapNavScreen — D-6 航點 / 節點導航(對齊 firmware map_nav_view.c)
 *
 * Header: "D-6 -> <name> !<hex>" / "D-6 (no target)" / "D-6 LOST <name>"
 * 大字位元盤(accent):"NE  045°"
 * range / bearing / ETA / speed 4 行 + dim hint
 *
 * Keys: BACK 回 D-1
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const CARDINALS = [
  { name: 'N',  min: 337.5, max: 22.5  },
  { name: 'NE', min: 22.5,  max: 67.5  },
  { name: 'E',  min: 67.5,  max: 112.5 },
  { name: 'SE', min: 112.5, max: 157.5 },
  { name: 'S',  min: 157.5, max: 202.5 },
  { name: 'SW', min: 202.5, max: 247.5 },
  { name: 'W',  min: 247.5, max: 292.5 },
  { name: 'NW', min: 292.5, max: 337.5 },
];

function bearingToCardinal(deg) {
  const d = ((deg % 360) + 360) % 360;
  if (d >= 337.5 || d < 22.5) return 'N';
  for (const c of CARDINALS) {
    if (c.name === 'N') continue;
    if (d >= c.min && d < c.max) return c.name;
  }
  return 'N';
}

export class MapNavScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._target = null;
    this._gps = { fix: true, speedKmh: 4.2 };  // mock walking speed
    this._mock = null;
  }

  setTarget(node) {
    this._target = node;
    if (node) {
      // Mock distance + bearing per peer (deterministic by short_name)
      const seed = (node.user?.short_name ?? '?').split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
      const dist = 80 + Math.abs(seed % 4500);
      const bearing = Math.abs(seed * 13) % 360;
      this._mock = { distance: dist, bearing };
    }
  }

  onEnter(from) { super.onEnter(from); }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    const t = this._target;
    let header;
    if (!t) {
      header = 'D-6 (no target)';
    } else {
      header = `D-6 -> ${t.user?.short_name ?? '?'} ${t.user?.id ?? '!?'}`;
    }
    r.drawLabel(4, 30, header, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    if (!t || !this._mock) {
      r.drawLabel(r.W / 2, 90, '--', {
        font: r.F.ZH_LG, color: r.C.TEXT_DIM, align: 'center',
      });
      r.drawLabel(4, 140, 'Lock a peer in D-1 first', {
        font: r.F.ZH_SM, color: r.C.TEXT,
      });
      r.drawHintBar([
      { key: 'BACK', label: '地圖' }
    ]);
      return;
    }

    if (!this._gps.fix) {
      r.drawLabel(r.W / 2, 90, 'GPS searching', {
        font: r.F.ZH_LG, color: r.C.WARNING, align: 'center',
      });
      r.drawHintBar([{ key: 'BACK', label: '地圖' }]);
      return;
    }

    const cardinal = bearingToCardinal(this._mock.bearing);
    const bearStr = `${cardinal}  ${this._mock.bearing.toString().padStart(3, '0')}°`;
    r.drawLabel(r.W / 2, 80, bearStr, {
      font: r.F.ZH_LG, color: r.C.FOCUS, align: 'center',
    });

    // Range
    const dist = this._mock.distance;
    const rangeStr = dist < 1000
      ? `${dist} m`
      : (dist < 10000 ? `${(dist / 1000).toFixed(3)} km` : `${(dist / 1000) | 0} km`);
    r.drawLabel(4, 140, `range    ${rangeStr}`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 162, `bearing  ${bearStr}`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });

    // ETA
    const speedKmh = this._gps.speedKmh;
    let etaStr;
    if (speedKmh < 1) {
      etaStr = '--  (stationary)';
    } else {
      const etaSecs = (dist / 1000) / speedKmh * 3600;
      if (etaSecs < 60) etaStr = `${etaSecs | 0}s`;
      else if (etaSecs < 3600) etaStr = `${((etaSecs / 60) | 0).toString().padStart(2, '0')}:${((etaSecs % 60) | 0).toString().padStart(2, '0')}`;
      else if (etaSecs < 86400) etaStr = `${((etaSecs / 3600) | 0).toString().padStart(2, '0')}:${(((etaSecs % 3600) / 60) | 0).toString().padStart(2, '0')}:${((etaSecs % 60) | 0).toString().padStart(2, '0')}`;
      else etaStr = '>1d';
    }
    r.drawLabel(4, 184, `ETA      ${etaStr}`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 206, `speed    ${speedKmh.toFixed(1)} km/h`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    r.drawHintBar([
      { key: 'BACK', label: '地圖' }
    ]);
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
