/**
 * MenuScreen — L-1 九宮格功能表(嚴格對齊 dev-Sblzm 韌體 launcher_view.c)
 *
 * 由 L-0 桌面 FUNC 鍵呼出。9 個 App 入口三列三欄,行列順序與韌體一致:
 *
 *   Msg(A)   Chan(B)  Nodes(C)
 *   Map(D)   Tele(F)  Tools(T)
 *   Set(S)   Me(C-4)  Power(Z-1 placeholder)
 *
 * 韌體裡只有右下角 Power 是唯一的 placeholder(target == VIEW_ID_COUNT,
 * 待 power button driver + Z-1 SOS standby);其他八格全部已實作。
 *
 * Keys:
 *   ▲▼◀▶  焦點移動
 *   OK     navigate; placeholder 改顯示一行 toast(L1 sweep Phase 1
 *          commit `049f218`)
 *   BACK   回 L-0 桌面
 *   FUNC   回 L-0 桌面
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

// 對齊 firmware/core1/src/ui/launcher_view.c s_tiles[]。
// 第 9 格 Power 是唯一 placeholder,OK 顯示 toast 不導航。
export const MENU_ITEMS = [
  { icon: 'chat',     label: '訊息',   target: 'messages'      },
  { icon: 'mesh-cfg', label: '頻道',   target: 'mesh-channels' },
  { icon: 'nodes',    label: '節點',   target: 'nodes'         },
  { icon: 'gnss',     label: '地圖',   target: 'gnss'          },
  { icon: 'sensors',  label: '遙測',   target: 'telemetry' },
  { icon: 'settings', label: '工具',   target: 'tools'         },
  { icon: 'mesh-cfg', label: '設定',   target: 'settings'      },
  { icon: 'connect',  label: '我的',   target: 'my-node'       },
  { icon: 'battery',  label: 'Power',  target: '__placeholder', placeholder: true,
    toast: 'SOS app 規劃中 (待 power button + Z-1)' },
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

    r.drawStatusBar(defaultStatusOpts(this.serial));

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

    r.drawHintBar([
      { key: 'OK',   label: '進入' },
      { key: 'BACK', label: '返回' },
    ]);
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
