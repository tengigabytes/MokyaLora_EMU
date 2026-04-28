/**
 * MokyaLora Digital Twin — Application Bootstrap
 *
 * Initialises all layers in dependency order:
 *   1. DisplayHAL      — canvas output (240×320)
 *   2. KeyboardHAL     — 36-key matrix + physical keyboard
 *   3. MIE_Bridge      — input engine (JS mock, WASM-ready)
 *   4. MeshtasticSerial — Web Serial USB bridge
 *   5. MokyaRenderer   — LVGL-style canvas drawing
 *   6. ScreenManager   — page navigation + transitions
 *   7. Screens          — Chat, Map, Settings
 *   8. rAF loop        — 60fps render + animation
 *
 * Boot sequence mirrors RP2350 firmware main():
 *   hal_display_init() → hal_kbd_init() → mie_init() → lv_init() → task loop
 */

import { DisplayHAL }           from './hal/display-hal.js';
import { KeyboardHAL, KEY_MATRIX } from './hal/keyboard-hal.js';
import { MIE_Bridge }           from './hal/mie-hal.js';
import { MeshtasticSerial, SerialState } from './serial/meshtastic-serial.js';
import { MokyaRenderer }        from './ui/renderer.js';
import { ScreenManager }        from './ui/screen-manager.js';
import { ChatScreen }           from './ui/screens/chat-screen.js';
import { MapScreen }            from './ui/screens/map-screen.js';
import { HomeScreen }           from './ui/screens/home-screen.js';
import { MenuScreen }           from './ui/screens/menu-screen.js';
import { MeshtasticScreen }     from './ui/screens/meshtastic-screen.js';
import { MessagesScreen }       from './ui/screens/messages-screen.js';
import { NodesScreen }          from './ui/screens/nodes-screen.js';
import { NodeDetailScreen }     from './ui/screens/node-detail-screen.js';
import { ConnectScreen }        from './ui/screens/connect-screen.js';
import { MeshConfigScreen }     from './ui/screens/mesh-config-screen.js';
import { MeshModulesScreen }    from './ui/screens/mesh-modules-screen.js';
import { MeshChannelsScreen }   from './ui/screens/mesh-channels-screen.js';
import { SettingsListScreen }   from './ui/screens/settings-list-screen.js';
import { FieldEditScreen }      from './ui/screens/field-edit-screen.js';
import { SensorsScreen }        from './ui/screens/sensors-screen.js';
import { BatteryScreen }        from './ui/screens/battery-screen.js';
import { SystemConfigScreen }   from './ui/screens/system-config-screen.js';
import { PlaceholderScreen }    from './ui/screens/placeholder-screen.js';
import { StatusDetailScreen }   from './ui/screens/status-detail-screen.js';
import { SOSScreen }            from './ui/screens/sos-screen.js';
import { LockScreen }           from './ui/screens/lock-screen.js';
import { cleanupOlderDays }     from './ui/screens/drafts-store.js';
import { save as saveMeshConfig }   from './ui/screens/mesh-config-store.js';
import { save as saveSystemConfig } from './ui/screens/system-settings-store.js';
import { NODES, pushSignalSample } from './ui/screens/nodes-data.js';
import { MiefFont, installMiefFont } from './ui/mief-font.js';

// ── Globals (accessible in console for dev) ──────────────────────
let display, keyboard, mie, serial, renderer, screens;

async function boot() {
  updateSplash(10, 'Initialising display HAL…');

  // ── 1. Display HAL ──────────────────────────────────────────────
  const canvas = document.getElementById('screen-canvas');
  display = new DisplayHAL(canvas);

  // ── 1a. MIE Unifont ─────────────────────────────────────────────
  // Routes canvas fillText/measureText through the firmware's 16 px 1bpp
  // bitmap font. Codepoints not covered by the font (emoji etc.) fall back
  // to the browser's native rasteriser inside the patched ctx.
  const miefFont = new MiefFont();
  try {
    await miefFont.load(`./data/mie_unifont_16.bin?v=v32`);
    installMiefFont(display.getContext(), miefFont);
    console.log(`[App] Unifont loaded — ${miefFont.glyphCount} glyphs`);
  } catch (err) {
    console.warn('[App] Unifont load failed, using native canvas text:', err.message);
  }

  updateSplash(25, 'Scanning keyboard matrix…');

  // ── 2. Keyboard HAL ─────────────────────────────────────────────
  keyboard = new KeyboardHAL();
  keyboard.bindPhysicalKeyboard();
  buildKeyGrid(keyboard);

  updateSplash(40, 'Loading MIE dictionary…');

  // ── 3. MIE Bridge ───────────────────────────────────────────────
  mie = new MIE_Bridge();

  // Try WASM first (Phase 4); if it succeeds, load MIED binary dict.
  // Falls back to JS impl + JSON dict if WASM is unavailable.
  //
  // Cache-bust on every asset tied to the IME build — the WASM binary and
  // MIED dict files are re-generated together, but the browser's HTTP
  // cache is aggressive on .wasm / .bin and can serve stale bytes even
  // after the Service Worker cache is evicted. Bump MIE_ASSET_VER in
  // lockstep with sw.js CACHE_VERSION whenever any dict or wasm asset is
  // rebuilt so the query string changes.
  const MIE_ASSET_VER = 'v32';
  const v = `?v=${MIE_ASSET_VER}`;
  await mie.loadWasm(`./wasm/mie_core.wasm${v}`);

  try {
    if (mie.isWasmActive) {
      await mie.loadDictionary(
        `./data/dict_dat.bin${v}`,    `./data/dict_values.bin${v}`,
        `./data/en_dat.bin${v}`,      `./data/en_values.bin${v}`,
        `./data/dict_v4.bin${v}`,
      );
    } else {
      await mie.loadDictionary(`./data/zhuyin-mock.json${v}`);
    }
  } catch (err) {
    console.warn('[App] Dict load failed, continuing without:', err.message);
  }

  // Persist the firmware's LruCache on tab close so repeat-typed chars
  // still promote across reloads.
  window.addEventListener('beforeunload', () => mie.flushLru?.());

  updateSplash(60, 'Initialising serial bridge…');

  // ── 4. Serial ───────────────────────────────────────────────────
  serial = new MeshtasticSerial();
  bindSerialUI(serial);

  updateSplash(75, 'Building LVGL renderer…');

  // ── 5. Renderer ─────────────────────────────────────────────────
  renderer = new MokyaRenderer(display);

  updateSplash(88, 'Loading screens…');

  // ── 6. Screen Manager ───────────────────────────────────────────
  screens = new ScreenManager(renderer);
  screens.register('home',        new HomeScreen(renderer, mie, serial));
  screens.register('menu',        new MenuScreen(renderer, mie, serial));
  // MESHTASTIC sub-tree
  screens.register('meshtastic',  new MeshtasticScreen(renderer, mie, serial));
  // Chat is shared between MESHTASTIC sub-menu items — instantiate first
  // so we can pass it as a dep to messages and node-detail for context wiring.
  const chatScreen = new ChatScreen(renderer, mie, serial);
  screens.register('chat',        chatScreen);
  screens.register('messages',    new MessagesScreen(renderer, mie, serial, { chatScreen }));
  const nodeDetail = new NodeDetailScreen(renderer, mie, serial, { chatScreen });
  screens.register('nodes',       new NodesScreen(renderer, mie, serial, { nodeDetail }));
  screens.register('node-detail', nodeDetail);
  screens.register('connect',     new ConnectScreen(renderer, mie, serial));
  // Top-level menu targets
  // ── Mesh-config tree ─────────────────────────────────────────
  const meshSettingsList = new SettingsListScreen(renderer, mie, serial);
  const meshFieldEdit    = new FieldEditScreen(renderer, mie, serial);
  meshSettingsList.setEditScreen(meshFieldEdit, saveMeshConfig, 'mesh-field-edit');
  const meshDeps = { settingsList: meshSettingsList };
  screens.register('mesh-config',         new MeshConfigScreen(renderer, mie, serial, meshDeps));
  screens.register('mesh-modules',        new MeshModulesScreen(renderer, mie, serial, meshDeps));
  screens.register('mesh-channels',       new MeshChannelsScreen(renderer, mie, serial, meshDeps));
  screens.register('mesh-settings-list',  meshSettingsList);
  screens.register('mesh-field-edit',     meshFieldEdit);

  // ── System (EMU) settings tree ───────────────────────────────
  const sysSettingsList = new SettingsListScreen(renderer, mie, serial);
  const sysFieldEdit    = new FieldEditScreen(renderer, mie, serial);
  sysSettingsList.setEditScreen(sysFieldEdit, saveSystemConfig, 'system-field-edit');
  const sysDeps = { settingsList: sysSettingsList };
  screens.register('settings',            new SystemConfigScreen(renderer, mie, serial, sysDeps));
  screens.register('system-settings-list', sysSettingsList);
  screens.register('system-field-edit',   sysFieldEdit);

  screens.register('sensors',     new SensorsScreen(renderer, mie, serial));
  screens.register('gnss',        new MapScreen(renderer, mie, serial, { nodeDetail }));
  screens.register('battery',     new BatteryScreen(renderer, mie, serial));
  // 全域 Modal-style 螢幕(由全域長按事件觸發)
  screens.register('status-detail', new StatusDetailScreen(renderer, mie, serial));
  screens.register('sos',           new SOSScreen(renderer, mie, serial));
  screens.register('lock',          new LockScreen(renderer, mie, serial));

  // L-1 九宮格的尚未細部規劃 App,以 placeholder 接住(對齊 doc/ui/01-page-architecture.md)
  screens.register('tools',     new PlaceholderScreen(renderer, mie, serial, '工具 (T-0)'));

  // 啟動時清掉超過 30 天的草稿(規格 §草稿生命週期)
  cleanupOlderDays(30);

  // ── Mirror real Meshtastic packets into the EMU registries ───────
  serial.addEventListener('serial:my_info', (e) => {
    const my = e.detail.myInfo;
    if (my?.myNodeNum) {
      serial.myNodeId = '!' + my.myNodeNum.toString(16).padStart(8, '0');
      console.log('[App] my_info — myNodeNum =', serial.myNodeId);
    }
  });
  serial.addEventListener('serial:node_info', (e) => {
    upsertNode(e.detail.nodeInfo);
  });
  serial.addEventListener('serial:config_complete', (e) => {
    addDebugEntry('serial', `config dump complete (id=${e.detail.id})`);
  });

  // ── 7. Wire keyboard → MIE → screens ────────────────────────────
  keyboard.addEventListener('key:down', (e) => {
    screens.handleKeyDown(e.detail);
    addDebugEntry('key', `↓ ${e.detail.key.fn} [${e.detail.key.label}]`);
  });

  keyboard.addEventListener('key:tap', (e) => {
    const { key, tapCount } = e.detail;
    screens.handleKeyTap(e.detail);
    addDebugEntry('key', `✓ ${key.fn} ×${tapCount}`);

    // Global tab switching (Right key cycles screens)
    // (Screens also handle RIGHT themselves, this is a fallback)
  });

  // 長按事件(對齊 doc/ui/00-design-charter.md)。
  // 全域路由先吃 FUNC/BACK/POWER(Status Bar 詳情、鎖屏、SOS),
  // 其餘(MODE / OK)轉給當前 screen 的 handleKeyHold。
  keyboard.addEventListener('key:hold', (e) => {
    const { key, heldMs } = e.detail;
    addDebugEntry('key', `⏱ ${key.fn} HOLD ${heldMs}ms`);

    // 全域長按:不論在哪個 screen 都觸發
    if (key.fn === 'FUNC') {
      // 已在 status-detail / sos / lock 面板時不再疊加
      const cur = screens._current?._name;
      if (cur !== 'status-detail' && cur !== 'sos' && cur !== 'lock') {
        screens.navigateTo('status-detail', 'fade');
      }
      return;
    }
    if (key.fn === 'BACK') {
      const cur = screens._current?._name;
      if (cur !== 'lock' && cur !== 'sos') {
        screens.navigateTo('lock', 'fade');
      }
      return;
    }
    if (key.fn === 'POWER') {
      const cur = screens._current?._name;
      if (cur !== 'sos') {
        screens.navigateTo('sos', 'fade');
      }
      return;
    }

    // 其餘交由 screen 處理
    if (typeof screens.handleKeyHold === 'function') {
      screens.handleKeyHold(e.detail);
    }
  });

  // MIE composition debug
  mie.addEventListener('composition:update', (e) => {
    const d = e.detail;
    if (d.buffer?.length || d.committed) {
      addDebugEntry('mie', `[${d.buffer?.join('')}] ${d.committed ?? ''}`);
    }
  });
  mie.addEventListener('mode:change', (e) => {
    addDebugEntry('mie', `Mode → ${e.detail.mode}`);
  });
  mie.addEventListener('action:enter', (e) => {
    addDebugEntry('mie', `SEND: "${e.detail.text}"`);
  });

  // Serial debug
  serial.addEventListener('serial:state', (e) => {
    addDebugEntry('serial', `State: ${e.detail.state}`);
  });
  serial.addEventListener('serial:message', (e) => {
    addDebugEntry('serial', `RX: ${e.detail.message.from}: ${e.detail.message.text}`);
  });

  // Boot into the Home screen — DPAD/OK opens the menu (no touch).
  updateSplash(96, 'Ready!');
  screens.navigateTo('home', 'none');

  updateSplash(100, '');

  // Scale device to fill page width
  scaleDevice();
  window.addEventListener('resize', scaleDevice);

  // ── 8. rAF render loop ──────────────────────────────────────────
  setTimeout(() => {
    dismissSplash();
    startRenderLoop();
  }, 300);

  // Expose for browser console debugging
  window.mokya = { display, keyboard, mie, serial, renderer, screens };
  console.log('%c🟢 MokyaLora Digital Twin ready — Phase 2', 'color:#30D158;font-weight:bold');
  console.log('Access globals via window.mokya.*');
}

/**
 * Merge an incoming meshtastic NodeInfo into the live NODES registry.
 * Matches by user.id (string like "!a1b2c3d4"); inserts a new entry
 * with the canonical EMU shape if not present.
 */
function upsertNode(ni) {
  if (!ni || !ni.user || !ni.user.id) return;
  const id = ni.user.id;
  let n = NODES.find(x => x.user.id === id);
  if (!n) {
    n = {
      num: ni.num ?? 0,
      user: {
        id,
        long_name:    ni.user.longName  ?? id,
        short_name:   ni.user.shortName ?? id.slice(-4),
        macaddr:      ni.user.macaddr   ?? '',
        hw_model:     hwModelName(ni.user.hwModel),
        is_licensed:  !!ni.user.isLicensed,
        public_key:   ni.user.publicKey ?? '',
        role:         roleName(ni.user.role),
      },
      position: {
        lat_i: 0, lon_i: 0, alt: 0,
        time: '—', location_source: 'UNSET', precision_bits: 0, sats_in_view: 0,
      },
      snr: null, last_heard: '—', rssi: null,
      device_metrics: {
        battery_level: 0, voltage: 0,
        channel_utilization: 0, air_util_tx: 0, uptime_seconds: 0,
      },
      channel: ni.channel ?? 0, via_mqtt: !!ni.viaMqtt, hops_away: ni.hopsAway ?? 0,
      is_favorite: !!ni.isFavorite, is_ignored: !!ni.isIgnored,
      signal_history: [], traceroute_history: [], ack_history: [],
    };
    NODES.push(n);
  }
  // Merge updatable fields.
  if (ni.user.longName)  n.user.long_name  = ni.user.longName;
  if (ni.user.shortName) n.user.short_name = ni.user.shortName;
  if (ni.user.role !== undefined) n.user.role = roleName(ni.user.role);
  if (ni.user.hwModel !== undefined) n.user.hw_model = hwModelName(ni.user.hwModel);
  if (ni.user.macaddr)   n.user.macaddr    = ni.user.macaddr;
  if (ni.user.publicKey) n.user.public_key = ni.user.publicKey;
  n.user.is_licensed = !!ni.user.isLicensed;

  if (ni.position) {
    if (ni.position.latitudeI  !== undefined) n.position.lat_i = ni.position.latitudeI;
    if (ni.position.longitudeI !== undefined) n.position.lon_i = ni.position.longitudeI;
    if (ni.position.altitude   !== undefined) n.position.alt   = ni.position.altitude;
    if (ni.position.satsInView !== undefined) n.position.sats_in_view = ni.position.satsInView;
    if (ni.position.precisionBits !== undefined) n.position.precision_bits = ni.position.precisionBits;
  }
  if (ni.snr !== undefined)     pushSignalSample(n, n.rssi, ni.snr);
  if (ni.lastHeard)             n.last_heard = formatLastHeard(ni.lastHeard);
  if (ni.deviceMetrics) {
    const m = ni.deviceMetrics;
    if (m.batteryLevel       !== undefined) n.device_metrics.battery_level       = m.batteryLevel;
    if (m.voltage            !== undefined) n.device_metrics.voltage             = (m.voltage * 1000) | 0;
    if (m.channelUtilization !== undefined) n.device_metrics.channel_utilization = +m.channelUtilization.toFixed(1);
    if (m.airUtilTx          !== undefined) n.device_metrics.air_util_tx         = +m.airUtilTx.toFixed(1);
    if (m.uptimeSeconds      !== undefined) n.device_metrics.uptime_seconds      = m.uptimeSeconds;
  }
  if (ni.hopsAway !== undefined) n.hops_away = ni.hopsAway;
  n.via_mqtt    = !!ni.viaMqtt;
  if (ni.isFavorite !== undefined) n.is_favorite = !!ni.isFavorite;
  if (ni.isIgnored  !== undefined) n.is_ignored  = !!ni.isIgnored;
}

// HardwareModel / Role enum value → display name.
const HW_NAMES = ['UNSET','TLORA_V2','TLORA_V1','TLORA_V2_1_1P6','TBEAM','HELTEC_V2_0',
  'TBEAM_V0P7','T_ECHO','TLORA_V1_1P3','RAK4631','HELTEC_V2_1','HELTEC_V1','LILYGO_TBEAM_S3_CORE',
  'RAK11200','NANO_G1','TLORA_V2_1_1P8','TLORA_T3_S3','NANO_G1_EXPLORER','NANO_G2_ULTRA',
  'LORA_TYPE','WIPHONE','WIO_WM1110','RAK2560','HELTEC_HRU_3601','STATION_G2','RAK11310',
  'SENSELORA_RP2040','SENSELORA_S3','CANARYONE','RP2040_LORA','STATION_G1','RAK11310_DEV',
  'TBEAM_S3_CORE','RP2040_FEATHER_RFM95','SEEED_XIAO_S3','MS24SF1','TLORA_C6','HELTEC_WIRELESS_TRACKER',
  'HELTEC_WIRELESS_PAPER','T_DECK','T_WATCH_S3','PICOMPUTER_S3','HELTEC_HT62','EBYTE_ESP32_S3',
  'ESP32_S3_PICO','CHATTER_2','HELTEC_WIRELESS_PAPER_V1_0','HELTEC_WIRELESS_TRACKER_V1_0',
  'UNPHONE','TD_LORAC','MESHTASTIC_DIY_V1','NRF52_PROMICRO_DIY','RP2040_LORA_DIY',
  'BETAFPV_2400_TX','BETAFPV_900_NANO_TX','RPI_PICO','HELTEC_WIRELESS_TRACKER_V1_1',
  'RADIOMASTER_900_BANDIT','PORTDUINO','MOKYA_LORA'];
const ROLE_NAMES = ['CLIENT','CLIENT_MUTE','ROUTER','ROUTER_CLIENT','REPEATER','TRACKER',
  'SENSOR','TAK','CLIENT_HIDDEN','LOST_AND_FOUND','TAK_TRACKER'];

function hwModelName(n) { return HW_NAMES[n] ?? `HW_${n ?? 0}`; }
function roleName(n)    { return ROLE_NAMES[n] ?? 'CLIENT'; }
function formatLastHeard(epoch) {
  if (!epoch) return '—';
  const dt = ((Date.now() / 1000) - epoch) | 0;
  if (dt < 60)    return `${dt} 秒前`;
  if (dt < 3600)  return `${(dt/60)|0} 分前`;
  if (dt < 86400) return `${(dt/3600)|0} 小時前`;
  return `${(dt/86400)|0} 天前`;
}

// ── Render loop ───────────────────────────────────────────────────
function startRenderLoop() {
  const loop = (now) => {
    screens.render(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ── HTML keyboard grid builder ────────────────────────────────────
function buildKeyGrid(kbd) {
  const navGrid  = document.getElementById('nav-grid');
  const coreGrid = document.getElementById('key-grid');
  if (!navGrid || !coreGrid) return;
  navGrid.innerHTML  = '';
  coreGrid.innerHTML = '';

  KEY_MATRIX.forEach((keyDef) => {
    const btn = document.createElement('button');
    btn.className = 'key-btn';
    btn.dataset.idx = keyDef.idx;
    btn.dataset.row = keyDef.row;
    btn.dataset.col = keyDef.col;
    btn.dataset.fn  = keyDef.fn;
    btn.title       = `[R${keyDef.row}C${keyDef.col}] ${keyDef.fn}`;

    // Label rendering
    if (keyDef.label2) {
      // Three-line: QWERTY/numeric on top (dim), Zhuyin label middle (main), calc label bottom
      const top = document.createElement('span');
      top.className = 'key-qwerty';
      top.textContent = keyDef.label2;
      btn.appendChild(top);
      const mid = document.createElement('span');
      mid.className = 'key-primary';
      mid.textContent = keyDef.label;
      btn.appendChild(mid);
      if (keyDef.label3) {
        const calc = document.createElement('span');
        calc.className = 'key-calc';
        calc.textContent = keyDef.label3;
        btn.appendChild(calc);
      }
    } else {
      // Nav / function / special keys — always use keyDef.label (not chars[])
      const p = document.createElement('span');
      p.className = 'key-primary';
      p.textContent = keyDef.label;
      btn.appendChild(p);
    }

    // Touch/mouse events → KeyboardHAL
    const onDown = (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      btn.classList.add('ripple');
      kbd.handleButtonEvent(keyDef.idx, 'down');
      setTimeout(() => btn.classList.remove('ripple'), 350);
    };
    const onUp = (e) => {
      e.preventDefault();
      btn.classList.remove('pressed');
      kbd.handleButtonEvent(keyDef.idx, 'up');
    };

    btn.addEventListener('mousedown',  onDown);
    btn.addEventListener('touchstart', onDown, { passive: false });
    btn.addEventListener('mouseup',    onUp);
    btn.addEventListener('touchend',   onUp);
    btn.addEventListener('mouseleave', () => btn.classList.remove('pressed'));

    // Route: col 5 or row 5 → nav area; everything else → core input grid
    const isNav = keyDef.col === 5 || keyDef.row === 5;
    (isNav ? navGrid : coreGrid).appendChild(btn);
  });
}

// ── Device scaler: fill page width via CSS zoom ───────────────────
function scaleDevice() {
  const scaler = document.querySelector('.device-frame-scaler');
  const frame  = document.querySelector('.device-frame');
  if (!scaler || !frame) return;
  // Reset zoom first to measure natural width
  scaler.style.zoom = 1;
  const naturalW = frame.offsetWidth;
  if (!naturalW) return;
  const availW   = window.innerWidth - 8; // 4px margin each side
  const ratio    = Math.min(availW / naturalW, 1.6); // cap at 1.6× on desktop
  scaler.style.zoom = ratio;
}

// ── Serial UI bindings ────────────────────────────────────────────
function bindSerialUI(serial) {
  const btnConnect    = document.getElementById('btn-connect');
  const btnDisconnect = document.getElementById('btn-disconnect');
  const connStatus    = document.getElementById('conn-status');
  const connIndicator = document.getElementById('conn-indicator');

  if (!btnConnect) return;

  btnConnect.addEventListener('click', async () => {
    if (!serial.isSupported) {
      alert('Web Serial API not supported.\nUse Chrome / Edge 89+ or Chromium-based browser.\n\n模擬模式仍可使用。');
      return;
    }
    btnConnect.disabled = true;
    connStatus.textContent = '連接中…';
    try {
      await serial.connect();
    } catch (err) {
      connStatus.textContent = `連接失敗: ${err.message}`;
      btnConnect.disabled = false;
    }
  });

  btnDisconnect.addEventListener('click', async () => {
    await serial.disconnect();
  });

  serial.addEventListener('serial:state', (e) => {
    const state = e.detail.state;
    if (state === SerialState.CONNECTED) {
      connStatus.textContent = `已連接 (${serial.baudRate} baud)`;
      connIndicator.className = 'w-2 h-2 rounded-full bg-green-400';
      btnConnect.classList.add('hidden');
      btnDisconnect.classList.remove('hidden');
    } else if (state === SerialState.DISCONNECTED) {
      connStatus.textContent = '模擬模式 (Simulation)';
      connIndicator.className = 'w-2 h-2 rounded-full bg-gray-600';
      btnConnect.classList.remove('hidden');
      btnDisconnect.classList.add('hidden');
      btnConnect.disabled = false;
    } else if (state === SerialState.ERROR) {
      connStatus.textContent = '連接錯誤 — 模擬模式';
      connIndicator.className = 'w-2 h-2 rounded-full bg-red-500';
      btnConnect.classList.remove('hidden');
      btnDisconnect.classList.add('hidden');
      btnConnect.disabled = false;
    }
  });
}

// ── Debug panel ───────────────────────────────────────────────────
function addDebugEntry(type, msg) {
  const log = document.getElementById('debug-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `dbg dbg-${type}`;
  entry.textContent = `${new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} [${type.toUpperCase()}] ${msg}`;
  log.appendChild(entry);
  // Auto-scroll + trim to 100 entries
  while (log.children.length > 100) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

document.getElementById('btn-clear-debug')?.addEventListener('click', () => {
  const log = document.getElementById('debug-log');
  if (log) log.innerHTML = '';
});

document.getElementById('btn-toggle-debug')?.addEventListener('click', () => {
  const panel = document.getElementById('debug-panel');
  panel?.classList.toggle('hidden');
});

// ── Splash screen helpers ─────────────────────────────────────────
function updateSplash(pct, msg) {
  const bar  = document.querySelector('.splash-progress');
  const sub  = document.getElementById('splash-msg');
  if (bar) bar.style.width = pct + '%';
  if (sub && msg) sub.textContent = msg;
}

function dismissSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('fade-out');
  setTimeout(() => splash.remove(), 600);
}

// ── Start ─────────────────────────────────────────────────────────
boot().catch(err => {
  console.error('[App] Boot failed:', err);
  const splashMsg = document.getElementById('splash-msg');
  if (splashMsg) splashMsg.textContent = `Boot error: ${err.message}`;
});
