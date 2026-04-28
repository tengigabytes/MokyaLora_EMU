/**
 * PlaceholderScreen — generic "coming soon" stub for menu items whose
 * feature screen hasn't been implemented yet (MESH 設定, 感測器, 電池).
 *
 * BACK returns to the previous screen via ScreenManager's history stack
 * (typically the menu).
 */

import { BaseScreen } from '../screen-manager.js';

export class PlaceholderScreen extends BaseScreen {
  constructor(renderer, mie, serial, title) {
    super(renderer, mie, serial);
    this._title = title ?? '功能';
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, this._title, {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    r.drawCard(20, 80, r.W - 40, 80, {
      radius: 8, bg: r.C.SURFACE, border: r.C.BORDER,
    });
    r.drawLabel(r.W / 2, 112, '敬請期待', {
      font: r.F.ZH_LG, color: r.C.GREEN, align: 'center',
    });
    r.drawLabel(r.W / 2, 138, 'Coming soon', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });

    r.drawLabel(r.W / 2, 235, 'BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK') this.goBack();
  }
}
