# CMakeLists.txt — Emscripten build for mie_core.wasm (mokya-twin/wasm-build/)
#
# Usage (from repo root after sourcing emsdk):
#   source /path/to/emsdk/emsdk_env.sh
#   emcmake cmake \
#       -S mokya-twin/wasm-build \
#       -B build/wasm \
#       -DMIE_SRC=MokyaLora/firmware/mie \
#       -DCMAKE_BUILD_TYPE=Release
#   cmake --build build/wasm
#
# Output: mokya-twin/wasm/mie_core.wasm
#
# MIE_SRC must point to the firmware/mie directory that contains:
#   src/ime_logic.cpp  src/trie_searcher.cpp  src/mie_init.cpp
#   src/ime_keys.cpp   src/ime_smart.cpp      src/ime_search.cpp
#   src/ime_commit.cpp src/ime_display.cpp    src/ime_direct.cpp
#   src/mie_c_api.cpp
#   include/mie/mie.h  include/mie/ime_logic.h  include/mie/trie_searcher.h
#
# build_wasm.sh handles checking out the correct firmware branch automatically.

cmake_minimum_required(VERSION 3.20)
project(mie_core CXX)
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Source root ───────────────────────────────────────────────────────────────
if(NOT DEFINED MIE_SRC)
  message(FATAL_ERROR "Set -DMIE_SRC=/path/to/firmware/mie")
endif()

# ── WASM glue + all firmware MIE sources ─────────────────────────────────────
# mie_c_api.cpp is intentionally omitted — the WASM glue uses the C++ API
# (mie::ImeLogic) directly so it can supply KeyEvent::now_ms and drive tick().
add_executable(mie_core
  ${CMAKE_CURRENT_SOURCE_DIR}/../firmware-stubs/mie_wasm_glue.cpp
  ${MIE_SRC}/src/trie_searcher.cpp
  ${MIE_SRC}/src/ime_logic.cpp
  ${MIE_SRC}/src/ime_keys.cpp
  ${MIE_SRC}/src/ime_smart.cpp
  ${MIE_SRC}/src/ime_search.cpp
  ${MIE_SRC}/src/ime_commit.cpp
  ${MIE_SRC}/src/ime_display.cpp
  ${MIE_SRC}/src/ime_direct.cpp
)

target_include_directories(mie_core PRIVATE
  ${MIE_SRC}/include
  ${MIE_SRC}/src        # for ime_internal.h
)

# ── Emscripten link flags ─────────────────────────────────────────────────────
target_link_options(mie_core PRIVATE
  # Standalone .wasm — no Emscripten JS glue (mie-hal.js is our own glue)
  -sSTANDALONE_WASM=1
  --no-entry

  # Exported WASM functions (must match mie_wasm_glue.cpp exports)
  "-sEXPORTED_FUNCTIONS=[\
_mie_load_zh_dict,\
_mie_load_en_dict,\
_mie_ctx_init,\
_mie_key,\
_mie_tick,\
_mie_pop_commit,\
_mie_pop_delete_before,\
_mie_pop_cursor_move,\
_mie_input_ptr,\
_mie_pending_style,\
_mie_pending_byte_len,\
_mie_pending_matched_prefix,\
_mie_mode_ptr,\
_mie_cand_count,\
_mie_cand_word_ptr,\
_mie_sel,\
_mie_selected_abs,\
_mie_page_sz,\
_mie_page_cnt,\
_mie_cur_page,\
_mie_page_cand_ptr,\
_mie_page_cand_cnt,\
_mie_clear_state,\
_mie_set_text_context,\
_malloc,\
_free\
]"

  # Memory: 4 MB initial, 64 MB max. The MIED v2 binaries live in WASM
  # linear memory for the lifetime of the context, and a full libchewing
  # dict with --zh-max-abbr-syls 4 / --zh-min-freq 30 currently weighs
  # ~22 MB — leave headroom for trie state and allocation churn.
  -sINITIAL_MEMORY=4194304
  -sMAXIMUM_MEMORY=67108864
  -sALLOW_MEMORY_GROWTH=1
)

# ── Optimisation ──────────────────────────────────────────────────────────────
if(CMAKE_BUILD_TYPE STREQUAL "Release")
  target_compile_options(mie_core PRIVATE -O2)
  target_link_options(mie_core PRIVATE -O2 -g0)
else()
  target_compile_options(mie_core PRIVATE -O0 -g2)
  target_link_options(mie_core PRIVATE -O0 -g2 -sSAFE_HEAP=1)
endif()

# ── Output filename ───────────────────────────────────────────────────────────
set_target_properties(mie_core PROPERTIES SUFFIX ".wasm")

# ── Post-build: copy to mokya-twin/wasm/ ─────────────────────────────────────
set(WASM_OUT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../wasm")
file(MAKE_DIRECTORY "${WASM_OUT_DIR}")
add_custom_command(TARGET mie_core POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "${WASM_OUT_DIR}"
  COMMAND ${CMAKE_COMMAND} -E copy
    "$<TARGET_FILE:mie_core>"
    "${WASM_OUT_DIR}/mie_core.wasm"
  COMMENT "Copying mie_core.wasm -> mokya-twin/wasm/"
)
