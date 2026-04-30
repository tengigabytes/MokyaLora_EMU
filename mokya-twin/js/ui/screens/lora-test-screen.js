/**
 * LoraTestScreen — T-5 LoRa 自我測試(對齊 firmware lora_test_view.c)
 *
 * Header: "T-5 LoRa 自我測試  (passive metrics)"
 * 7 rows × 24 px:
 *   0. RX packets   :  N
 *   1. Last RX SNR  :  ±N.N dB  RSSI: NN
 *   2. TX queued    :  N
 *   3. ACK delivered:  N
 *   4. NACK / errors:  N
 *   5. Queue free   :  N / N
 *   6. Last ACK     :  pid=0xNN err=N
 * Hint: BACK 工具   (active loopback v2)
 */

import { BaseScreen } from '../screen-manager.js';

const ROW_H = 24;
const ROW_TOP = 50;

export class LoraTestScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._stats = null;
  }

  onEnter(from) {
    super.onEnter(from);
    // Mock counter set
    this._stats = {
      rx:    127,
      lastSnr:  +((Math.random() * 8 - 1).toFixed(1)),
      lastRssi: -82,
      txq:   34,
      ack:   31,
      nack:  3,
      qfree: 14,
      qmax:  16,
      lastAckPid: 0x21A4,
      lastAckErr: 0,
    };
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75, rssi: -82,
    });

    r.drawLabel(4, 30, 'T-5 LoRa 自我測試  (passive metrics)', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    const s = this._stats;
    const snrStr = `${s.lastSnr >= 0 ? '+' : ''}${s.lastSnr.toFixed(1)} dB`;
    const rows = [
      `RX packets   :  ${s.rx}`,
      `Last RX SNR  :  ${snrStr}  RSSI: ${s.lastRssi}`,
      `TX queued    :  ${s.txq}`,
      `ACK delivered:  ${s.ack}`,
      `NACK / errors:  ${s.nack}`,
      `Queue free   :  ${s.qfree} / ${s.qmax}`,
      `Last ACK     :  pid=0x${s.lastAckPid.toString(16).toUpperCase()} err=${s.lastAckErr}`,
    ];
    for (let i = 0; i < rows.length; i++) {
      r.drawLabel(4, ROW_TOP + i * ROW_H + 14, rows[i], {
        font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
      });
    }

    r.drawLabel(4, 218, 'BACK 工具   (active loopback v2)', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
