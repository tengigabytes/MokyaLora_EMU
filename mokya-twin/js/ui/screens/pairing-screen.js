/**
 * PairingScreen — T-7 配對碼顯示(對齊 firmware pairing_view.c)
 *
 * 顯示本機 Admin Channel 公鑰的 hex(64 字元 split 2 行)+ standard base64
 * (44 字元 split 2 行)。EMU 端用 mock pubkey,實機則從 cascade
 * Security config 取出。
 *
 * Keys: BACK / FUNC 回 T-0
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

// Mock 32-byte public key (deterministic across reloads).
const MOCK_PK = new Uint8Array([
  0xa3, 0x57, 0xf2, 0x91, 0x4c, 0xb8, 0x05, 0x3d,
  0xe1, 0x6f, 0x29, 0x88, 0xb1, 0x4a, 0xc7, 0x02,
  0x53, 0xfa, 0x6e, 0xd0, 0x91, 0x2c, 0x73, 0x88,
  0x44, 0x99, 0x2b, 0x06, 0xee, 0x18, 0xa5, 0xd0,
]);

function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export class PairingScreen extends BaseScreen {
  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    // Header
    r.drawLabel(4, 30, 'T-7 配對碼  本機公鑰', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    const hex = toHex(MOCK_PK);
    const b64 = toBase64(MOCK_PK);

    // HEX section
    r.drawLabel(4, 56, 'HEX (32 B):', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    r.drawLabel(4, 80, hex.slice(0, 32), {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 100, hex.slice(32), {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });

    // BASE64 section
    r.drawLabel(4, 130, 'BASE64 (44 chars):', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    r.drawLabel(4, 154, b64.slice(0, 32), {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 174, b64.slice(32), {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });

    r.drawHintBar([
      { key: 'BACK', label: '工具   admin_chan=off' }
    ]);
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
