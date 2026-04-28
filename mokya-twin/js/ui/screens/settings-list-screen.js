/**
 * SettingsListScreen — generic field-list renderer for one config group.
 *
 * Used for every leaf in the mesh-config tree (device/lora/position/...,
 * each module config, individual channel slot). The screen is parametric:
 * pass `{ title, fields }` and it renders a scrollable list of
 * `label: value` rows, one row per field.
 *
 * Editing is not yet implemented — OK on a row briefly highlights the row
 * and shows a "編輯中…" toast at the bottom. Real editors per type
 * (bool toggle, enum picker, int/float input, string input via IME) are
 * a follow-up.
 *
 * Keys:
 *   UP/DOWN — move selection (auto-scroll keeps selection visible)
 *   OK      — placeholder edit hint
 *   BACK    — goBack()
 */

import { BaseScreen } from '../screen-manager.js';

const ROW_H        = 22;
const VISIBLE_ROWS = 8;          // tuned for content area y=44..220
const LIST_TOP_Y   = 44;

export class SettingsListScreen extends BaseScreen {
  constructor(renderer, mie, serial, opts = {}) {
    super(renderer, mie, serial);
    this._title  = opts.title  ?? '設定';
    this._fields = opts.fields ?? [];
    this._sel    = 0;
    this._top    = 0;
    this._fieldEdit  = null;    // shared FieldEditScreen instance
    this._saveFn     = null;    // tree-specific persistence callback
    this._editTarget = 'field-edit';
  }

  /** Inject the shared edit screen + tree-specific save fn. */
  setEditScreen(fieldEditScreen, saveFn = null, editTarget = 'field-edit') {
    this._fieldEdit  = fieldEditScreen;
    this._saveFn     = saveFn;
    this._editTarget = editTarget;
  }

  /** Refresh the data on entry — useful when a parent screen swapped fields. */
  setData(title, fields) {
    this._title  = title;
    this._fields = fields;
    this._sel = Math.min(this._sel, Math.max(0, fields.length - 1));
    this._top = 0;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
      rssi:    -82,
    });

    r.drawLabel(r.W / 2, 32, this._title, {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });
    if (this._fields.length > 0) {
      r.drawLabel(r.W - 6, 32, `${this._sel + 1}/${this._fields.length}`, {
        font: r.F.XS, color: r.C.TEXT_DIM, align: 'right',
      });
    }

    const fields = this._fields;
    const top    = this._top;
    const rows   = Math.min(VISIBLE_ROWS, fields.length - top);

    for (let i = 0; i < rows; i++) {
      const idx = top + i;
      const fld = fields[idx];
      const y   = LIST_TOP_Y + i * ROW_H;
      const isSel = (idx === this._sel);

      // Row background
      r.ctx.fillStyle = isSel ? r.C.GREEN_MUTED : '#161618';
      r.ctx.fillRect(4, y, r.W - 8, ROW_H - 2);

      // Label (left)
      r.drawLabel(8, y + 16, fld.label, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : r.C.TEXT,
      });

      // Value (right) — colour-coded by type
      const valueText = formatValue(fld);
      const valueColor = colorForValue(fld, r.C);
      r.drawLabel(r.W - 8, y + 16, valueText, {
        font: r.F.ZH_SM, color: isSel ? r.C.GREEN : valueColor, align: 'right',
      });
    }

    // Right-edge scroll thumb
    if (fields.length > VISIBLE_ROWS) {
      const trackH = VISIBLE_ROWS * ROW_H;
      const trackX = r.W - 2;
      r.ctx.fillStyle = r.C.SURFACE2;
      r.ctx.fillRect(trackX, LIST_TOP_Y, 2, trackH);
      const thumbH = Math.max(8, ((VISIBLE_ROWS / fields.length) * trackH) | 0);
      const thumbY = LIST_TOP_Y +
        (((this._top / Math.max(1, fields.length - VISIBLE_ROWS)) * (trackH - thumbH)) | 0);
      r.ctx.fillStyle = r.C.GREEN;
      r.ctx.fillRect(trackX, thumbY, 2, thumbH);
    }

    r.drawLabel(r.W / 2, 235, 'OK 編輯 · BACK 返回', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
    });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const N  = this._fields.length;
    if (N === 0) {
      if (fn === 'BACK') this.goBack();
      return;
    }
    if (fn === 'UP')   { this._sel = (this._sel - 1 + N) % N; this._ensureVisible(); return; }
    if (fn === 'DOWN') { this._sel = (this._sel + 1) % N;     this._ensureVisible(); return; }
    if (fn === 'OK') {
      if (this._fieldEdit) {
        this._fieldEdit.setField(this._fields[this._sel], this._saveFn);
        this.goto(this._editTarget, 'slide_l');
      }
      return;
    }
    if (fn === 'BACK') { this.goBack(); return; }
  }

  _ensureVisible() {
    if (this._sel < this._top)                     this._top = this._sel;
    else if (this._sel >= this._top + VISIBLE_ROWS) this._top = this._sel - VISIBLE_ROWS + 1;
    if (this._top < 0) this._top = 0;
    if (this._top > this._fields.length - VISIBLE_ROWS)
      this._top = Math.max(0, this._fields.length - VISIBLE_ROWS);
  }
}

function formatValue(fld) {
  let v;
  switch (fld.type) {
    case 'bool':   v = fld.value ? '✓ 開' : '— 關'; break;
    case 'enum':   v = String(fld.value); break;
    case 'int':
    case 'float':  v = String(fld.value); if (fld.unit) v += ' ' + fld.unit; break;
    case 'string': v = fld.value === '' ? '(空)' : String(fld.value); break;
    default:       v = String(fld.value);
  }
  // Truncate very long values
  if (v.length > 18) v = v.slice(0, 17) + '…';
  return v;
}

function colorForValue(fld, C) {
  if (fld.type === 'bool') return fld.value ? C.GREEN : C.TEXT_DIM;
  return C.TEXT;
}
