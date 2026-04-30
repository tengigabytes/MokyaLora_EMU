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
 *   OK     goto MENU_ITEMS[sel].target — placeholder 上改顯示一行 toast
 *          (對齊 dev-Sblzm L1 sweep Phase 1 commit `049f218`,不再無聲離開
 *          launcher)
 *   BACK   回 L-0 桌面
 *   FUNC   回 L-0 桌面(規格:L-1 內按 FUNC 關閉九宮格)
 */

import { BaseScreen } from '../screen-manager.js';

// 對齊 doc/ui/01-page-architecture.md L-1 九宮格九 App。
// 第 9 格 EMU 是模擬器專屬入口(對應原本的 meshtastic 開發儀表),
// 實機韌體可移除或替換。
//
// `placeholder: true` 標記尚未在 EMU 落地的 App,OK 不導航而是顯示
// inline toast,對齊 dev-Sblzm L1 sweep Phase 1。實機韌體該欄位
// 對應 view router 中 `target == VIEW_ID_COUNT` 的 grey tile。
export const MENU_ITEMS = [
  { icon: 'chat',     label: '訊息',   target: 'messages'      },
  { icon: 'mesh-cfg', label: '頻道',   target: 'mesh-channels' },
  { icon: 'nodes',    label: '節點',   target: 'nodes'         },
  { icon: 'gnss',     label: '地圖',   target: 'gnss'          },
  { icon: 'sensors',  label: '遙測',   target: 'telemetry-hist' },
  { icon: 'settings', label: '工具',   target: 'tools',          placeholder: true,
    toast: '工具 App 規劃中 (T-0 ~ T-8 待落地)' },
  { icon: 'mesh-cfg', label: '設定',   target: 'settings'      },
  { icon: 'battery',  label: 'SOS',    target: 'sos-standby',    placeholder: true,
    toast: 'SOS app 規劃中 (待 power button + Z-1)' },
  { icon: 'connect',  label: 'EMU',    target: 'meshtastic'    },
];

const COLS = 3;
const ROWS = Math.ceil(MENU_ITEMS.length / COLS);
const TOAST_MS = 2200;

export class MenuScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = 0;
    this._toast = null;        // { text: string, until: ms }
  }

  onEnter(from) {
    super.onEnter(from);
    this._toast = null;
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

    // Grid area: y=42..222 (留 4px 給 toast 行)
    const gridH = this._toast ? 168 : 184;
    r.drawMenuGrid(MENU_ITEMS, this._sel, 0, 42, r.W, gridH);

    // Inline toast — dev-Sblzm L1 sweep Phase 1 (commit 049f218)
    if (this._toast && performance.now() < this._toast.until) {
      r.drawLabel(r.W / 2, 218, this._toast.text, {
        font: r.F.ZH_SM, color: r.C.FOCUS, align: 'center',
      });
    } else if (this._toast) {
      this._toast = null;
    }

    r.drawLabel(r.W / 2, 235, 'OK 進入 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N  = MENU_ITEMS.length;
    const move = (delta) => {
      this._sel = (this._sel + delta + N) % N;
      this._toast = null;       // any cursor move clears toast
    };
    if (fn === 'LEFT')  { move(-1); return; }
    if (fn === 'RIGHT') { move(+1); return; }
    if (fn === 'UP') {
      const r = (this._sel / COLS) | 0;
      const c = this._sel % COLS;
      const nr = (r - 1 + ROWS) % ROWS;
      this._sel = Math.min(nr * COLS + c, N - 1);
      this._toast = null;
      return;
    }
    if (fn === 'DOWN') {
      const r = (this._sel / COLS) | 0;
      const c = this._sel % COLS;
      const nr = (r + 1) % ROWS;
      this._sel = Math.min(nr * COLS + c, N - 1);
      this._toast = null;
      return;
    }
    if (fn === 'OK') {
      const item = MENU_ITEMS[this._sel];
      if (item.placeholder) {
        this._toast = {
          text:  item.toast ?? '此 App 規劃中',
          until: performance.now() + TOAST_MS,
        };
        return;
      }
      this.goto(item.target, 'slide_l');
      return;
    }
    if (fn === 'BACK') { this.goBack('fade'); return; }
    if (fn === 'FUNC') { this.goBack('fade'); return; }
  }
}
