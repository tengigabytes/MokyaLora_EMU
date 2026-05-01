/**
 * SysDiagScreen — 系統診斷(對齊 firmware sys_diag_view.c,3 pages)
 *
 * Title: "[系統診斷] ◀ N/3 name ▶"
 * Pages cycled by LEFT/RIGHT.
 *
 *   1. 資源     — heap / SRAM / PSRAM / flash / LFS / MSP / uptime
 *   2. CPU+任務 — Core1 idle%、Core0 狀態、top 8 task by stack high-water
 *   3. 螢幕     — FPS overlay + UP 進入 R/G/B/W/K 像素測試,LEFT/RIGHT 切色,DOWN 退出
 *
 * Keys: LEFT/RIGHT 翻頁 · UP/DOWN 子模式 · BACK 回 launcher
 */

import { BaseScreen } from '../screen-manager.js';
import { defaultStatusOpts } from './_chrome.js';

const PAGES = ['資源', 'CPU+任務', '螢幕'];
const PIX_NAMES  = ['RED', 'GREEN', 'BLUE', 'WHITE', 'BLACK'];
const PIX_COLORS = ['#F85149', '#39D353', '#64D2FF', '#FFFFFF', '#000000'];

export class SysDiagScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._page = 0;
    this._pixtest = false;
    this._pixIdx  = 0;
    this._fps = 30.0;
    this._lastFpsAt = 0;
    this._fpsCount = 0;
  }

  onEnter(from) {
    super.onEnter(from);
    this._pixtest = false;
  }

  render(now) {
    const r = this.r;

    if (this._pixtest) {
      this._renderPixtest();
      return;
    }

    // Track an actual FPS for the screen page
    if (this._lastFpsAt === 0) this._lastFpsAt = now;
    this._fpsCount++;
    if (now - this._lastFpsAt >= 1000) {
      this._fps = this._fpsCount * 1000 / (now - this._lastFpsAt);
      this._fpsCount = 0;
      this._lastFpsAt = now;
    }

    r.clear();
    r.drawStatusBar(defaultStatusOpts(this.serial));

    const title = `[系統診斷] ◀ ${this._page + 1}/${PAGES.length} ${PAGES[this._page]} ▶`;
    r.drawLabel(4, 30, title, { font: r.F.ZH_SM, color: r.C.TEXT_DIM });

    if (this._page === 0)      this._renderResources();
    else if (this._page === 1) this._renderCpu();
    else                       this._renderScreen();

    r.drawHintBar([
      { key: '◀▶', label: '翻頁' },
      { key: 'BACK', label: '返回' },
    ]);
  }

  _renderResources() {
    const r = this.r;
    const lines = [
      'heap   : 53 KB / 56 KB used (free 12.3 KB)',
      'SRAM   : 412 KB / 520 KB BSS+stack',
      'PSRAM  : 142 KB / 8 MB used',
      'flash  : 1.84 MB / 16 MB used',
      'LFS    : 2.1 KB / 1 MB used (DM/wpt/hist)',
      'MSP    : 4.1 KB free (guard >= 2 KB)',
      'uptime : 0d 02:14:37',
    ];
    for (let i = 0; i < lines.length; i++) {
      r.drawLabel(4, 56 + i * 20, lines[i], {
        font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
      });
    }
  }

  _renderCpu() {
    const r = this.r;
    r.drawLabel(4, 56, 'Core1 idle: 78%   busy: 22%   avg10: 24%', {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.GREEN,
    });
    r.drawLabel(4, 76, 'Core0     : OK   ipc_rx=1247 ipc_tx=312', {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 100, 'Task              prio  hwm', {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    const tasks = [
      ['lvgl_task',         3,  1280],
      ['key_task',          4,   720],
      ['gps_task',          3,  2048],
      ['ipc_task',          5,   864],
      ['mie_task',          3,  1536],
      ['idle',              0,   192],
      ['Tmr Svc',           3,   480],
      ['IDLE',              0,   192],
    ];
    for (let i = 0; i < tasks.length; i++) {
      const [name, prio, hwm] = tasks[i];
      const line = `${name.padEnd(16)} ${String(prio).padStart(2)}    ${String(hwm).padStart(4)}`;
      r.drawLabel(4, 118 + i * 14, line, {
        font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
      });
    }
    r.drawLabel(4, 234, `tasks: 8`, { font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT_DIM });
  }

  _renderScreen() {
    const r = this.r;
    r.drawLabel(4, 56,  `FPS    : ${this._fps.toFixed(1)}`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.GREEN,
    });
    r.drawLabel(4, 80,  `pixclk : 240×320 16-bit (LVGL v9)`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 104, `frame  : 320×240 px @ 60 Hz target`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 128, `flush  : RGB565 partial DMA`, {
      font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(4, 168, '↑ 進入像素測試 (R/G/B/W/K)', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  _renderPixtest() {
    const r = this.r;
    const ctx = r.ctx;
    ctx.fillStyle = PIX_COLORS[this._pixIdx];
    ctx.fillRect(0, 0, r.W, r.H);
    const isLight = (this._pixIdx === 3);
    r.drawLabel(r.W / 2, r.H / 2 + 5, PIX_NAMES[this._pixIdx], {
      font: r.F.ZH_LG ?? r.F.ZH_MD,
      color: isLight ? '#000000' : '#FFFFFF',
      align: 'center',
    });
    r.drawLabel(r.W / 2, r.H - 12, '◀▶ 切色 · ↓ 退出',
      { font: r.F.ZH_SM, color: isLight ? '#444' : '#bbb', align: 'center' });
  }

  handleKeyTap({ key }) {
    const fn = key.fn;

    if (this._pixtest) {
      if (fn === 'LEFT')  { this._pixIdx = (this._pixIdx - 1 + PIX_NAMES.length) % PIX_NAMES.length; return; }
      if (fn === 'RIGHT') { this._pixIdx = (this._pixIdx + 1) % PIX_NAMES.length; return; }
      if (fn === 'DOWN' || fn === 'BACK' || fn === 'FUNC') {
        this._pixtest = false; return;
      }
      return;
    }

    if (fn === 'LEFT')  { this._page = (this._page - 1 + PAGES.length) % PAGES.length; return; }
    if (fn === 'RIGHT') { this._page = (this._page + 1) % PAGES.length; return; }
    if (fn === 'UP' && this._page === 2) { this._pixtest = true; return; }
    if (fn === 'BACK' || fn === 'FUNC') { this.goBack(); return; }
  }
}
