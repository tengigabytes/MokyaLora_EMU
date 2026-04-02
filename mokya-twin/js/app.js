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
import { SettingsScreen }       from './ui/screens/settings-screen.js';

// ── Globals (accessible in console for dev) ──────────────────────
let display, keyboard, mie, serial, renderer, screens;

async function boot() {
  updateSplash(10, 'Initialising display HAL…');

  // ── 1. Display HAL ──────────────────────────────────────────────
  const canvas = document.getElementById('screen-canvas');
  display = new DisplayHAL(canvas);

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
  await mie.loadWasm('./wasm/mie_core.wasm');

  try {
    if (mie.isWasmActive) {
      await mie.loadDictionary('./data/dict_dat.bin', './data/dict_values.bin');
    } else {
      await mie.loadDictionary('./data/zhuyin-mock.json');
    }
  } catch (err) {
    console.warn('[App] Dict load failed, continuing without:', err.message);
  }

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
  screens.register('chat',     new ChatScreen(renderer, mie, serial));
  screens.register('map',      new MapScreen(renderer, mie, serial));
  screens.register('settings', new SettingsScreen(renderer, mie, serial));

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

  // Tab navigation via bottom tab bar click (HTML buttons)
  bindTabBarClicks();

  // Start on chat screen
  updateSplash(96, 'Ready!');
  screens.navigateTo('chat', 'none');

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

// ── Tab bar click handler ─────────────────────────────────────────
function bindTabBarClicks() {
  // We'll render tab bar on canvas, but also intercept canvas clicks
  const canvas = document.getElementById('screen-canvas');
  canvas.addEventListener('click', (e) => {
    const rect  = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;

    // Tab bar: y 218–240, three equal columns (landscape 320×240)
    if (cy >= 218) {
      const tabW = 320 / 3;
      const tabIdx = Math.floor(cx / tabW);
      if (tabIdx === 0) screens.navigateTo('chat',     'fade');
      else if (tabIdx === 1) screens.navigateTo('map', 'fade');
      else                   screens.navigateTo('settings', 'fade');
    }
  });
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
