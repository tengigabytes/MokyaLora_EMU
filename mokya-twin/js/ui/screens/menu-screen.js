/**
 * MenuScreen — L-1 九宮格(嚴格對齊 dev-Sblzm 韌體 launcher_view.c 2d0b41c)
 *
 * 由 L-0 桌面 FUNC 鍵呼出。3×4 grid + 3-row viewport scroll(commit becc3e5):
 *
 *   row 0: Msg(A)    Chan(B)    Nodes(C)
 *   row 1: Map(D)    Tele(F)    Tools(T)
 *   row 2: Set(S)    Me(C-4)    Power(Z-1 placeholder)
 *   row 3: HWDiag    SysDiag    —(placeholder)
 *
 * 視窗一次只顯示 3 列(ROWS=3),focus 移到第 4 列時,viewport 自動往下捲。
 *
 * Keys:
 *   ▲▼◀▶  焦點移動(必要時觸發 viewport scroll)
 *   OK     navigate;placeholder 顯示 toast
 *   BACK / FUNC  回 L-0 桌面
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

// 對齊 firmware/core1/src/ui/launcher_view.c s_tiles[](2d0b41c)。
// HWDiag/SysDiag 是 commit becc3e5 新加的第 4 列。
export const MENU_ITEMS = [
  { icon: 'chat',     label: '訊息',     target: 'messages'      },
  { icon: 'mesh-cfg', label: '頻道',     target: 'mesh-channels' },
  { icon: 'nodes',    label: '節點',     target: 'nodes'         },
  { icon: 'gnss',     label: '地圖',     target: 'gnss'          },
  { icon: 'sensors',  label: '遙測',     target: 'telemetry'     },
  { icon: 'settings', label: '工具',     target: 'tools'         },
  { icon: 'mesh-cfg', label: '設定',     target: 'settings'      },
  { icon: 'connect',  label: '我的',     target: 'my-node'       },
  { icon: 'battery',  label: 'Power',    target: '__placeholder', placeholder: true,
    toast: 'SOS app 規劃中 (待 power button + Z-1)' },
  { icon: 'sensors',  label: 'HWDiag',   target: 'hw-diag'       },
  { icon: 'settings', label: 'SysDiag',  target: 'sys-diag'      },
  { icon: 'battery',  label: '—',        target: '__placeholder', placeholder: true,
    toast: '預留位置' },
];

const COLS = 3;
const ROWS = 3;                 // viewport rows visible at once
const ROWS_TOTAL = Math.ceil(MENU_ITEMS.length / COLS);
const TOAST_MS = 2200;

export class MenuScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._cur = 0;             // absolute tile index 0..MENU_ITEMS.length-1
    this._viewRow = 0;         // topmost visible row 0..(ROWS_TOTAL-ROWS)
    this._toast = null;
  }

  onEnter(from) {
    super.onEnter(from);
    this._toast = null;
    this._ensureVisible();
  }

  _ensureVisible() {
    const row = (this._cur / COLS) | 0;
    if (row < this._viewRow) this._viewRow = row;
    else if (row >= this._viewRow + ROWS) this._viewRow = row - ROWS + 1;
    if (this._viewRow < 0) this._viewRow = 0;
    const maxView = Math.max(0, ROWS_TOTAL - ROWS);
    if (this._viewRow > maxView) this._viewRow = maxView;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    r.drawLabel(r.W / 2, 32, '選單', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    // Slice the visible 3×3 viewport from the 3×4 model.
    const visibleStart = this._viewRow * COLS;
    const visibleEnd   = visibleStart + ROWS * COLS;
    const visible = MENU_ITEMS.slice(visibleStart, visibleEnd);
    const visibleSel = this._cur - visibleStart;
    const gridH = this._toast ? 168 : 184;
    r.drawMenuGrid(visible, visibleSel, 0, 42, r.W, gridH);

    // Scroll indicator on the right edge — small dot stack showing which
    // viewport row is active out of the 4 total rows.
    if (ROWS_TOTAL > ROWS) {
      const trackX = r.W - 6;
      const trackY = 42;
      const trackH = gridH;
      const dotR  = 2;
      const step  = trackH / ROWS_TOTAL;
      for (let i = 0; i < ROWS_TOTAL; i++) {
        const dy = trackY + step * (i + 0.5);
        const inViewport = (i >= this._viewRow && i < this._viewRow + ROWS);
        r.ctx.fillStyle = inViewport ? r.C.FOCUS : r.C.BORDER;
        r.ctx.beginPath();
        r.ctx.arc(trackX, dy, dotR, 0, Math.PI * 2);
        r.ctx.fill();
      }
    }

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
    const moveCol = (delta) => {
      const next = this._cur + delta;
      if (next < 0 || next >= N) return;
      this._cur = next;
      this._toast = null;
      this._ensureVisible();
    };
    const moveRow = (delta) => {
      const r = (this._cur / COLS) | 0;
      const c = this._cur % COLS;
      const nr = r + delta;
      if (nr < 0 || nr >= ROWS_TOTAL) return;
      const next = Math.min(nr * COLS + c, N - 1);
      this._cur = next;
      this._toast = null;
      this._ensureVisible();
    };
    if (fn === 'LEFT')  { moveCol(-1); return; }
    if (fn === 'RIGHT') { moveCol(+1); return; }
    if (fn === 'UP')    { moveRow(-1); return; }
    if (fn === 'DOWN')  { moveRow(+1); return; }
    if (fn === 'OK') {
      const item = MENU_ITEMS[this._cur];
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
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack('fade'); return; }
  }
}
