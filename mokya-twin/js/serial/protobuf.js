/**
 * protobuf.js — minimal Protocol Buffers wire-format helpers.
 *
 * Implements just enough to decode Meshtastic FromRadio packets and
 * encode the few ToRadio messages the EMU sends (want_config_id,
 * sendtext, traceroute trigger). Handles wire types 0 (varint), 1
 * (64-bit), 2 (length-delimited) and 5 (32-bit). No 64-bit ints.
 *
 * NOT a full protobuf implementation — packed repeated fields, group
 * wire types (3/4) and zigzag sint32 are out of scope. Callers pass a
 * field handler that's invoked once per encoded field; nested messages
 * are decoded by recursing into the length-delimited bytes.
 */

const TXT = new TextDecoder();

/** Decode a varint starting at `off`. Returns { value, next }. */
export function readVarint(buf, off) {
  let result = 0, shift = 0, i = off;
  for (;;) {
    if (i >= buf.length) throw new Error('varint truncated');
    const b = buf[i++];
    result |= (b & 0x7F) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift >= 32) throw new Error('varint > 32 bits unsupported');
  }
  // result may be negative due to 32-bit shift overflow on JS numbers;
  // coerce back to unsigned 32-bit.
  return { value: result >>> 0, next: i };
}

/** Encode an unsigned int as varint. */
export function writeVarint(out, n) {
  n = n >>> 0;
  while (n > 0x7F) { out.push((n & 0x7F) | 0x80); n >>>= 7; }
  out.push(n & 0x7F);
}

/** Read a 32-bit little-endian unsigned int. */
export function readU32(buf, off = 0) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

/** Read a 32-bit little-endian signed int (for fixed32). */
export function readI32(buf, off = 0) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) | 0;
}

/** Read an IEEE-754 float (4 bytes, little-endian). */
export function readFloat(buf, off = 0) {
  const view = new DataView(buf.buffer, buf.byteOffset + off, 4);
  return view.getFloat32(0, true);
}

/** Decode a UTF-8 string from a length-delimited bytes view. */
export function readString(buf) {
  return TXT.decode(buf);
}

/**
 * Iterate every encoded field in `buf`. Calls `handler(fieldNum, wireType, valueView, rawBuf)`
 * where `valueView` is:
 *   wireType 0 (varint)            → number (uint32)
 *   wireType 1 (64-bit fixed)      → Uint8Array of 8 bytes
 *   wireType 2 (length-delimited)  → Uint8Array view of the inner bytes (no copy)
 *   wireType 5 (32-bit fixed)      → Uint8Array of 4 bytes
 * Other wire types throw.
 */
export function forEachField(buf, handler) {
  let i = 0;
  while (i < buf.length) {
    const tag = readVarint(buf, i); i = tag.next;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      const v = readVarint(buf, i); i = v.next;
      handler(fieldNum, wireType, v.value);
    } else if (wireType === 1) {
      handler(fieldNum, wireType, buf.subarray(i, i + 8)); i += 8;
    } else if (wireType === 2) {
      const l = readVarint(buf, i); i = l.next;
      handler(fieldNum, wireType, buf.subarray(i, i + l.value)); i += l.value;
    } else if (wireType === 5) {
      handler(fieldNum, wireType, buf.subarray(i, i + 4)); i += 4;
    } else {
      throw new Error(`unsupported wire type ${wireType}`);
    }
  }
}

/** Build a length-delimited frame: tag + len + bytes. */
export function writeLenDelim(out, fieldNum, bytes) {
  writeVarint(out, (fieldNum << 3) | 2);
  writeVarint(out, bytes.length);
  for (const b of bytes) out.push(b);
}

/** Build a single varint field. */
export function writeVarintField(out, fieldNum, value) {
  writeVarint(out, (fieldNum << 3) | 0);
  writeVarint(out, value);
}
