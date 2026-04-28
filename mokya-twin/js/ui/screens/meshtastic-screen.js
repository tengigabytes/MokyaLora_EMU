/**
 * MeshtasticScreen — sub-menu shown when MESHTASTIC is selected from the
 * top-level menu. A vertical 5-row list (icon + label) navigated by
 * UP/DOWN; OK enters the corresponding feature screen, BACK returns to
 * the top-level menu.
 */

import { BaseScreen } from '../screen-manager.js';
import { ICONS }       from '../icons.js';

export const MESHTASTIC_ITEMS = [
  { icon: 'chat',     label: '訊息',  target: 'messages'    },
  { icon: 'nodes',    label: '節點',  target: 'nodes'       },
  { icon: 'gnss',     label: '地圖',  target: 'gnss'        },
  { icon: 'mesh-cfg', label: '設定',  target: 'mesh-config' },
  { icon: 'connect',  label: '連接',  target: 'connect'     },
];

export class MeshtasticScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = 0;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, 'MESHTASTIC', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    // Vertical list — each row 36 px tall (icon 24×24 + label).
    const listX = 30;
    const listY = 50;
    const listW = r.W - 60;
    const ROW_H = 36;

    for (let i = 0; i < MESHTASTIC_ITEMS.length; i++) {
      const item = MESHTASTIC_ITEMS[i];
      const y    = listY + i * ROW_H;
      const isSel = (i === this._sel);

      r.drawCard(listX, y, listW, ROW_H - 4, {
        radius: 4,
        bg:     isSel ? r.C.GREEN_MUTED : r.C.SURFACE,
        border: isSel ? r.C.GREEN       : r.C.BORDER,
      });

      const ic = ICONS[item.icon];
      if (ic) {
        r.drawIcon(item.icon, listX + 4, y + ((ROW_H - 4 - ic.h) >> 1),
                   isSel ? r.C.GREEN : r.C.TEXT);
      }
      r.drawLabel(listX + 36, y + (ROW_H - 4) / 2 + 6, item.label, {
        font: r.F.ZH_MD, color: isSel ? r.C.GREEN : r.C.TEXT,
      });
      if (isSel) {
        // Caret indicator on the right
        r.drawLabel(listX + listW - 12, y + (ROW_H - 4) / 2 + 6, '►', {
          font: r.F.ZH_SM, color: r.C.GREEN, align: 'right',
        });
      }
    }

    r.drawLabel(r.W / 2, 235, 'OK 進入 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N  = MESHTASTIC_ITEMS.length;
    if (fn === 'UP')   { this._sel = (this._sel - 1 + N) % N; return; }
    if (fn === 'DOWN') { this._sel = (this._sel + 1) % N; return; }
    if (fn === 'OK')   { this.goto(MESHTASTIC_ITEMS[this._sel].target, 'slide_l'); return; }
    if (fn === 'BACK') { this.goBack(); return; }
  }
}
