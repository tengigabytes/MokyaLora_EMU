/**
 * HomeScreen — L-0 桌面 / Home(對齊 doc/ui/20-launcher-home.md v4)
 *
 * 三重身份:
 *   1. 狀態儀表(身份+日期 / GPS / 電源 / 環境 / 網路)— 純顯示
 *   2. 通知中樞(訊息 ×3 + 節點事件 ×1)— D-pad 焦點導航
 *   3. 快速入口(FUNC → L-1 九宮格 / OK → 進當前對話)
 *
 * 標準版面:固定 3 訊息 + 1 事件,不動態擴張。
 *
 * 鍵位(對齊規格 §互動行為):
 *   ▲▼          焦點上下(跨區流動)
 *   → / OK     進入該對話 / 該節點詳情
 *   ←          移除提醒(unread→0,不刪內容)
 *   FUNC        呼出 L-1 九宮格
 *   BACK        無作用(長按鎖屏由全域處理)
 */

import { BaseScreen } from '../screen-manager.js';

// 行高分配(spec §行高分配)
const Y_DASH_START   = 16;
const ROW_H          = 20;
const Y_SEP_1        = 117;
const Y_MSG_HDR      = 118;
const Y_MSG_LIST     = 136;
const Y_SEP_2        = 196;
const Y_EVT_HDR      = 197;
const Y_EVT_LIST     = 215;

// Mock 節點事件(以後接 NodeDB 事件流)
const MOCK_EVENTS = [
  { type: 'online', who: 'Tony',  time: '09:30' },
];

export class HomeScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    /** 焦點:0..2 = 訊息列、3..N = 事件列 */
    this._focus = 0;
    this._lastInteract = performance.now();
    /** 移除過的訊息提醒 id 集合(模擬 unread→0) */
    this._dismissedMsgIds = new Set();
    /** 移除過的事件 index */
    this._dismissedEvtIdx = new Set();
  }

  onEnter(from) {
    super.onEnter(from);
    this._focus = 0;
  }

  render(now) {
    const r = this.r;
    r.clear();

    // ── Status Bar ─────────────────────────────────────────────
    r.drawStatusBar({
      time:    timeStr(),
      battery: this._batteryPct(now),
      mesh:    this._meshCount(),
      gps:     this._gpsState(),
      unread:  this._totalUnread(),
    });

    // ── 5 行儀表 ───────────────────────────────────────────────
    this._drawIdentity(r,    Y_DASH_START + 0 * ROW_H);
    this._drawGps(r,         Y_DASH_START + 1 * ROW_H);
    this._drawPower(r, now,  Y_DASH_START + 2 * ROW_H);
    this._drawEnv(r,         Y_DASH_START + 3 * ROW_H);
    this._drawNetwork(r,     Y_DASH_START + 4 * ROW_H);

    // 分隔線
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(0, Y_SEP_1, r.W, 1);

    // ── 訊息區 ─────────────────────────────────────────────────
    const messages = this._messageList();
    const unreadN  = messages.filter(m => !m.read).length;
    this._drawSectionHeader(r, Y_MSG_HDR, '▼ 收件',
      unreadN > 0 ? `${unreadN} 未讀` : '已讀畢',
      unreadN > 0 ? r.C.GREEN : r.C.TEXT_DIM);

    for (let i = 0; i < 3; i++) {
      const y   = Y_MSG_LIST + i * ROW_H;
      const msg = messages[i];
      const isFocused = (this._focus === i);
      if (msg) {
        this._drawMessageRow(r, y, msg, isFocused);
      } else if (i === 0 && messages.length === 0) {
        r.drawLabel(r.W / 2, y + 14, '(目前沒有訊息)', {
          font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
        });
      }
    }

    // 分隔線
    r.ctx.fillStyle = r.C.BORDER;
    r.ctx.fillRect(0, Y_SEP_2, r.W, 1);

    // ── 節點事件區 ────────────────────────────────────────────
    const events = this._eventList();
    this._drawSectionHeader(r, Y_EVT_HDR, '◎ 節點事件',
      events.length > 0 ? `${events.length} 則` : '0 則',
      events.length > 0 ? r.C.TEXT : r.C.TEXT_DIM);

    if (events.length > 0) {
      const ev = events[0];
      const isFocused = (this._focus === 3);
      this._drawEventRow(r, Y_EVT_LIST, ev, isFocused);
    } else {
      r.drawLabel(r.W / 2, Y_EVT_LIST + 14, '(目前沒有節點事件)', {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'center',
      });
    }
  }

  // ── 5 行儀表渲染 ──────────────────────────────────────────────
  _drawIdentity(r, y) {
    // 「洛克 !abc12345              04-28 We」
    r.drawLabel(4, y + 14, '洛克', { font: r.F.ZH_MD, color: r.C.TEXT });
    r.drawLabel(40, y + 14, '!abc12345', { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
    r.drawLabel(r.W - 4, y + 14, dateMmDdWe(), {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
    });
  }

  _drawGps(r, y) {
    // 「◉ 24.149°N 120.681°E ±3m 3D」(尚未接 GNSS,顯示 placeholder)
    const fix = '3d';
    const map = {
      '3d': { glyph: '◉', label: '3D', color: r.C.GREEN     },
      '2d': { glyph: '◉', label: '2D', color: r.C.WARNING   },
      'searching': { glyph: '◌', label: '搜尋', color: r.C.TEXT_DIM },
      'lost': { glyph: '✕', label: '無定位', color: r.C.DANGER  },
    };
    const g = map[fix] || map.searching;
    r.drawLabel(4, y + 14, g.glyph, { font: r.F.ZH_MD, color: g.color });
    r.drawLabel(20, y + 14, '24.149°N 120.681°E ±3m', {
      font: r.F.ZH_SM, color: r.C.TEXT,
    });
    r.drawLabel(r.W - 4, y + 14, g.label, {
      font: r.F.ZH_SM, color: g.color, align: 'right',
    });
  }

  _drawPower(r, now, y) {
    const pct = this._batteryPct(now);
    const v   = 4.02;
    const ma  = -180;
    const eta = '~11h24m';

    let color = r.C.TEXT;
    let glyph = '▣';
    if (pct <= 5)        { color = r.C.DANGER;  }
    else if (pct <= 15)  { color = r.C.DANGER;  }
    else if (pct <= 30)  { color = r.C.WARNING; }

    r.drawLabel(4, y + 14, `${glyph}${pct}%`, {
      font: r.F.ZH_SM, color,
    });
    r.drawLabel(64, y + 14, `${v.toFixed(2)}V ${ma}mA`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    r.drawLabel(r.W - 4, y + 14, eta, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
    });
  }

  _drawEnv(r, y) {
    // 「🌡28.4° 📊1013.2→ ⛰2,847m」(尚未接 sensor,placeholder)
    r.drawLabel(4,   y + 14, '🌡28.4°',     { font: r.F.ZH_SM, color: r.C.TEXT });
    r.drawLabel(80,  y + 14, '📊1013.2→',   { font: r.F.ZH_SM, color: r.C.TEXT });
    r.drawLabel(180, y + 14, '⛰2,847m',     { font: r.F.ZH_SM, color: r.C.TEXT });
  }

  _drawNetwork(r, y) {
    // 「☷ChU18% Tx4% H:2m Hop2.1 SNR-8」(placeholder;後續接 mesh metrics)
    r.drawLabel(4,   y + 14, '☷ChU18%',     { font: r.F.ZH_SM, color: r.C.GREEN });
    r.drawLabel(74,  y + 14, 'Tx4%',         { font: r.F.ZH_SM, color: r.C.GREEN });
    r.drawLabel(118, y + 14, 'H:2m',         { font: r.F.ZH_SM, color: r.C.GREEN });
    r.drawLabel(158, y + 14, 'Hop2.1',       { font: r.F.ZH_SM, color: r.C.TEXT_DIM });
    r.drawLabel(212, y + 14, 'SNR-8',        { font: r.F.ZH_SM, color: r.C.WARNING });
  }

  _drawSectionHeader(r, y, leftText, rightText, rightColor) {
    r.drawLabel(4, y + 13, leftText, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
    r.drawLabel(r.W - 4, y + 13, rightText, {
      font: r.F.ZH_SM, color: rightColor, align: 'right',
    });
  }

  _drawMessageRow(r, y, msg, isFocused) {
    // 焦點底色
    if (isFocused) {
      r.ctx.fillStyle = r.C.FOCUS_BG;
      r.ctx.fillRect(0, y, r.W, ROW_H);
    }
    let x = 4;
    // ▶ 焦點符
    if (isFocused) {
      r.drawLabel(x, y + 14, '▶', { font: r.F.ZH_SM, color: r.C.FOCUS });
    }
    x += 12;
    // 圖示(👤 DM / # 頻道 / 📢 廣播)
    const icon = msg.kind === 'dm' ? '👤' : (msg.kind === 'channel' ? '#' : '📢');
    r.drawLabel(x, y + 14, icon, { font: r.F.ZH_SM, color: r.C.TEXT });
    x += 18;
    // 名稱
    const name = truncate(msg.from, 8);
    r.drawLabel(x, y + 14, name, {
      font: r.F.ZH_SM, color: isFocused ? r.C.FOCUS : r.C.TEXT,
    });
    // 時間 + 未讀
    const tx = r.W - 4;
    if (msg.unread > 0) {
      r.drawLabel(tx, y + 14, `●${msg.unread} ${msg.time}`, {
        font: r.F.ZH_SM, color: r.C.GREEN, align: 'right',
      });
    } else {
      r.drawLabel(tx, y + 14, msg.time, {
        font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
      });
    }
    // 預覽(第二行,但版面只有 20px 一行 → 此 PR 簡化為靠中放預覽)
    // 規格指預覽在同一行靠右,但空間有限;此 EMU 採實用變體
  }

  _drawEventRow(r, y, ev, isFocused) {
    if (isFocused) {
      r.ctx.fillStyle = r.C.FOCUS_BG;
      r.ctx.fillRect(0, y, r.W, ROW_H);
    }
    const map = {
      'online':  { sym: '↑', color: r.C.GREEN     },
      'offline': { sym: '↓', color: r.C.TEXT_DIM  },
      'request': { sym: '?', color: r.C.INFO      },
      'new':     { sym: '+', color: r.C.TEXT      },
      'move':    { sym: '○', color: r.C.WARNING   },
      'sos':     { sym: '⚠', color: r.C.DANGER    },
    };
    const m = map[ev.type] || map.online;
    let x = 4;
    if (isFocused) {
      r.drawLabel(x, y + 14, '▶', { font: r.F.ZH_SM, color: r.C.FOCUS });
    }
    x += 12;
    r.drawLabel(x, y + 14, m.sym, { font: r.F.ZH_SM, color: m.color });
    x += 14;
    const txt = `${ev.who} ${eventLabel(ev.type)}`;
    r.drawLabel(x, y + 14, txt, {
      font: r.F.ZH_SM, color: isFocused ? r.C.FOCUS : r.C.TEXT,
    });
    r.drawLabel(r.W - 4, y + 14, ev.time, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM, align: 'right',
    });
  }

  // ── Key handling ────────────────────────────────────────────
  handleKeyTap({ key }) {
    const fn = key.fn;
    this._lastInteract = performance.now();
    const messages = this._messageList();
    const events   = this._eventList();
    const msgFocusable = Math.min(3, messages.length);
    const total = msgFocusable + (events.length > 0 ? 1 : 0);
    if (total === 0 && fn !== 'FUNC') return;

    if (fn === 'FUNC') {
      this.goto('menu', 'fade');
      return;
    }
    if (fn === 'UP') {
      if (this._focus > 0) this._focus--;
      return;
    }
    if (fn === 'DOWN') {
      if (this._focus < total - 1) this._focus++;
      else this.goto('messages', 'slide_l');  // 規格:事件最後一筆 ↓ → 進訊息 App
      return;
    }
    if (fn === 'OK' || fn === 'RIGHT') {
      if (this._focus < msgFocusable) {
        const msg = messages[this._focus];
        if (msg.kind === 'dm') {
          // 進 DM 對話(先取得 chat-screen 並設置 recipient)
          const chat = this._manager._screens.get('chat');
          chat?.setRecipient?.(msg.id, msg.from);
        } else {
          const chat = this._manager._screens.get('chat');
          chat?.setChannel?.(msg.id ?? 0, msg.from);
        }
        this.goto('chat', 'slide_l');
      } else if (events.length > 0) {
        this.goto('nodes', 'slide_l');
      }
      return;
    }
    if (fn === 'LEFT') {
      // 移除提醒(訊息 → unread=0;事件 → 移除)
      if (this._focus < msgFocusable) {
        const msg = messages[this._focus];
        this._dismissedMsgIds.add(msg.id);
      } else {
        this._dismissedEvtIdx.add(this._focus - msgFocusable);
      }
      return;
    }
  }

  // ── Mock data sources(後續接真實狀態) ──────────────────────
  _messageList() {
    // 取 sim messages 末段;尚無「對話列表」資料模型,此處用單一聚合
    const sims = this.serial.getSimMessages?.() ?? [];
    const recent = sims.slice(-3).reverse();
    return recent.map((m, i) => ({
      id:     m.id ?? i,
      kind:   m.from?.startsWith('!') ? 'dm' : 'channel',
      from:   m.from ?? '?',
      time:   m.time ?? '—',
      preview: m.text ?? '',
      unread: this._dismissedMsgIds.has(m.id ?? i) ? 0 : 1,
      read:   this._dismissedMsgIds.has(m.id ?? i),
    }));
  }

  _eventList() {
    return MOCK_EVENTS.filter((_, i) => !this._dismissedEvtIdx.has(i));
  }

  _totalUnread() {
    return this._messageList().filter(m => m.unread > 0).length;
  }

  _meshCount() {
    return 0;  // 尚未接 NodeDB
  }

  _gpsState() { return '3d'; }

  _batteryPct(now) {
    return 70 + ((Math.sin(now / 60000) * 10) | 0);
  }
}

// ── helpers ───────────────────────────────────────────────────
function timeStr() {
  return new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}
function dateMmDdWe() {
  const d  = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const we = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
  return `${mm}-${dd} ${we}`;
}
function truncate(s, maxChars) {
  if (!s) return '';
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}
function eventLabel(type) {
  switch (type) {
    case 'online':  return '上線';
    case 'offline': return '離線';
    case 'request': return '請求位置';
    case 'new':     return '加入';
    case 'move':    return '移動';
    case 'sos':     return '發送 SOS';
    default:        return '';
  }
}
