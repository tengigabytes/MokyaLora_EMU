/**
 * ChannelShareScreen — B-4 分享頻道(對齊 firmware channel_share_view.c)
 *
 * Header: "B-4 分享 chN  <name>"
 * QR code 144×144 置中 + URL 文字 + status row。
 * EMU 用 canvas 模擬 QR(隨機灰階格 visual proxy);完整實作在 v2 接 qrcode 套件。
 *
 * Keys: BACK 回 B-2
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

export class ChannelShareScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._channel = { idx: 0, name: 'LongFast' };
    this._url = '';
    this._qrPattern = null;
  }

  setChannel(ch) {
    this._channel = ch;
    this._url = `https://meshtastic.org/e/#${this._mockBase64Set(ch)}`;
    this._qrPattern = this._genQRPattern(this._url);
  }

  onEnter(from) {
    super.onEnter(from);
    if (!this._url) this.setChannel(this._channel);
  }

  _mockBase64Set(ch) {
    // Mock URL hash — in real device this is the protobuf-encoded ChannelSet.
    return btoa(JSON.stringify({ name: ch.name, idx: ch.idx, ts: Date.now() }))
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  _genQRPattern(seed) {
    const N = 24;     // 24×24 module ASCII proxy
    const grid = new Array(N * N).fill(0);
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    let r = h >>> 0;
    const next = () => { r = (r * 1664525 + 1013904223) >>> 0; return r; };
    for (let i = 0; i < N * N; i++) grid[i] = (next() & 1);
    // Finder patterns (3 corners)
    const placeFinder = (cx, cy) => {
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
        const isOn = (dx === 0 || dx === 6 || dy === 0 || dy === 6) ||
                     (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
        grid[(cy + dy) * N + (cx + dx)] = isOn ? 1 : 0;
      }
    };
    placeFinder(0, 0); placeFinder(N - 7, 0); placeFinder(0, N - 7);
    return { N, grid };
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar(defaultStatusOpts(this.serial));

    r.drawLabel(4, 24, `B-4 分享 ch${this._channel.idx}  ${this._channel.name}`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    // QR code area: 144×144 centred at x=88..231, y=44..187
    const QR_X = 88, QR_Y = 44, QR_W = 144;
    const ctx = r.ctx;
    // White background
    ctx.fillStyle = r.C.TEXT;
    ctx.fillRect(QR_X, QR_Y, QR_W, QR_W);

    if (this._qrPattern) {
      const { N, grid } = this._qrPattern;
      const cell = QR_W / N;
      ctx.fillStyle = r.C.BG;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (grid[y * N + x]) {
            ctx.fillRect(QR_X + x * cell, QR_Y + y * cell, cell, cell);
          }
        }
      }
    }

    // URL text (truncate)
    const urlShort = this._url.length > 40 ? this._url.slice(0, 37) + '…' : this._url;
    r.drawLabel(r.W / 2, 200, urlShort, {
      font: r.F.XS, color: r.C.TEXT, align: 'center',
    });
    r.drawLabel(r.W / 2, 215, `URL ${this._url.length} chars  QR OK  BACK`, {
      font: r.F.XS, color: r.C.TEXT_DIM, align: 'center',
    });
    r.drawHintBar([
      { key: 'BACK', label: '編輯' }
    ]);
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
