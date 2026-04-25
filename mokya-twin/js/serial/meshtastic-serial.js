import { decodeFromRadio, encodeWantConfig } from './meshtastic-frame.js';

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
      // Request a full config dump from the device. The reply arrives as
      // a stream of FromRadio packets terminated by FromRadio.config_complete_id.
      try { await this._sendWantConfig(); }
      catch (e) { console.warn('[Serial] want_config failed:', e.message); }
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
    // Meshtastic stream framing: [0x94 0xC3][len_msb len_lsb][payload].
    // Length is BIG-ENDIAN — confirmed against meshtastic/python
    // mesh_interface._parseFrame and firmware StreamAPI::handleFromRadio.
    const buf = this._rxBuf;
    let i = 0;
    while (i + 4 <= this._rxHead) {
      if (buf[i] !== PKT_MAGIC[0] || buf[i + 1] !== PKT_MAGIC[1]) { i++; continue; }
      const len = (buf[i + 2] << 8) | buf[i + 3];
      if (this._rxHead - i - 4 < len) break;          // wait for more bytes
      const payload = buf.slice(i + 4, i + 4 + len);
      this._dispatchPacket(payload);
      i += 4 + len;
    }
    // Compact buffer — drop everything before i.
    if (i > 0) {
      const remaining = this._rxHead - i;
      this._rxBuf.copyWithin(0, i, this._rxHead);
      this._rxHead = remaining;
    }
  }

  _dispatchPacket(payload) {
    let fromRadio;
    try { fromRadio = decodeFromRadio(payload); }
    catch (err) {
      console.warn('[Serial] decode failed:', err.message, payload);
      return;
    }
    // Fan out to higher-level events so consumers don't need to switch
    // on the FromRadio top-level themselves.
    this._emit('serial:fromradio', { fromRadio });
    if (fromRadio.myInfo)            this._emit('serial:my_info',     { myInfo:   fromRadio.myInfo });
    if (fromRadio.nodeInfo)          this._emit('serial:node_info',   { nodeInfo: fromRadio.nodeInfo });
    if (fromRadio.config)            this._emit('serial:config',      { config:   fromRadio.config });
    if (fromRadio.channel)           this._emit('serial:channel',     { channel:  fromRadio.channel });
    if (fromRadio.metadata)          this._emit('serial:metadata',    { metadata: fromRadio.metadata });
    if (fromRadio.configCompleteId !== undefined) {
      this._emit('serial:config_complete', { id: fromRadio.configCompleteId });
      console.log('[Serial] Config dump complete (id=' + fromRadio.configCompleteId + ')');
    }
  }

  // ── Sending raw ToRadio frames ─────────────────────────────

  /** Wrap a ToRadio protobuf payload in the Meshtastic stream frame. */
  _frameToRadio(payload) {
    const frame = new Uint8Array(4 + payload.length);
    frame[0] = PKT_MAGIC[0];
    frame[1] = PKT_MAGIC[1];
    frame[2] = (payload.length >> 8) & 0xFF;        // BE
    frame[3] =  payload.length       & 0xFF;
    frame.set(payload, 4);
    return frame;
  }

  /** Send `ToRadio { want_config_id = nonce }`. Triggers a config dump. */
  async _sendWantConfig(nonce = 1) {
    const payload = encodeWantConfig(nonce);
    await this._writer.write(this._frameToRadio(payload));
    console.log('[Serial] → want_config_id =', nonce);
  }

  // ── Encoding (placeholder for sendTextMessage path) ──────────

  _encodeTextMessage(text) {
    // Real ToRadio.packet encoding is non-trivial (MeshPacket → Data
    // sub-message → portnum=TEXT_MESSAGE_APP=1 → utf-8 payload). For
    // now we still emit the simulation-mode frame so the EMU's
    // sendText path at least round-trips locally; the real encoder
    // lives in a follow-up commit once the receive path is verified
    // against a real device.
    const textBytes = new TextEncoder().encode(text);
    const payload   = new Uint8Array(4 + textBytes.length);
    payload[0] = 0x08; payload[1] = 0x01;            // fake portnum varint
    payload[2] = 0x12; payload[3] = textBytes.length; // fake payload len
    payload.set(textBytes, 4);
    return this._frameToRadio(payload);
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
