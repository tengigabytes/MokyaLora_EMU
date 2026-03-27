/**
 * ChatScreen — Meshtastic message list + MIE text input
 *
 * Layout (240 × 320):
 *   [0–17]    Status bar
 *   [18–255]  Message list (scrollable, 238px)
 *   [256–283] Composition / IME bar  (28px)
 *   [284–299] Input text preview bar (16px)
 *   [300–319] Tab bar (20px)
 */

import { BaseScreen } from '../screen-manager.js';
import { InputMode }  from '../../core/mie-processor.js';

// Pre-populated mock conversation
const INITIAL_MESSAGES = [
  { id:1, from:'BM-7388', text:'大家好！陽明山的訊號今天超好', time:'09:12', rssi:-82, snr:4.2,  sent:false },
  { id:2, from:'VK2-101', text:'Good morning! SNR +3.8 from Sydney mesh', time:'09:14', rssi:-98, snr:1.8, sent:false },
  { id:3, from:'ME',      text:'早安！我剛到七星山頂', time:'09:15', rssi:null, snr:null, sent:true },
  { id:4, from:'BM-7388', text:'收到！-82 dBm 很強 73', time:'09:16', rssi:-85, snr:3.9,  sent:false },
  { id:5, from:'ME',      text:'測試 MokyaLora 注音輸入', time:'09:17', rssi:null, snr:null, sent:true },
];

export class ChatScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._messages = [...INITIAL_MESSAGES];
    this._scrollY  = 0;
    this._maxScroll = 0;
    this._compState = { buffer: [], candidates: [], selIdx: 0, committed: '' };
    this._showComp  = true;
    // Fake RSSI waveform data (circular buffer, 40 points)
    this._rssiHistory = Array.from({ length: 40 }, () => -(70 + Math.random() * 40));
    this._rssiTick    = 0;
  }

  onEnter(from) {
    super.onEnter(from);
    // Subscribe to MIE events
    this.mie.addEventListener('composition:update', this._onCompositionUpdate);
    this.mie.addEventListener('action:enter',       this._onEnterAction);
    // Subscribe to serial messages
    this.serial.addEventListener('serial:message',  this._onSerialMessage);
    this.serial.addEventListener('serial:sent',     this._onSerialSent);
    // Load any persisted sim messages
    const simMsgs = this.serial.getSimMessages();
    if (simMsgs.length > INITIAL_MESSAGES.length) {
      this._messages = simMsgs.slice(-50);
    }
  }

  onLeave(toScreen) {
    this.mie.removeEventListener('composition:update', this._onCompositionUpdate);
    this.mie.removeEventListener('action:enter',       this._onEnterAction);
    this.serial.removeEventListener('serial:message',  this._onSerialMessage);
    this.serial.removeEventListener('serial:sent',     this._onSerialSent);
  }

  // Bind as arrow functions so removeEventListener works
  _onCompositionUpdate = (e) => {
    this._compState = {
      buffer:     e.detail.buffer     ?? [],
      candidates: e.detail.candidates ?? [],
      selIdx:     this.mie._jsImpl?.candidateIdx ?? 0,
      committed:  e.detail.committed  ?? '',
    };
  };

  _onEnterAction = (e) => {
    const text = e.detail.text?.trim();
    if (!text) return;
    const msg = {
      id:   Date.now(),
      from: 'ME',
      text,
      time: new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' }),
      sent: true,
    };
    this._messages.push(msg);
    this._scrollY = 9999; // Scroll to bottom
    this.serial.sendTextMessage(text);
  };

  _onSerialMessage = (e) => {
    const msg = e.detail.message;
    msg.id  = msg.id ?? Date.now();
    msg.sent = false;
    this._messages.push(msg);
    this._scrollY = 9999; // Auto-scroll
    // Update RSSI history
    if (msg.rssi) {
      this._rssiHistory.push(msg.rssi);
      if (this._rssiHistory.length > 40) this._rssiHistory.shift();
    }
  };

  _onSerialSent = () => {}; // Message already added via _onEnterAction

  render(now) {
    const r = this.r;
    const CONTENT_TOP = 18;
    const TAB_H       = 22;
    const COMP_H      = this._showComp ? 28 : 0;
    const PREVIEW_H   = 16;
    const CONTENT_BTM = r.H - TAB_H - COMP_H - PREVIEW_H;
    const CONTENT_H   = CONTENT_BTM - CONTENT_TOP;

    // Background
    r.d.fillRect(0, CONTENT_TOP, r.W, CONTENT_H, r.C.BG);

    // ── Render messages (clipped to content area) ─────────────────
    this.ctx = r.ctx;
    r.ctx.save();
    r.ctx.beginPath();
    r.ctx.rect(0, CONTENT_TOP, r.W, CONTENT_H);
    r.ctx.clip();

    // Measure total height to compute scroll range
    let totalH = 4;
    const snapshots = this._messages.map(msg => {
      const lines = r._wrapText(msg.text, r.W - 32, r.F.ZH_SM);
      const h = 5 * 2 + (!msg.sent ? 12 : 0) + lines.length * 14 + (msg.rssi ? 10 : 0) + 8;
      return { msg, h };
    });
    for (const s of snapshots) totalH += s.h;

    // Clamp scroll
    this._maxScroll = Math.max(0, totalH - CONTENT_H);
    this._scrollY   = Math.min(this._scrollY, this._maxScroll);

    let y = CONTENT_TOP + 4 - this._scrollY;
    for (const { msg, h } of snapshots) {
      if (y + h < CONTENT_TOP || y > CONTENT_BTM) { y += h; continue; }
      r.drawMessageBubble(msg, 4, y, r.W - 8);
      y += h;
    }

    r.ctx.restore();

    // Scroll indicator
    if (this._maxScroll > 0) {
      const indH  = Math.max(20, CONTENT_H * CONTENT_H / (totalH || 1));
      const indY  = CONTENT_TOP + (this._scrollY / this._maxScroll) * (CONTENT_H - indH);
      r.ctx.fillStyle = r.C.SURFACE3;
      r.ctx.fillRect(r.W - 3, indY, 2, indH);
    }

    // ── Input preview bar ────────────────────────────────────────
    const prevY = CONTENT_BTM;
    r.d.fillRect(0, prevY, r.W, PREVIEW_H, '#0E0E10');
    r.d.fillRect(0, prevY, r.W, 1, r.C.BORDER);
    const inputText = this.mie.inputText;
    r.ctx.font = r.F.ZH_SM;
    r.ctx.fillStyle = r.C.TEXT;
    r.ctx.textBaseline = 'middle';
    // Cursor blink
    const cursor = Math.floor(now / 500) % 2 === 0 ? '▋' : '';
    r.ctx.fillText((inputText || '輸入…') + cursor, 6, prevY + PREVIEW_H / 2);
    r.ctx.textBaseline = 'alphabetic';

    // ── Composition bar ──────────────────────────────────────────
    if (this._showComp) {
      r.drawCompositionBar({
        committed:  this._compState.committed,
        buffer:     this._compState.buffer,
        candidates: this._compState.candidates,
        selIdx:     this._compState.selIdx,
        mode:       this.mie.currentMode,
      });
    }

    // ── RSSI mini-waveform (top-right area of content) ───────────
    const waveY = CONTENT_TOP + 2;
    r.drawLineChart(r.W - 50, waveY, 46, 12, this._rssiHistory, {
      lineColor: r.C.LORA, fillColor: 'rgba(191,90,242,0.08)',
      minVal: -120, maxVal: -50
    });

    // ── Status bar ────────────────────────────────────────────────
    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' }),
      battery: this._fakeBattery(now),
      rssi:    this._rssiHistory[this._rssiHistory.length - 1] ?? -90,
      mode:    'LoRa',
    });

    // ── Tab bar ───────────────────────────────────────────────────
    r.drawTabBar(['💬 聊天', '🗺 地圖', '⚙ 設定'], 0);
  }

  handleKeyTap({ key, tapCount }) {
    // Navigation
    if (key.fn === 'UP')   { this._scrollY = Math.max(0, this._scrollY - 30); return; }
    if (key.fn === 'DOWN') { this._scrollY = Math.min(this._maxScroll, this._scrollY + 30); return; }
    if (key.fn === 'RIGHT') { this.goto('map', 'slide_l'); return; }
    // Forward everything else to MIE
    this.mie.processKeyTap({ key, tapCount });
  }

  handleKeyDown({ key }) {
    this.mie.processKeyDown({ key });
  }

  _fakeBattery(now) {
    return 72 + Math.sin(now / 60000) * 5 | 0;
  }
}
