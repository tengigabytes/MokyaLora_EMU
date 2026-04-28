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
import { listDraftIds, getDraft } from './drafts-store.js';

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

    // 極簡低電模式(對齊 doc/ui/20-launcher-home.md §極簡低電模式 ≤5%)
    const pct = this._batteryPct(now);
    if (pct <= 5 && !this._isCharging()) {
      this._renderLowBattery(r, pct);
      return;
    }

    // ── Status Bar ─────────────────────────────────────────────
    r.drawStatusBar({
      time:    timeStr(),
      battery: pct,
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

  /**
   * 對齊 doc/ui/20-launcher-home.md §訊息區段條目(每筆 40 字位):
   *   ▶👤阿明     09:38 ●2 我快到了五分鐘有
   *   2 ▶ + 2 圖示 + 8 名稱 + 1 + 5 時間 + 1 + 3 ●N + 1 + 17 預覽 + 草稿 ✏
   */
  _drawMessageRow(r, y, msg, isFocused) {
    const ctx = r.ctx;
    // 焦點底色
    if (isFocused) {
      ctx.fillStyle = r.C.FOCUS_BG;
      ctx.fillRect(0, y, r.W, ROW_H);
    }
    ctx.font          = r.F.ZH_SM;
    ctx.textBaseline  = 'alphabetic';
    ctx.textAlign     = 'left';
    const baseline = y + 14;

    // ▶ 焦點符(固定欄)
    let x = 4;
    if (isFocused) {
      ctx.fillStyle = r.C.FOCUS;
      ctx.fillText('▶', x, baseline);
    }
    x += 14;

    // 圖示(👤 DM / # 頻道 / 📢 廣播)
    const icon = msg.kind === 'dm' ? '👤' : (msg.kind === 'channel' ? '#' : '📢');
    ctx.fillStyle = r.C.TEXT;
    ctx.fillText(icon, x, baseline);
    x += 18;

    // 名稱(截 4 全形)
    const name = truncate(msg.from, 4);
    ctx.fillStyle = isFocused ? r.C.FOCUS : r.C.TEXT;
    ctx.fillText(name, x, baseline);
    x += 64;  // 留 8 半形字位 ≈ 64px,固定欄位讓後續對齊穩定

    // 時間
    const timeStr = String(msg.time || '');
    ctx.fillStyle = r.C.TEXT_DIM;
    ctx.fillText(timeStr, x, baseline);
    x += ctx.measureText(timeStr).width + 6;

    // 未讀 ●N(若 N>0)/ 草稿 ✏(若有草稿)
    if (msg.draft) {
      ctx.fillStyle = r.C.FOCUS;
      ctx.fillText('✏', x, baseline);
      x += 18;
    } else if (msg.unread > 0) {
      ctx.fillStyle = r.C.GREEN;
      ctx.fillText(`●${msg.unread}`, x, baseline);
      x += ctx.measureText(`●${msg.unread}`).width + 4;
    }

    // 預覽(草稿時顯示草稿內容,否則顯示最後訊息預覽)
    const previewText = msg.draft || msg.preview || '';
    if (previewText) {
      const remainW = r.W - x - 4;
      ctx.fillStyle = msg.draft ? r.C.FOCUS_DIM
                    : (msg.unread > 0 ? r.C.TEXT : r.C.TEXT_DIM);
      const truncated = truncateToWidth(ctx, previewText, remainW);
      ctx.fillText(truncated, x, baseline);
    }
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
    // 草稿 ID 集合(對齊 12-ime.md §對話列表草稿提示):chat-screen 用
    // `chat:{kind}:{id}` 為 key,這裡同步推導。
    const draftIds = new Set(listDraftIds());
    return recent.map((m, i) => {
      const id   = m.id ?? i;
      const kind = m.from?.startsWith('!') ? 'dm' : 'channel';
      const draftKey = `chat:${kind}:${id}`;
      const draftEntry = draftIds.has(draftKey) ? getDraft(draftKey) : null;
      return {
        id, kind,
        from:    m.from ?? '?',
        time:    m.time ?? '—',
        preview: m.text ?? '',
        draft:   draftEntry?.text || '',
        unread:  this._dismissedMsgIds.has(id) ? 0 : 1,
        read:    this._dismissedMsgIds.has(id),
      };
    });
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

  _isCharging() { return false; }   // 後續接 ADC + USB detect

  /**
   * 極簡低電桌面(規格 §極簡低電模式)
   * - Status Bar 整條暗紅 alert='lowBatt'
   * - 中央超大電量字(Unifont 16px ×3 縮放)
   * - 電壓 / 電流 / 預估剩餘 / 座標 / SOS 提示 / 充電提示
   * - 「Func 仍可呼出功能表」
   * - 退出條件:充電插入 OR 電量 >10%(此處只繪;切回 normal 由 render 入口判斷)
   */
  _renderLowBattery(r, pct) {
    const C = r.C;
    // 1. Status Bar 整條暗紅
    r.drawStatusBar({
      alert:     'lowBatt',
      alertText: `⚠ 電量不足                              ${pct}%`,
    });

    // 2. 超大電量字(scale 3× from Unifont 16px)
    const ctx = r.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(3, 3);
    ctx.fillStyle    = C.DANGER;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`▣  ${pct}%`, r.W / 6, 12);   // 縮放後 baseline = 36
    ctx.restore();
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    // 3. 電壓 / 電流 / 剩餘
    r.drawLabel(r.W / 2, 100, '4.02V  -180mA  ~28min', {
      font: r.F.ZH_MD, color: C.TEXT, align: 'center',
    });

    // 4. 座標
    r.drawLabel(r.W / 2, 130, '◉ 24.149°N 120.681°E', {
      font: r.F.ZH_MD, color: C.TEXT, align: 'center',
    });

    // 5. SOS 提示
    r.drawLabel(r.W / 2, 160, '長按 Power 5 秒 啟動 SOS', {
      font: r.F.ZH_SM, color: C.WARNING, align: 'center',
    });

    // 6. 充電提示
    r.drawLabel(r.W / 2, 184, '🔌 請盡快充電', {
      font: r.F.ZH_MD, color: C.DANGER, align: 'center',
    });

    // 7. 分隔線 + Func 仍可呼出
    ctx.fillStyle = C.BORDER;
    ctx.fillRect(0, 215, r.W, 1);
    r.drawLabel(r.W / 2, 232, 'Func 仍可呼出功能表', {
      font: r.F.ZH_SM, color: C.TEXT_DIM, align: 'center',
    });
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
/** 以畫布 ctx 當前字型量測,把字串截斷到最多 maxWidth 寬,超過加 …。 */
function truncateToWidth(ctx, s, maxWidth) {
  if (!s) return '';
  if (ctx.measureText(s).width <= maxWidth) return s;
  const ellipsis = '…';
  const eW = ctx.measureText(ellipsis).width;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const w = ctx.measureText(s.slice(0, mid)).width + eW;
    if (w <= maxWidth) lo = mid;
    else               hi = mid - 1;
  }
  return s.slice(0, lo) + ellipsis;
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
