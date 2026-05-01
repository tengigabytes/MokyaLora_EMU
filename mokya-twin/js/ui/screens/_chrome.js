/**
 * _chrome.js — Shared screen chrome helpers.
 *
 * 對齊韌體 G-1 status bar / G-2 hint bar 慣例,讓所有 view 的「外殼」
 * 保持一致(否則新 screen 的 status bar 只填了 time/battery,看起來
 * 比 home / nodes / messages 等舊 screen 簡陋)。
 *
 * 使用範例:
 *
 *   import { defaultStatusOpts, drawHintBarRow } from './_chrome.js';
 *
 *   render(now) {
 *     this.r.clear();
 *     this.r.drawStatusBar(defaultStatusOpts(this.serial));
 *     // ... 內容 ...
 *     drawHintBarRow(this.r, [
 *       { key: 'OK',   label: '進入' },
 *       { key: 'BACK', label: '工具' },
 *     ]);
 *   }
 */

import { NODES }         from './nodes-data.js';
import { SerialState }   from '../../serial/meshtastic-serial.js';

/**
 * 從 EMU 全域狀態組出對齊韌體 status_bar.c 的 opts。
 * - time:HH:MM(uptime 風格,EMU 用 wall clock)
 * - mesh:NODES 表的非自身節點數
 * - gps:mock 為 '3d'(EMU 沒接 GPS NMEA)
 * - mode:預設 'Op';IME 啟動的 screen 自行 override
 * - battery:75%(EMU 無感測,sos/lock/home 自行 override 為實際)
 *
 * @param {object} [serial]  optional serial bridge for mesh count source
 * @param {object} [override] override 任何欄位(例如 mode='ZH')
 */
export function defaultStatusOpts(serial, override = {}) {
  const time = new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const myId = serial?.myNodeId ?? null;
  const mesh = NODES.filter(n => n.user?.id !== myId).length;
  const live = serial?.state === SerialState?.CONNECTED;
  return {
    time,
    battery: 78,
    charging: false,
    mesh,
    gps:    'searching',     // EMU 無 GPS — 對齊韌體 oGPS 字樣
    unread: 0,
    mode:   'Op',
    tx:     live && (Math.random() < 0.05),
    rx:     live && (Math.random() < 0.05),
    ...override,
  };
}

/**
 * 在畫面底部 y=H-16 畫 hint bar(對齊韌體 hint_bar.c 三標籤)。
 * 直接接 renderer.drawHintBar()。
 *
 * @param {object} renderer
 * @param {{key:string,label:string}[]} hints
 */
export function drawHintBarRow(renderer, hints) {
  renderer.drawHintBar(hints);
}
