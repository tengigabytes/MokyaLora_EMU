/**
 * Hint Bar (G-2) — 動態鍵位提示列
 *
 * 對齊 doc/ui/00-design-charter.md:「全域反射 — Hint Bar 僅在子模式顯示」
 *
 * 顯示時機:
 *   - IME 啟動中(注/EN/Ab/Num 任一)
 *   - 編輯態(模式 A/B 文字框)
 *   - Modal / 確認對話框
 *   - 設定葉節點四模板
 *
 * **不**顯示時機:
 *   - L-0 桌面(Op 態,焦點直接互動,不需提示)
 *   - L-1 九宮格(Op 態)
 *
 * 視覺:畫面底部 16px,左對齊串接 hint(`鍵 + 動作`),以 `  ` 兩空格分隔。
 *
 * @example
 *   import { drawHintBar } from './components/hint-bar.js';
 *   drawHintBar(renderer, [
 *     { key: 'OK',   label: '進入' },
 *     { key: 'BACK', label: '上一層' },
 *     { key: 'FUNC', label: '九宮格' },
 *   ]);
 */
export function drawHintBar(renderer, hints, opts = {}) {
  if (!hints || hints.length === 0) return;
  const r   = renderer;
  const ctx = r.ctx;
  const C   = r.C;
  const h   = 16;
  const y   = (opts.y !== undefined) ? opts.y : (r.H - h);

  // 背景
  ctx.fillStyle = C.SURFACE;
  ctx.fillRect(0, y, r.W, h);
  ctx.fillStyle = C.BORDER;
  ctx.fillRect(0, y, r.W, 1);

  // Hint 內容
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  let x = 4;
  for (const hint of hints) {
    // 鍵名:橙色(對應實體鍵)
    ctx.fillStyle = C.FOCUS;
    ctx.fillText(hint.key, x, y);
    x += ctx.measureText(hint.key).width + 4;
    // 動作描述:次色
    ctx.fillStyle = C.TEXT_DIM;
    ctx.fillText(hint.label, x, y);
    x += ctx.measureText(hint.label).width + 12;
    if (x >= r.W) break;
  }
  ctx.textBaseline = 'alphabetic';
}
