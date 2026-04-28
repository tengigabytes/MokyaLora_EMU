/**
 * ChatScreen — Meshtastic message list + MIE text input.
 *
 * Layout (320 × 240 landscape):
 *   [0–17]   Status bar
 *   [18–195] Message list (scrollable)
 *   [196–217] Composition / IME bar (renderer.drawCompositionBar)
 *   [218–239] Input text preview bar
 *
 * BACK (with no active composition) returns to the previous screen
 * (typically the menu).
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
    // Conversation context: {kind:'channel', id, name} or {kind:'dm', id, name}
    this._conversation = { kind: 'channel', id: 0, name: 'LongFast' };
    this._compState = {
      pending:       { str: '', matchedPrefixBytes: 0, style: 0 },
      candidates:    [],
      allCandidates: [],
      selectedAbs:   0,
      selIdx:        0,
      committed:     '',
      picker:        { active: false, cells: [], cols: 0, selected: 0 },
    };
    this._showComp  = true;
    // Fake RSSI waveform data (circular buffer, 40 points)
    this._rssiHistory = Array.from({ length: 40 }, () => -(70 + Math.random() * 40));
    this._rssiTick    = 0;
  }

  /** Switch to a channel context (id = channel index). */
  setChannel(id, name = `Ch ${id}`) {
    this._conversation = { kind: 'channel', id, name };
    this._scrollY = 0;
  }

  /** Switch to a private-message context with a specific node. */
  setRecipient(nodeId, name = nodeId) {
    this._conversation = { kind: 'dm', id: nodeId, name };
    this._scrollY = 0;
  }

  onEnter(from) {
    super.onEnter(from);
    // Subscribe to MIE events
    this.mie.addEventListener('composition:update',  this._onCompositionUpdate);
    this.mie.addEventListener('composition:commit',  this._onCompositionCommit);
    this.mie.addEventListener('action:enter',        this._onEnterAction);
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
    this.mie.removeEventListener('composition:update',  this._onCompositionUpdate);
    this.mie.removeEventListener('composition:commit',  this._onCompositionCommit);
    this.mie.removeEventListener('action:enter',        this._onEnterAction);
    this.serial.removeEventListener('serial:message',  this._onSerialMessage);
    this.serial.removeEventListener('serial:sent',     this._onSerialSent);
  }

  // Bind as arrow functions so removeEventListener works
  _onCompositionUpdate = (e) => {
    const d = e.detail;
    const rawBuf = d.buffer ?? '';
    const pending = d.pending ?? {
      str:                Array.isArray(rawBuf) ? rawBuf.join('') : rawBuf,
      matchedPrefixBytes: 0,
      style:              rawBuf && rawBuf.length ? 1 : 0,
    };
    this._compState = {
      pending,
      candidates:    d.candidates ?? [],
      allCandidates: d.allCandidates ?? d.candidates ?? [],
      selectedAbs:   d.selectedAbs ?? d.sel ?? this.mie._jsImpl?.candidateIdx ?? 0,
      selIdx:        d.sel ?? 0,
      committed:     d.committed ?? '',
      picker:        d.picker ?? { active: false, cells: [], cols: 0, selected: 0 },
    };
  };

  // WASM mode: each committed character arrives here; accumulate in compState
  _onCompositionCommit = (e) => {
    this._compState = {
      ...this._compState,
      committed: (this._compState.committed ?? '') + (e.detail.text ?? ''),
    };
  };

  _onEnterAction = (e) => {
    const text = (e.detail.text ?? '').trim();
    if (!text) return;
    const msg = {
      id:   Date.now(),
      from: 'ME',
      text,
      time: new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' }),
      sent: true,
    };
    this._messages.push(msg);
    this._scrollY = 9999;
    this._compState.committed = '';
    // Route DMs to the recipient node, channel messages stay broadcast.
    const opts = this._conversation.kind === 'dm'
      ? { to: this._conversation.id, wantAck: true }
      : { channel: this._conversation.id ?? 0 };
    this.serial.sendTextMessage(text, opts);
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
    const STATUS_BTM = 18;
    const HDR_H      = 16;          // conversation context bar
    const CONTENT_TOP = STATUS_BTM + HDR_H;
    const TAB_H       = 22;
    // Composition block = 文字 row (22) + 候選 row (22) = 44 when shown.
    const COMP_H      = this._showComp ? 44 : 0;
    const CONTENT_BTM = r.H - TAB_H - COMP_H;
    const CONTENT_H   = CONTENT_BTM - CONTENT_TOP;

    // Conversation context bar
    r.d.fillRect(0, STATUS_BTM, r.W, HDR_H, r.C.SURFACE);
    const conv = this._conversation;
    const tag  = conv.kind === 'dm' ? '私訊 →' : '頻道 #';
    const tagColor = conv.kind === 'dm' ? r.C.WARNING : r.C.GREEN;
    r.drawLabel(8, STATUS_BTM + 12, tag, {
      font: r.F.ZH_SM, color: tagColor,
    });
    r.drawLabel(48, STATUS_BTM + 12, conv.name, {
      font: r.F.ZH_SM, color: r.C.TEXT,
    });

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

    // ── Composition bar (候選 row on top, 文字 row on bottom) ─────
    if (this._showComp) {
      r.drawCompositionBar({
        committedLeft:  this._compState.committed,
        committedRight: '',
        pending:        this._compState.pending,
        candidates:     this._compState.candidates,
        allCandidates:  this._compState.allCandidates,
        selectedAbs:    this._compState.selectedAbs,
        selIdx:         this._compState.selIdx,
        mode:           this.mie.currentMode,
        picker:         this._compState.picker,
        cursorBlink:    Math.floor(now / 500) % 2 === 0,
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
    });

  }

  handleKeyTap({ key, tapCount }) {
    // Only scroll with UP/DOWN when no active composition and no picker overlay
    // (buffer empty, no candidates, picker closed).
    const pendingLen = (this._compState.pending?.str ?? '').length;
    const pickerActive = !!this._compState.picker?.active;
    const hasComp = pendingLen > 0 || this._compState.candidates.length > 0 || pickerActive;
    if (key.fn === 'BACK' && !hasComp) { this.goBack(); return; }
    if (key.fn === 'UP'   && !hasComp) { this._scrollY = Math.max(0, this._scrollY - 30); return; }
    if (key.fn === 'DOWN' && !hasComp) { this._scrollY = Math.min(this._maxScroll, this._scrollY + 30); return; }
    // Forward everything (including LEFT/RIGHT/UP/DOWN during composition) to MIE
    this.mie.processKeyTap({ key, tapCount });
  }

  handleKeyDown({ key }) {
    // Width-packed candidate paging: UP/DOWN flip the renderer's display-page
    // and snap firmware's selection to the new page's first slot. Only kicks
    // in when there are candidates and more than one display-page; otherwise
    // the press falls through to MIE (firmware emits cursor:move when there
    // are no candidates).
    if ((key.fn === 'UP' || key.fn === 'DOWN') &&
        this._compState.allCandidates.length > 0) {
      const info = this.r.getDisplayPageInfo();
      if (info.pageCount > 1) {
        const next = key.fn === 'UP'
          ? (info.page - 1 + info.pageCount) % info.pageCount
          : (info.page + 1) % info.pageCount;
        this.r.setDisplayPage(next);
        this.mie.navigateToCandidate(info.pages[next].start);
        return;
      }
    }
    this.mie.processKeyDown({ key });
  }

  _fakeBattery(now) {
    return 72 + Math.sin(now / 60000) * 5 | 0;
  }
}
