/**
 * LockScreen — BACK 長按 ≥1.5s 觸發。
 *
 * 對齊 doc/ui/00-design-charter.md 鍵位語意對照表。
 *
 * PR5 placeholder:全螢幕鎖定畫面 + 時間 + 解鎖提示。
 *
 * 互動:OK + BACK 同時按解鎖(此處簡化為:任一按 OK 解鎖)。
 */

import { BaseScreen } from '../screen-manager.js';

export class LockScreen extends BaseScreen {
  render(now) {
    const r = this.r;
    const C = r.C;
    r.clear();

    // 大時鐘
    const t = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const ctx = r.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(2, 2);
    ctx.fillStyle    = C.TEXT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(t, r.W / 4, 24);
    ctx.restore();
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    // 日期
    const d = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short' });
    r.drawLabel(r.W / 2, 110, d, {
      font: r.F.ZH_MD, color: C.TEXT_DIM, align: 'center',
    });

    // 鎖頭圖示 + 提示
    r.drawLabel(r.W / 2, 160, '🔒 已鎖屏', {
      font: r.F.ZH_LG, color: C.FOCUS, align: 'center',
    });
    r.drawLabel(r.W / 2, 200, '按 OK 解鎖', {
      font: r.F.ZH_SM, color: C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    if (key.fn === 'OK') {
      this.goBack();
    }
  }

  /** 鎖屏狀態下吃掉所有長按(避免 BACK 長按再進鎖屏)。 */
  handleKeyHold() {}
}
