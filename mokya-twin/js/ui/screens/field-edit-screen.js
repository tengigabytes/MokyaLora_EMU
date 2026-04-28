/**
 * FieldEditScreen — 對齊 doc/ui/50-settings-leaf-templates.md 的四模板
 *
 *   A 列舉選一 (enum):   `●/○ + ▶` + 滾動提示
 *   B 數值輸入 (int/float): `▶val◀ unit` + 範圍/當前
 *   C 開關 (bool):        `啟用 ────●──── 停用` 滑桿視覺
 *   D 文字輸入 (string):   inline editor 焦點橙邊框 + 字數 N/Max
 *
 * 共通骨架(對齊規格):
 *   y=0..15  Status Bar
 *   y=18..36 ⚙ 麵包屑(14px 次色)
 *   y=40..56 設定項標題(16px 主色)
 *   y=60     1px 分隔線
 *   y=64..   內容區框(模板特異區)
 *   y=...238 說明文字(14px 次色,word wrap,最多 2-3 行)
 *
 * **不繪製 Hint Bar** —— 規格明定整個設定 App 不顯示 Hint Bar(50-templates §共通骨架)。
 *
 * 編輯流程:
 *   - 進入時 _draft 從 field.value 複製
 *   - OK → _commit() 寫回 field.value、呼叫 saveFn、goBack
 *   - BACK → 直接 goBack(不寫回)
 */

import { BaseScreen } from '../screen-manager.js';

// 共通版面常數
const Y_BREADCRUMB = 20;
const Y_TITLE      = 44;
const Y_SEP        = 60;
const Y_CONTENT    = 68;
const Y_DESC       = 196;

export class FieldEditScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._field       = null;
    this._draft       = null;
    this._enumIdx     = 0;
    this._parentTitle = '';
    // String-mode MIE handlers (bound once, attached per onEnter).
    this._onCommit = (e) => {
      if (this._field?.type !== 'string') return;
      const text = e.detail.text ?? '';
      // 過濾 OK 後的 stray ASCII 空格 commit(同 chat-screen 處理)
      if (text === ' ' && this._lastUserKeyFn === 'OK') return;
      this._draft = (this._draft ?? '') + text;
    };
    this._onDelete = () => {
      if (this._field?.type !== 'string') return;
      this._draft = Array.from(this._draft ?? '').slice(0, -1).join('');
    };
  }

  /**
   * Caller (SettingsListScreen) sets the field + a save callback before
   * navigating in. parentTitle 供麵包屑使用(例如「LoRa」、「Bluetooth」)。
   */
  setField(field, saveFn = null, parentTitle = '') {
    this._field       = field;
    this._draft       = field.value;
    this._saveFn      = saveFn;
    this._parentTitle = parentTitle || '';
    // 危險項二次確認(對齊 50-settings-leaf-templates.md §危險項二次確認)
    // confirmFocus: null=尚未進入確認 / 0=取消 / 1=確認變更
    this._confirmFocus = null;
    if (field.type === 'enum') {
      const idx = field.options.indexOf(field.value);
      this._enumIdx = idx >= 0 ? idx : 0;
    }
  }

  onEnter(from) {
    super.onEnter(from);
    if (this._field?.type === 'string') {
      this.mie.reset?.();
      this.mie.addEventListener('composition:commit', this._onCommit);
      this.mie.addEventListener('action:delete',      this._onDelete);
      this.mie.setTextContext?.('');
    }
  }

  onLeave(to) {
    if (this._field?.type === 'string') {
      this.mie.removeEventListener('composition:commit', this._onCommit);
      this.mie.removeEventListener('action:delete',      this._onDelete);
      this.mie.reset?.();
    }
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:     new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery:  75,
      mode:     this._field?.type === 'string' ? this.mie.currentMode : 'Op',
      capsLock: this._field?.type === 'string' && !!this.mie.capsLock,
    });

    const fld = this._field;
    if (!fld) {
      r.drawLabel(r.W / 2, 120, '(無欄位)', { font: r.F.ZH_MD, color: r.C.TEXT_DIM, align: 'center' });
      return;
    }

    this._drawHeader(r, fld);

    switch (fld.type) {
      case 'bool':   this._renderBool(r);   break;
      case 'enum':   this._renderEnum(r);   break;
      case 'int':
      case 'float':  this._renderNumber(r); break;
      case 'string': this._renderString(r); break;
      default:
        r.drawLabel(r.W / 2, 130, String(this._draft), {
          font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
        });
    }

    this._drawDescription(r, fld);

    // 危險項二次確認下方按鈕區
    if (this._confirmFocus !== null) {
      this._drawConfirmRow(r, fld);
    }
  }

  /** 危險項確認列 — 規格 50-settings-leaf-templates.md §危險項二次確認。 */
  _drawConfirmRow(r, fld) {
    const C = r.C;
    const ctx = r.ctx;
    const y = r.H - 30;
    // 警告訊息
    const warnMsg = fld.dangerWarning || '⚠ 變更此項可能影響本機運作';
    r.drawLabel(r.W / 2, y - 6, warnMsg, {
      font: r.F.ZH_SM, color: C.WARNING, align: 'center',
    });
    // 按鈕
    const btnY = y, btnH = 26, btnW = 100, gap = 12;
    const totalW = btnW * 2 + gap;
    const x0 = (r.W - totalW) / 2;
    const items = [
      { label: '取消',     x: x0 },
      { label: '確認變更', x: x0 + btnW + gap },
    ];
    items.forEach((it, i) => {
      const isSel = (this._confirmFocus === i);
      r.drawCard(it.x, btnY, btnW, btnH, {
        radius: 4,
        bg:     isSel ? (i === 1 ? C.DANGER : C.FOCUS_BG) : C.SURFACE,
        border: isSel ? (i === 1 ? C.DANGER : C.FOCUS)    : C.BORDER,
      });
      const label = isSel ? `▶${it.label}` : it.label;
      r.drawLabel(it.x + btnW / 2, btnY + btnH / 2 + 5, label, {
        font: r.F.ZH_MD,
        color: isSel ? (i === 1 ? C.TEXT : C.FOCUS) : C.TEXT,
        align: 'center',
      });
    });
  }

  // ── 共通骨架 ──────────────────────────────────────────────────
  _drawHeader(r, fld) {
    // 麵包屑 ⚙ {parent} › {title}(末段截斷,最多 4 段;此處 2 段)
    const parent = this._parentTitle || '設定';
    const crumb  = `⚙ ${parent} › ${fld.label}`;
    r.drawLabel(4, Y_BREADCRUMB, crumb, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      maxWidth: r.W - 8,
    });
    // 標題
    r.drawLabel(4, Y_TITLE, fld.label, {
      font: r.F.ZH_MD, color: r.C.TEXT,
    });
    // 分隔線
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(0, Y_SEP, r.W, 1);
  }

  _drawDescription(r, fld) {
    const desc = fld.description || '';
    if (!desc) return;
    // word wrap;字級 14px;最多 3 行
    const lines = wrapByWidth(r, desc, r.F.ZH_SM, r.W - 8);
    const MAX = 3;
    for (let i = 0; i < Math.min(lines.length, MAX); i++) {
      r.drawLabel(4, Y_DESC + i * 18, lines[i], {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      });
    }
  }

  // ── 模板 A:列舉選一 ────────────────────────────────────────
  _renderEnum(r) {
    const opts = this._field.options;
    const VISIBLE = 5;
    const ROW_H   = 22;
    const sel     = this._enumIdx;
    const current = opts.indexOf(this._field.value);

    // 內容區框
    const frameY = Y_CONTENT;
    const frameH = VISIBLE * ROW_H + 18;   // 額外 18px 給滾動提示
    r.drawCard(8, frameY, r.W - 16, frameH, {
      radius: 4, bg: r.C.SURFACE, border: r.C.BORDER,
    });

    // 滾動視窗:焦點居中
    let top = sel - ((VISIBLE / 2) | 0);
    if (top < 0) top = 0;
    if (top > opts.length - VISIBLE) top = Math.max(0, opts.length - VISIBLE);

    const rows = Math.min(VISIBLE, opts.length - top);
    for (let i = 0; i < rows; i++) {
      const idx   = top + i;
      const v     = opts[idx];
      const isSel = (idx === sel);
      const isCur = (idx === current);
      const y     = frameY + 4 + i * ROW_H;

      // 選中背景(橙底)
      if (isSel) {
        r.ctx.fillStyle = r.C.FOCUS_BG;
        r.ctx.fillRect(10, y, r.W - 20, ROW_H - 2);
      }

      // ●/○ 標記
      const marker = isCur ? '●' : '○';
      r.drawLabel(16, y + 16, marker, {
        font: r.F.ZH_MD, color: isCur ? r.C.TEXT : r.C.TEXT_DIM,
      });

      // ▶ 焦點標記
      if (isSel) {
        r.drawLabel(32, y + 16, '▶', {
          font: r.F.ZH_MD, color: r.C.FOCUS,
        });
      }

      // 選項文字
      r.drawLabel(48, y + 16, String(v), {
        font: r.F.ZH_MD, color: isSel ? r.C.FOCUS : r.C.TEXT,
      });

      // 「(當前)」靠右(若這項是當前值)
      if (isCur) {
        r.drawLabel(r.W - 16, y + 16, '(當前)', {
          font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
        });
      }
    }

    // 滾動提示
    const hintY = frameY + 4 + VISIBLE * ROW_H + 2;
    if (top > 0) {
      r.drawLabel(16, hintY, `↑ 還有 ${top} 項`, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM,
      });
    }
    const remaining = opts.length - (top + rows);
    if (remaining > 0) {
      r.drawLabel(r.W - 16, hintY, `↓ 還有 ${remaining} 項`, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
      });
    }
  }

  // ── 模板 B:數值輸入 ────────────────────────────────────────
  _renderNumber(r) {
    const fld   = this._field;
    const isInt = (fld.type === 'int');
    const val   = isInt ? (this._draft | 0) : Number(this._draft);
    const txt   = isInt ? String(val) : val.toFixed(2);
    const unit  = fld.unit || '';

    // 內容區框
    const frameY = Y_CONTENT;
    const frameH = 116;
    r.drawCard(8, frameY, r.W - 16, frameH, {
      radius: 4, bg: r.C.SURFACE, border: r.C.BORDER,
    });

    // 大字數值 ▶val◀ unit(32px = 16px Unifont ×2 縮放)
    const ctx = r.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(2, 2);
    // baseline 'top' 後 16px 字會佔 16 邏輯 px,放大後 32 螢幕 px
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'center';
    ctx.fillStyle    = r.C.FOCUS;
    const bigLine = `▶${txt}◀${unit ? '  ' + unit : ''}`;
    // 內容區中央 y(frameY+16 起的 32px),scale=2 → /2
    ctx.fillText(bigLine, r.W / 4, (frameY + 24) / 2);
    ctx.restore();
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    // 範圍提示
    const rangeStr = (typeof fld.min === 'number' && typeof fld.max === 'number')
      ? `範圍:${fld.min} - ${fld.max}${unit ? ' ' + unit : ''}`
      : '';
    if (rangeStr) {
      r.drawLabel(r.W / 2, frameY + 76, rangeStr, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
      });
    }

    // 當前值
    const curStr = `當前:${formatVal(fld.value, isInt)}${unit ? ' ' + unit : ''}`;
    r.drawLabel(r.W / 2, frameY + 96, curStr, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });

    // 超範圍紅色警告
    if (typeof fld.min === 'number' && val < fld.min ||
        typeof fld.max === 'number' && val > fld.max) {
      r.drawLabel(r.W / 2, frameY + frameH - 16, '⚠ 超出範圍', {
        font: r.F.ZH_SM, color: r.C.DANGER, align: 'center',
      });
    }
  }

  // ── 模板 C:開關 ────────────────────────────────────────────
  _renderBool(r) {
    const fld   = this._field;
    const draft = !!this._draft;
    const left  = fld.labelLeft  || '啟用';
    const right = fld.labelRight || '停用';
    // 規格:左=啟用(true)、右=停用(false)。實作以 boolean 對應:
    //   true  → 滑桿在左
    //   false → 滑桿在右
    const isLeft = draft;

    // 內容區框
    const frameY = Y_CONTENT;
    const frameH = 116;
    r.drawCard(8, frameY, r.W - 16, frameH, {
      radius: 4, bg: r.C.SURFACE, border: r.C.BORDER,
    });

    // 「啟用 ────●──── 停用」
    const cy = frameY + 36;
    r.drawLabel(36, cy + 8, left, {
      font: r.F.ZH_MD, color: isLeft ? r.C.FOCUS : r.C.TEXT_DIM,
    });
    r.drawLabel(r.W - 36, cy + 8, right, {
      font: r.F.ZH_MD, color: isLeft ? r.C.TEXT_DIM : r.C.FOCUS, align: 'right',
    });

    // 滑桿軌道
    const trackX = 80, trackY = cy + 4, trackW = r.W - 160;
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(trackX, trackY, trackW, 2);
    // 滑桿球
    const ballX = isLeft ? trackX : trackX + trackW;
    r.ctx.beginPath();
    r.ctx.arc(ballX, trackY + 1, 6, 0, Math.PI * 2);
    r.ctx.fillStyle = r.C.FOCUS;
    r.ctx.fill();

    // 當前值
    const curLabel = (fld.value === true) ? left : right;
    r.drawLabel(r.W / 2, frameY + 80, `當前:${curLabel}`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  // ── 模板 D:文字輸入 ────────────────────────────────────────
  _renderString(r) {
    const fld    = this._field;
    const max    = fld.maxLength || 0;
    const text   = this._draft ?? '';
    const len    = byteLength(text);

    // Inline editor frame:焦點橙邊框 2px(規格)
    const frameY = Y_CONTENT;
    const frameH = 24;
    // 雙重邊框模擬 2px:外層橙、內層 SURFACE 收邊
    r.ctx.fillStyle = r.C.FOCUS;
    r.ctx.fillRect(8, frameY, r.W - 16, frameH);
    r.ctx.fillStyle = r.C.SURFACE;
    r.ctx.fillRect(10, frameY + 2, r.W - 20, frameH - 4);

    // 已輸入文本(主色)+ inline preedit(橙背景塊 + 游標)+ 字數計數
    const padX = 14;
    const baseline = frameY + 16;
    const showPlaceholder = (text === '');
    if (showPlaceholder) {
      // 規格:無內容時不顯示空文字,只顯示 inline preedit + 游標
      // 但若連 preedit 也沒有,顯示 (空) 提示
      const pendingStr = this.mie.getPendingView?.()?.str ?? '';
      if (pendingStr.length === 0 && !this.mie.currentMode) {
        r.drawLabel(padX, baseline, '(空)', {
          font: r.F.ZH_MD, color: r.C.TEXT_DIM,
        });
      }
    } else {
      r.ctx.font         = r.F.ZH_MD;
      r.ctx.fillStyle    = r.C.TEXT;
      r.ctx.textAlign    = 'left';
      r.ctx.textBaseline = 'alphabetic';
      r.ctx.fillText(text, padX, baseline);
    }
    // Inline preedit 緊接已 commit 文字之後
    let cursorX = padX + (showPlaceholder ? 0 : r.ctx.measureText(text).width);
    const pending = this.mie.getPendingView?.() ?? { str: '', matchedPrefixBytes: 0, style: 0 };
    const blink   = ((performance.now() / 500) | 0) % 2 === 0;
    r.drawInlinePreedit(cursorX, baseline, pending, {
      cursorBlink: blink, height: frameH - 4,
    });

    // 字數 N/Max(顏色依規格門檻)
    const cntStr = max > 0 ? `${len}/${max}` : `${len}`;
    let cntColor = r.C.TEXT_DIM;
    if (max > 0) {
      const ratio = len / max;
      if (ratio >= 1)        cntColor = r.C.DANGER;
      else if (ratio >= 0.8) cntColor = r.C.WARNING;
    }
    r.drawLabel(r.W - padX, frameY + 16, cntStr, {
      font: r.F.ZH_SM, color: cntColor, align: 'right',
    });

    // 驗證錯誤訊息(若有 validate)
    let errText = '';
    if (fld.validate && !fld.validate(text)) {
      errText = (fld.errorMessage && fld.errorMessage(text)) || '⚠ 格式錯誤';
    } else if (max > 0 && len > max) {
      errText = '⚠ 超出字數上限';
    }
    if (errText) {
      r.drawLabel(4, frameY + frameH + 8, errText, {
        font: r.F.ZH_SM, color: r.C.DANGER,
      });
    }

    // ── IME Bar(規格 12-ime.md §IME Bar 18px 單列,有候選字才繪) ──
    const allCands = (this.mie.getAllCandidates?.() ?? []);
    const picker   = (this.mie.getPicker?.() ?? { active: false, cells: [], cols: 0, selected: 0 });
    r.drawCompositionBar({
      allCandidates: allCands,
      candidates:    allCands,
      selectedAbs:   (this.mie.getSelectedAbs?.() ?? 0),
      selIdx:        this.mie.getPageSel?.() ?? 0,
      picker,
    });
  }

  // ── Key handling ────────────────────────────────────────────
  /**
   * 長按事件(對齊 doc/ui/12-ime.md):
   *   MODE 長按 → CapsLock(string 編輯時生效)
   *   OK   長按 → 模式 A 同短按(即 commit + 退出)
   */
  handleKeyHold({ key }) {
    const t = this._field?.type;
    if (key.fn === 'MODE' && t === 'string') {
      const on = this.mie.toggleCapsLock?.();
      console.log('[FieldEdit] CapsLock', on ? 'ON' : 'OFF');
      return;
    }
    if (key.fn === 'OK') {
      this._commit();
      return;
    }
  }

  handleKeyTap({ key, tapCount }) {
    const fn = key.fn;
    if (!this._field) { if (fn === 'BACK') this.goBack(); return; }
    const t = this._field.type;

    // 危險項二次確認攔截(規格 §危險項二次確認)
    if (this._confirmFocus !== null) {
      if (fn === 'LEFT')  { this._confirmFocus = 0; return; }
      if (fn === 'RIGHT') { this._confirmFocus = 1; return; }
      if (fn === 'BACK')  { this.goBack(); return; }   // 不套用
      if (fn === 'OK') {
        if (this._confirmFocus === 1) {
          this._commit();                               // 確認變更
        } else {
          this._confirmFocus = null;                    // 取消 → 回編輯
        }
      }
      return;
    }

    // BACK 永遠取消 + goBack
    if (fn === 'BACK') {
      this.goBack();
      return;
    }
    if (fn === 'OK' && t !== 'string') {
      // 模板 B 超範圍時 OK 阻止套用(規格 §B 數值類型細分)
      if ((t === 'int' || t === 'float')) {
        const v = (t === 'int') ? (this._draft | 0) : Number(this._draft);
        if (typeof this._field.min === 'number' && v < this._field.min) return;
        if (typeof this._field.max === 'number' && v > this._field.max) return;
      }
      this._commit();
      return;
    }

    if (t === 'bool') {
      // ◀▶ 切換滑桿(▲▼ 無作用,符合規格)
      if (fn === 'LEFT')  { this._draft = true;  return; }
      if (fn === 'RIGHT') { this._draft = false; return; }
      return;
    }
    if (t === 'enum') {
      const N = this._field.options.length;
      if (fn === 'UP')   { this._enumIdx = (this._enumIdx - 1 + N) % N; this._draft = this._field.options[this._enumIdx]; return; }
      if (fn === 'DOWN') { this._enumIdx = (this._enumIdx + 1) % N;     this._draft = this._field.options[this._enumIdx]; return; }
      return;
    }
    if (t === 'int') {
      const stepS = this._field.stepSmall || 1;
      const stepL = this._field.stepLarge || 10;
      if (fn === 'UP')    { this._draft = (this._draft | 0) + stepS;  return; }
      if (fn === 'DOWN')  { this._draft = (this._draft | 0) - stepS;  return; }
      if (fn === 'RIGHT') { this._draft = (this._draft | 0) + stepL;  return; }
      if (fn === 'LEFT')  { this._draft = (this._draft | 0) - stepL;  return; }
      return;
    }
    if (t === 'float') {
      const v = Number(this._draft) || 0;
      const stepS = this._field.stepSmall || 1;
      const stepL = this._field.stepLarge || 0.1;
      if (fn === 'UP')    { this._draft = round2(v + stepS); return; }
      if (fn === 'DOWN')  { this._draft = round2(v - stepS); return; }
      if (fn === 'RIGHT') { this._draft = round2(v + stepL); return; }
      if (fn === 'LEFT')  { this._draft = round2(v - stepL); return; }
      return;
    }
    if (t === 'string') {
      if (fn === 'OK') {
        const pending = this.mie.getPendingView?.()?.str ?? '';
        if (pending.length > 0) {
          this.mie.processKeyTap({ key, tapCount });
          return;
        }
        // 驗證失敗時 OK 不離開(規格)
        if (this._field.validate && !this._field.validate(this._draft)) return;
        if (this._field.maxLength && byteLength(this._draft) > this._field.maxLength) return;
        this._commit();
        return;
      }
      this.mie.processKeyTap({ key, tapCount });
    }
  }

  handleKeyDown({ key }) {
    this._lastUserKeyFn = key.fn;
    if (this._field?.type === 'string') {
      this.mie.processKeyDown({ key });
    }
  }

  _commit() {
    if (!this._field) { this.goBack(); return; }
    // 危險項:OK 不直接套用,改顯示 [取消][確認變更] 按鈕區
    // (規格 50-templates §危險項二次確認:預設焦點在「確認變更」)
    if (this._field.isDangerous && this._confirmFocus === null) {
      this._confirmFocus = 1;
      return;
    }
    this._field.value = this._draft;
    if (typeof this._saveFn === 'function') this._saveFn();
    this.goBack();
  }
}

// ── helpers ───────────────────────────────────────────────────
function round2(x) { return Math.round(x * 100) / 100; }

function formatVal(v, isInt) {
  if (typeof v !== 'number') return String(v);
  return isInt ? String(v | 0) : Number(v).toFixed(2);
}

/** UTF-8 byte length(注:字串型欄位 maxLength 規格指 byte 數)。 */
function byteLength(s) {
  if (!s) return 0;
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(s).length;
  // 粗估 fallback:全形 3 byte / 半形 1 byte
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) > 0x7F ? 3 : 1);
  return n;
}

/** Word wrap by pixel width(CJK 任意切、半形不切)。 */
function wrapByWidth(r, text, font, maxW) {
  const ctx = r.ctx;
  const prev = ctx.font;
  ctx.font = font;
  const lines = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  ctx.font = prev;
  return lines;
}
