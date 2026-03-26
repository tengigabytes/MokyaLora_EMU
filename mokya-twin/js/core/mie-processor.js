/**
 * MIE_Processor — MokyaInput Engine State Machine
 *
 * Phase 1: skeleton with all states wired up, basic multi-tap routing.
 * Phase 2: full Zhuyin composition, trie lookup, candidate navigation.
 *
 * Input mode state machine:
 *
 *   ZHUYIN  ──MODE──► ENGLISH ──MODE──► NUMERIC ──MODE──► ZHUYIN
 *
 * Zhuyin composition state machine (per syllable):
 *
 *   IDLE ─initial key─► INITIAL ─medial/final key─► MEDIAL/FINAL
 *        ◄──commit──────          ─tone key──────►  TONE ─►commit─► IDLE
 *        ◄──timeout─────── (multi-tap window expires)
 *
 * Events emitted (CustomEvent on EventTarget):
 *   'composition:update'  { buffer: string[], candidates: string[], state }
 *   'composition:commit'  { text: string }
 *   'cursor:move'         { direction: 'up'|'down'|'left'|'right' }
 *   'action:back'
 *   'action:menu'
 *   'action:enter'
 *   'action:delete'
 */

import { MIE_Trie }  from './mie-trie.js';
import { MIE_Timer } from './mie-timer.js';

/** Input modes */
export const InputMode = Object.freeze({
  ZHUYIN:  'ZHUYIN',
  ENGLISH: 'ENGLISH',
  NUMERIC: 'NUMERIC',
  SYMBOL:  'SYMBOL',
});

/** Zhuyin composition states */
export const CompositionState = Object.freeze({
  IDLE:      'IDLE',       // No pending phoneme
  INITIAL:   'INITIAL',    // Has initial consonant (聲母)
  MEDIAL:    'MEDIAL',     // Has medial (介音 ㄧ/ㄨ/ㄩ)
  FINAL:     'FINAL',      // Has final vowel (韻母)
  TONE:      'TONE',       // Tone mark entered, ready to commit
  MULTI_TAP: 'MULTI_TAP',  // Mid multi-tap cycle on a key
  SELECTING: 'SELECTING',  // Browsing candidate list
});

/** Which phoneme category a symbol belongs to */
const PHONEME_CATEGORY = {
  // Initials (聲母)
  ㄅ:'initial', ㄆ:'initial', ㄇ:'initial', ㄈ:'initial',
  ㄉ:'initial', ㄊ:'initial', ㄋ:'initial', ㄌ:'initial',
  ㄍ:'initial', ㄎ:'initial', ㄏ:'initial',
  ㄐ:'initial', ㄑ:'initial', ㄒ:'initial',
  ㄓ:'initial', ㄔ:'initial', ㄕ:'initial', ㄖ:'initial',
  ㄗ:'initial', ㄘ:'initial', ㄙ:'initial',
  // Medials (介音)
  ㄧ:'medial', ㄨ:'medial', ㄩ:'medial',
  // Finals (韻母)
  ㄚ:'final', ㄛ:'final', ㄜ:'final', ㄝ:'final',
  ㄞ:'final', ㄟ:'final', ㄠ:'final', ㄡ:'final',
  ㄢ:'final', ㄣ:'final', ㄤ:'final', ㄥ:'final', ㄦ:'final',
  // Tones (聲調)
  '¯':'tone', 'ˊ':'tone', 'ˇ':'tone', 'ˋ':'tone', '˙':'tone', '・':'tone',
};

export class MIE_Processor extends EventTarget {
  /**
   * @param {MIE_Trie}  trie   Loaded phonetic dictionary
   * @param {MIE_Timer} timer  RP2350 timer simulator
   */
  constructor(trie, timer) {
    super();
    this._trie      = trie;
    this._timer     = timer;

    /** Current input mode */
    this.mode = InputMode.ZHUYIN;

    /** Zhuyin composition state */
    this.compState = CompositionState.IDLE;

    /**
     * Active phoneme buffer (current syllable being composed).
     * e.g. ["ㄅ", "ㄚ"] — initial + final, awaiting tone
     * Max 3 slots: [initial?, medial/final?, tone?]
     * @type {string[]}
     */
    this.compBuffer = [];

    /**
     * Current candidate list from trie lookup.
     * @type {string[]}
     */
    this.candidates = [];

    /** Selected candidate index */
    this.candidateIdx = 0;

    /** Committed text buffer (simulates uint8_t input_buffer[256] in SRAM) */
    this._inputBuffer = new Uint8Array(256);
    this._inputBufferLen = 0;
    this._committed = ''; // JS string mirror

    /** Multi-tap: last key fn that was tapped and its current char index */
    this._multiTapFn   = null;
    this._multiTapIdx  = 0;
    this._multiTapTimer = -1;

    /** Auto-commit timer ID */
    this._autoCommitTimer = -1;
  }

  /**
   * Main entry point: process a key tap event from KeyboardHAL.
   * @param {{ key: import('../hal/keyboard-hal.js').KeyDef, tapCount: number }} event
   */
  processKeyTap({ key, tapCount }) {
    const fn = key.fn;

    // Navigation keys — mode-independent
    if (['UP','DOWN','LEFT','RIGHT'].includes(fn)) {
      this._emit('cursor:move', { direction: fn.toLowerCase() });
      return;
    }
    if (fn === 'OK')    { this._confirmCandidate(); return; }
    if (fn === 'BACK')  { this._emit('action:back', {}); return; }
    if (fn === 'MENU')  { this._emit('action:menu', {}); return; }
    if (fn === 'ENTER') { this._commitAndSend(); return; }
    if (fn === 'DEL')   { this._delete(); return; }
    if (fn === 'SPACE') { this._appendChar(' '); return; }
    if (fn === 'POWER') { /* handled by app */ return; }
    if (fn === 'HELP')  { /* handled by app */ return; }

    // Mode switch
    if (fn === 'MODE' || fn === 'ENLANG') { this._cycleMode(); return; }

    // Tone keys — only meaningful in ZHUYIN mode
    if (fn.startsWith('TONE') && this.mode === InputMode.ZHUYIN) {
      this._applyTone(key.chars[0]); return;
    }

    // Character input — route by mode
    switch (this.mode) {
      case InputMode.ZHUYIN:   this._handleZhuyinKey(key, tapCount); break;
      case InputMode.ENGLISH:  this._handleEnglishKey(key, tapCount); break;
      case InputMode.NUMERIC:  this._handleNumericKey(key, tapCount); break;
      default: break;
    }
  }

  /** Also accept raw key:down for immediate feedback (navigation keys) */
  processKeyDown({ key }) {
    // Immediate action for nav keys (no tap delay)
    if (['UP','DOWN','LEFT','RIGHT'].includes(key.fn)) {
      this._emit('cursor:move', { direction: key.fn.toLowerCase() });
    }
  }

  // ── Zhuyin input ──────────────────────────────────────────────

  _handleZhuyinKey(key, tapCount) {
    if (!key.chars.length) return;
    // Multi-tap: cycle through characters on this key
    const charIdx = (tapCount - 1) % key.chars.length;
    const phoneme = key.chars[charIdx];
    const cat = PHONEME_CATEGORY[phoneme];

    if (!cat) return; // Unknown phoneme

    if (cat === 'tone') {
      this._applyTone(phoneme);
      return;
    }

    // Cancel pending auto-commit if we're still composing
    this._timer.cancelAlarm(this._autoCommitTimer);

    // Determine where to place this phoneme in the buffer
    // Rule: initial → medial → final (each can be replaced if same category)
    this._setPhoneme(cat, phoneme);

    // Query trie for partial prefix
    const { reachable, candidates } = this._trie.startsWith(this.compBuffer);
    this.candidates    = reachable ? candidates : [];
    this.candidateIdx  = 0;
    this.compState     = cat === 'initial' ? CompositionState.INITIAL
                       : cat === 'medial'  ? CompositionState.MEDIAL
                       :                     CompositionState.FINAL;

    this._emitComposition();

    // Auto-commit if trie has only one match and tone is implicit
    if (this.candidates.length === 1 && !this._hasSlot('tone')) {
      this._autoCommitTimer = this._timer.addAlarmInMs(1200, () => {
        if (this.compBuffer.length) this._applyTone('˙'); // neutral tone
      });
    }
  }

  _applyTone(toneChar) {
    this._timer.cancelAlarm(this._autoCommitTimer);
    if (this.compBuffer.length === 0) return; // Nothing to tonify

    // Remove existing tone if any
    this.compBuffer = this.compBuffer.filter(p => PHONEME_CATEGORY[p] !== 'tone');
    this.compBuffer.push(toneChar);
    this.compState = CompositionState.TONE;

    // Lookup full sequence
    const { found, candidates } = this._trie.search(this.compBuffer);
    this.candidates   = found ? candidates : this._phonemesToRaw();
    this.candidateIdx = 0;

    this._emitComposition();

    // Auto-select first candidate after 400ms if not navigating
    this._autoCommitTimer = this._timer.addAlarmInMs(400, () => {
      this._confirmCandidate();
    });
  }

  _setPhoneme(category, phoneme) {
    // Remove existing phoneme of same category
    this.compBuffer = this.compBuffer.filter(p => PHONEME_CATEGORY[p] !== category);
    // Insert at correct position: initial, medial, final, tone
    const ORDER = ['initial','medial','final','tone'];
    const pos = ORDER.indexOf(category);
    // Find insertion index
    let insertAt = this.compBuffer.length;
    for (let i = 0; i < this.compBuffer.length; i++) {
      if (ORDER.indexOf(PHONEME_CATEGORY[this.compBuffer[i]]) > pos) {
        insertAt = i; break;
      }
    }
    this.compBuffer.splice(insertAt, 0, phoneme);
  }

  _hasSlot(category) {
    return this.compBuffer.some(p => PHONEME_CATEGORY[p] === category);
  }

  _phonemesToRaw() {
    // No trie match — return raw phonemes as single candidate
    return [this.compBuffer.join('')];
  }

  _confirmCandidate() {
    this._timer.cancelAlarm(this._autoCommitTimer);
    if (this.compBuffer.length === 0) return;
    const text = this.candidates[this.candidateIdx] ?? this.compBuffer.join('');
    this.compBuffer   = [];
    this.candidates   = [];
    this.candidateIdx = 0;
    this.compState    = CompositionState.IDLE;
    this._appendChar(text);
    this._emit('composition:commit', { text });
    this._emitComposition();
  }

  // ── English / Numeric input ───────────────────────────────────

  _handleEnglishKey(key, tapCount) {
    // In English mode, multi-tap cycles through a–z mappings on Zhuyin keys
    // This is a Phase 2 feature; Phase 1 just logs
    const charIdx = (tapCount - 1) % Math.max(key.chars.length, 1);
    const ch = key.chars[charIdx];
    if (ch) this._appendChar(ch);
  }

  _handleNumericKey(key, tapCount) {
    // Numeric: only digits
    const digits = '0123456789';
    const ch = digits[key.idx % 10];
    if (ch) this._appendChar(ch);
  }

  // ── Buffer management ─────────────────────────────────────────

  _appendChar(ch) {
    this._committed += ch;
    this._emit('composition:update', {
      buffer: this.compBuffer,
      candidates: this.candidates,
      state: this.compState,
      committed: this._committed,
    });
  }

  _delete() {
    this._timer.cancelAlarm(this._autoCommitTimer);
    if (this.compBuffer.length > 0) {
      // Delete last phoneme in composition
      this.compBuffer.pop();
      if (this.compBuffer.length === 0) this.compState = CompositionState.IDLE;
      const { reachable, candidates } = this._trie.startsWith(this.compBuffer);
      this.candidates = reachable ? candidates : [];
      this._emitComposition();
    } else if (this._committed.length > 0) {
      // Delete last committed char
      this._committed = this._committed.slice(0, -1);
      this._emit('composition:update', {
        buffer: [], candidates: [], state: CompositionState.IDLE,
        committed: this._committed,
      });
    }
  }

  _commitAndSend() {
    if (this.compBuffer.length > 0) this._confirmCandidate();
    const text = this._committed;
    this._committed = '';
    this._inputBufferLen = 0;
    this._emit('action:enter', { text });
  }

  _cycleMode() {
    const modes = [InputMode.ZHUYIN, InputMode.ENGLISH, InputMode.NUMERIC];
    const next = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this._resetComposition();
    this.mode = next;
    this._emit('mode:change', { mode: next });
  }

  _resetComposition() {
    this._timer.cancelAlarm(this._autoCommitTimer);
    this.compBuffer   = [];
    this.candidates   = [];
    this.candidateIdx = 0;
    this.compState    = CompositionState.IDLE;
  }

  // ── Helpers ───────────────────────────────────────────────────

  _emitComposition() {
    this._emit('composition:update', {
      buffer:     this.compBuffer,
      candidates: this.candidates,
      state:      this.compState,
      committed:  this._committed,
    });
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Current input line text (composition + committed) */
  get inputText() {
    return this._committed + (this.compBuffer.length ? this.compBuffer.join('') : '');
  }
}
