/**
 * mie_wasm_glue.cpp — WASM export layer for MokyaInput Engine
 *
 * Bridges the firmware's context-based C API (mie_ctx_t*) to a
 * single-instance WASM module consumed by mie-hal.js.
 *
 * STANDALONE_WASM mode — no JS imports/callbacks.
 * JS polls state after each mie_key() call:
 *   - mie_pop_commit(buf, max) → int  reads committed text (if any)
 *   - mie_input_ptr()               current input display
 *   - mie_mode_ptr()                mode indicator
 *   - mie_cand_count() etc.         candidate list
 *
 * Exported functions:
 *   mie_load_zh_dict(dat_ptr, dat_len, val_ptr, val_len) → int
 *   mie_load_en_dict(dat_ptr, dat_len, val_ptr, val_len) → int
 *   mie_ctx_init()                                       → int
 *   mie_key(row, col, pressed)                           → int  (redraw flag)
 *   mie_pop_commit(buf, max_len)                         → int  (bytes written, 0=none)
 *   mie_input_ptr()                                      → ptr  (null-term UTF-8)
 *   mie_mode_ptr()                                       → ptr
 *   mie_cand_count()                                     → int
 *   mie_cand_word_ptr(idx)                               → ptr
 *   mie_sel()                                            → int
 *   mie_page_sz()                                        → int
 *   mie_page_cnt()                                       → int
 *   mie_clear_state()                                    → void
 */

#include <emscripten.h>
#include <mie/mie.h>
#include <cstring>
#include <cstdlib>

// ── Global singleton state ────────────────────────────────────────────────────

static mie_dict_t* g_zh_dict   = nullptr;
static mie_dict_t* g_en_dict   = nullptr;
static mie_ctx_t*  g_ctx       = nullptr;

// Committed text ring: commit callback writes here, mie_pop_commit() drains it.
static char  g_commit_buf[512] = {};
static int   g_commit_len      = 0;

// ── Commit callback (internal — no JS import needed) ─────────────────────────

static void commit_cb(const char* utf8, void* /*user_data*/) {
  int len = static_cast<int>(strlen(utf8));
  int remaining = static_cast<int>(sizeof(g_commit_buf)) - g_commit_len - 1;
  if (len > remaining) len = remaining;
  if (len > 0) {
    memcpy(g_commit_buf + g_commit_len, utf8, len);
    g_commit_len += len;
    g_commit_buf[g_commit_len] = '\0';
  }
}

// ── Dictionary loading ────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_load_zh_dict(const uint8_t* dat_buf, int dat_len,
                     const uint8_t* val_buf, int val_len) {
  mie_dict_close(g_zh_dict);
  g_zh_dict = mie_dict_open_memory(dat_buf, (size_t)dat_len,
                                    val_buf, (size_t)val_len);
  return g_zh_dict ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_load_en_dict(const uint8_t* dat_buf, int dat_len,
                     const uint8_t* val_buf, int val_len) {
  mie_dict_close(g_en_dict);
  g_en_dict = mie_dict_open_memory(dat_buf, (size_t)dat_len,
                                    val_buf, (size_t)val_len);
  return g_en_dict ? 1 : 0;
}

// ── Context lifecycle ─────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_ctx_init(void) {
  if (!g_zh_dict) return 0;
  mie_ctx_destroy(g_ctx);
  g_ctx = mie_ctx_create(g_zh_dict, g_en_dict);
  if (!g_ctx) return 0;
  mie_set_commit_cb(g_ctx, commit_cb, nullptr);
  return 1;
}

// ── Key processing ────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_key(uint8_t row, uint8_t col, int pressed) {
  if (!g_ctx) return 0;
  return mie_process_key(g_ctx, row, col, pressed);
}

// ── Committed text drain ──────────────────────────────────────────────────────

/**
 * Copy any pending committed text into buf (max max_len bytes, null-terminated).
 * Returns bytes written (not including null), 0 if nothing committed since last call.
 * Clears the internal buffer on each call.
 */
EMSCRIPTEN_KEEPALIVE extern "C"
int mie_pop_commit(char* buf, int max_len) {
  if (g_commit_len == 0 || max_len <= 0) return 0;
  int n = g_commit_len < max_len - 1 ? g_commit_len : max_len - 1;
  memcpy(buf, g_commit_buf, n);
  buf[n] = '\0';
  g_commit_len = 0;
  g_commit_buf[0] = '\0';
  return n;
}

// ── State queries ─────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
const char* mie_input_ptr(void) {
  if (!g_ctx) return "";
  return mie_input_str(g_ctx);
}

EMSCRIPTEN_KEEPALIVE extern "C"
const char* mie_mode_ptr(void) {
  if (!g_ctx) return "";
  return mie_mode_indicator(g_ctx);
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_cand_count(void) {
  if (!g_ctx) return 0;
  return mie_candidate_count(g_ctx);
}

EMSCRIPTEN_KEEPALIVE extern "C"
const char* mie_cand_word_ptr(int idx) {
  if (!g_ctx) return "";
  const char* w = mie_candidate_word(g_ctx, idx);
  return w ? w : "";
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_sel(void) {
  if (!g_ctx) return 0;
  return mie_page_sel(g_ctx);
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_page_sz(void) {
  return mie_page_size();
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_page_cnt(void) {
  if (!g_ctx) return 0;
  return mie_cand_page_count(g_ctx);
}

// ── Actions ───────────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
void mie_clear_state(void) {
  if (g_ctx) mie_clear_input(g_ctx);
}
