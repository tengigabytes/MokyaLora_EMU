/**
 * KeyboardHAL — 6×6 Matrix Keyboard Scanner
 *
 * Mirrors RP2350 GPIO matrix scan from firmware:
 *   GPIO KEY_C0–C5 (columns, driven LOW sequentially)
 *   GPIO KEY_R0–R5 (rows,    read with pull-up)
 *
 * Provides debounced key events as CustomEvents on EventTarget.
 * Event types:  'key:down'   payload: { key: KeyDef }
 *               'key:up'     payload: { key: KeyDef }
 *               'key:tap'    payload: { key: KeyDef, tapCount: number }
 *
 * Physical keyboard is also mapped for desktop development.
 *
 * Key index = row * 6 + col  (0..35)
 */

/**
 * 36-key matrix definition.
 * Each entry matches one physical key on MokyaLora hardware.
 *
 * Fields:
 *   idx     : linear index (row*6+col)
 *   row/col : matrix position (KEY_R0..R5 / KEY_C0..C5)
 *   label   : display label (shown on HTML key button)
 *   fn      : function identifier (used by MIE processor)
 *   chars   : multi-tap character sequence (index = tap count - 1)
 *   keyCode : physical keyboard binding for desktop dev
 *   category: styling category
 */
export const KEY_MATRIX = [
  // ── Row 0 — Function Row ──────────────────────────────────────
  { idx: 0,  row:0, col:0, label:'⏻',       fn:'POWER',  chars:[],                    keyCode:'F12',          cat:'func'    },
  { idx: 1,  row:0, col:1, label:'← BCK',   fn:'BACK',   chars:[],                    keyCode:'Escape',       cat:'func'    },
  { idx: 2,  row:0, col:2, label:'☰ MENU',  fn:'MENU',   chars:[],                    keyCode:'Tab',          cat:'func'    },
  { idx: 3,  row:0, col:3, label:'¯ 1st',   fn:'TONE1',  chars:['¯'],                 keyCode:'Digit1',       cat:'tone'    },
  { idx: 4,  row:0, col:4, label:'ˊ 2nd',   fn:'TONE2',  chars:['ˊ'],                 keyCode:'Digit2',       cat:'tone'    },
  { idx: 5,  row:0, col:5, label:'⌨ MODE',  fn:'MODE',   chars:[],                    keyCode:'Digit3',       cat:'mode'    },
  // ── Row 1 — Initials Group A + D-pad Up + Del ─────────────────
  { idx: 6,  row:1, col:0, label:'ㄅㄆ',    fn:'BP',     chars:['ㄅ','ㄆ'],           keyCode:'KeyA',         cat:'zhuyin'  },
  { idx: 7,  row:1, col:1, label:'ㄇㄈ',    fn:'MF',     chars:['ㄇ','ㄈ'],           keyCode:'KeyS',         cat:'zhuyin'  },
  { idx: 8,  row:1, col:2, label:'ㄉㄊ',    fn:'DT',     chars:['ㄉ','ㄊ'],           keyCode:'KeyD',         cat:'zhuyin'  },
  { idx: 9,  row:1, col:3, label:'▲',        fn:'UP',     chars:[],                    keyCode:'ArrowUp',      cat:'dpad'    },
  { idx: 10, row:1, col:4, label:'ㄋㄌ',    fn:'NL',     chars:['ㄋ','ㄌ'],           keyCode:'KeyF',         cat:'zhuyin'  },
  { idx: 11, row:1, col:5, label:'⌫ DEL',  fn:'DEL',    chars:[],                    keyCode:'Backspace',    cat:'del'     },
  // ── Row 2 — Initials Group B + D-pad Left/Right + OK ─────────
  { idx: 12, row:2, col:0, label:'ㄍㄎ',    fn:'GK',     chars:['ㄍ','ㄎ'],           keyCode:'KeyZ',         cat:'zhuyin'  },
  { idx: 13, row:2, col:1, label:'ㄏㄐ',    fn:'HJ',     chars:['ㄏ','ㄐ'],           keyCode:'KeyX',         cat:'zhuyin'  },
  { idx: 14, row:2, col:2, label:'ㄑㄒ',    fn:'QX',     chars:['ㄑ','ㄒ'],           keyCode:'KeyC',         cat:'zhuyin'  },
  { idx: 15, row:2, col:3, label:'◄',        fn:'LEFT',   chars:[],                    keyCode:'ArrowLeft',    cat:'dpad'    },
  { idx: 16, row:2, col:4, label:'✓ OK',    fn:'OK',     chars:[],                    keyCode:'Enter',        cat:'dpad'    },
  { idx: 17, row:2, col:5, label:'►',        fn:'RIGHT',  chars:[],                    keyCode:'ArrowRight',   cat:'dpad'    },
  // ── Row 3 — Initials Group C + D-pad Down + Medials + Space ──
  { idx: 18, row:3, col:0, label:'ㄓㄔ',    fn:'ZHCH',   chars:['ㄓ','ㄔ'],           keyCode:'KeyV',         cat:'zhuyin'  },
  { idx: 19, row:3, col:1, label:'ㄕㄖ',    fn:'SHR',    chars:['ㄕ','ㄖ'],           keyCode:'KeyB',         cat:'zhuyin'  },
  { idx: 20, row:3, col:2, label:'ㄗㄘㄙ',  fn:'ZCS',    chars:['ㄗ','ㄘ','ㄙ'],      keyCode:'KeyN',         cat:'zhuyin'  },
  { idx: 21, row:3, col:3, label:'▼',        fn:'DOWN',   chars:[],                    keyCode:'ArrowDown',    cat:'dpad'    },
  { idx: 22, row:3, col:4, label:'ㄧㄨㄩ',  fn:'IUY',    chars:['ㄧ','ㄨ','ㄩ'],      keyCode:'KeyG',         cat:'zhuyin'  },
  { idx: 23, row:3, col:5, label:'_SPC_',   fn:'SPACE',  chars:[' '],                 keyCode:'Space',        cat:'space'   },
  // ── Row 4 — Finals Group A + Tones 3/4 ───────────────────────
  { idx: 24, row:4, col:0, label:'ㄚㄛㄜ',  fn:'AOEH',   chars:['ㄚ','ㄛ','ㄜ'],      keyCode:'KeyH',         cat:'zhuyin'  },
  { idx: 25, row:4, col:1, label:'ㄝㄞㄟ',  fn:'EAIEI',  chars:['ㄝ','ㄞ','ㄟ'],      keyCode:'KeyJ',         cat:'zhuyin'  },
  { idx: 26, row:4, col:2, label:'ㄠㄡㄢ',  fn:'AOUANG', chars:['ㄠ','ㄡ','ㄢ'],      keyCode:'KeyK',         cat:'zhuyin'  },
  { idx: 27, row:4, col:3, label:'ㄣㄤㄥ',  fn:'ENANGEN',chars:['ㄣ','ㄤ','ㄥ'],      keyCode:'KeyL',         cat:'zhuyin'  },
  { idx: 28, row:4, col:4, label:'ˇ 3rd',   fn:'TONE3',  chars:['ˇ'],                 keyCode:'Digit5',       cat:'tone'    },
  { idx: 29, row:4, col:5, label:'ˋ 4th',   fn:'TONE4',  chars:['ˋ'],                 keyCode:'Digit6',       cat:'tone'    },
  // ── Row 5 — Finals Group B + Lang switch + Enter ─────────────
  { idx: 30, row:5, col:0, label:'ㄦ ・',   fn:'ERNN',   chars:['ㄦ','・'],            keyCode:'KeyY',         cat:'zhuyin'  },
  { idx: 31, row:5, col:1, label:'EN/中',   fn:'ENLANG', chars:[],                    keyCode:'KeyU',         cat:'mode'    },
  { idx: 32, row:5, col:2, label:'# SYM',   fn:'SYM',    chars:['#'],                 keyCode:'KeyI',         cat:'func'    },
  { idx: 33, row:5, col:3, label:'↵ ENT',   fn:'ENTER',  chars:['\n'],                keyCode:'NumpadEnter',  cat:'enter'   },
  { idx: 34, row:5, col:4, label:'˙ 5th',   fn:'TONE5',  chars:['˙'],                 keyCode:'Digit7',       cat:'tone'    },
  { idx: 35, row:5, col:5, label:'? HELP',  fn:'HELP',   chars:[],                    keyCode:'KeyO',         cat:'func'    },
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
    if (this._state[idx] === 1) return; // Already pressed (held)
    // Debounce — ignore bounces within debounceMs
    if (this._debounce.has(idx)) return;
    this._debounce.set(idx, setTimeout(() => this._debounce.delete(idx), this.debounceMs));

    this._state[idx] = 1;
    const key = KEY_MATRIX[idx];
    this.dispatchEvent(new CustomEvent('key:down', { detail: { key } }));

    // Vibration feedback (mobile)
    if (navigator.vibrate) navigator.vibrate(8);
  }

  _onKeyUp(idx) {
    if (this._state[idx] === 0) return;
    this._state[idx] = 0;
    const key = KEY_MATRIX[idx];
    this.dispatchEvent(new CustomEvent('key:up', { detail: { key } }));

    // Multi-tap counter
    this._registerTap(key);
  }

  /**
   * Multi-tap counter: each tap within multiTapWindowMs increments count.
   * After timeout, emits 'key:tap' with final tapCount.
   */
  _registerTap(key) {
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
