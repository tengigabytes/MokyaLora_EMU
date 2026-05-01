/**
 * MyNodeScreen — C-4 我的節點(對齊 firmware my_node_view.c)
 *
 * Header(accent): "<short_name> !<my-hex>" 或 "Me  !<hex>"
 * Body fields(read-only,從 cache 取):
 *   Long  : <long_name>
 *   Role  : Client/...
 *   HW    : N
 *   Reboot: N
 *   FW    : <firmware_version>
 *   PIO   : <pio_env>
 *   NodeDB: N peers
 *   Caps  : wifi=Y/n ble=Y/n eth=Y/n shutdown=Y/n
 *
 * Keys: BACK 回 home
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';
import { NODES }     from './nodes-data.js';

const ROW_H = 20;
const ROW_TOP = 50;

export class MyNodeScreen extends BaseScreen {
  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    const myId = this.serial?.myNodeId ?? '!a3c8e211';
    const my = NODES.find(n => n.user?.id === myId)
              ?? { user: { short_name: 'EMU', long_name: 'MokyaLora EMU', role: 'CLIENT', hw_model: 'MOKYA_LORA' } };
    const sn = my.user.short_name ?? 'Me';
    r.drawLabel(4, 24, `${sn} ${myId}`, {
      font: r.F.ZH_SM, color: r.C.FOCUS,
    });

    const lines = [
      `Long  : ${my.user.long_name ?? '(no name)'}`,
      `Role  : ${my.user.role ?? 'CLIENT'}`,
      `HW    : ${my.user.hw_model ?? '?'}`,
      `Reboot: 3`,
      `FW    : 2.7.8`,
      `PIO   : rp2350b-mokya`,
      `NodeDB: ${NODES.length} peers`,
      `Caps  : wifi=n ble=n eth=n shutdown=Y`,
    ];

    for (let i = 0; i < lines.length; i++) {
      r.drawLabel(4, ROW_TOP + i * ROW_H + 14, lines[i], {
        font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
      });
    }

    r.drawHintBar([
      { key: '(編輯請至設定)', label: '' },
      { key: 'BACK', label: '返回' }
    ]);
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
