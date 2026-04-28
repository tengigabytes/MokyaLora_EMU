/**
 * MenuScreen — 3×2 icon grid, DPAD-driven, opened from HomeScreen.
 *
 * Layout (320×240 landscape):
 *   y=0..17    Status bar
 *   y=22..38   Title "選單"
 *   y=42..226  3×2 grid (cells ≈ 100×95)
 *   y=230..238 Footer hint "OK 進入 · BACK 返回"
 *
 * Keys:
 *   LEFT/RIGHT — ±1 with wrap
 *   UP/DOWN    — ±3 (row jump) with wrap
 *   OK         — goto MENU_ITEMS[sel].target
 *   BACK       — goto home
 */

import { BaseScreen } from '../screen-manager.js';

export const MENU_ITEMS = [
  { icon: 'chat',     label: 'MESHTASTIC', target: 'meshtastic'  },
  { icon: 'mesh-cfg', label: 'MESH 設定',  target: 'mesh-config' },
  { icon: 'sensors',  label: '感測器',     target: 'sensors'     },
  { icon: 'gnss',     label: 'GNSS',       target: 'gnss'        },
  { icon: 'battery',  label: '電池',       target: 'battery'     },
  { icon: 'settings', label: '系統設定',   target: 'settings'    },
];

const COLS = 3;
const ROWS = Math.ceil(MENU_ITEMS.length / COLS);

export class MenuScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = 0;
  }

  onEnter(from) {
    super.onEnter(from);
    // Returning from a feature screen: keep _sel as-is so user resumes
    // from the same icon they last entered.
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, '選單', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    // Grid area: y=42..226, full width
    r.drawMenuGrid(MENU_ITEMS, this._sel, 0, 42, r.W, 184);

    r.drawLabel(r.W / 2, 235, 'OK 進入 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N  = MENU_ITEMS.length;
    if (fn === 'LEFT')  { this._sel = (this._sel - 1 + N) % N; return; }
    if (fn === 'RIGHT') { this._sel = (this._sel + 1) % N; return; }
    if (fn === 'UP') {
      // jump up one row, wrap by total rows
      const r = (this._sel / COLS) | 0;
      const c = this._sel % COLS;
      const nr = (r - 1 + ROWS) % ROWS;
      this._sel = Math.min(nr * COLS + c, N - 1);
      return;
    }
    if (fn === 'DOWN') {
      const r = (this._sel / COLS) | 0;
      const c = this._sel % COLS;
      const nr = (r + 1) % ROWS;
      this._sel = Math.min(nr * COLS + c, N - 1);
      return;
    }
    if (fn === 'OK')   { this.goto(MENU_ITEMS[this._sel].target, 'slide_l'); return; }
    if (fn === 'BACK') { this.goBack('fade'); return; }
  }
}
