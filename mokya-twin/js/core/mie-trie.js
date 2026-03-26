/**
 * MIE_Trie — Zhuyin phonetic sequence lookup
 *
 * Mirrors the C-language Trie-Searcher in firmware/mie/trie-searcher.c
 * Node memory layout is kept compatible with the C struct for future WASM.
 *
 * C struct reference (approximate):
 *   typedef struct TrieNode {
 *     uint16_t children[MIE_PHONEME_COUNT];  // index into node pool
 *     uint8_t  candidate_offset;             // into candidates_pool[]
 *     uint8_t  candidate_count;
 *     bool     is_terminal;
 *   } TrieNode;
 *
 * JS uses Map-based children for flexibility during prototyping.
 * Phase 4 converts this to a flat ArrayBuffer matching the C layout.
 */

/** Single trie node */
class MIE_TrieNode {
  constructor() {
    /** @type {Map<string, MIE_TrieNode>} phoneme → child node */
    this.children = new Map();
    /** @type {string[]} candidate characters at this node */
    this.candidates = [];
    /** Terminal node (valid complete phonetic sequence) */
    this.isTerminal = false;
  }
}

export class MIE_Trie {
  constructor() {
    this.root = new MIE_TrieNode();
    this._nodeCount = 1;
  }

  /**
   * Insert a phonetic sequence and its candidates.
   * @param {string[]} sequence  e.g. ["ㄅ","ㄚ","ˋ"]
   * @param {string[]} candidates  e.g. ["爸","霸","罷"]
   */
  insert(sequence, candidates) {
    let node = this.root;
    for (const phoneme of sequence) {
      if (!node.children.has(phoneme)) {
        node.children.set(phoneme, new MIE_TrieNode());
        this._nodeCount++;
      }
      node = node.children.get(phoneme);
    }
    node.isTerminal = true;
    // Merge candidates (dedup)
    const set = new Set([...node.candidates, ...candidates]);
    node.candidates = Array.from(set);
  }

  /**
   * Exact sequence search.
   * @param {string[]} sequence
   * @returns {{ found: boolean, candidates: string[], node: MIE_TrieNode|null }}
   */
  search(sequence) {
    const node = this._walk(sequence);
    if (!node || !node.isTerminal) return { found: false, candidates: [], node: null };
    return { found: true, candidates: node.candidates, node };
  }

  /**
   * Prefix search — returns all candidates reachable from prefix.
   * Used for progressive composition display.
   * @param {string[]} prefix
   * @returns {{ reachable: boolean, candidates: string[] }}
   */
  startsWith(prefix) {
    const node = this._walk(prefix);
    if (!node) return { reachable: false, candidates: [] };
    const candidates = [];
    this._collectCandidates(node, candidates, 20);
    return { reachable: true, candidates };
  }

  /** Internal: walk trie following sequence, return final node or null */
  _walk(sequence) {
    let node = this.root;
    for (const phoneme of sequence) {
      if (!node.children.has(phoneme)) return null;
      node = node.children.get(phoneme);
    }
    return node;
  }

  /** Internal: DFS collect up to maxCount candidates from subtree */
  _collectCandidates(node, out, maxCount) {
    if (out.length >= maxCount) return;
    out.push(...node.candidates.slice(0, maxCount - out.length));
    for (const child of node.children.values()) {
      if (out.length >= maxCount) break;
      this._collectCandidates(child, out, maxCount);
    }
  }

  /**
   * Load entries from the mock JSON dictionary.
   * Simulates reading the Trie from RP2350 Flash (spi_flash_read).
   * @param {object} jsonData  parsed zhuyin-mock.json
   */
  loadFromJson(jsonData) {
    if (!jsonData?.entries) return;
    let loaded = 0;
    for (const entry of jsonData.entries) {
      if (entry.phonetic && entry.candidates) {
        this.insert(entry.phonetic, entry.candidates);
        loaded++;
      }
    }
    console.log(`[MIE_Trie] Loaded ${loaded} entries, ${this._nodeCount} nodes`);
  }

  /**
   * Serialize trie to a flat Uint8Array (Phase 4 compatibility).
   * Produces a binary blob that can be mmapped by WASM mie_trie_load_blob().
   * Currently a stub — real implementation in Phase 4.
   * @returns {Uint8Array}
   */
  toArrayBuffer() {
    // Phase 4 stub: encode node pool as flat binary
    const header = new Uint8Array(8);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x4D494554, false); // magic "MIET"
    view.setUint32(4, this._nodeCount, true);
    return header; // Placeholder
  }

  get nodeCount() { return this._nodeCount; }
}
