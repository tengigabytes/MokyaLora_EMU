#!/usr/bin/env python3
"""
mock_to_mied.py — Convert zhuyin-mock.json to MIED v2 binary
=============================================================
Produces dict_dat.bin + dict_values.bin compatible with firmware
TrieSearcher (trie_searcher.cpp) and mie_wasm_glue.cpp.

Usage:
  python mock_to_mied.py \
      --input  mokya-twin/data/zhuyin-mock.json \
      --output mokya-twin/data/

Output files:
  dict_dat.bin    key-sequence index (MIED v2 header + index + keys)
  dict_values.bin word candidates pool

MIED v2 format (from firmware gen_dict.py):
  dict_dat.bin:
    Header (16 bytes LE):
      magic[4]="MIED" version:u16=2 flags:u16=0
      key_count:u32 keys_data_off:u32
    Index  (key_count x 8 bytes):
      key_data_off:u32  val_data_off:u32
    Keys section (variable):
      key_len:u8  key_bytes[key_len]   -- sorted ascending by key bytes

  dict_values.bin:
    ValueRecord per key (at val_data_off):
      word_count:u16
      per word: freq:u16  tone:u8  word_len:u8  word_utf8[word_len]
"""

import json, struct, sys, argparse
from collections import defaultdict
from pathlib import Path

MAGIC   = b"MIED"
VERSION = 2
KEY_OFFSET = 0x21  # key_byte = key_index + 0x21

# ── Hardware keymap: phoneme → key_index (0–19) ──────────────────────────────
# Matches firmware ime_keys.cpp and gen_dict.py PHONEME_TO_KEY
_KEYMAP_RAW = [
    (0,  'ㄅ', 'ㄉ'),
    (1,  'ˇ',  'ˋ'),
    (2,  'ㄓ', 'ˊ'),
    (3,  '˙',  'ㄚ'),
    (4,  'ㄞ', 'ㄢ', 'ㄦ'),
    (5,  'ㄆ', 'ㄊ'),
    (6,  'ㄍ', 'ㄐ'),
    (7,  'ㄔ', 'ㄗ'),
    (8,  'ㄧ', 'ㄛ'),
    (9,  'ㄟ', 'ㄣ'),
    (10, 'ㄇ', 'ㄋ'),
    (11, 'ㄎ', 'ㄑ'),
    (12, 'ㄕ', 'ㄘ'),
    (13, 'ㄨ', 'ㄜ'),
    (14, 'ㄠ', 'ㄤ'),
    (15, 'ㄈ', 'ㄌ'),
    (16, 'ㄏ', 'ㄒ'),
    (17, 'ㄖ', 'ㄙ'),
    (18, 'ㄩ', 'ㄝ'),
    (19, 'ㄡ', 'ㄥ'),
]
PHONEME_TO_KEY = {}
for _entry in _KEYMAP_RAW:
    for _ph in _entry[1:]:
        PHONEME_TO_KEY[_ph] = _entry[0]

# Tone → (key_index or None, tone_number)
# Tone 1 (¯) has no key — encoded as 0x20 appended after the last phoneme key
TONE_MAP = {
    '¯': (None, 1),   # first tone — append 0x20
    'ˊ': (2,    2),   # second tone — key 2 (shares with ㄓ)
    'ˇ': (1,    3),   # third tone  — key 1
    'ˋ': (1,    4),   # fourth tone — key 1
    '˙': (3,    5),   # neutral tone — key 3
}


def phonetic_to_keyseq(phonetic: list) -> bytes | None:
    """Convert a phoneme list (e.g. ['ㄅ','ㄚ','ˋ']) to MIED key-byte sequence."""
    key_bytes = []
    tone = 0
    for ph in phonetic:
        if ph in TONE_MAP:
            key_idx, tone = TONE_MAP[ph]
            if key_idx is not None:
                key_bytes.append(key_idx + KEY_OFFSET)
            # tone 1 (¯): append 0x20 marker AFTER building the rest
        elif ph in PHONEME_TO_KEY:
            key_bytes.append(PHONEME_TO_KEY[ph] + KEY_OFFSET)
        else:
            print(f"  WARNING: unknown phoneme '{ph}' — skipping entry", file=sys.stderr)
            return None, 0

    if tone == 1:
        key_bytes.append(0x20)  # tone-1 marker (invisible in display)

    return bytes(key_bytes), tone


def build_value_record(words: list) -> bytes:
    """Pack (word, freq, tone)* into a ValueRecord (v2 format)."""
    valid = []
    for word, freq, tone in words:
        wb = word.encode('utf-8')
        if len(wb) < 32:
            valid.append((wb, freq, tone))
    data = struct.pack('<H', len(valid))
    for wb, freq, tone in valid:
        data += struct.pack('<HBB', min(freq, 0xFFFF), tone, len(wb)) + wb
    return data


def build_mied(entries: list) -> tuple:
    """Build (dat_bytes, val_bytes) from [(keyseq, word, freq, tone)] list.

    Also adds abbreviated prefix entries (without tone byte) so that greedy
    prefix search finds candidates during partial input (before tone is entered).
    """
    key_to_words = defaultdict(list)
    for keyseq, word, freq, tone in entries:
        key_to_words[keyseq].append((word, freq, tone))

    # Add abbreviated variants: for each full key sequence, also add a version
    # that strips the trailing tone byte (0x20..0x24) if present.
    # This mirrors what gen_dict.py does with --zh-max-abbr-syls.
    TONE_BYTES = {0x20, 0x21, 0x22, 0x23, 0x24}  # 0x20=tone1, rest=tone key bytes
    abbreviated = defaultdict(list)
    for keyseq, words in list(key_to_words.items()):
        if len(keyseq) >= 2 and keyseq[-1] == 0x20:
            # tone-1 marker: strip to get the phoneme-only prefix
            abbr = keyseq[:-1]
            for w, f, t in words:
                abbreviated[abbr].append((w, f, t))
        elif len(keyseq) >= 3 and (keyseq[-1] + KEY_OFFSET - KEY_OFFSET) in range(25):
            # last byte is a tone key (key indices 1,2,3 → bytes 0x22,0x23,0x24)
            # strip it to get the 2-phoneme prefix
            abbr = keyseq[:-1]
            for w, f, t in words:
                abbreviated[abbr].append((w, f, t))

    # Merge abbreviated entries (deduplicate words, prefer higher freq)
    for abbr_key, words in abbreviated.items():
        if abbr_key not in key_to_words:
            seen = {}
            for w, f, t in words:
                if w not in seen or f > seen[w][0]:
                    seen[w] = (f, t)
            key_to_words[abbr_key] = [(w, f, t) for w, (f, t) in seen.items()]

    sorted_keys = sorted(key_to_words.keys())
    key_count   = len(sorted_keys)

    # dict_values.bin
    val_data    = bytearray()
    val_offsets = {}
    for ks in sorted_keys:
        val_offsets[ks] = len(val_data)
        val_data += build_value_record(key_to_words[ks])

    # keys section
    keys_section     = bytearray()
    key_data_off_map = {}
    for ks in sorted_keys:
        key_data_off_map[ks] = len(keys_section)
        keys_section += struct.pack('B', len(ks)) + ks

    # dict_dat.bin
    header_size   = 16
    index_size    = key_count * 8
    keys_data_off = header_size + index_size

    header  = MAGIC
    header += struct.pack('<HH', VERSION, 0)
    header += struct.pack('<II', key_count, keys_data_off)

    index = bytearray()
    for ks in sorted_keys:
        index += struct.pack('<II', key_data_off_map[ks], val_offsets[ks])

    dat_bytes = header + bytes(index) + bytes(keys_section)
    return bytes(dat_bytes), bytes(val_data), key_count


def main():
    ap = argparse.ArgumentParser(description='Convert zhuyin-mock.json to MIED v2')
    ap.add_argument('--input',  default='mokya-twin/data/zhuyin-mock.json')
    ap.add_argument('--output', default='mokya-twin/data/')
    args = ap.parse_args()

    data = json.loads(Path(args.input).read_text(encoding='utf-8'))
    entries_json = data.get('entries', [])

    entries = []
    skipped = 0
    for e in entries_json:
        phonetic   = e['phonetic']
        candidates = e['candidates']
        keyseq, tone = phonetic_to_keyseq(phonetic)
        if keyseq is None:
            skipped += 1
            continue
        for i, word in enumerate(candidates):
            freq = max(1, len(candidates) - i)  # higher freq for earlier candidates
            entries.append((keyseq, word, freq, tone))

    print(f"Loaded {len(entries_json)} entries, {len(entries)} words, {skipped} skipped")

    dat, val, key_count = build_mied(entries)

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'dict_dat.bin').write_bytes(dat)
    (out / 'dict_values.bin').write_bytes(val)

    print(f"Written {key_count} key sequences")
    print(f"  dict_dat.bin    {len(dat):,} bytes → {out / 'dict_dat.bin'}")
    print(f"  dict_values.bin {len(val):,} bytes → {out / 'dict_values.bin'}")


if __name__ == '__main__':
    main()
