/**
 * mie_wasm_glue.cpp — WASM export layer for MokyaInput Engine v2 (listener API)
 *
 * Bridges the firmware C++ ImeLogic to a single-instance WASM module consumed
 * by mie-hal.js.
 *
 * Design notes:
 *   - Uses the C++ API (mie::ImeLogic) directly rather than the C API in
 *     <mie/mie.h>: the v2 ImeLogic is push-based, requires KeyEvent::now_ms
 *     from a monotonic clock, and needs periodic tick() for multi-tap and
 *     long-press timers. The C API does not expose tick() nor accept now_ms.
 *   - A single WasmListener implements IImeListener and stashes events into
 *     drainable slots. JS polls mie_pop_* after every key/tick to pick them
 *     up.
 *   - The keycode parameter is the semantic MOKYA_KEY_* value from
 *     <mie/keycode.h>. The host is expected to have already translated its
 *     matrix coordinates to a canonical keycode (see keycode.h — row-major
 *     row*6+col+1 for the 6×6 matrix).
 *
 * Exported functions (STANDALONE_WASM, no Emscripten JS glue):
 *   mie_load_zh_dict(dat_ptr, dat_len, val_ptr, val_len) -> int
 *   mie_load_en_dict(dat_ptr, dat_len, val_ptr, val_len) -> int
 *   mie_ctx_init()                                        -> int
 *   mie_key(keycode, pressed, now_ms)                     -> int
 *   mie_tick(now_ms)                                      -> int
 *   mie_pop_commit(buf, max_len)                          -> int
 *   mie_pop_delete_before()                               -> int  (1-shot flag)
 *   mie_pop_cursor_move()                                 -> int  (0=none, 1=L, 2=R, 3=U, 4=D)
 *   mie_input_ptr()                                       -> const char*
 *   mie_mode_ptr()                                        -> const char*
 *   mie_cand_count()                                      -> int
 *   mie_cand_word_ptr(idx)                                -> const char*
 *   mie_sel()                                             -> int
 *   mie_page_sz()                                         -> int
 *   mie_page_cnt()                                        -> int
 *   mie_cur_page()                                        -> int
 *   mie_page_cand_ptr(idx)                                -> const char*
 *   mie_page_cand_cnt()                                   -> int
 *   mie_clear_state()                                     -> void
 *   mie_set_text_context(prev_utf8)                       -> void
 */

#include <emscripten.h>
#include <mie/ime_logic.h>
#include <mie/trie_searcher.h>
#include <mie/hal_port.h>

#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <new>

// ── Singleton state ──────────────────────────────────────────────────────────

static mie::TrieSearcher g_zh;
static mie::TrieSearcher g_en;
static bool              g_zh_loaded = false;
static bool              g_en_loaded = false;
static mie::ImeLogic*    g_ime       = nullptr;

// ── Listener — stashes events for JS to drain ────────────────────────────────

class WasmListener final : public mie::IImeListener {
public:
    // Commit ring
    char  commit_buf[512] = {};
    int   commit_len      = 0;

    // DEL-before 1-shot flag
    bool  del_before_flag = false;

    // Cursor-move FIFO (NavDir code: 1=L, 2=R, 3=U, 4=D)
    static constexpr int kQueueCap = 16;
    uint8_t cursor_move_queue[kQueueCap] = {};
    int     cursor_move_head = 0;
    int     cursor_move_tail = 0;

    void on_commit(const char* utf8) override {
        if (!utf8) return;
        int len = static_cast<int>(std::strlen(utf8));
        int remain = static_cast<int>(sizeof(commit_buf)) - commit_len - 1;
        if (len > remain) len = remain;
        if (len > 0) {
            std::memcpy(commit_buf + commit_len, utf8, len);
            commit_len += len;
            commit_buf[commit_len] = '\0';
        }
    }

    void on_delete_before() override { del_before_flag = true; }

    void on_cursor_move(mie::NavDir d) override {
        uint8_t code = static_cast<uint8_t>(d) + 1;  // NavDir: Left=0..Down=3
        int next = (cursor_move_tail + 1) % kQueueCap;
        if (next != cursor_move_head) {
            cursor_move_queue[cursor_move_tail] = code;
            cursor_move_tail = next;
        }
    }

    void on_composition_changed() override { /* no-op — JS re-queries after every call */ }
};

static WasmListener g_listener;

// ── Dictionary loading ───────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_load_zh_dict(const uint8_t* dat, int dat_len,
                     const uint8_t* val, int val_len) {
    g_zh_loaded = g_zh.load_from_memory(dat, static_cast<size_t>(dat_len),
                                         val, static_cast<size_t>(val_len));
    return g_zh_loaded ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_load_en_dict(const uint8_t* dat, int dat_len,
                     const uint8_t* val, int val_len) {
    g_en_loaded = g_en.load_from_memory(dat, static_cast<size_t>(dat_len),
                                         val, static_cast<size_t>(val_len));
    return g_en_loaded ? 1 : 0;
}

// ── Context lifecycle ────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_ctx_init(void) {
    if (!g_zh_loaded) return 0;
    delete g_ime;
    g_ime = new(std::nothrow) mie::ImeLogic(g_zh, g_en_loaded ? &g_en : nullptr);
    if (!g_ime) return 0;
    g_ime->set_listener(&g_listener);
    return 1;
}

// ── Key / tick ───────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_key(uint8_t keycode, int pressed, uint32_t now_ms) {
    if (!g_ime) return 0;
    mie::KeyEvent ev;
    ev.keycode = keycode;
    ev.pressed = (pressed != 0);
    ev.now_ms  = now_ms;
    return g_ime->process_key(ev) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_tick(uint32_t now_ms) {
    if (!g_ime) return 0;
    return g_ime->tick(now_ms) ? 1 : 0;
}

// ── Listener drains ──────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_pop_commit(char* buf, int max_len) {
    if (g_listener.commit_len == 0 || max_len <= 0) return 0;
    int n = g_listener.commit_len < max_len - 1 ? g_listener.commit_len : max_len - 1;
    std::memcpy(buf, g_listener.commit_buf, n);
    buf[n] = '\0';
    g_listener.commit_len    = 0;
    g_listener.commit_buf[0] = '\0';
    return n;
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_pop_delete_before(void) {
    if (!g_listener.del_before_flag) return 0;
    g_listener.del_before_flag = false;
    return 1;
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_pop_cursor_move(void) {
    if (g_listener.cursor_move_head == g_listener.cursor_move_tail) return 0;
    uint8_t code = g_listener.cursor_move_queue[g_listener.cursor_move_head];
    g_listener.cursor_move_head = (g_listener.cursor_move_head + 1) % WasmListener::kQueueCap;
    return static_cast<int>(code);
}

// ── State queries ────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
const char* mie_input_ptr(void) {
    if (!g_ime) return "";
    const mie::PendingView pv = g_ime->pending_view();
    return pv.str ? pv.str : "";
}

// PendingStyle enum values (matches mie::PendingStyle): 0=None, 1=PrefixBold, 2=Inverted.
EMSCRIPTEN_KEEPALIVE extern "C"
int mie_pending_style(void) {
    if (!g_ime) return 0;
    return static_cast<int>(g_ime->pending_view().style);
}

// Byte count of pending buffer (excludes terminating null).
EMSCRIPTEN_KEEPALIVE extern "C"
int mie_pending_byte_len(void) {
    if (!g_ime) return 0;
    return g_ime->pending_view().byte_len;
}

// Byte count of the matched prefix within pending (for PrefixBold style).
EMSCRIPTEN_KEEPALIVE extern "C"
int mie_pending_matched_prefix(void) {
    if (!g_ime) return 0;
    return g_ime->pending_view().matched_prefix_bytes;
}

EMSCRIPTEN_KEEPALIVE extern "C"
const char* mie_mode_ptr(void) {
    return g_ime ? g_ime->mode_indicator() : "";
}

// Legacy full-list accessors (JS currently prefers the paginated API).
EMSCRIPTEN_KEEPALIVE extern "C"
int mie_cand_count(void) {
    return g_ime ? g_ime->candidate_count() : 0;
}

EMSCRIPTEN_KEEPALIVE extern "C"
const char* mie_cand_word_ptr(int idx) {
    if (!g_ime || idx < 0 || idx >= g_ime->candidate_count()) return "";
    return g_ime->candidate(idx).word;
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_sel(void) {
    return g_ime ? g_ime->page_sel() : 0;
}

// Absolute selection index over the full merged candidate list (0..cand_count).
EMSCRIPTEN_KEEPALIVE extern "C"
int mie_selected_abs(void) {
    return g_ime ? g_ime->selected() : 0;
}

// ── Pagination ───────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_page_sz(void) {
    return mie::ImeLogic::kPageSize;
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_page_cnt(void) {
    return g_ime ? g_ime->page_count() : 0;
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_cur_page(void) {
    return g_ime ? g_ime->page() : 0;
}

EMSCRIPTEN_KEEPALIVE extern "C"
int mie_page_cand_cnt(void) {
    return g_ime ? g_ime->page_cand_count() : 0;
}

EMSCRIPTEN_KEEPALIVE extern "C"
const char* mie_page_cand_ptr(int idx) {
    if (!g_ime || idx < 0 || idx >= g_ime->page_cand_count()) return "";
    return g_ime->page_cand(idx).word;
}

// ── Actions ──────────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE extern "C"
void mie_clear_state(void) {
    if (g_ime) g_ime->abort();
}

EMSCRIPTEN_KEEPALIVE extern "C"
void mie_set_text_context(const char* prev_utf8) {
    if (g_ime) g_ime->set_text_context(prev_utf8 ? prev_utf8 : "");
}
