/**
 * MsgDetailScreen — A-3 訊息詳情(對齊 firmware message_detail_view.c)
 *
 * Modal 風格,FUNC long-press 在對話視圖叫出。
 * Header: "DM detail / !<peer-hex>"
 * Body 多行內容(out vs in 略有不同):
 *   Outbound: Dir/PID/Sent/Want/Ack 狀態 + Text
 *   Inbound: Dir/Recv/Hops/SNR/RSSI + Text
 *
 * Keys: BACK 關
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

export class MsgDetailScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._msg = null;          // { dir, peer, peerId, pid, time, want_ack, ack, hopsLimit, hopsStart, snr, rssi, text }
  }

  setMessage(msg) { this._msg = msg; }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    const m = this._msg;
    if (!m) {
      r.drawLabel(4, 30, 'DM detail', { font: r.F.ZH_SM, color: r.C.FOCUS });
      r.drawLabel(4, 60, '(no message)', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
      r.drawLabel(4, 90, 'BACK to return.', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
      return;
    }

    r.drawLabel(4, 30, `DM detail / ${m.peerId ?? '!?'}`, {
      font: r.F.ZH_SM, color: r.C.FOCUS,
    });

    let lines;
    if (m.dir === 'TX') {
      lines = [
        `Dir : TX`,
        `PID : 0x${(m.pid ?? 0).toString(16).toUpperCase()}`,
        `Sent : ${m.time ?? '?'}ms (boot)`,
        `Want : ${m.want_ack ? 'yes' : 'no'}`,
        `Ack : ${m.ack ?? 'NONE'}`,
        ``,
        `Text : ${(m.text ?? '').slice(0, 136)}${(m.text ?? '').length > 136 ? '…' : ''}`,
      ];
    } else {
      lines = [
        `Dir : RX`,
        `Recv : ${m.time ?? '?'}ms (boot)`,
        `Hops : limit/start ${m.hopsLimit ?? '--'}/${m.hopsStart ?? '--'}`,
        `SNR : ${m.snr === undefined || m.snr === null ? '--' : ((m.snr >= 0 ? '+' : '') + m.snr.toFixed(2) + 'dB')}`,
        `RSSI : ${m.rssi === undefined ? '--' : (m.rssi + 'dBm')}`,
        ``,
        `Text : ${(m.text ?? '').slice(0, 136)}${(m.text ?? '').length > 136 ? '…' : ''}`,
      ];
    }

    let y = 50;
    for (const line of lines) {
      // Wrap simple long lines (Text)
      const wrap = this._wrap(line, 38);
      for (const sub of wrap) {
        r.drawLabel(4, y, sub, { font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT });
        y += 18;
      }
    }
    r.drawHintBar([
      { key: 'BACK', label: '關閉' }
    ]);
  }

  _wrap(line, w) {
    const out = [];
    let s = line;
    while (s.length > w) {
      out.push(s.slice(0, w));
      s = s.slice(w);
    }
    out.push(s);
    return out;
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
