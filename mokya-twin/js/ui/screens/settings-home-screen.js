/**
 * SettingsHomeScreen — S-0 設定主頁(對齊 doc/ui/01-page-architecture.md)
 *
 * 頂端:本機身份摘要(暱稱 / 角色 / 區域 / Preset / TX 功率)。
 * 列表:常用(S-1~S-5)/ 通訊(S-6~S-8)/ 進階(S-9~S-15,預設折疊)
 * 三段分組,焦點 ▲▼ 移動,◀▶ 折疊/展開區段標題,OK 進入二級頁。
 *
 * Keys:
 *   ▲▼     焦點移動(跨區段)
 *   ◀▶     在區段標題上時折疊/展開
 *   OK     葉節點 → 進入該二級頁;區段標題 → toggle 折疊
 *   BACK   返回 L-1 九宮格
 */

import { BaseScreen } from '../screen-manager.js';

const ROW_H   = 20;
const LIST_Y  = 64;
const VISIBLE = 8;

// 三大分組 — 對齊 01-page-architecture.md §S 區
const GROUPS = [
  {
    key: 'common', label: '常用', defaultOpen: true,
    items: [
      { id: 's1', label: '無線電',   target: 'mesh-config'  /* S-1 */ },
      { id: 's2', label: '裝置',     target: 'mesh-config'  /* S-2 — TODO 拆分 */ },
      { id: 's3', label: '位置',     target: 'mesh-config'  /* S-3 */ },
      { id: 's4', label: '顯示',     target: 'system-settings-list' /* S-4 */ },
      { id: 's5', label: '電源',     target: 'system-settings-list' /* S-5 */ },
    ],
  },
  {
    key: 'comm', label: '通訊', defaultOpen: true,
    items: [
      { id: 's6', label: '加密與金鑰', target: 'mesh-config'    /* S-6 */ },
      { id: 's7', label: '模組',       target: 'mesh-modules'   /* S-7 */ },
      { id: 's8', label: '遠端管理',   target: 'mesh-config'    /* S-8 placeholder */ },
    ],
  },
  {
    key: 'adv', label: '進階', defaultOpen: false,
    items: [
      { id: 's9',  label: '音訊',         target: 'system-settings-list'  /* S-9 */ },
      { id: 's10', label: '網路',         target: 'system-settings-list'  /* S-10 */ },
      { id: 's11', label: '藍牙',         target: 'system-settings-list'  /* S-11 */ },
      { id: 's12', label: '匯入匯出',     target: 'system-settings-list'  /* S-12 */ },
      { id: 's13', label: '開發者選項',   target: 'system-settings-list'  /* S-13 */ },
      { id: 's14', label: '危險區',       target: 'system-settings-list'  /* S-14 */ },
      { id: 's15', label: '版本資訊',     target: 'system-settings-list'  /* S-15 */ },
    ],
  },
];

export class SettingsHomeScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._sel  = 0;
    this._top  = 0;
    this._open = new Map();
    for (const g of GROUPS) this._open.set(g.key, g.defaultOpen);
  }

  /** 攤平的當前可見列(區段標題 + 展開的葉節點)。 */
  _flatten() {
    const out = [];
    for (const g of GROUPS) {
      out.push({ kind: 'header', group: g });
      if (this._open.get(g.key)) {
        for (const it of g.items) out.push({ kind: 'leaf', item: it });
      }
    }
    return out;
  }

  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75,
    });

    // 標題
    r.drawLabel(r.W / 2, 28, '設定', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });

    // 身份摘要(對齊規格 §S-0 頂端顯示)
    this._drawIdentitySummary(r, 38);
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(0, 60, r.W, 1);

    // 列表
    const flat = this._flatten();
    const rows = Math.min(VISIBLE, flat.length - this._top);
    for (let i = 0; i < rows; i++) {
      const idx = this._top + i;
      const y   = LIST_Y + i * ROW_H;
      const row = flat[idx];
      const isFocused = (idx === this._sel);
      if (row.kind === 'header') this._drawHeader(r, y, row.group, isFocused);
      else                       this._drawLeaf(r, y, row.item, isFocused);
    }
  }

  _drawIdentitySummary(r, y) {
    // 後續接 mesh-config 真實值;目前 placeholder
    r.drawLabel(4,  y, '洛克', { font: r.F.ZH_SM, color: r.C.TEXT });
    r.drawLabel(56, y, 'CLIENT', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
    r.drawLabel(116, y, 'TW · LongFast', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
    r.drawLabel(r.W - 4, y, 'TX 22dBm', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
    });
  }

  _drawHeader(r, y, group, isFocused) {
    const ctx = r.ctx;
    if (isFocused) {
      ctx.fillStyle = r.C.FOCUS_BG;
      ctx.fillRect(0, y, r.W, ROW_H);
    }
    const isOpen = this._open.get(group.key);
    const arrow  = isOpen ? '▼' : '▶';
    ctx.font          = r.F.ZH_SM;
    ctx.textBaseline  = 'alphabetic';
    ctx.textAlign     = 'left';
    ctx.fillStyle = isFocused ? r.C.FOCUS : r.C.TEXT_DIM;
    ctx.fillText(arrow + ' ' + group.label, 4, y + 14);
  }

  _drawLeaf(r, y, item, isFocused) {
    const ctx = r.ctx;
    if (isFocused) {
      ctx.fillStyle = r.C.FOCUS_BG;
      ctx.fillRect(0, y, r.W, ROW_H);
    }
    ctx.font          = r.F.ZH_SM;
    ctx.textBaseline  = 'alphabetic';
    ctx.textAlign     = 'left';
    let x = 16;
    if (isFocused) {
      ctx.fillStyle = r.C.FOCUS;
      ctx.fillText('▶', x, y + 14);
    }
    x += 14;
    ctx.fillStyle = isFocused ? r.C.FOCUS : r.C.TEXT;
    ctx.fillText(item.label, x, y + 14);
  }

  handleKeyTap({ key }) {
    const fn = key.fn;
    const flat = this._flatten();
    const N = flat.length;
    if (fn === 'UP')   { this._sel = (this._sel - 1 + N) % N; this._ensureVisible(N); return; }
    if (fn === 'DOWN') { this._sel = (this._sel + 1) % N;     this._ensureVisible(N); return; }
    const cur = flat[this._sel];
    if (fn === 'LEFT' || fn === 'RIGHT') {
      if (cur.kind === 'header') {
        this._open.set(cur.group.key, fn === 'RIGHT');
      }
      return;
    }
    if (fn === 'OK') {
      if (cur.kind === 'header') {
        this._open.set(cur.group.key, !this._open.get(cur.group.key));
      } else {
        this.goto(cur.item.target, 'slide_l');
      }
      return;
    }
    if (fn === 'BACK') { this.goBack(); return; }
  }

  _ensureVisible(total) {
    if (this._sel < this._top)                  this._top = this._sel;
    else if (this._sel >= this._top + VISIBLE)  this._top = this._sel - VISIBLE + 1;
    if (this._top < 0) this._top = 0;
    if (this._top > total - VISIBLE) this._top = Math.max(0, total - VISIBLE);
  }
}
