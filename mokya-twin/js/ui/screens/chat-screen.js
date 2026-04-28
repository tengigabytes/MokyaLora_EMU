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
import { setDraft, getDraft, clearDraft, humanAge } from './drafts-store.js';

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

  /** 對齊 doc/ui/12-ime.md 草稿系統:每個目的地一份 key。 */
  _draftId() {
    const c = this._conversation;
    return `chat:${c.kind}:${c.id}`;
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
    // 草稿恢復對話框(規格 12-ime.md §草稿恢復畫面):進入時若有草稿,
    // 顯示「[繼續編輯][重新開始]」二選一。OK 在「繼續」=保留草稿、
    // 「重新開始」=清除草稿;BACK 不進編輯,回上層。
    const draft = getDraft(this._draftId());
    if (draft) {
      this._recovery = {
        text:  draft.text,
        age:   humanAge(((Date.now() / 1000) | 0) - draft.savedAt),
        focus: 0,   // 0=繼續編輯、1=重新開始
      };
    } else {
      this._recovery = null;
    }
  }

  onLeave(toScreen) {
    // 模式 B + 離開 + buffer 非空 → 存草稿(規格)
    const pendingStr = (this._compState?.pending?.str ?? '');
    const committed  = (this._compState?.committed ?? '');
    const buffer = (committed + pendingStr).trim();
    if (buffer) {
      setDraft(this._draftId(), buffer);
    }
    this._draftBanner = null;

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
    // Stray space filter:WASM firmware 在 OK 鍵 commit 候選字後可能會在
    // committed 累積字串末尾追加一個 ASCII 空格(stray)。SPACE 鍵的空格
    // 不走這條路徑(SPACE 直接被 firmware 處理為「一聲/literal space」走
    // composition:commit channel,但 lastUserKeyFn 會是 'SPACE'),所以僅
    // 在「最近一次按鍵是 OK」時去掉末尾 ASCII 空格。
    let committedRaw = d.committed ?? '';
    if (this._lastUserKeyFn === 'OK' && committedRaw.endsWith(' ')) {
      committedRaw = committedRaw.replace(/ +$/, '');
    }
    this._compState = {
      pending,
      candidates:    d.candidates ?? [],
      allCandidates: d.allCandidates ?? d.candidates ?? [],
      selectedAbs:   d.selectedAbs ?? d.sel ?? this.mie._jsImpl?.candidateIdx ?? 0,
      selIdx:        d.sel ?? 0,
      committed:     committedRaw,
      picker:        d.picker ?? { active: false, cells: [], cols: 0, selected: 0 },
    };
  };

  // WASM mode: each committed character arrives here; accumulate in compState
  _onCompositionCommit = (e) => {
    const text = e.detail.text ?? '';
    // 過濾 OK 後的 stray ASCII 空格 commit(同 _onCompositionUpdate 註解)。
    if (text === ' ' && this._lastUserKeyFn === 'OK') return;
    this._compState = {
      ...this._compState,
      committed: (this._compState.committed ?? '') + text,
    };
  };

  _onEnterAction = (e) => {
    const text = (e.detail.text ?? '').trim();
    this._sendBuffer(text);
  };

  /** 訊息送出 — MIE action:enter 觸發(OK 在無候選字 + 無 pending 時)。 */
  _sendBuffer(text) {
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
    this._compState.pending   = { str: '', matchedPrefixBytes: 0, style: 0 };
    // 送出後清除該對象的草稿(規格 §草稿生命週期)
    clearDraft(this._draftId());
    this._draftBanner = null;
    // Route DMs to the recipient node, channel messages stay broadcast.
    const opts = this._conversation.kind === 'dm'
      ? { to: this._conversation.id, wantAck: true }
      : { channel: this._conversation.id ?? 0 };
    this.serial.sendTextMessage(text, opts);
  }

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

    // 草稿恢復對話框(在 chat 畫面繪完之上完整覆蓋)
    if (this._recovery) {
      this._renderRecovery(r);
      return;
    }

    const STATUS_BTM = 18;
    const HDR_H      = 16;          // conversation context bar
    const CONTENT_TOP = STATUS_BTM + HDR_H;
    // 對齊 doc/ui/12-ime.md:
    //   IME Bar 18px 條件顯示(有候選字才畫,規格)
    //   輸入框 22px(模式 B 規格中緊鄰 IME Bar 上方)— 顯示已 commit 文字 + inline preedit
    //   Hint Bar 16px 在最底
    // IME Bar 18px 與 Hint Bar 16px 互斥(同位置 — 緊貼螢幕底)
    const hasComp = this._compHasContent();
    const FOOT_H  = hasComp ? 18 : 16;
    const INPUT_H = 22;
    const INPUT_Y = r.H - FOOT_H - INPUT_H;
    const CONTENT_BTM = INPUT_Y;
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

    // ── 輸入框(模式 B,inline preedit + 游標)─────────────────────
    // 對齊 doc/ui/12-ime.md §模式 B 訊息 App 對話內的特殊版面 — 輸入區
    // 緊鄰 IME Bar 上方,使用者輸入時眼睛在「文字框 → 候選字」視線最短。
    {
      const ix = 4, iy = INPUT_Y, iw = r.W - 8, ih = INPUT_H;
      // 框背景 + 焦點橙邊框(規格 §模式 A 元素規格 焦點邊框 2px)
      r.ctx.fillStyle = r.C.FOCUS;
      r.ctx.fillRect(ix, iy, iw, ih);
      r.ctx.fillStyle = r.C.SURFACE;
      r.ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);

      // 已 commit 的待送文字(主色)+ inline preedit + 游標
      const padX = 6;
      const baseline = iy + ih / 2 + 5;
      let tx = ix + padX;
      const committed = this._compState.committed ?? '';
      if (committed) {
        r.ctx.font         = r.F.ZH_MD;
        r.ctx.fillStyle    = r.C.TEXT;
        r.ctx.textAlign    = 'left';
        r.ctx.textBaseline = 'alphabetic';
        r.ctx.fillText(committed, tx, baseline);
        tx += r.ctx.measureText(committed).width;
      }
      const blink = Math.floor(now / 500) % 2 === 0;
      tx += r.drawInlinePreedit(tx, baseline, this._compState.pending, {
        cursorBlink: blink, height: ih - 4,
      });

      // 字數計數靠右下(規格 §模式 B 字數計數)
      const len = countChars(committed) + countChars(this._compState.pending?.str ?? '');
      const max = 240;
      let cntColor = r.C.TEXT_DIM;
      if (len >= max) cntColor = r.C.DANGER;
      else if (len >= max * 0.8) cntColor = r.C.WARNING;
      r.drawLabel(ix + iw - 4, iy + ih - 4, `${len}/${max}`, {
        font: r.F.XS, color: cntColor, align: 'right',
      });
    }

    // ── IME Bar(規格單列 18px,僅有候選字時顯示) ─────────────────
    if (hasComp) {
      r.drawCompositionBar({
        candidates:     this._compState.candidates,
        allCandidates:  this._compState.allCandidates,
        selectedAbs:    this._compState.selectedAbs,
        selIdx:         this._compState.selIdx,
        picker:         this._compState.picker,
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
      time:     new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' }),
      battery:  this._fakeBattery(now),
      mode:     this.mie.currentMode,   // IME 啟動時自動顯示 注/EN/Ab/Num
      capsLock: !!this.mie.capsLock,    // Ab/EN multitap 大小寫鎖(MODE 長按切換)
    });

    // ── Hint Bar(子模式)— 對齊 doc/ui/12-ime.md 鍵位行為表 ──────
    // 訊息對話 = 模式 B 全螢幕編輯;OK 短按換行、長按送出。
    // 規格:IME Bar 與 Hint Bar 互斥(同位置 — 緊貼螢幕底)
    if (!hasComp) {
      r.drawHintBar([
        { key: 'OK',   label: '換行' },
        { key: 'OK⌘',  label: '送出' },
        { key: 'BCK',  label: '存草稿' },
        { key: 'MODE', label: '切 IME' },
      ]);
    }
  }

  /** 是否有 IME 內容(pending preedit / 候選字 / picker)— 決定 IME Bar 顯隱。 */
  _compHasContent() {
    const pendingLen = (this._compState?.pending?.str ?? '').length;
    return pendingLen > 0
        || (this._compState?.candidates?.length ?? 0) > 0
        || !!this._compState?.picker?.active;
  }

  /**
   * 長按事件(對齊 doc/ui/12-ime.md 鍵位行為表):
   *   MODE 長按 → CapsLock(IME)
   *   BACK 長按 → 鎖屏(由全域路由處理,此處不接)
   *
   * OK 不分長/短按 — 統一走 MIE 原始邏輯(短按 / 任意長度按):
   *   有候選字 → 確認候選字
   *   無候選   → action:enter → _sendBuffer 送出
   * 規格 12-ime.md「模式 B 短按換行 / 長按送出」差異化暫不實作 — chat
   * 輸入框是單列 inline,換行視覺無意義;且雙路徑容易出現 stray space
   * 等 firmware 行為差異。
   */
  handleKeyHold({ key }) {
    if (key.fn === 'MODE') {
      this.mie.toggleCapsLock?.();
      return;
    }
  }

  handleKeyTap({ key, tapCount }) {
    // 草稿恢復對話框攔截鍵位
    if (this._recovery) {
      this._handleRecoveryKey(key);
      return;
    }

    // Only scroll with UP/DOWN when no active composition and no picker overlay
    // (buffer empty, no candidates, picker closed).
    const pendingLen = (this._compState.pending?.str ?? '').length;
    const pickerActive = !!this._compState.picker?.active;
    const hasComp = pendingLen > 0 || this._compState.candidates.length > 0 || pickerActive;
    if (key.fn === 'BACK' && !hasComp) { this.goBack(); return; }
    if (key.fn === 'UP'   && !hasComp) { this._scrollY = Math.max(0, this._scrollY - 30); return; }
    if (key.fn === 'DOWN' && !hasComp) { this._scrollY = Math.min(this._maxScroll, this._scrollY + 30); return; }
    // 短按 OK 交給 MIE 處理:
    //   有候選字 → MIE 確認該候選字
    //   無候選字 + 有 committed → MIE action:enter → _sendBuffer 送出
    //   完全空 buffer → MIE 不會做任何事
    // 規格 12-ime.md 模式 B 短按 OK = 換行;但 chat 輸入框是單列無 word-wrap,
    // 換行視覺會被當作空格,實作犧牲 spec 此點以保 UX。長按 OK 由
    // handleKeyHold 處理為顯式送出(與 spec 一致)。
    // Forward everything (including LEFT/RIGHT/UP/DOWN during composition) to MIE
    this.mie.processKeyTap({ key, tapCount });
  }

  /** 草稿恢復對話框(規格 12-ime.md §草稿恢復畫面)。 */
  _renderRecovery(r) {
    r.clear();
    const C = r.C;

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: this._fakeBattery(performance.now()),
    });

    // 標題
    r.drawLabel(r.W / 2, 32, this._conversation.name, {
      font: r.F.ZH_MD, color: C.TEXT, align: 'center',
    });
    r.ctx.fillStyle = C.BORDER;
    r.ctx.fillRect(0, 42, r.W, 1);

    r.drawLabel(r.W / 2, 70, '發現未完成的草稿', {
      font: r.F.ZH_MD, color: C.TEXT, align: 'center',
    });

    // 草稿預覽(框 + 截斷文字)
    const preview = truncatePreview(this._recovery.text, 32);
    r.drawCard(20, 90, r.W - 40, 50, {
      radius: 6, bg: C.SURFACE, border: C.BORDER,
    });
    r.drawLabel(r.W / 2, 110, `「${preview}」`, {
      font: r.F.ZH_SM, color: C.FOCUS, align: 'center', maxWidth: r.W - 60,
    });
    r.drawLabel(r.W / 2, 132, `建立於 ${this._recovery.age}`, {
      font: r.F.ZH_SM, color: C.TEXT_DIM, align: 'center',
    });

    // 按鈕(◀▶ 切換,OK 確認)
    const btnY = 168;
    const btnW = 110, btnH = 30, gap = 12;
    const totalW = btnW * 2 + gap;
    const x0 = (r.W - totalW) / 2;
    const items = [
      { label: '繼續編輯', x: x0 },
      { label: '重新開始', x: x0 + btnW + gap },
    ];
    items.forEach((it, i) => {
      const isSel = (this._recovery.focus === i);
      r.drawCard(it.x, btnY, btnW, btnH, {
        radius: 6,
        bg:     isSel ? C.FOCUS_BG : C.SURFACE,
        border: isSel ? C.FOCUS    : C.BORDER,
      });
      const label = isSel ? `▶ ${it.label}` : it.label;
      r.drawLabel(it.x + btnW / 2, btnY + btnH / 2 + 6, label, {
        font: r.F.ZH_MD, color: isSel ? C.FOCUS : C.TEXT, align: 'center',
      });
    });

    // 底部提示
    r.drawLabel(r.W / 2, 218, '◀▶ 切換  OK 確認  BCK 取消', {
      font: r.F.ZH_SM, color: C.TEXT_DIM, align: 'center',
    });
  }

  _handleRecoveryKey(key) {
    if (!this._recovery) return;
    if (key.fn === 'LEFT')  { this._recovery.focus = 0; return; }
    if (key.fn === 'RIGHT') { this._recovery.focus = 1; return; }
    if (key.fn === 'BACK') {
      // 規格:BACK = 不進編輯,回上層;草稿保留
      this._recovery = null;
      this.goBack();
      return;
    }
    if (key.fn === 'OK') {
      if (this._recovery.focus === 1) {
        // 重新開始 → 清草稿
        clearDraft(this._draftId());
      }
      // 「繼續編輯」 → 草稿留著(下次離開若 buffer 空,onLeave 不會覆寫;
      //                  若新輸入則 onLeave 會以新 buffer 覆寫)。
      // 完整把草稿載入 MIE composition 受 WASM API 限制,留待後續整合。
      this._recovery = null;
      return;
    }
  }

  handleKeyDown({ key }) {
    // 追蹤最近一次按鍵 fn 名,供 _onCompositionCommit/Update 過濾 stray
    // space(WASM 在 OK 後會 emit 一個 ASCII 空格 commit;若按 SPACE 鍵,
    // 此值會是 'SPACE',讓真正的空格通過)。
    this._lastUserKeyFn = key.fn;

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

function truncatePreview(s, maxChars) {
  if (!s) return '';
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}

function countChars(s) {
  if (!s) return 0;
  return Array.from(s).length;
}
