/**
 * SosStandbyScreen — Z-1 SOS 待機(對齊 doc/ui/01-page-architecture.md Z-1)
 *
 * 編輯 SOS 廣播文字 + 預覽要送的內容。Power 長按 5s 才會啟動 Z-2 廣播。
 *
 * Keys: OK 切換預覽 · BACK 回 launcher
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

export class SosStandbyScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._text = 'SOS — 緊急救援，請聯絡!';
    this._preview = false;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    r.drawLabel(4, 30, 'Z-1 SOS 待機', {
      font: r.F.ZH_SM, color: r.C.WARNING,
    });

    r.drawCard(8, 50, r.W - 16, 50, {
      radius: 6, bg: r.C.SURFACE, border: r.C.BORDER,
    });
    r.drawLabel(14, 78, this._text, {
      font: r.F.ZH_MD, color: r.C.TEXT,
    });
    r.drawLabel(14, 65, 'SOS 廣播文字:', {
      font: r.F.XS, color: r.C.TEXT_DIM,
    });

    if (this._preview) {
      r.drawLabel(4, 120, '── 預覽 ──', {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      });
      r.drawLabel(4, 145, `頻道: PRIMARY (broadcast)`, { font: r.F.ZH_SM, color: r.C.TEXT });
      r.drawLabel(4, 165, `每 30 秒重複 (Z-3 設定)`, { font: r.F.ZH_SM, color: r.C.TEXT });
      r.drawLabel(4, 185, `附 GPS:25.052103 N / 121.574039 E`, { font: r.F.ZH_SM, color: r.C.TEXT });
    } else {
      r.drawLabel(4, 130, '尚未廣播。', {
        font: r.F.ZH_MD, color: r.C.TEXT,
      });
      r.drawLabel(4, 155, 'Power 鍵長按 ≥5 秒以啟動 SOS 廣播', {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      });
      r.drawLabel(4, 175, '(注:Z-2 啟動畫面 + IPC_CMD_SEND_SOS 待硬體 power button)', {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      });
    }

    r.drawHintBar([
      { key: 'OK', label: '預覽' },
      { key: 'SET', label: '至 Z-3 設定' },
      { key: 'BACK', label: '返回' }
    ]);
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    if (fn === 'OK')   { this._preview = !this._preview; return; }
    if (fn === 'SET')  { this.goto('sos-config', 'slide_l'); return; }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }
}
