/**
 * SettingsScreen — Device status + configuration panel
 *
 * Layout (240 × 320):
 *   [0–17]    Status bar
 *   [18–20]   Section header
 *   [21–297]  Settings list (scrollable)
 *   [298–319] Tab bar
 *
 * Sections:
 *   LoRa Radio    — frequency, bandwidth, SF, TX power, RSSI
 *   RP2350 System — dual-core usage, heap, uptime, firmware
 *   Display       — brightness slider
 *   About         — firmware version, build date, node ID
 */

import { BaseScreen } from '../screen-manager.js';
import { SerialState } from '../../serial/meshtastic-serial.js';

export class SettingsScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    // Simulated RP2350 system stats (updated each render)
    this._core0 = 0.12;
    this._core1 = 0.45;
    this._heap  = { used: 186000, total: 512000 };
    this._uptime   = 0;
    this._startTime = Date.now();
    this._brightness = 200; // 0–255 (mirrors RP2350 PWM)
    this._selectedRow = 0;
    this._scrollY     = 0;
    this._loraFreq    = 923.125; // MHz (Taiwan band plan)
    this._loraBW      = 250;     // kHz
    this._loraSF      = 11;
    this._loraTXPow   = 22;      // dBm
  }

  onEnter(from) {
    super.onEnter(from);
    this._startTime = Date.now() - (this._uptime * 1000);
    // Animate core usage
    this._coreTimer = setInterval(() => {
      this._core0 = 0.05 + Math.random() * 0.2;
      this._core1 = 0.35 + Math.random() * 0.35;
    }, 800);
  }

  onLeave(toScreen) {
    if (this._coreTimer) {
      clearInterval(this._coreTimer);
      this._coreTimer = null;
    }
  }

  render(now) {
    const r = this.r;
    this._uptime = Math.floor((Date.now() - this._startTime) / 1000);

    const CONTENT_TOP = 18;
    const TAB_H       = 22;
    const CONTENT_H   = r.H - CONTENT_TOP - TAB_H;

    // Background
    r.d.fillRect(0, CONTENT_TOP, r.W, CONTENT_H, r.C.BG);

    // Clip
    r.ctx.save();
    r.ctx.beginPath();
    r.ctx.rect(0, CONTENT_TOP, r.W, CONTENT_H);
    r.ctx.clip();

    let y = CONTENT_TOP + 4 - this._scrollY;

    // ── Section: LoRa Radio ──────────────────────────────────────
    y = this._drawSectionHeader(y, '📡 LoRa Radio');
    y = this._drawInfoRow(y, 'Frequency',  `${this._loraFreq} MHz`);
    y = this._drawInfoRow(y, 'Bandwidth',  `${this._loraBW} kHz`);
    y = this._drawInfoRow(y, 'Spread. Factor', `SF${this._loraSF}`);
    y = this._drawInfoRow(y, 'TX Power',   `${this._loraTXPow} dBm`);
    y = this._drawInfoRow(y, 'RSSI',       `-85 dBm`);
    y = this._drawInfoRow(y, 'SNR',        `+3.8 dB`);
    y = this._drawInfoRow(y, 'Air Rate',   '~1.6 kbps');
    y += 4;

    // ── Section: RP2350 System ───────────────────────────────────
    y = this._drawSectionHeader(y, '⚙ RP2350 System');

    // Core 0 usage bar
    y = this._drawBarRow(y, 'Core 0', this._core0, {
      color: r.C.GREEN, label: `${(this._core0*100).toFixed(0)}%`
    });
    // Core 1 usage bar
    y = this._drawBarRow(y, 'Core 1', this._core1, {
      color: r.C.INFO, label: `${(this._core1*100).toFixed(0)}%`
    });
    // Heap
    y = this._drawBarRow(y, 'Heap',
      this._heap.used / this._heap.total, {
        color: r.C.WARNING,
        label: `${(this._heap.used/1024).toFixed(0)}/${(this._heap.total/1024).toFixed(0)}K`
      }
    );
    // Uptime
    const h = Math.floor(this._uptime / 3600);
    const m = Math.floor((this._uptime % 3600) / 60);
    const s = this._uptime % 60;
    y = this._drawInfoRow(y, 'Uptime', `${h}h ${m}m ${s}s`);
    y = this._drawInfoRow(y, 'Flash', '16 MB (XIP)');
    y += 4;

    // ── Section: Display ─────────────────────────────────────────
    y = this._drawSectionHeader(y, '💡 Display');
    y = this._drawBrightnessRow(y);
    y = this._drawInfoRow(y, 'Resolution', '240 × 320');
    y = this._drawInfoRow(y, 'Type',       '2.4" IPS');
    y += 4;

    // ── Section: MIE ─────────────────────────────────────────────
    y = this._drawSectionHeader(y, '⌨ MIE Input Engine');
    y = this._drawInfoRow(y, 'Mode',      this.mie.currentMode);
    y = this._drawInfoRow(y, 'Dict',      this.mie.isDictLoaded ? '已載入' : '未載入');
    y = this._drawInfoRow(y, 'WASM',      this.mie.isWasmActive ? '啟用' : 'JS Fallback');
    y = this._drawInfoRow(y, 'Trie nodes', `${this.mie._trie?.nodeCount ?? '-'}`);
    y += 4;

    // ── Section: Connection ──────────────────────────────────────
    y = this._drawSectionHeader(y, '🔌 Connection');
    const connState = this.serial.state;
    const connColor = connState === SerialState.CONNECTED ? r.C.GREEN
                    : connState === SerialState.ERROR      ? r.C.DANGER
                    :                                        r.C.TEXT_DIM;
    y = this._drawInfoRow(y, 'USB Serial', connState, connColor);
    y = this._drawInfoRow(y, 'Baud Rate',  `${this.serial.baudRate}`);
    y = this._drawInfoRow(y, 'Node ID',    this.serial.myNodeId);
    y += 4;

    // ── Section: About ───────────────────────────────────────────
    y = this._drawSectionHeader(y, 'ℹ About');
    y = this._drawInfoRow(y, 'Firmware', 'MokyaLora v0.1.0-dev');
    y = this._drawInfoRow(y, 'Build',    '2026-03-27 · Phase 2');
    y = this._drawInfoRow(y, 'MIE',      'JS Mock · WASM Phase 4');
    y = this._drawInfoRow(y, 'LoRa MCU', 'RP2350 · Pico SDK 2.x');
    y += 8;

    r.ctx.restore();

    // Scroll indicator
    const totalH = y + this._scrollY - CONTENT_TOP;
    if (totalH > CONTENT_H) {
      const indH  = Math.max(20, CONTENT_H * CONTENT_H / totalH);
      const indY  = CONTENT_TOP + (this._scrollY / (totalH - CONTENT_H)) * (CONTENT_H - indH);
      r.ctx.fillStyle = r.C.SURFACE3;
      r.ctx.fillRect(r.W - 3, indY, 2, indH);
    }

    // ── Status bar ────────────────────────────────────────────────
    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' }),
      battery: 72,
      rssi:    -85,
      mode:    'SYS',
    });

    // ── Tab bar ───────────────────────────────────────────────────
    r.drawTabBar(['💬 聊天', '🗺 地圖', '⚙ 設定'], 2);
  }

  // ── Row builders ─────────────────────────────────────────────

  _drawSectionHeader(y, title) {
    const r = this.r;
    r.d.fillRect(0, y, r.W, 18, '#111416');
    r.drawLabel(6, y + 12, title, { font: r.F.SM, color: r.C.GREEN });
    r.d.fillRect(0, y + 17, r.W, 1, r.C.BORDER);
    return y + 18;
  }

  _drawInfoRow(y, label, value, valueColor) {
    const r = this.r;
    const ROW_H = 18;
    r.d.fillRect(0, y, r.W, ROW_H, r.C.BG);
    r.drawLabel(8, y + 11, label, { font: r.F.XS, color: r.C.TEXT_DIM });
    r.drawLabel(r.W - 6, y + 11, value, {
      font: r.F.XS, color: valueColor ?? r.C.TEXT, align: 'right'
    });
    r.d.fillRect(8, y + ROW_H - 1, r.W - 8, 1, '#1A1A1C');
    return y + ROW_H;
  }

  _drawBarRow(y, label, fraction, { color, label: barLabel } = {}) {
    const r = this.r;
    const ROW_H = 22;
    r.d.fillRect(0, y, r.W, ROW_H, r.C.BG);
    r.drawLabel(8, y + 9, label, { font: r.F.XS, color: r.C.TEXT_DIM });
    r.drawBar(70, y + 4, r.W - 100, 10, fraction, 1, {
      fgColor: color, bgColor: r.C.SURFACE2, radius: 3,
    });
    r.drawLabel(r.W - 6, y + 11, barLabel, {
      font: r.F.XS, color, align: 'right'
    });
    r.d.fillRect(8, y + ROW_H - 1, r.W - 8, 1, '#1A1A1C');
    return y + ROW_H;
  }

  _drawBrightnessRow(y) {
    const r = this.r;
    const ROW_H = 22;
    r.d.fillRect(0, y, r.W, ROW_H, r.C.BG);
    r.drawLabel(8, y + 9, '亮度', { font: r.F.XS, color: r.C.TEXT_DIM });
    r.drawBar(42, y + 4, r.W - 70, 12, this._brightness, 255, {
      fgColor: r.C.WARNING, bgColor: r.C.SURFACE2, radius: 4,
    });
    r.drawLabel(r.W - 6, y + 11, `${Math.round(this._brightness/255*100)}%`, {
      font: r.F.XS, color: r.C.WARNING, align: 'right'
    });
    r.d.fillRect(8, y + ROW_H - 1, r.W - 8, 1, '#1A1A1C');
    return y + ROW_H;
  }

  handleKeyTap({ key }) {
    if (key.fn === 'UP')   { this._scrollY = Math.max(0, this._scrollY - 20); return; }
    if (key.fn === 'DOWN') { this._scrollY += 20; return; }
    if (key.fn === 'LEFT') { this.goto('map', 'slide_r'); return; }
    if (key.fn === 'BACK') { this.goto('chat', 'slide_r'); return; }
    if (key.fn === 'VOLUP') {
      this._brightness = Math.min(255, this._brightness + 20);
      this.r.d.setBrightness(this._brightness);
    }
    if (key.fn === 'VOLDN') {
      this._brightness = Math.max(20, this._brightness - 20);
      this.r.d.setBrightness(this._brightness);
    }
  }
}
