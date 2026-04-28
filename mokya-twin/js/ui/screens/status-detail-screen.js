/**
 * StatusDetailScreen — FUNC 長按 ≥2s 全域詳情面板。
 *
 * 對齊 doc/ui/10-status-bar.md §FUNC 長按詳情面板。
 *
 * 行為:
 *   - 任何按鍵(BACK / FUNC / OK / 其他)關閉面板,回上一頁
 *   - 內容每秒重繪
 *   - 警告區段優先在頂端
 *   - 滾動式(若內容超過螢幕高;PR5 簡化:不滾動,顯示能塞下的部分)
 */

import { BaseScreen } from '../screen-manager.js';

export class StatusDetailScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._scrollY = 0;
  }

  render(now) {
    const r = this.r;
    r.clear();

    // 標題列
    r.drawLabel(r.W / 2, 12, '系統狀態', {
      font: r.F.ZH_MD, color: r.C.TEXT, align: 'center',
    });
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(0, 22, r.W, 1);

    // 內容(對齊規格 §FUNC 長按詳情面板的 7 個區段)
    const sections = this._buildSections(now);
    let y = 28 - this._scrollY;
    const C = r.C;
    for (const sec of sections) {
      // 區段標題:橙色
      r.drawLabel(4, y, sec.icon + ' ' + sec.title, {
        font: r.F.ZH_SM, color: sec.warn ? C.WARNING : C.FOCUS,
      });
      y += 16;
      for (const line of sec.lines) {
        if (y > 16 && y < r.H - 16) {
          r.drawLabel(16, y, line, {
            font: r.F.ZH_SM, color: C.TEXT_DIM,
          });
        }
        y += 14;
      }
      y += 4;  // 區段間距
    }

    // 底部提示
    r.ctx.fillStyle = C.BORDER;
    r.ctx.fillRect(0, r.H - 16, r.W, 1);
    r.drawLabel(r.W / 2, r.H - 4, '↑↓ 滾動  任意鍵 關閉', {
      font: r.F.ZH_SM, color: C.TEXT_DIM, align: 'center',
    });
  }

  _buildSections(now) {
    const out = [];
    const time = new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    out.push({
      icon: '🕐', title: time + ' GMT+8',
      lines: ['上次 GPS 同步 — (尚未實作)'],
    });
    out.push({
      icon: '📡', title: 'TX / RX',
      lines: ['最近發送 — / 最近接收 —'],
    });
    out.push({
      icon: '📻', title: 'LongFast',
      lines: ['906.875 MHz / SF11', 'BW 250 kHz / CR 4/5'],
    });
    out.push({
      icon: '🌐', title: '鄰居 — / 已知 —',
      lines: ['Hop 平均 —'],
    });
    out.push({
      icon: '📍', title: 'GPS 模組停用',
      lines: ['(未接 GNSS)'],
    });
    out.push({
      icon: '✉', title: '未讀 0',
      lines: [],
    });
    out.push({
      icon: '🔋', title: this._batteryLine(now),
      lines: ['剩餘 ~—'],
    });
    out.push({
      icon: '💼', title: 'IDLE',
      lines: ['運行 — / 韌體 mokya-twin emu'],
    });

    // 警告區段(若有)— 規格要求優先在頂端
    // PR5 範例:無實際警告系統,留空陣列。實際串接由後續 PR 完成。
    return out;
  }

  _batteryLine(now) {
    const bat = 70 + ((Math.sin(now / 60000) * 10) | 0);
    return `${bat}%  4.02V`;
  }

  handleKeyTap({ key }) {
    // 任何按鍵關閉(規格)
    if (key.fn === 'UP')   { this._scrollY = Math.max(0, this._scrollY - 20); return; }
    if (key.fn === 'DOWN') { this._scrollY = this._scrollY + 20; return; }
    this.goBack();
  }

  handleKeyHold() {
    // 長按也關閉(避免再觸發 FUNC 長按進來自己)
    this.goBack();
  }
}
