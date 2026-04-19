/**
 * KeyboardHAL — MokyaLora hardware keyboard matrix scanner
 *
 * Matches actual PCB layout:
 *   - 5×5 core input area  (R0–R4, C0–C4) = 25 keys
 *   - C5 column nav keys   (R0–R4, C5)    = 5 keys
 *   - R5 navigation row    (R5, C0–C5)    = 6 keys
 *   Total: 36 keys  (6 × 6 GPIO matrix)
 *
 * Physical layout overview:
 *
 *   Core input (5 cols × 4 Zhuyin rows + 1 fn row):
 *     R0:  ㄅㄉ │ ˇˋ  │ ㄓˊ │ ˙ㄚ │ ㄞㄢㄦ  ║ ►
 *     R1:  ㄆㄊ │ ㄍㄐ │ ㄔㄗ│ ㄧㄛ│ ㄟㄣ   ║ ▼
 *     R2:  ㄇㄋ │ ㄎㄑ │ ㄕㄘ│ ㄨㄜ│ ㄠㄤ   ║ SET
 *     R3:  ㄈㄌ │ ㄏㄒ │ ㄖㄙ│ ㄩㄝ│ ㄡㄥ   ║ DEL
 *     R4:  MODE │ TAB  │ SPC │ ，  │ 。.？  ║ VOL+
 *   ─────────────────────────────────────────────
 *     R5:  FUNC │ BCK  │  ▲  │  ◄  │  OK    ║ VOL-
 *
 * ZHUYIN mode: key.chars contains phoneme sequence (multi-tap)
 * ENGLISH mode: ENGLISH_CHARS map in mie-processor.js provides Latin chars
 * SPACE = tone 1 (¯) when a phoneme is pending; otherwise literal space
 * OK    = confirm candidate OR send message when idle
 */

/**
 * Canonical MokyaLora keycodes — mirrors firmware/mie/include/mie/keycode.h.
 * The MIE bridge passes these straight to mie_key(); a future USB Control
 * channel can inject the same values so a host app drives real hardware
 * with zero translation.
 *
 * Note: the EMU rearranges the D-pad / FUNC / BACK / SET buttons relative
 * to the firmware's row-major matrix layout, so the keycode for a given
 * EMU (row, col) cell is NOT row*6+col+1 for those repositioned slots.
 * Refer to MOKYA_KEY_* by name; numeric values are an internal convention.
 */
export const KEYCODE = {
  NONE:    0x00,
  KEY_1:   0x01, KEY_3:  0x02, KEY_5:  0x03, KEY_7:  0x04, KEY_9:  0x05, FUNC:    0x06,
  KEY_Q:   0x07, KEY_E:  0x08, KEY_T:  0x09, KEY_U:  0x0A, KEY_O:  0x0B, SET:     0x0C,
  KEY_A:   0x0D, KEY_D:  0x0E, KEY_G:  0x0F, KEY_J:  0x10, KEY_L:  0x11, BACK:    0x12,
  KEY_Z:   0x13, KEY_C:  0x14, KEY_B:  0x15, KEY_M:  0x16, KEY_BACKSLASH: 0x17, DEL: 0x18,
  MODE:    0x19, TAB:    0x1A, SPACE:  0x1B, SYM1:   0x1C, SYM2:   0x1D, VOL_UP:  0x1E,
  UP:      0x1F, DOWN:   0x20, LEFT:   0x21, RIGHT:  0x22, OK:     0x23, VOL_DOWN:0x24,
  POWER:   0x25,
};

/**
 * 36-key matrix definition.
 *
 * Fields:
 *   idx     : linear index  (row*6 + col)
 *   row/col : EMU grid position (R0–R5 / C0–C5; nav keys are repositioned
 *             vs. the firmware matrix — see keycode below for the canonical
 *             firmware identifier)
 *   keycode : firmware MOKYA_KEY_* value (passed straight to mie_key)
 *   label   : display text  (shown on HTML button)
 *   fn      : legacy semantic name (UI screens still test e.g. key.fn === 'UP')
 *   chars   : Zhuyin phoneme multi-tap sequence
 *   keyCode : physical keyboard binding (desktop dev)
 *   cat     : style category
 */
export const KEY_MATRIX = [
  // ── Row 0 — Numeric / Zhuyin top row ────────────────────────────
  { idx: 0,  row:0, col:0, keycode:KEYCODE.KEY_1, label:'ㄅ ㄉ',  label2:'1 2', label3:'ANS', fn:'BD',    chars:['ㄅ','ㄉ'],      keyCode:'Digit1',    cat:'zhuyin' },
  { idx: 1,  row:0, col:1, keycode:KEYCODE.KEY_3, label:'ˇ ˋ',    label2:'3 4', label3:'7',   fn:'T34',   chars:['ˇ','ˋ'],        keyCode:'Digit3',    cat:'tone'   },
  { idx: 2,  row:0, col:2, keycode:KEYCODE.KEY_5, label:'ㄓ ˊ',   label2:'5 6', label3:'8',   fn:'ZHT2',  chars:['ㄓ','ˊ'],       keyCode:'Digit5',    cat:'zhuyin' },
  { idx: 3,  row:0, col:3, keycode:KEYCODE.KEY_7, label:'˙ ㄚ',   label2:'7 8', label3:'9',   fn:'T5A',   chars:['˙','ㄚ'],        keyCode:'Digit7',    cat:'zhuyin' },
  { idx: 4,  row:0, col:4, keycode:KEYCODE.KEY_9, label:'ㄞㄢㄦ', label2:'9 0', label3:'÷',   fn:'AIANR', chars:['ㄞ','ㄢ','ㄦ'], keyCode:'Digit9',    cat:'zhuyin' },
  { idx: 5,  row:0, col:5, keycode:KEYCODE.RIGHT, label:'►',                                   fn:'RIGHT', chars:[],               keyCode:'ArrowRight',cat:'dpad'   },

  // ── Row 1 — QWERTY top / Zhuyin second row ──────────────────────
  { idx: 6,  row:1, col:0, keycode:KEYCODE.KEY_Q, label:'ㄆ ㄊ',  label2:'Q W', label3:'(',   fn:'PT',    chars:['ㄆ','ㄊ'],      keyCode:'KeyQ',      cat:'zhuyin' },
  { idx: 7,  row:1, col:1, keycode:KEYCODE.KEY_E, label:'ㄍ ㄐ',  label2:'E R', label3:'4',   fn:'GJ',    chars:['ㄍ','ㄐ'],      keyCode:'KeyE',      cat:'zhuyin' },
  { idx: 8,  row:1, col:2, keycode:KEYCODE.KEY_T, label:'ㄔ ㄗ',  label2:'T Y', label3:'5',   fn:'CHZ',   chars:['ㄔ','ㄗ'],      keyCode:'KeyT',      cat:'zhuyin' },
  { idx: 9,  row:1, col:3, keycode:KEYCODE.KEY_U, label:'ㄧ ㄛ',  label2:'U I', label3:'6',   fn:'IO',    chars:['ㄧ','ㄛ'],      keyCode:'KeyU',      cat:'zhuyin' },
  { idx: 10, row:1, col:4, keycode:KEYCODE.KEY_O, label:'ㄟ ㄣ',  label2:'O P', label3:'×',   fn:'EIN',   chars:['ㄟ','ㄣ'],      keyCode:'KeyO',      cat:'zhuyin' },
  { idx: 11, row:1, col:5, keycode:KEYCODE.DOWN,  label:'▼',                                   fn:'DOWN',  chars:[],               keyCode:'ArrowDown', cat:'dpad'   },

  // ── Row 2 — QWERTY middle / Zhuyin third row ────────────────────
  { idx: 12, row:2, col:0, keycode:KEYCODE.KEY_A, label:'ㄇ ㄋ',  label2:'A S', label3:')',   fn:'MN',    chars:['ㄇ','ㄋ'],      keyCode:'KeyA',      cat:'zhuyin' },
  { idx: 13, row:2, col:1, keycode:KEYCODE.KEY_D, label:'ㄎ ㄑ',  label2:'D F', label3:'1',   fn:'KQ',    chars:['ㄎ','ㄑ'],      keyCode:'KeyD',      cat:'zhuyin' },
  { idx: 14, row:2, col:2, keycode:KEYCODE.KEY_G, label:'ㄕ ㄘ',  label2:'G H', label3:'2',   fn:'SHC',   chars:['ㄕ','ㄘ'],      keyCode:'KeyG',      cat:'zhuyin' },
  { idx: 15, row:2, col:3, keycode:KEYCODE.KEY_J, label:'ㄨ ㄜ',  label2:'J K', label3:'3',   fn:'UE',    chars:['ㄨ','ㄜ'],      keyCode:'KeyJ',      cat:'zhuyin' },
  { idx: 16, row:2, col:4, keycode:KEYCODE.KEY_L, label:'ㄠ ㄤ',  label2:'L',   label3:'-',   fn:'AOANG', chars:['ㄠ','ㄤ'],      keyCode:'KeyL',      cat:'zhuyin' },
  { idx: 17, row:2, col:5, keycode:KEYCODE.SET,   label:'SET',                                 fn:'SET',   chars:[],               keyCode:'F2',        cat:'func'   },

  // ── Row 3 — QWERTY bottom / Zhuyin fourth row ───────────────────
  { idx: 18, row:3, col:0, keycode:KEYCODE.KEY_Z, label:'ㄈ ㄌ',  label2:'Z X', label3:'AC',  fn:'FL',    chars:['ㄈ','ㄌ'],      keyCode:'KeyZ',      cat:'zhuyin' },
  { idx: 19, row:3, col:1, keycode:KEYCODE.KEY_C, label:'ㄏ ㄒ',  label2:'C V', label3:'0',   fn:'HX',    chars:['ㄏ','ㄒ'],      keyCode:'KeyC',      cat:'zhuyin' },
  { idx: 20, row:3, col:2, keycode:KEYCODE.KEY_B, label:'ㄖ ㄙ',  label2:'B N', label3:'.',   fn:'RS',    chars:['ㄖ','ㄙ'],      keyCode:'KeyB',      cat:'zhuyin' },
  { idx: 21, row:3, col:3, keycode:KEYCODE.KEY_M, label:'ㄩ ㄝ',  label2:'M',   label3:'xⁿ',  fn:'YE',    chars:['ㄩ','ㄝ'],      keyCode:'KeyM',      cat:'zhuyin' },
  { idx: 22, row:3, col:4, keycode:KEYCODE.KEY_BACKSLASH, label:'ㄡ ㄥ', label2:'--', label3:'+', fn:'OUENG', chars:['ㄡ','ㄥ'], keyCode:'Semicolon', cat:'zhuyin' },
  { idx: 23, row:3, col:5, keycode:KEYCODE.DEL,   label:'⌫ DEL',                              fn:'DEL',   chars:[],               keyCode:'Backspace', cat:'del'    },

  // ── Row 4 — Function bottom row ─────────────────────────────────
  { idx: 24, row:4, col:0, keycode:KEYCODE.MODE,  label:'MODE',                               fn:'MODE',  chars:[],               keyCode:'Tab',       cat:'mode'   },
  { idx: 25, row:4, col:1, keycode:KEYCODE.TAB,   label:'TAB',                                fn:'TAB',   chars:['\t'],           keyCode:'Backquote', cat:'func'   },
  { idx: 26, row:4, col:2, keycode:KEYCODE.SPACE, label:'SPC',                                fn:'SPACE', chars:[' '],            keyCode:'Space',     cat:'space'  },
  { idx: 27, row:4, col:3, keycode:KEYCODE.SYM1,  label:'SYM',   label2:'，',                 fn:'SYM',   chars:['，'],            keyCode:'Comma',     cat:'func'   },
  { idx: 28, row:4, col:4, keycode:KEYCODE.SYM2,  label:'。.？',                             fn:'PUNCT', chars:['。','.','？'],  keyCode:'Period',    cat:'func'   },
  { idx: 29, row:4, col:5, keycode:KEYCODE.VOL_UP, label:'VOL+',                              fn:'VOLUP', chars:[],               keyCode:'Equal',     cat:'vol'    },

  // ── Row 5 — Navigation row ───────────────────────────────────────
  { idx: 30, row:5, col:0, keycode:KEYCODE.FUNC, label:'FN',                                  fn:'FUNC',  chars:[],               keyCode:'F1',        cat:'func'   },
  { idx: 31, row:5, col:1, keycode:KEYCODE.BACK, label:'BCK',                                 fn:'BACK',  chars:[],               keyCode:'Escape',    cat:'func'   },
  { idx: 32, row:5, col:2, keycode:KEYCODE.UP,   label:'▲',                                   fn:'UP',    chars:[],               keyCode:'ArrowUp',   cat:'dpad'   },
  { idx: 33, row:5, col:3, keycode:KEYCODE.LEFT, label:'◄',                                   fn:'LEFT',  chars:[],               keyCode:'ArrowLeft', cat:'dpad'   },
  { idx: 34, row:5, col:4, keycode:KEYCODE.OK,   label:'✓ OK',                               fn:'OK',    chars:[],               keyCode:'Enter',     cat:'dpad'   },
  { idx: 35, row:5, col:5, keycode:KEYCODE.VOL_DOWN, label:'VOL-',                            fn:'VOLDN', chars:[],               keyCode:'Minus',     cat:'vol'    },
];

/** Lookup by function name */
export const KEY_BY_FN = Object.fromEntries(KEY_MATRIX.map(k => [k.fn, k]));

/** Lookup by physical keyCode */
export const KEY_BY_CODE = Object.fromEntries(
  KEY_MATRIX.filter(k => k.keyCode).map(k => [k.keyCode, k])
);

export class KeyboardHAL extends EventTarget {
  constructor() {
    super();
    /** Current matrix state: 1 = pressed, 0 = released */
    this._state = new Uint8Array(36);
    /** Debounce timer handles per key */
    this._debounce = new Map();
    /** Multi-tap tracking per key function */
    this._tapCounters = new Map(); // fn → { count, timerId }
    /** Multi-tap confirmation window (ms) */
    this.multiTapWindowMs = 300;
    /** Debounce delay (mirrors RP2350 ~20ms) */
    this.debounceMs = 20;

    this._physicalKeyHandler = null;
  }

  /** Bind physical keyboard for desktop development */
  bindPhysicalKeyboard() {
    this._physicalKeyHandler = (e) => {
      if (e.repeat) return;
      const key = KEY_BY_CODE[e.code];
      if (!key) return;
      e.preventDefault();
      if (e.type === 'keydown') this._onKeyDown(key.idx);
      else                       this._onKeyUp(key.idx);
    };
    document.addEventListener('keydown', this._physicalKeyHandler);
    document.addEventListener('keyup',   this._physicalKeyHandler);
  }

  unbindPhysicalKeyboard() {
    if (this._physicalKeyHandler) {
      document.removeEventListener('keydown', this._physicalKeyHandler);
      document.removeEventListener('keyup',   this._physicalKeyHandler);
    }
  }

  /**
   * Called by UI when an HTML key button is pressed/released.
   * @param {number} keyIdx  0–35
   * @param {'down'|'up'} type
   */
  handleButtonEvent(keyIdx, type) {
    if (type === 'down') this._onKeyDown(keyIdx);
    else                  this._onKeyUp(keyIdx);
  }

  _onKeyDown(idx) {
    if (this._state[idx] === 1) return;
    if (this._debounce.has(idx)) return;
    this._debounce.set(idx, setTimeout(() => this._debounce.delete(idx), this.debounceMs));

    this._state[idx] = 1;
    const key = KEY_MATRIX[idx];
    this.dispatchEvent(new CustomEvent('key:down', { detail: { key } }));

    if (navigator.vibrate) navigator.vibrate(8);
  }

  _onKeyUp(idx) {
    if (this._state[idx] === 0) return;
    this._state[idx] = 0;
    const key = KEY_MATRIX[idx];
    this.dispatchEvent(new CustomEvent('key:up', { detail: { key } }));
    this._registerTap(key);
  }

  /**
   * Multi-tap counter: each tap within multiTapWindowMs increments count.
   * A tap on a DIFFERENT key flushes the pending tap immediately.
   */
  _registerTap(key) {
    // A tap on a different key clears the other key's pending counter
    // (its event was already fired immediately, so no re-dispatch needed)
    for (const [fn, entry] of this._tapCounters.entries()) {
      if (fn !== key.fn) {
        clearTimeout(entry.timerId);
        this._tapCounters.delete(fn);
      }
    }

    // All keys fire key:tap immediately — no wait needed for single/no-char keys
    if (key.chars.length <= 1) {
      this.dispatchEvent(new CustomEvent('key:tap', { detail: { key, tapCount: 1 } }));
      return;
    }

    // Multi-char keys: increment counter and fire immediately with current count.
    // A subsequent tap within multiTapWindowMs will fire again with count+1,
    // letting MIE cycle to the next character (replaces previous output).
    const existing = this._tapCounters.get(key.fn);
    if (existing) {
      clearTimeout(existing.timerId);
      existing.count++;
    } else {
      this._tapCounters.set(key.fn, { count: 1, timerId: null });
    }
    const entry = this._tapCounters.get(key.fn);

    // Fire immediately — gives instant visual feedback on every tap
    this.dispatchEvent(new CustomEvent('key:tap', {
      detail: { key, tapCount: entry.count }
    }));

    // After the window expires with no further taps, clean up the counter
    entry.timerId = setTimeout(() => {
      this._tapCounters.delete(key.fn);
    }, this.multiTapWindowMs);
  }

  /** Check if a key is currently held */
  isPressed(fn) {
    const key = KEY_BY_FN[fn];
    return key ? this._state[key.idx] === 1 : false;
  }

  /** Raw matrix state (Uint8Array[36]) — mirrors gpio_get() reads */
  get matrixState() { return this._state; }
}
