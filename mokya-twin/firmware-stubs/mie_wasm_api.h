/**
 * mie_wasm_api.h — WASM exports from mie_core.wasm (mie_wasm_glue.cpp)
 *
 * This header documents the functions exported by the compiled WASM module.
 * Build: ./build_wasm.sh  →  mokya-twin/wasm/mie_core.wasm
 *
 * JS usage (from mie-hal.js after WebAssembly.instantiate):
 *
 *   const { instance } = await WebAssembly.instantiate(buffer, {
 *     env: { emscripten_notify_memory_growth: () => {} },
 *     wasi_snapshot_preview1: {},
 *   });
 *   const wasm = instance.exports;
 *   wasm._initialize();
 *
 *   // Load dictionary (MIED v2 format, two binary files)
 *   wasm.mie_load_zh_dict(dat_ptr, dat_len, val_ptr, val_len); // 1=ok
 *   wasm.mie_load_en_dict(dat_ptr, dat_len, val_ptr, val_len); // optional
 *   wasm.mie_ctx_init();                                        // 1=ok
 *
 *   // Key events (pressed: 1=down, 0=up)
 *   wasm.mie_key(row, col, pressed);  // non-zero = UI should redraw
 *
 *   // Poll committed text after each key event
 *   const buf = wasm.malloc(256);
 *   const n   = wasm.mie_pop_commit(buf, 256);  // bytes written, 0=none
 *   if (n) { const text = readUtf8(wasm.memory, buf); }
 *   wasm.free(buf);
 *
 *   // Read input display and candidates
 *   readUtf8(wasm.memory, wasm.mie_input_ptr());   // e.g. "ㄅ˙"
 *   readUtf8(wasm.memory, wasm.mie_mode_ptr());    // "中" / "EN" / "ABC"
 *   const n = wasm.mie_cand_count();
 *   for (let i = 0; i < n; i++)
 *     readUtf8(wasm.memory, wasm.mie_cand_word_ptr(i));
 *
 *   // Pagination
 *   wasm.mie_sel();       // selected index on current page
 *   wasm.mie_page_sz();   // candidates per page (fixed = 5)
 *   wasm.mie_page_cnt();  // total pages
 *
 *   // Reset
 *   wasm.mie_clear_state();
 */

#ifndef MIE_WASM_API_H
#define MIE_WASM_API_H

#include <stdint.h>
#include <stddef.h>

#ifdef __EMSCRIPTEN__
#  include <emscripten.h>
#  define MIE_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#  define MIE_EXPORT
#endif

#ifdef __cplusplus
extern "C" {
#endif

MIE_EXPORT int mie_load_zh_dict(const uint8_t* dat_buf, int dat_len,
                                 const uint8_t* val_buf, int val_len);
MIE_EXPORT int mie_load_en_dict(const uint8_t* dat_buf, int dat_len,
                                 const uint8_t* val_buf, int val_len);
MIE_EXPORT int         mie_ctx_init(void);
MIE_EXPORT int         mie_key(uint8_t row, uint8_t col, int pressed);
MIE_EXPORT int         mie_pop_commit(char* buf, int max_len);
MIE_EXPORT const char* mie_input_ptr(void);
MIE_EXPORT const char* mie_mode_ptr(void);
MIE_EXPORT int         mie_cand_count(void);
MIE_EXPORT const char* mie_cand_word_ptr(int idx);
MIE_EXPORT int         mie_sel(void);
MIE_EXPORT int         mie_page_sz(void);
MIE_EXPORT int         mie_page_cnt(void);
/** Current page number (0-indexed). Updates after TAB / UP / DOWN cross-page. */
MIE_EXPORT int         mie_cur_page(void);
/** Word pointer for page-relative index idx (use instead of mie_cand_word_ptr for display). */
MIE_EXPORT const char* mie_page_cand_ptr(int idx);
/** Candidate count on the current page (may be < mie_page_sz() on last page). */
MIE_EXPORT int         mie_page_cand_cnt(void);
MIE_EXPORT void        mie_clear_state(void);

#ifdef __cplusplus
}
#endif

#endif /* MIE_WASM_API_H */
