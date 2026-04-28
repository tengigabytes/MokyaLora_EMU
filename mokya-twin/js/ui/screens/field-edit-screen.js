/**
 * FieldEditScreen — type-aware editor for one settings field.
 *
 * The screen is shared (one instance, mutated by setField() before each
 * navigation). Editing happens against a `_draft` buffer; the underlying
 * field is only updated on OK confirm.
 *
 * Per-type controls:
 *   bool:   ▲▼◀▶  toggle 開/關     OK save · BACK cancel
 *   enum:   ▲▼     scroll options   OK save · BACK cancel
 *   int:    ▲ +1   ▼ −1   ◀ −10   ▶ +10   OK save · BACK cancel
 *   float:  ▲ +1   ▼ −1   ◀ −0.1  ▶ +0.1  OK save · BACK cancel
 *   string: live MIE composition; commit text appends to draft;
 *           DEL pops a codepoint; OK save · BACK cancel
 */

import { BaseScreen } from '../screen-manager.js';

export class FieldEditScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._field    = null;
    this._draft    = null;
    this._enumIdx  = 0;
    // String-mode MIE handlers (bound once, attached per onEnter).
    this._onCommit = (e) => {
      if (this._field?.type !== 'string') return;
      this._draft = (this._draft ?? '') + (e.detail.text ?? '');
    };
    this._onDelete = () => {
      if (this._field?.type !== 'string') return;
      this._draft = Array.from(this._draft ?? '').slice(0, -1).join('');
    };
  }

  /**
   * Caller (SettingsListScreen) sets the field + a save callback before
   * navigating in. The save callback is invoked on commit so the right
   * persistence store (mesh-config / system-settings) gets written to.
   */
  setField(field, saveFn = null) {
    this._field   = field;
    this._draft   = field.value;
    this._saveFn  = saveFn;
    if (field.type === 'enum') {
      const idx = field.options.indexOf(field.value);
      this._enumIdx = idx >= 0 ? idx : 0;
    }
  }

  onEnter(from) {
    super.onEnter(from);
    if (this._field?.type === 'string') {
      // Drop any leftover composition from the previous user of MIE
      // (e.g. chat-screen) so this edit starts on a clean slate.
      this.mie.reset?.();
      this.mie.addEventListener('composition:commit', this._onCommit);
      this.mie.addEventListener('action:delete',      this._onDelete);
      // Reset firmware sentence-start state so the first char isn't
      // auto-prefixed with a space (SmartEn convention).
      this.mie.setTextContext?.('');
    }
  }

  onLeave(to) {
    if (this._field?.type === 'string') {
      this.mie.removeEventListener('composition:commit', this._onCommit);
      this.mie.removeEventListener('action:delete',      this._onDelete);
      // Cancel any half-typed phoneme so the next chat session starts clean.
      this.mie.reset?.();
    }
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
      mode:    this._field?.type === 'string' ? (this.mie.currentMode || '注') : 'Op',
    });

    const fld = this._field;
    if (!fld) {
      r.drawLabel(r.W / 2, 120, '(無欄位)', { font: r.F.ZH_MD, color: r.C.TEXT_DIM, align: 'center' });
      return;
    }

    // Title (label + dot-key hint)
    r.drawLabel(r.W / 2, 28, fld.label, {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });
    r.drawLabel(r.W / 2, 44, fld.key, {
      font: r.F.XS, color: r.C.TEXT_DIM, align: 'center',
    });

    switch (fld.type) {
      case 'bool':   this._renderBool(r);   break;
      case 'enum':   this._renderEnum(r);   break;
      case 'int':
      case 'float':  this._renderNumber(r); break;
      case 'string': this._renderString(r); break;
      default:
        r.drawLabel(r.W / 2, 120, String(this._draft), {
          font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
        });
    }

    r.drawLabel(r.W / 2, 235, this._hint(fld.type), {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  // ── Per-type renderers ──────────────────────────────────────
  _renderBool(r) {
    const opts = [
      { v: true,  label: '開' },
      { v: false, label: '關' },
    ];
    const cellW = 120, cellH = 60, gap = 12;
    const totalW = cellW * 2 + gap;
    const x0 = (r.W - totalW) / 2;
    const y0 = 90;
    for (let i = 0; i < 2; i++) {
      const sel = (this._draft === opts[i].v);
      const x = x0 + i * (cellW + gap);
      r.drawCard(x, y0, cellW, cellH, {
        radius: 8,
        bg:     sel ? r.C.GREEN_MUTED : r.C.SURFACE,
        border: sel ? r.C.GREEN       : r.C.BORDER,
      });
      r.drawLabel(x + cellW / 2, y0 + cellH / 2 + 6, opts[i].label, {
        font: r.F.ZH_LG, color: sel ? r.C.GREEN : r.C.TEXT, align: 'center',
      });
    }
  }

  _renderEnum(r) {
    const opts = this._field.options;
    const VISIBLE = 6;
    const ROW_H = 22;
    const sel = this._enumIdx;
    let top = sel - ((VISIBLE / 2) | 0);
    if (top < 0) top = 0;
    if (top > opts.length - VISIBLE) top = Math.max(0, opts.length - VISIBLE);
    const y0 = 64;
    const rows = Math.min(VISIBLE, opts.length - top);
    for (let i = 0; i < rows; i++) {
      const idx  = top + i;
      const v    = opts[idx];
      const isSel = (idx === sel);
      const y    = y0 + i * ROW_H;
      r.ctx.fillStyle = isSel ? r.C.GREEN_MUTED : '#161618';
      r.ctx.fillRect(20, y, r.W - 40, ROW_H - 2);
      r.drawLabel(r.W / 2, y + 16, v, {
        font: r.F.ZH_MD, color: isSel ? r.C.GREEN : r.C.TEXT, align: 'center',
      });
    }
    if (opts.length > VISIBLE) {
      r.drawLabel(r.W / 2, y0 + VISIBLE * ROW_H + 6, `${sel + 1}/${opts.length}`, {
        font: r.F.XS, color: r.C.TEXT_DIM, align: 'center',
      });
    }
  }

  _renderNumber(r) {
    const txt = this._field.type === 'int' ? String(this._draft | 0) : String(Number(this._draft).toFixed(2));
    const unit = this._field.unit ?? '';

    // Big value box
    r.drawCard(30, 90, r.W - 60, 60, { radius: 8, bg: r.C.SURFACE, border: r.C.GREEN });
    r.drawLabel(r.W / 2, 130, txt + (unit ? ' ' + unit : ''), {
      font: r.F.ZH_LG, color: r.C.GREEN, align: 'center',
    });

    // Step hint
    const step = this._field.type === 'int' ? '◀ −10  ▼ −1  ▲ +1  ▶ +10' : '◀ −0.1  ▼ −1  ▲ +1  ▶ +0.1';
    r.drawLabel(r.W / 2, 170, step, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  _renderString(r) {
    // Draft buffer in a card; live MIE composition rendered via the
    // shared composition bar at the bottom (chat-screen style).
    r.drawCard(20, 64, r.W - 40, 50, { radius: 6, bg: r.C.SURFACE, border: r.C.GREEN });
    const display = (this._draft === '' ? '(空)' : this._draft);
    const color   = (this._draft === '' ? r.C.TEXT_DIM : r.C.TEXT);
    r.drawLabel(r.W / 2, 94, display, {
      font: r.F.ZH_MD, color, align: 'center', maxWidth: r.W - 60,
    });
    r.drawLabel(r.W / 2, 130, '輸入字元 → 自動加入 · DEL 退一字', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });

    // ── MIE composition bar (mirrors chat-screen) ───────────────
    const pending  = (this.mie.getPendingView?.() ?? { str: '', matchedPrefixBytes: 0, style: 0 });
    const allCands = (this.mie.getAllCandidates?.() ?? []);
    const selAbs   = (this.mie.getSelectedAbs?.() ?? 0);
    const picker   = (this.mie.getPicker?.() ?? { active: false, cells: [], cols: 0, selected: 0 });
    r.drawCompositionBar({
      committedLeft:  '',
      committedRight: '',
      pending,
      allCandidates:  allCands,
      candidates:     allCands,
      selectedAbs:    selAbs,
      selIdx:         this.mie.getPageSel?.() ?? 0,
      mode:           this.mie.currentMode || '',
      picker,
      cursorBlink:    ((performance.now() / 500) | 0) % 2 === 0,
    });
  }

  // ── Key handling ────────────────────────────────────────────
  handleKeyTap({ key, tapCount }) {
    const fn = key.fn;
    if (!this._field) { if (fn === 'BACK') this.goBack(); return; }
    const t = this._field.type;

    // Universal save / cancel
    if (fn === 'BACK') {
      if (t === 'string') {
        // BACK in string mode is ambiguous: short-press cancels edit.
        // A pending MIE composition is reset by onLeave().
      }
      this.goBack();
      return;
    }
    if (fn === 'OK' && t !== 'string') {
      this._commit();
      return;
    }

    // Per-type key handling
    if (t === 'bool') {
      if (fn === 'UP' || fn === 'DOWN' || fn === 'LEFT' || fn === 'RIGHT') {
        this._draft = !this._draft;
      }
      return;
    }
    if (t === 'enum') {
      const N = this._field.options.length;
      if (fn === 'UP')   { this._enumIdx = (this._enumIdx - 1 + N) % N; this._draft = this._field.options[this._enumIdx]; return; }
      if (fn === 'DOWN') { this._enumIdx = (this._enumIdx + 1) % N;     this._draft = this._field.options[this._enumIdx]; return; }
      return;
    }
    if (t === 'int') {
      if (fn === 'UP')    { this._draft = (this._draft | 0) + 1;  return; }
      if (fn === 'DOWN')  { this._draft = (this._draft | 0) - 1;  return; }
      if (fn === 'RIGHT') { this._draft = (this._draft | 0) + 10; return; }
      if (fn === 'LEFT')  { this._draft = (this._draft | 0) - 10; return; }
      return;
    }
    if (t === 'float') {
      const v = Number(this._draft) || 0;
      if (fn === 'UP')    { this._draft = round2(v + 1);   return; }
      if (fn === 'DOWN')  { this._draft = round2(v - 1);   return; }
      if (fn === 'RIGHT') { this._draft = round2(v + 0.1); return; }
      if (fn === 'LEFT')  { this._draft = round2(v - 0.1); return; }
      return;
    }
    if (t === 'string') {
      // OK in string mode: if a composition is pending, let MIE commit it
      // first (don't exit yet); otherwise commit + exit.
      if (fn === 'OK') {
        const pending = this.mie.getPendingView?.()?.str ?? '';
        if (pending.length > 0) {
          this.mie.processKeyTap({ key, tapCount });
          return;
        }
        this._commit();
        return;
      }
      // Forward all other keys to MIE for composition.
      this.mie.processKeyTap({ key, tapCount });
    }
  }

  handleKeyDown({ key }) {
    if (this._field?.type === 'string') {
      this.mie.processKeyDown({ key });
    }
  }

  _commit() {
    if (this._field) {
      this._field.value = this._draft;
      if (typeof this._saveFn === 'function') this._saveFn();
    }
    this.goBack();
  }

  _hint(type) {
    switch (type) {
      case 'bool':   return '◀▶▲▼ 切換 · OK 儲存 · BACK 取消';
      case 'enum':   return '▲▼ 選擇 · OK 儲存 · BACK 取消';
      case 'int':
      case 'float':  return 'OK 儲存 · BACK 取消';
      case 'string': return '輸入文字 · OK 儲存 · BACK 取消';
      default:       return 'OK 儲存 · BACK 取消';
    }
  }
}

function round2(x) { return Math.round(x * 100) / 100; }
