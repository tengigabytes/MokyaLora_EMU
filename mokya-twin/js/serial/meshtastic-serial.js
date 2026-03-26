/**
 * MeshtasticSerial — Web Serial API bridge to physical Meshtastic device
 *
 * Connects to a real RP2350-based MokyaLora device over USB CDC Serial.
 * Sends typed text as Meshtastic text messages (simplified protobuf framing).
 * Receives incoming mesh packets and parses them for the chat UI.
 *
 * Modes:
 *   SIMULATION — all messages go to localStorage mock store
 *   USB        — real Web Serial connection
 *
 * Meshtastic serial framing (simplified):
 *   [0x94 0xC3] [length:uint16_le] [protobuf_payload...]
 *
 * Phase 3 will add full protobuf encoding/decoding.
 * Phase 1: framing + send/receive skeleton, simulation mode fully functional.
 */

/** Connection states (mirrors enum in firmware serial handler) */
export const SerialState = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING:   'CONNECTING',
  CONNECTED:    'CONNECTED',
  ERROR:        'ERROR',
});

/** Baud rates supported by Meshtastic firmware */
export const BAUD_RATES = [115200, 38400, 9600];
const DEFAULT_BAUD = 115200;

/** Meshtastic serial magic bytes (start-of-packet) */
const PKT_MAGIC = [0x94, 0xC3];

export class MeshtasticSerial extends EventTarget {
  constructor() {
    super();
    this.state = SerialState.DISCONNECTED;
    this._port   = null;
    this._reader = null;
    this._writer = null;
    this._readLoop = null;
    this._rxBuf  = new Uint8Array(4096);
    this._rxHead = 0;

    /** Our node ID (set on connect, or mock) */
    this.myNodeId = 'LOCAL';

    /** Serial baud rate */
    this.baudRate = DEFAULT_BAUD;

    /** Whether Web Serial is available in this browser */
    this.isSupported = 'serial' in navigator;
  }

  // ── Connect / Disconnect ─────────────────────────────────────

  /**
   * Request a port and connect.
   * Shows the browser's native serial port picker dialog.
   * @throws if denied or Serial not supported
   */
  async connect() {
    if (!this.isSupported) {
      throw new Error('Web Serial API not supported. Use Chrome 89+ or Edge 89+.');
    }
    this._setState(SerialState.CONNECTING);
    try {
      // Show browser port picker
      this._port = await navigator.serial.requestPort({
        // Filter to Meshtastic-compatible USB VID/PID if known
        // filters: [{ usbVendorId: 0x303A }]  // Espressif — uncomment if needed
      });
      await this._port.open({ baudRate: this.baudRate });
      this._writer = this._port.writable.getWriter();
      this._startReadLoop();
      this._setState(SerialState.CONNECTED);
      this._emit('serial:connected', { baudRate: this.baudRate });
      console.log('[Serial] Connected at', this.baudRate, 'baud');
    } catch (err) {
      this._setState(SerialState.ERROR);
      this._emit('serial:error', { message: err.message });
      throw err;
    }
  }

  async disconnect() {
    this._setState(SerialState.DISCONNECTED);
    try {
      if (this._reader) { await this._reader.cancel(); this._reader = null; }
      if (this._writer) { await this._writer.close(); this._writer = null; }
      if (this._port)   { await this._port.close();   this._port   = null; }
    } catch (err) {
      console.warn('[Serial] Disconnect error:', err.message);
    }
    this._emit('serial:disconnected', {});
    console.log('[Serial] Disconnected');
  }

  // ── Send ─────────────────────────────────────────────────────

  /**
   * Send a text message to the mesh.
   * In SIMULATION mode, echoes to localStorage.
   * In USB mode, encodes as Meshtastic protobuf over serial.
   * @param {string} text
   */
  async sendTextMessage(text) {
    if (this.state !== SerialState.CONNECTED) {
      // Simulation mode: store locally
      this._simulateSend(text);
      return;
    }
    try {
      const payload = this._encodeTextMessage(text);
      await this._writer.write(payload);
      this._emit('serial:sent', { text });
    } catch (err) {
      this._emit('serial:error', { message: err.message });
    }
  }

  // ── Receive loop ─────────────────────────────────────────────

  _startReadLoop() {
    this._reader = this._port.readable.getReader();
    this._readLoop = this._runReadLoop();
  }

  async _runReadLoop() {
    try {
      while (true) {
        const { value, done } = await this._reader.read();
        if (done) break;
        this._onRxData(value);
      }
    } catch (err) {
      if (this.state === SerialState.CONNECTED) {
        console.warn('[Serial] Read loop ended:', err.message);
        this._setState(SerialState.ERROR);
        this._emit('serial:error', { message: err.message });
      }
    }
  }

  _onRxData(chunk) {
    // Append to ring buffer
    for (const byte of chunk) {
      this._rxBuf[this._rxHead % this._rxBuf.length] = byte;
      this._rxHead++;
    }
    // Try to parse complete packets
    this._parsePackets();
  }

  _parsePackets() {
    // Simplified framing: look for [0x94 0xC3][len16le][payload...]
    // Phase 3 will implement full protobuf parsing
    const buf = this._rxBuf;
    let i = 0;
    while (i < this._rxHead - 4) {
      if (buf[i] === PKT_MAGIC[0] && buf[i+1] === PKT_MAGIC[1]) {
        const len = buf[i+2] | (buf[i+3] << 8);
        if (this._rxHead - i - 4 >= len) {
          const payload = buf.slice(i + 4, i + 4 + len);
          this._dispatchPacket(payload);
          i += 4 + len;
          continue;
        }
      }
      i++;
    }
  }

  _dispatchPacket(payload) {
    // Phase 3: full protobuf decode
    // Phase 1: treat payload as UTF-8 text after first 4 bytes (fake header)
    try {
      const text = new TextDecoder().decode(payload.slice(4));
      const msg = {
        from: 'MESH-' + Math.floor(Math.random() * 9000 + 1000),
        text: text.trim(),
        time: new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' }),
        rssi: -(50 + Math.floor(Math.random() * 60)),
        snr:  +(Math.random() * 8 - 2).toFixed(1),
      };
      this._emit('serial:message', { message: msg });
    } catch {}
  }

  // ── Encoding (Phase 1 simplified) ────────────────────────────

  _encodeTextMessage(text) {
    // Simplified: [magic 2B][len 2B][4B fake header][UTF-8 text]
    const textBytes = new TextEncoder().encode(text);
    const payload   = new Uint8Array(4 + textBytes.length);
    payload[0] = 0x08; // field 1, wire type 0 (fake portnum)
    payload[1] = 0x01; // TEXT_MESSAGE_APP = 1
    payload[2] = 0x12; // field 2, wire type 2 (fake payload)
    payload[3] = textBytes.length;
    payload.set(textBytes, 4);

    const frame = new Uint8Array(4 + payload.length);
    frame[0] = PKT_MAGIC[0];
    frame[1] = PKT_MAGIC[1];
    frame[2] =  payload.length       & 0xFF;
    frame[3] = (payload.length >> 8) & 0xFF;
    frame.set(payload, 4);
    return frame;
  }

  // ── Simulation mode ──────────────────────────────────────────

  _simulateSend(text) {
    // Store in localStorage as a sent message
    const msgs = this._getSimMessages();
    msgs.push({
      id:   Date.now(),
      from: 'ME',
      text,
      time: new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' }),
      sent: true,
    });
    localStorage.setItem('mokya_sim_messages', JSON.stringify(msgs.slice(-100)));
    this._emit('serial:sent', { text, simulated: true });

    // Simulate a reply after 2–5 seconds (demo)
    const delay = 2000 + Math.random() * 3000;
    setTimeout(() => {
      const replies = [
        '收到！訊號很清晰 73',
        'Roger that, -85dBm here',
        '你好！我在山頂，RSSI -92',
        'QSL de BM-7388',
        'mesh 狀況不錯呢',
      ];
      const msg = {
        id:   Date.now(),
        from: 'BM-' + (7000 + Math.floor(Math.random() * 999)),
        text: replies[Math.floor(Math.random() * replies.length)],
        time: new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' }),
        rssi: -(70 + Math.floor(Math.random() * 40)),
        snr:  +(Math.random() * 6 - 1).toFixed(1),
        sent: false,
      };
      const updated = this._getSimMessages();
      updated.push(msg);
      localStorage.setItem('mokya_sim_messages', JSON.stringify(updated.slice(-100)));
      this._emit('serial:message', { message: msg });
    }, delay);
  }

  _getSimMessages() {
    try { return JSON.parse(localStorage.getItem('mokya_sim_messages') || '[]'); }
    catch { return []; }
  }

  getSimMessages() { return this._getSimMessages(); }

  // ── State helpers ─────────────────────────────────────────────

  _setState(state) {
    this.state = state;
    this._emit('serial:state', { state });
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get isConnected() { return this.state === SerialState.CONNECTED; }
}
