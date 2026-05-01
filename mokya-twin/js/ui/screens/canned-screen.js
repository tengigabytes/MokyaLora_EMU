/**
 * CannedScreen — A-4 預設訊息(對齊 firmware canned_view.c + canned_messages.c)
 *
 * Header: "Send to <peer>" 或 "Quick send  (no peer)"
 * 8 個預設訊息(縱向選單),OK 送出。
 *
 * 預設訊息(對齊 firmware canned_messages.c):
 *   OK / Yes / No / Thanks / On my way / Be there in 5 / I'm safe / Stand by
 *
 * Keys: UP/DOWN 選 · OK 送 · BACK 取消
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const CANNED = [
  'OK',
  'Yes',
  'No',
  'Thanks',
  'On my way',
  'Be there in 5',
  "I'm safe",
  'Stand by',
];

const ROW_H = 24;
const ROW_TOP = 38;

export class CannedScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel = 0;
    this._target = null;        // { id, short_name }
    this._toast = null;
  }

  setTarget(target) {
    this._target = target;
  }

  onEnter(from) {
    super.onEnter(from);
    this._toast = null;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    const header = this._target?.short_name
      ? `Send to ${this._target.short_name}`
      : 'Quick send  (no peer)';
    r.drawLabel(4, 30, header, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    for (let i = 0; i < CANNED.length; i++) {
      const focused = (i === this._sel);
      const y = ROW_TOP + i * ROW_H + 14;
      r.drawLabel(4, y, `${focused ? '>' : ' '}${CANNED[i]}`, {
        font: r.F.ZH_MD,
        color: focused ? r.C.FOCUS : r.C.TEXT,
      });
    }

    if (this._toast) {
      r.drawLabel(r.W / 2, 218, this._toast, {
        font: r.F.ZH_SM, color: r.C.GREEN, align: 'center',
      });
    }

    r.drawHintBar([
      { key: 'OK', label: '送出' },
      { key: 'BACK', label: '取消' }
    ]);
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N = CANNED.length;
    if (fn === 'UP')   { if (this._sel > 0) this._sel--; return; }
    if (fn === 'DOWN') { if (this._sel + 1 < N) this._sel++; return; }
    if (fn === 'OK') {
      if (!this._target) {
        this._toast = '無收件人,先在節點清單選一位';
        return;
      }
      // Mock send — in real device this calls phoneapi_encode_text_packet.
      this._toast = `已送 → ${this._target.short_name}`;
      setTimeout(() => this.goBack(), 600);
      return;
    }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }
}
