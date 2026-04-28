/**
 * Drafts store — 對齊 doc/ui/12-ime.md 「草稿系統」
 *
 * 模式 B 編輯按 BACK 且 buffer 非空時呼叫 setDraft();下次進入該目的地
 * 時呼叫 getDraft() 顯示恢復畫面;OK 送出 / 重新開始時 clearDraft();
 * 30 天未動的草稿由 cleanupOlderDays() 清除(由 boot 時呼叫一次)。
 *
 * 規格:
 *   儲存位置: Flash drafts.bin(此 EMU 用 localStorage 模擬)
 *   每筆大小: < 1KB
 *   Key:      每個目的地一份(對話 ID / 設定項 ID / 記事 ID)
 *
 * 儲存格式(每筆 JSON):
 *   { text: string, savedAt: number /* epoch sec *​/ }
 */

const STORAGE_PREFIX = 'mokya:drafts:';

/** 寫入草稿。空字串等於 clear。 */
export function setDraft(id, text) {
  if (!id) return;
  if (!text) {
    clearDraft(id);
    return;
  }
  const payload = JSON.stringify({
    text:    String(text),
    savedAt: (Date.now() / 1000) | 0,
  });
  try {
    localStorage.setItem(STORAGE_PREFIX + id, payload);
  } catch (err) {
    console.warn('[drafts] setDraft failed:', err.message);
  }
}

/** 讀取草稿。回傳 { text, savedAt } 或 null。 */
export function getDraft(id) {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj?.text !== 'string') return null;
    return { text: obj.text, savedAt: obj.savedAt | 0 };
  } catch {
    return null;
  }
}

/** 草稿存在多久(秒)。不存在回 -1。 */
export function getDraftAgeSec(id) {
  const d = getDraft(id);
  if (!d) return -1;
  return Math.max(0, ((Date.now() / 1000) | 0) - d.savedAt);
}

/** 是否有草稿。 */
export function hasDraft(id) {
  return getDraft(id) !== null;
}

/** 清除單一草稿。 */
export function clearDraft(id) {
  if (!id) return;
  try { localStorage.removeItem(STORAGE_PREFIX + id); }
  catch {}
}

/** 列出所有草稿 id(供對話列表 ✏ 圖示判斷)。 */
export function listDraftIds() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) out.push(key.slice(STORAGE_PREFIX.length));
    }
  } catch {}
  return out;
}

/** 清除超過 N 天未更新的草稿(規格:預設 30 天)。 */
export function cleanupOlderDays(days = 30) {
  const cutoff = ((Date.now() / 1000) | 0) - days * 86400;
  for (const id of listDraftIds()) {
    const d = getDraft(id);
    if (d && d.savedAt < cutoff) clearDraft(id);
  }
}

/** 人性化年齡字串(供恢復畫面)。 */
export function humanAge(ageSec) {
  if (ageSec < 0)    return '剛剛';
  if (ageSec < 60)   return `${ageSec} 秒前`;
  if (ageSec < 3600) return `${(ageSec / 60) | 0} 分鐘前`;
  if (ageSec < 86400)return `${(ageSec / 3600) | 0} 小時前`;
  return `${(ageSec / 86400) | 0} 天前`;
}
