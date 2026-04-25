/**
 * meshtastic-frame.js — Meshtastic FromRadio decoder + minimal ToRadio
 * encoders. Field numbers verified against meshtastic/protobufs @ main:
 *   src/meshtastic/mesh.proto      (FromRadio, ToRadio, NodeInfo, User,
 *                                   Position, MyNodeInfo, Channel)
 *   src/meshtastic/telemetry.proto (DeviceMetrics)
 *
 * Only the fields the EMU surfaces are decoded; everything else is
 * skipped silently.
 *
 * Wire framing (separate concern, in meshtastic-serial.js):
 *   0x94 0xC3 [len_msb] [len_lsb] [protobuf_FromRadio]
 */

import {
  forEachField, readVarint, readI32, readFloat, readString,
  writeVarintField,
} from './protobuf.js';

// ── FromRadio top-level ──────────────────────────────────────
export function decodeFromRadio(bytes) {
  const out = {};
  forEachField(bytes, (fn, wt, v) => {
    switch (fn) {
      case 1:  out.packet            = decodeMeshPacket(v);   break;
      case 3:  out.myInfo            = decodeMyNodeInfo(v);   break;
      case 4:  out.nodeInfo          = decodeNodeInfo(v);     break;
      case 5:  out.config            = decodeConfig(v);       break;
      case 7:  out.configCompleteId  = v;                     break;
      case 8:  out.rebooted          = v !== 0;               break;
      case 10: out.channel           = decodeChannel(v);      break;
      case 11: out.queueStatus       = decodeQueueStatus(v);  break;
      case 13: out.metadata          = decodeMetadata(v);     break;
    }
  });
  return out;
}

// ── MyNodeInfo ───────────────────────────────────────────────
function decodeMyNodeInfo(buf) {
  const o = {};
  forEachField(buf, (fn, wt, v) => {
    switch (fn) {
      case 1: o.myNodeNum     = v; break;
      case 4: o.rebootCount   = v; break;
      case 6: o.minAppVersion = v; break;
      case 7: o.deviceId      = readString(v); break;
      case 8: o.pioEnv        = readString(v); break;
    }
  });
  return o;
}

// ── NodeInfo ────────────────────────────────────────────────
function decodeNodeInfo(buf) {
  const o = {};
  forEachField(buf, (fn, wt, v) => {
    switch (fn) {
      case 1:  o.num            = v; break;
      case 4:  o.user           = decodeUser(v);     break;
      case 5:  o.position       = decodePosition(v); break;
      case 7:  o.snr            = readFloat(v);      break;
      case 8:  o.lastHeard      = v;                 break;
      case 9:  o.deviceMetrics  = decodeDeviceMetrics(v); break;
      case 10: o.channel        = v;                 break;
      case 11: o.viaMqtt        = v !== 0;           break;
      case 12: o.hopsAway       = v;                 break;
      case 13: o.isFavorite     = v !== 0;           break;
      case 14: o.isIgnored      = v !== 0;           break;
    }
  });
  return o;
}

function decodeUser(buf) {
  const o = {};
  forEachField(buf, (fn, wt, v) => {
    switch (fn) {
      case 1: o.id          = readString(v); break;
      case 2: o.longName    = readString(v); break;
      case 3: o.shortName   = readString(v); break;
      case 4: o.macaddr     = bytesToHex(v); break;
      case 5: o.hwModel     = v;             break;
      case 6: o.isLicensed  = v !== 0;       break;
      case 7: o.role        = v;             break;
      case 8: o.publicKey   = bytesToHex(v); break;
    }
  });
  return o;
}

function decodePosition(buf) {
  const o = {};
  forEachField(buf, (fn, wt, v) => {
    switch (fn) {
      // latitude_i / longitude_i are sfixed32 in the proto, but we
      // accept both wire types just in case (fixed32 = wt 5; varint = 0).
      case 1: o.latitudeI   = wt === 5 ? readI32(v) : signed(v); break;
      case 2: o.longitudeI  = wt === 5 ? readI32(v) : signed(v); break;
      case 3: o.altitude    = signed(v); break;
      case 4: o.time        = v; break;
      case 7: o.satsInView  = v; break;
      case 12: o.precisionBits = v; break;
    }
  });
  return o;
}

function decodeDeviceMetrics(buf) {
  const o = {};
  forEachField(buf, (fn, wt, v) => {
    switch (fn) {
      case 1: o.batteryLevel        = v;            break;
      case 2: o.voltage             = readFloat(v); break;
      case 3: o.channelUtilization  = readFloat(v); break;
      case 4: o.airUtilTx           = readFloat(v); break;
      case 5: o.uptimeSeconds       = v;            break;
    }
  });
  return o;
}

// ── Config (only group key + summary surfaced) ─────────────
function decodeConfig(buf) {
  // Config is a oneof — find which sub-message is set.
  let group = null, payload = null;
  forEachField(buf, (fn, wt, v) => {
    payload = v; group = ['device','position','power','network','display',
                          'lora','bluetooth','security','sessionkey'][fn - 1] ?? null;
  });
  return { group, raw: payload };
}

// ── Channel ────────────────────────────────────────────────
function decodeChannel(buf) {
  const o = {};
  forEachField(buf, (fn, wt, v) => {
    switch (fn) {
      case 1: o.index    = v; break;
      case 2: o.settings = v; break; // ChannelSettings — left raw
      case 3: o.role     = v; break; // 0 DISABLED, 1 PRIMARY, 2 SECONDARY
    }
  });
  return o;
}

// ── MeshPacket (passthrough, only header fields) ───────────
function decodeMeshPacket(buf) {
  const o = {};
  forEachField(buf, (fn, wt, v) => {
    switch (fn) {
      case 1: o.from      = v; break;
      case 2: o.to        = v; break;
      case 3: o.channel   = v; break;
      case 6: o.id        = v; break;
      case 7: o.rxTime    = v; break;
      case 8: o.rxSnr     = readFloat(v); break;
      case 9: o.hopLimit  = v; break;
      case 11: o.rxRssi   = signed(v); break;
    }
  });
  return o;
}

function decodeQueueStatus(buf) {
  const o = {};
  forEachField(buf, (fn, wt, v) => {
    switch (fn) {
      case 1: o.res       = v; break;
      case 2: o.free      = v; break;
      case 3: o.maxlen    = v; break;
      case 4: o.meshPacketId = v; break;
    }
  });
  return o;
}

function decodeMetadata(buf) {
  const o = {};
  forEachField(buf, (fn, wt, v) => {
    switch (fn) {
      case 1: o.firmwareVersion = readString(v); break;
      case 2: o.deviceStateVersion = v; break;
      case 5: o.hwModel = v; break;
      case 9: o.role    = v; break;
    }
  });
  return o;
}

// ── ToRadio encoders ───────────────────────────────────────
/**
 * Encode `ToRadio { want_config_id = nonce }`. This is the trigger
 * Meshtastic devices use to dump their config / nodes / channels
 * back to the host. Returns the payload bytes (unframed).
 */
export function encodeWantConfig(nonce = 1) {
  const out = [];
  writeVarintField(out, 3, nonce >>> 0);
  return new Uint8Array(out);
}

/**
 * Encode `ToRadio { heartbeat = {} }` — keep the connection alive.
 * Empty Heartbeat sub-message = length-delimited length 0.
 */
export function encodeHeartbeat() {
  // Field 7 = heartbeat (Heartbeat), wire type 2, length 0.
  return new Uint8Array([(7 << 3) | 2, 0]);
}

// ── Helpers ────────────────────────────────────────────────
function signed(v) { return v | 0; } // varint values used as i32

function bytesToHex(buf) {
  let s = '';
  for (let i = 0; i < buf.length; i++) {
    s += buf[i].toString(16).padStart(2, '0');
  }
  return s;
}
