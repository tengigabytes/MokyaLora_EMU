/**
 * SOSScreen — Power 長按 ≥5s 觸發。
 *
 * 對齊 doc/ui/10-status-bar.md §SOS 啟動 警告態整條覆蓋。
 *
 * PR5 placeholder:整條紅底 + 中央大字「SOS 廣播中」+ 倒數 + 解除按鈕。
 * 完整 SOS App(Z-1~Z-3)留 PR6+。
 *
 * 互動:OK 解除(待實作),BACK 取消廣播。
 */

import { BaseScreen } from '../screen-manager.js';

export class SOSScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._startedAt = 0;
    this._cancelFocus = true;  // BACK / OK 焦點目前在「取消」
  }

  onEnter(from) {
    super.onEnter(from);
    this._startedAt = performance.now();
  }

  render(now) {
    const r = this.r;
    const C = r.C;

    // 整條紅底(規格 1Hz 閃爍 — 此 PR 簡化為常亮)
    r.ctx.fillStyle = C.ALERT_BG_CRIT;
    r.ctx.fillRect(0, 0, r.W, r.H);

    // 大字標題
    r.drawLabel(r.W / 2, 60, '🚨 SOS 廣播中', {
      font: r.F.ZH_LG, color: C.TEXT, align: 'center',
    });
    r.drawLabel(r.W / 2, 90, '已連續 ' + this._uptimeStr() + ' 秒', {
      font: r.F.ZH_MD, color: C.TEXT, align: 'center',
    });
    r.drawLabel(r.W / 2, 120, '位置每 30 秒重複廣播', {
      font: r.F.ZH_SM, color: C.TEXT, align: 'center',
    });

    // 取消按鈕(焦點橙)
    r.drawCard(r.W / 2 - 60, 170, 120, 36, {
      radius: 6, bg: C.FOCUS, border: C.FOCUS,
    });
    r.drawLabel(r.W / 2, 192, '◀ 取消廣播 ▶', {
      font: r.F.ZH_MD, color: C.BG, align: 'center',
    });

    r.drawLabel(r.W / 2, 232, 'BACK 取消  /  OK 確認', {
      font: r.F.ZH_SM, color: C.TEXT, align: 'center',
    });
  }

  _uptimeStr() {
    return ((performance.now() - this._startedAt) / 1000).toFixed(0);
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'OK') {
      console.log('[SOS] 取消廣播');
      this.goBack();
    }
  }
}
