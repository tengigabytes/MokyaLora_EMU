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
 * 36-key matrix definition.
 *
 * Fields:
 *   idx     : linear index  (row*6 + col)
 *   row/col : GPIO matrix   (R0–R5 / C0–C5)
 *   label   : display text  (shown on HTML button)
 *   fn      : function name (used by MIE_Processor)
 *   chars   : Zhuyin phoneme multi-tap sequence
 *   keyCode : physical keyboard binding (desktop dev)
 *   cat     : style category
 */
export const KEY_MATRIX = [
  // ── Row 0 — Numeric / Zhuyin top row ────────────────────────────
  { idx: 0,  row:0, col:0, label:'ㄅ ㄉ',    fn:'BD',    chars:['ㄅ','ㄉ'],       keyCode:'Digit1',    cat:'zhuyin' },
  { idx: 1,  row:0, col:1, label:'ˇ ˋ',      fn:'T34',   chars:['ˇ','ˋ'],         keyCode:'Digit3',    cat:'tone'   },
  { idx: 2,  row:0, col:2, label:'ㄓ ˊ',     fn:'ZHT2',  chars:['ㄓ','ˊ'],        keyCode:'Digit5',    cat:'zhuyin' },
  { idx: 3,  row:0, col:3, label:'˙ ㄚ',     fn:'T5A',   chars:['˙','ㄚ'],         keyCode:'Digit7',    cat:'zhuyin' },
  { idx: 4,  row:0, col:4, label:'ㄞㄢㄦ',   fn:'AIANR', chars:['ㄞ','ㄢ','ㄦ'],  keyCode:'Digit9',    cat:'zhuyin' },
  { idx: 5,  row:0, col:5, label:'►',          fn:'RIGHT', chars:[],               keyCode:'ArrowRight',cat:'dpad'   },

  // ── Row 1 — QWERTY top / Zhuyin second row ──────────────────────
  { idx: 6,  row:1, col:0, label:'ㄆ ㄊ',    fn:'PT',    chars:['ㄆ','ㄊ'],       keyCode:'KeyQ',      cat:'zhuyin' },
  { idx: 7,  row:1, col:1, label:'ㄍ ㄐ',    fn:'GJ',    chars:['ㄍ','ㄐ'],       keyCode:'KeyE',      cat:'zhuyin' },
  { idx: 8,  row:1, col:2, label:'ㄔ ㄗ',    fn:'CHZ',   chars:['ㄔ','ㄗ'],       keyCode:'KeyT',      cat:'zhuyin' },
  { idx: 9,  row:1, col:3, label:'ㄧ ㄛ',    fn:'IO',    chars:['ㄧ','ㄛ'],       keyCode:'KeyU',      cat:'zhuyin' },
  { idx: 10, row:1, col:4, label:'ㄟ ㄣ',    fn:'EIN',   chars:['ㄟ','ㄣ'],       keyCode:'KeyO',      cat:'zhuyin' },
  { idx: 11, row:1, col:5, label:'▼',          fn:'DOWN',  chars:[],               keyCode:'ArrowDown', cat:'dpad'   },

  // ── Row 2 — QWERTY middle / Zhuyin third row ────────────────────
  { idx: 12, row:2, col:0, label:'ㄇ ㄋ',    fn:'MN',    chars:['ㄇ','ㄋ'],       keyCode:'KeyA',      cat:'zhuyin' },
  { idx: 13, row:2, col:1, label:'ㄎ ㄑ',    fn:'KQ',    chars:['ㄎ','ㄑ'],       keyCode:'KeyD',      cat:'zhuyin' },
  { idx: 14, row:2, col:2, label:'ㄕ ㄘ',    fn:'SHC',   chars:['ㄕ','ㄘ'],       keyCode:'KeyG',      cat:'zhuyin' },
  { idx: 15, row:2, col:3, label:'ㄨ ㄜ',    fn:'UE',    chars:['ㄨ','ㄜ'],       keyCode:'KeyJ',      cat:'zhuyin' },
  { idx: 16, row:2, col:4, label:'ㄠ ㄤ',    fn:'AOANG', chars:['ㄠ','ㄤ'],       keyCode:'KeyL',      cat:'zhuyin' },
  { idx: 17, row:2, col:5, label:'SET',        fn:'SET',   chars:[],               keyCode:'F2',        cat:'func'   },

  // ── Row 3 — QWERTY bottom / Zhuyin fourth row ───────────────────
  { idx: 18, row:3, col:0, label:'ㄈ ㄌ',    fn:'FL',    chars:['ㄈ','ㄌ'],       keyCode:'KeyZ',      cat:'zhuyin' },
  { idx: 19, row:3, col:1, label:'ㄏ ㄒ',    fn:'HX',    chars:['ㄏ','ㄒ'],       keyCode:'KeyC',      cat:'zhuyin' },
  { idx: 20, row:3, col:2, label:'ㄖ ㄙ',    fn:'RS',    chars:['ㄖ','ㄙ'],       keyCode:'KeyB',      cat:'zhuyin' },
  { idx: 21, row:3, col:3, label:'ㄩ ㄝ',    fn:'YE',    chars:['ㄩ','ㄝ'],       keyCode:'KeyM',      cat:'zhuyin' },
  { idx: 22, row:3, col:4, label:'ㄡ ㄥ',    fn:'OUENG', chars:['ㄡ','ㄥ'],       keyCode:'Semicolon', cat:'zhuyin' },
  { idx: 23, row:3, col:5, label:'⌫ DEL',   fn:'DEL',   chars:[],               keyCode:'Backspace', cat:'del'    },

  // ── Row 4 — Function bottom row ─────────────────────────────────
  { idx: 24, row:4, col:0, label:'MODE',      fn:'MODE',  chars:[],               keyCode:'Tab',       cat:'mode'   },
  { idx: 25, row:4, col:1, label:'TAB',        fn:'TAB',   chars:['\t'],           keyCode:'Backquote', cat:'func'   },
  { idx: 26, row:4, col:2, label:'___',        fn:'SPACE', chars:[' '],            keyCode:'Space',     cat:'space'  },
  { idx: 27, row:4, col:3, label:'，SYM',     fn:'SYM',   chars:['，'],            keyCode:'Comma',     cat:'func'   },
  { idx: 28, row:4, col:4, label:'。.？',     fn:'PUNCT', chars:['。','.','？'],  keyCode:'Period',    cat:'func'   },
  { idx: 29, row:4, col:5, label:'VOL+',       fn:'VOLUP', chars:[],               keyCode:'Equal',     cat:'vol'    },

  // ── Row 5 — Navigation row ───────────────────────────────────────
  { idx: 30, row:5, col:0, label:'FN',         fn:'FUNC',  chars:[],               keyCode:'F1',        cat:'func'   },
  { idx: 31, row:5, col:1, label:'← BCK',    fn:'BACK',  chars:[],               keyCode:'Escape',    cat:'func'   },
  { idx: 32, row:5, col:2, label:'▲',          fn:'UP',    chars:[],               keyCode:'ArrowUp',   cat:'dpad'   },
  { idx: 33, row:5, col:3, label:'◄',          fn:'LEFT',  chars:[],               keyCode:'ArrowLeft', cat:'dpad'   },
  { idx: 34, row:5, col:4, label:'✓ OK',      fn:'OK',    chars:[],               keyCode:'Enter',     cat:'dpad'   },
  { idx: 35, row:5, col:5, label:'VOL-',       fn:'VOLDN', chars:[],               keyCode:'Minus',     cat:'vol'    },
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
    this.multiTapWindowMs = 600;
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
    // Flush any pending different-key tap immediately
    for (const [fn, entry] of this._tapCounters.entries()) {
      if (fn !== key.fn) {
        clearTimeout(entry.timerId);
        this._tapCounters.delete(fn);
        const k = KEY_MATRIX.find(k => k.fn === fn);
        if (k) {
          this.dispatchEvent(new CustomEvent('key:tap', {
            detail: { key: k, tapCount: entry.count }
          }));
        }
      }
    }

    const existing = this._tapCounters.get(key.fn);
    if (existing) {
      clearTimeout(existing.timerId);
      existing.count++;
    } else {
      this._tapCounters.set(key.fn, { count: 1, timerId: null });
    }
    const entry = this._tapCounters.get(key.fn);
    entry.timerId = setTimeout(() => {
      this._tapCounters.delete(key.fn);
      this.dispatchEvent(new CustomEvent('key:tap', {
        detail: { key, tapCount: entry.count }
      }));
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
