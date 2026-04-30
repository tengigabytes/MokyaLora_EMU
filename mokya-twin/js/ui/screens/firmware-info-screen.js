/**
 * FirmwareInfoScreen — T-8 韌體資訊(對齊 firmware firmware_info_view.c)
 *
 * 10 列只讀資訊:Core 1 git hash / Core 0 meshtastic version / variant /
 * node id / role / caps / hw model / cache freshness / blank / OTA hint.
 * EMU 端 Core 1 hash 取自 build 時的 SW cache version,其餘從 mock 值。
 *
 * Keys: BACK / FUNC 回 T-0
 */

import { BaseScreen } from '../screen-manager.js';

const ROW_H = 20;
const HEADER_Y = 30;
const ROW_TOP = 50;

export class FirmwareInfoScreen extends BaseScreen {
  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(4, HEADER_Y, 'T-8 韌體資訊', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // Mock values — match firmware row order
    const myNodeNum = (this.serial?.myNodeId ?? '!a3c8e211').replace('!', '');
    const rows = [
      `Core 1   git=mokya-emu-twin`,
      `Core 0   meshtastic 2.7.8`,
      `Variant  rp2350b-mokya`,
      `Node     !${myNodeNum}`,
      `Role     CLIENT  (devstate v3)`,
      `Caps     wifi=0 bt=0 eth=0 shut=1`,
      `HW       model=75 (RPI_PICO2 expected)`,
      `Cache    nodes=8  seq=1247`,
      ``,
      `更新   J-Link reflash (尚無 OTA)`,
    ];

    for (let i = 0; i < rows.length; i++) {
      const isHint = (i === rows.length - 1);
      r.drawLabel(4, ROW_TOP + i * ROW_H, rows[i], {
        font: r.F.ZH_SM, color: isHint ? r.C.TEXT_DIM : r.C.TEXT,
      });
    }
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
