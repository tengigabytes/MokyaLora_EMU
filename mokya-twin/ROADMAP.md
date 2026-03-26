# MokyaLora Digital Twin — Development Roadmap

Repository: `tengigabytes/MokyaLora`
Sandbox repo: `tengigabytes/CldTest/mokya-twin/`

---

## File Structure

```
mokya-twin/
├── index.html                      # PWA entry point
├── manifest.json                   # PWA manifest
├── sw.js                           # Service Worker (offline cache)
├── ROADMAP.md                      # This file
├── icons/
│   ├── icon-192.svg                # PWA icon 192×192
│   └── icon-512.svg                # PWA icon 512×512
├── css/
│   └── device.css                  # Device frame, keyboard, animations
├── data/
│   └── zhuyin-mock.json            # MIE mock dictionary (simulates Flash)
├── wasm/                           # Phase 4: compiled WASM binaries
│   └── mie_core.wasm               # (not present until Phase 4)
└── js/
    ├── app.js                      # Bootstrap: init all layers, rAF loop
    ├── hal/
    │   ├── display-hal.js          # Canvas HAL (ILI9341 flush_cb equivalent)
    │   ├── keyboard-hal.js         # 6×6 matrix scanner, key definitions
    │   └── mie-hal.js              # MIE_Bridge (JS now, WASM Phase 4)
    ├── core/
    │   ├── mie-processor.js        # Zhuyin state machine
    │   ├── mie-timer.js            # RP2350 alarm timer simulator
    │   └── mie-trie.js             # Phonetic Trie (mirrors C struct layout)
    ├── ui/
    │   ├── renderer.js             # LVGL-style Canvas widgets
    │   ├── screen-manager.js       # Page transitions (lv_scr_load_anim)
    │   └── screens/
    │       ├── chat-screen.js      # Meshtastic chat + MIE input
    │       ├── map-screen.js       # GNSS node map
    │       └── settings-screen.js  # RP2350 system stats + config
    └── serial/
        └── meshtastic-serial.js    # Web Serial API + Meshtastic framing
```

---

## Phase 1 — Foundation ✅ (Current)

**Goal:** Beautiful, interactive device simulation. All architectural layers in place.

**Deliverables:**
- [x] Device frame: dark phone body, green-tinted 240×320 IPS screen, bezel, scanlines, LED pulse
- [x] 36-key 6×6 keyboard: Zhuyin labels, press animations, ripple effect, D-pad area
- [x] HAL abstraction: `DisplayHAL`, `KeyboardHAL`, `MIE_Bridge`
- [x] MIE skeleton: state machine, trie structure, RP2350 timer simulator
- [x] WASM placeholder: `MIE_Bridge.loadWasm()` entry point ready
- [x] Canvas renderer: LVGL-style widgets (status bar, tab bar, bubbles, charts, bars)
- [x] 3 screens: Chat (message list), Map (node grid), Settings (system stats)
- [x] RSSI waveform animation, LoRa signal bars, battery icon
- [x] Physical keyboard binding for desktop development
- [x] Web Serial UI: connect/disconnect buttons, mode indicator
- [x] PWA: `manifest.json` + Service Worker (offline capable)
- [x] Debug console panel (HAL/MIE event log)
- [x] Mock message conversation + simulated replies

**How to run (Phase 1):**
```bash
# Serve locally (required for ES modules + SW)
npx serve mokya-twin
# or
python3 -m http.server -d mokya-twin 8080
# Open in Chrome: http://localhost:8080
```

---

## Phase 2 — MIE Core Engine

**Goal:** Full working Zhuyin input — type a syllable, see candidates, select with D-pad.

**Deliverables:**
- [ ] Complete Zhuyin composition FSM (initial → medial → final → tone → commit)
- [ ] Multi-tap with `MIE_Timer` (800ms window, cycle through chars on same key)
- [ ] `MIE_Trie` full phonetic dictionary (load real `zhuyin.json` / `.bin`)
- [ ] Candidate list navigation: `UP`/`DOWN` to browse, `OK` to select
- [ ] English mode: multi-tap → a–z mapping on Zhuyin keys (Nokia T9-style)
- [ ] Numeric mode: direct digit input
- [ ] Symbol picker screen (SYM key → modal grid)
- [ ] `uint8_t input_buffer[256]` management (mirrors firmware SRAM layout)
- [ ] Full Zhuyin dictionary file (build script: `tools/build-dict.py`)
- [ ] Unit tests for MIE state machine (Jest or Vitest)

**Key files to modify/create:**
- `js/core/mie-processor.js` — fill in `_handleZhuyinKey`, `_applyTone`, etc.
- `js/core/mie-trie.js` — add `serialize()` / `deserialize()` for binary format
- `data/zhuyin-full.json` — complete 常用字 dictionary (~10,000 entries)
- `tools/build-dict.py` — Python script to compile JSON → binary Trie blob

---

## Phase 3 — Connectivity

**Goal:** Real Meshtastic USB connection — type on the twin, message appears on real mesh.

**Deliverables:**
- [ ] Full Meshtastic serial framing (start-of-packet magic, length prefix)
- [ ] protobuf encoding: `TextMessagePayload`, `ToRadio`, `FromRadio` messages
- [ ] Receive + parse incoming `MeshPacket` and display in chat
- [ ] Node discovery: parse `NodeInfo` packets, update map with real GPS coords
- [ ] `DeviceMetadata` parsing: populate Settings screen with real firmware info
- [ ] Baud rate auto-detection (try 115200, 38400, 9600)
- [ ] Reconnect logic: exponential backoff on disconnect
- [ ] Offline queue: buffer messages when disconnected, flush on reconnect
- [ ] Connection health indicator (last-seen heartbeat timer)

**Key files to modify/create:**
- `js/serial/meshtastic-serial.js` — full protobuf codec
- `js/serial/protobuf/` — generated JS protobuf from `meshtastic.proto`
- `tools/gen-proto.sh` — `protoc-gen-es` generation script

**Testing:** Connect a real Meshtastic device (e.g. LILYGO T-Beam) via USB-C, open Chrome.

---

## Phase 4 — WASM Bridge (LVGL + mie_core.c)

**Goal:** Replace JS renderer and MIE with compiled C code running in WASM.

**Deliverables:**
- [ ] Emscripten toolchain setup: `CMakeLists.txt` → `emcmake cmake` → `.wasm`
- [ ] `firmware/mie/mie_core.c` compiled as WASM library (no RP2350 deps)
- [ ] WASM `env` imports implemented in `mie-hal.js`:
      `get_tick_ms`, `display_flush`, `emit_event`
- [ ] `MIE_Bridge.loadWasm()` fully wired: swap `_useWasm = true`
- [ ] LVGL compiled to WASM with Canvas 2D output port:
      `lv_display_set_flush_cb` → JS `flush_cb` → `DisplayHAL.flush()`
- [ ] Screen layout migrated to LVGL C sources (`ui/screens/*.c`)
- [ ] Zhuyin Trie binary blob loaded from WASM `mie_trie_load_blob()`
- [ ] Memory layout validated: `font_buffer`, `input_buffer` match C structs

**Architecture after Phase 4:**
```
JS (host)                    WASM (mie_core.c + LVGL)
─────────────────────────── ──────────────────────────
KeyboardHAL.handleButtonEvent → mie_process_key()
                              → lv_indev_read_cb()
DisplayHAL.flush()          ← lv_display_flush_cb()
MIE_Bridge.getComposition() ← mie_get_composition()
```

---

## Phase 5 — Advanced

**Goal:** Production-grade simulation, multi-device, complete human-factors testing.

**Deliverables:**
- [ ] Multi-device simulation: open 2+ tabs, messages route between twins via BroadcastChannel
- [ ] Real LoRa packet parsing: visualise channel utilisation, airtime, duty cycle
- [ ] GNSS replay: load GPX track, animate node positions on map
- [ ] Font atlas: load custom RP2350 bitmap font into `font_buffer` (Chinese glyph rendering)
- [ ] Haptic feedback: Vibration API mapped to RP2350 buzzer GPIO
- [ ] Human-factors test harness: record key sequences → replay → measure WPM
- [ ] Battery simulation: drain model based on TX power + display brightness
- [ ] OTA update simulator: mock DFU flow over serial

---

## WASM Upgrade Guide

When replacing JS with WASM in Phase 4:

### 1. Keep `MIE_Bridge` public API unchanged
The contract (`processKeyTap`, `getCandidates`, `selectCandidate`, `reset`) must not change.
Only `_useWasm` flips from `false` → `true`.

### 2. Implement `env` imports before loading WASM
```javascript
// In mie-hal.js loadWasm():
const imports = {
  env: {
    get_tick_ms:             () => this._timer.getTickMs(),
    display_flush:           (x1,y1,x2,y2,ptr) => display.flush(x1,y1,x2,y2, readColorBuf(ptr)),
    emit_composition_update: (bufPtr, candPtr)  => this._emit('composition:update', ...),
  }
};
```

### 3. SharedArrayBuffer for zero-copy frame buffer
Enable COOP/COEP headers on your server for `SharedArrayBuffer` support:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### 4. IHalPort interface
Define a stable C interface in `firmware/mie/hal_port.h`:
```c
typedef struct {
  uint32_t (*get_tick_ms)(void);
  void (*display_flush)(int x1, int y1, int x2, int y2, const uint16_t *buf);
  void (*emit_event)(const char *type, const char *json);
} IHalPort;
```
The WASM module imports exactly these three functions, making JS↔WASM interop minimal.

---

## GitHub Pages Deployment

```bash
# From repo root
git subtree push --prefix mokya-twin origin gh-pages
# Or with gh CLI:
gh workflow run pages --ref main
```

**server headers** (required for Web Serial + SharedArrayBuffer):
```
# _headers file (Netlify / Cloudflare Pages)
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

**Browser compatibility:**
| Feature | Chrome 89+ | Edge 89+ | Firefox | Safari |
|---------|-----------|---------|---------|--------|
| ES Modules | ✅ | ✅ | ✅ | ✅ |
| Web Serial | ✅ | ✅ | ❌ | ❌ |
| PWA install | ✅ | ✅ | partial | partial |
| WASM Phase 4 | ✅ | ✅ | ✅ | ✅ |

> **Recommended:** Chrome 110+ on desktop/Android for full feature support including Web Serial.

---

## Calling Claude for Phase 2

When ready for Phase 2, prompt:
> "繼續開發 MokyaLora Digital Twin Phase 2 — MIE Core Engine。
> 專案在 mokya-twin/，請完成 mie-processor.js 的完整注音組字邏輯、
> 多按確認計時、候選詞選擇，並建立完整 zhuyin-full.json 字典。"

For Phase 3 (USB):
> "開發 Phase 3 — Connectivity：實作完整 Meshtastic protobuf 編解碼，
> 連接真實裝置後能收發文字訊息並更新地圖節點位置。"
