/**
 * MenuScreen — L-1 九宮格功能表(對齊 doc/ui/01-page-architecture.md)
 *
 * 由 L-0 桌面 FUNC 鍵呼出。9 個 App 入口分三列三欄:
 *
 *   訊息(A)  頻道(B)  節點(C)
 *   地圖(D)  遙測(F)  工具(T)
 *   設定(S)  SOS(Z)   系統儀表(EMU)
 *
 * 第三列右下保留為 EMU 系統儀表入口(原本的 Mesh/感測器/電池/GNSS 等
 * 開發用功能集合到工具或設定底下;L-1 規格九宮格嚴格 9 格)。
 *
 * Keys:
 *   ▲▼◀▶  焦點移動
 *   OK     goto MENU_ITEMS[sel].target
 *   BACK   回 L-0 桌面
 *   FUNC   回 L-0 桌面(規格:L-1 內按 FUNC 關閉九宮格)
 */

import { BaseScreen } from '../screen-manager.js';

export const MENU_ITEMS = [
  { icon: 'chat',     label: '訊息',   target: 'messages'    },
  { icon: 'mesh-cfg', label: '頻道',   target: 'mesh-channels' },
  { icon: 'sensors',  label: '節點',   target: 'nodes'       },
  { icon: 'gnss',     label: '地圖',   target: 'gnss'        },
  { icon: 'battery',  label: '遙測',   target: 'battery'     },
  { icon: 'settings', label: '工具',   target: 'tools'       },
  { icon: 'mesh-cfg', label: '設定',   target: 'settings'    },
  { icon: 'battery',  label: 'SOS',    target: 'sos'         },
  { icon: 'sensors',  label: 'EMU',    target: 'meshtastic'  },
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
    if (fn === 'FUNC') { this.goBack('fade'); return; }
  }
}
