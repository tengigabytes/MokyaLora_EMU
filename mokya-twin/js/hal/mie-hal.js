/**
 * MIE_Bridge — Hardware Abstraction Layer for MokyaInput Engine
 *
 * This class is the critical WASM seam:
 *
 *   Phase 1–3: delegates to MIE_Processor (JS implementation)
 *   Phase 4:   replaces _jsImpl with a loaded WebAssembly instance
 *              compiled from firmware/mie/mie_core.c via Emscripten.
 *
 * The public API must NEVER change between phases — only the
 * internal _useWasm flag and _wasm instance swap.
 *
 * WASM imports expected (env object):
 *   get_tick_ms()                     → number
 *   display_flush(x1,y1,x2,y2,ptr)   → void
 *   emit_event(type_ptr, detail_ptr)  → void
 *
 * WASM exports expected:
 *   mie_init()                        → void
 *   mie_process_key(row, col, type)   → void   (type: 0=down,1=up,2=tap)
 *   mie_get_composition(buf_ptr, len) → number (bytes written)
 *   mie_get_candidates(buf_ptr, len)  → number
 *   mie_select_candidate(idx)         → void
 *   mie_reset()                       → void
 *   memory                            → WebAssembly.Memory
 */

import { MIE_Processor, InputMode } from '../core/mie-processor.js';
import { MIE_Trie }                 from '../core/mie-trie.js';
import { MIE_Timer }                from '../core/mie-timer.js';

export class MIE_Bridge extends EventTarget {
  constructor() {
    super();

    // ── JS-side implementation (Phase 1–3) ──────────────────────
    this._trie  = new MIE_Trie();
    this._timer = new MIE_Timer();
    this._jsImpl = new MIE_Processor(this._trie, this._timer);

    // ── WASM slot (Phase 4) ──────────────────────────────────────
    /** @type {WebAssembly.Instance|null} */
    this._wasm = null;
    this._useWasm = false;

    /** Simulated SRAM font buffer: uint8_t font_buffer[4096] */
    this._fontBuffer  = new Uint8Array(4096);
    /** Simulated SRAM input buffer: uint8_t input_buffer[256] */
    this._inputBuffer = new Uint8Array(256);

    // Forward JS processor events to bridge consumers
    this._forwardEvents();

    // Status
    this._dictionaryLoaded = false;
  }

  // ── Dictionary loading ───────────────────────────────────────

  /**
   * Load the phonetic dictionary.
   * Simulates RP2350 spi_flash_read() from Flash offset.
   * Accepts a JSON object or fetches from path.
   * @param {string|object} sourceOrUrl  JSON URL path or parsed object
   */
  async loadDictionary(sourceOrUrl) {
    let data;
    if (typeof sourceOrUrl === 'string') {
      const res = await fetch(sourceOrUrl);
      data = await res.json();
    } else {
      data = sourceOrUrl;
    }
    this._trie.loadFromJson(data);
    this._dictionaryLoaded = true;
    console.log('[MIE_Bridge] Dictionary loaded:', this._trie.nodeCount, 'nodes');
    this._emit('bridge:ready', { nodeCount: this._trie.nodeCount });
  }

  // ── WASM loading (Phase 4 entry point) ──────────────────────

  /**
   * Attempt to load the compiled mie_core.wasm.
   * If it fails, silently falls back to JS implementation.
   * @param {string} wasmPath  path to mie_core.wasm
   */
  async loadWasm(wasmPath) {
    try {
      const response = await fetch(wasmPath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();

      const imports = {
        env: {
          // Time source
          get_tick_ms: () => this._timer.getTickMs(),
          // Display flush from WASM framebuffer (Phase 4)
          display_flush: (x1, y1, x2, y2, colorBufPtr) => {
            this._emit('wasm:display_flush', { x1, y1, x2, y2, colorBufPtr });
          },
          // MIE event relay
          emit_composition_update: (bufPtr, candPtr) => {
            this._emit('composition:update', { wasm: true, bufPtr, candPtr });
          },
          // Memory helpers
          abort: (msg) => { throw new Error(`WASM abort: ${msg}`); },
        }
      };

      const { instance } = await WebAssembly.instantiate(buffer, imports);
      this._wasm = instance.exports;
      this._wasm.mie_init();
      this._useWasm = true;
      console.log('[MIE_Bridge] ✓ WASM module loaded — mie_core active');
      this._emit('bridge:wasm_loaded', {});
    } catch (err) {
      console.info('[MIE_Bridge] WASM unavailable, JS impl active:', err.message);
      this._useWasm = false;
    }
  }

  // ── Public API (stable across Phase 1–4) ────────────────────

  /**
   * Process a key tap event.
   * @param {{ key: object, tapCount: number }} keyEvent
   */
  processKeyTap(keyEvent) {
    if (this._useWasm && this._wasm) {
      this._wasm.mie_process_key(keyEvent.key.row, keyEvent.key.col, 2); // 2=tap
    } else {
      this._jsImpl.processKeyTap(keyEvent);
    }
  }

  /**
   * Process immediate key-down (for navigation feedback).
   * @param {{ key: object }} keyEvent
   */
  processKeyDown(keyEvent) {
    if (this._useWasm && this._wasm) {
      this._wasm.mie_process_key(keyEvent.key.row, keyEvent.key.col, 0); // 0=down
    } else {
      this._jsImpl.processKeyDown(keyEvent);
    }
  }

  /**
   * Get current composition buffer as string array.
   * @returns {string[]}
   */
  getCompositionBuffer() {
    if (this._useWasm && this._wasm) {
      // Phase 4: read from WASM linear memory
      const buf = new Uint8Array(64);
      const len = this._wasm.mie_get_composition(/* ptr */ 0, buf.length);
      return Array.from(buf.slice(0, len)).map(b => String.fromCharCode(b));
    }
    return [...this._jsImpl.compBuffer];
  }

  /**
   * Get current candidate list.
   * @returns {string[]}
   */
  getCandidates() {
    if (this._useWasm && this._wasm) {
      // Phase 4: read from WASM
      return [];
    }
    return [...this._jsImpl.candidates];
  }

  /**
   * Select a candidate by index.
   * @param {number} idx
   */
  selectCandidate(idx) {
    if (this._useWasm && this._wasm) {
      this._wasm.mie_select_candidate(idx);
    } else {
      this._jsImpl.candidateIdx = idx;
      this._jsImpl._confirmCandidate();
    }
  }

  /** Reset composition state (e.g. on focus loss) */
  reset() {
    if (this._useWasm && this._wasm) {
      this._wasm.mie_reset();
    } else {
      this._jsImpl._resetComposition();
    }
  }

  /** Cycle through input modes: ZHUYIN → ENGLISH → NUMERIC */
  cycleMode() {
    this._jsImpl._cycleMode();
  }

  get currentMode()    { return this._jsImpl.mode; }
  get inputText()      { return this._jsImpl.inputText; }
  get isWasmActive()   { return this._useWasm; }
  get isDictLoaded()   { return this._dictionaryLoaded; }

  // ── Internal helpers ─────────────────────────────────────────

  _forwardEvents() {
    const forward = (type) => {
      this._jsImpl.addEventListener(type, (e) => {
        this.dispatchEvent(new CustomEvent(type, { detail: e.detail }));
      });
    };
    ['composition:update','composition:commit','cursor:move',
     'action:back','action:menu','action:enter','action:delete',
     'mode:change'
    ].forEach(forward);
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
