/**
 * MapScreen — Nearby node map with GNSS coordinates
 *
 * Layout (240 × 320):
 *   [0–17]   Status bar
 *   [18–297] Map canvas (Canvas 2D drawn lat/lon grid + nodes)
 *   [298–319] Tab bar
 *
 * Features:
 *   - Dark tile-style grid (simulates offline map)
 *   - Node markers with callsigns + pulsing rings
 *   - GNSS coordinate display for selected node
 *   - Simulated node positions update over time
 *   - "MY LOCATION" dot with green glow
 */

import { BaseScreen } from '../screen-manager.js';

// Simulated nearby nodes (GNSS lat/lon near Yangmingshan, Taiwan)
const MOCK_NODES = [
  { id:'BM-7388', lat: 25.1932, lon: 121.5599, rssi:-82,  snr:4.2, desc:'七星山頂' },
  { id:'VK2-101', lat: 25.1705, lon: 121.4811, rssi:-98,  snr:1.8, desc:'淡水' },
  { id:'BM-0042', lat: 25.0339, lon: 121.5645, rssi:-105, snr:0.5, desc:'台北101' },
  { id:'TW-5511', lat: 25.2100, lon: 121.6700, rssi:-91,  snr:2.4, desc:'基隆山' },
  { id:'ME',      lat: 25.1830, lon: 121.5419, rssi:0,    snr:99,  desc:'MY POS' },
];

export class MapScreen extends BaseScreen {
  constructor(renderer, mie, serial) {
    super(renderer, mie, serial);
    this._selectedNodeIdx = 4; // Default: highlight MY POS
    this._panX = 0;
    this._panY = 0;
    this._zoom = 1;
    this._animPhase = 0;
    this._nodes = MOCK_NODES.map(n => ({ ...n }));
  }

  onEnter(from) {
    super.onEnter(from);
    // Wiggle node positions slightly every 5s (simulated GPS drift)
    this._driftInterval = setInterval(() => this._driftNodes(), 5000);
  }

  onLeave(toScreen) {
    if (this._driftInterval) {
      clearInterval(this._driftInterval);
      this._driftInterval = null;
    }
  }

  _driftNodes() {
    for (const n of this._nodes) {
      if (n.id !== 'ME') {
        n.lat += (Math.random() - 0.5) * 0.002;
        n.lon += (Math.random() - 0.5) * 0.002;
      }
    }
  }

  render(now) {
    const r = this.r;
    this._animPhase = (now / 1000) % (Math.PI * 2);

    const CONTENT_TOP = 18;
    const TAB_H       = 22;
    const MAP_H       = r.H - CONTENT_TOP - TAB_H;

    // ── Map background ──────────────────────────────────────────
    r.d.fillRect(0, CONTENT_TOP, r.W, MAP_H, '#0C1018');

    // ── Grid lines (lat/lon) ─────────────────────────────────────
    this._drawGrid(CONTENT_TOP, MAP_H);

    // ── Connection lines between nodes ──────────────────────────
    this._drawConnections(CONTENT_TOP, MAP_H);

    // ── Node markers ─────────────────────────────────────────────
    this._drawNodes(CONTENT_TOP, MAP_H, now);

    // ── Info panel: selected node details ────────────────────────
    this._drawNodeInfo(CONTENT_TOP, MAP_H);

    // ── Coordinate overlay ───────────────────────────────────────
    this._drawCoordOverlay(CONTENT_TOP, MAP_H);

    // ── Scale bar ────────────────────────────────────────────────
    r.ctx.fillStyle = r.C.TEXT_DIM;
    r.ctx.fillRect(8, CONTENT_TOP + MAP_H - 16, 30, 1);
    r.drawLabel(8, CONTENT_TOP + MAP_H - 6, '~5km', { font: r.F.XS, color: r.C.TEXT_DIM });

    // ── Status bar ────────────────────────────────────────────────
    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' }),
      battery: 72,
      rssi:    -85,
      mode:    'MAP',
    });

    // ── Tab bar ───────────────────────────────────────────────────
    r.drawTabBar(['💬 聊天', '🗺 地圖', '⚙ 設定'], 1);
  }

  _projectLatLon(lat, lon, contentTop, mapH) {
    // Simple Mercator approximation for small area
    // Center on MY POS
    const me  = this._nodes.find(n => n.id === 'ME');
    const cLat = me?.lat ?? 25.18;
    const cLon = me?.lon ?? 121.54;

    const scale = 1200 * this._zoom; // pixels per degree
    const x = this.r.W / 2 + (lon - cLon) * scale + this._panX;
    const y = contentTop + mapH / 2 - (lat - cLat) * scale + this._panY;
    return { x, y };
  }

  _drawGrid(contentTop, mapH) {
    const r = this.r;
    r.ctx.strokeStyle = '#1A2028';
    r.ctx.lineWidth = 0.5;

    // Draw 8×10 grid
    const cols = 8, rows = 10;
    for (let i = 0; i <= cols; i++) {
      const x = (r.W / cols) * i;
      r.ctx.beginPath(); r.ctx.moveTo(x, contentTop); r.ctx.lineTo(x, contentTop + mapH); r.ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = contentTop + (mapH / rows) * j;
      r.ctx.beginPath(); r.ctx.moveTo(0, y); r.ctx.lineTo(r.W, y); r.ctx.stroke();
    }
  }

  _drawConnections(contentTop, mapH) {
    const r = this.r;
    r.ctx.strokeStyle = 'rgba(48,209,88,0.12)';
    r.ctx.lineWidth   = 0.8;
    r.ctx.setLineDash([3, 5]);
    const me = this._projectLatLon(
      this._nodes.find(n => n.id === 'ME').lat,
      this._nodes.find(n => n.id === 'ME').lon,
      contentTop, mapH
    );
    for (const node of this._nodes) {
      if (node.id === 'ME') continue;
      if (node.rssi < -110) continue; // Out of range
      const p = this._projectLatLon(node.lat, node.lon, contentTop, mapH);
      r.ctx.beginPath(); r.ctx.moveTo(me.x, me.y); r.ctx.lineTo(p.x, p.y); r.ctx.stroke();
    }
    r.ctx.setLineDash([]);
  }

  _drawNodes(contentTop, mapH, now) {
    const r = this.r;
    const pulseScale = 0.5 + 0.5 * Math.sin(now / 600);

    this._nodes.forEach((node, idx) => {
      const { x, y } = this._projectLatLon(node.lat, node.lon, contentTop, mapH);
      if (x < -10 || x > r.W + 10 || y < contentTop - 10 || y > contentTop + mapH + 10) return;

      const isMe       = node.id === 'ME';
      const isSelected = idx === this._selectedNodeIdx;
      const color      = isMe ? r.C.GREEN : (node.rssi > -90 ? r.C.INFO : r.C.TEXT_DIM);
      const size       = isMe ? 5 : 4;

      // Pulse ring
      if (isMe || isSelected) {
        const pr = (size + 4) + pulseScale * 4;
        r.ctx.beginPath();
        r.ctx.arc(x, y, pr, 0, Math.PI * 2);
        r.ctx.strokeStyle = color + '30';
        r.ctx.lineWidth   = 1;
        r.ctx.stroke();
      }

      r.drawNodeDot(x, y, node.id, { color, pulse: isSelected, size });

      // RSSI label for strong signals
      if (!isMe && node.rssi > -100) {
        r.drawLabel(x + size + 2, y - 2, `${node.rssi}`, {
          font: r.F.XS, color: r.C.TEXT_MUTED
        });
      }
    });
  }

  _drawNodeInfo(contentTop, mapH) {
    const r = this.r;
    const node = this._nodes[this._selectedNodeIdx];
    if (!node) return;

    // Bottom info panel
    const panelH = 36;
    const panelY = contentTop + mapH - panelH;
    r.drawCard(2, panelY, r.W - 4, panelH, { radius: 6, bg: '#111820', border: r.C.BORDER });

    r.drawLabel(8, panelY + 10, node.id, { font: r.F.MD, color: r.C.GREEN });
    r.drawLabel(8, panelY + 22, node.desc, { font: r.F.XS, color: r.C.TEXT_DIM });

    if (node.id !== 'ME') {
      r.drawLabel(r.W - 8, panelY + 10, `${node.rssi} dBm`, {
        font: r.F.XS, color: node.rssi > -90 ? r.C.GREEN : r.C.WARNING, align: 'right'
      });
      r.drawLabel(r.W - 8, panelY + 22, `SNR ${node.snr}`, {
        font: r.F.XS, color: r.C.TEXT_DIM, align: 'right'
      });
    } else {
      r.drawLabel(r.W - 8, panelY + 16, '📍 MY POS', {
        font: r.F.XS, color: r.C.GREEN, align: 'right'
      });
    }
  }

  _drawCoordOverlay(contentTop, mapH) {
    const r = this.r;
    const me = this._nodes.find(n => n.id === 'ME');
    if (!me) return;
    const lat = me.lat.toFixed(4);
    const lon = me.lon.toFixed(4);
    r.drawLabel(r.W / 2, contentTop + 8, `${lat}N  ${lon}E`, {
      font: r.F.XS, color: r.C.TEXT_DIM, align: 'center'
    });
  }

  handleKeyTap({ key }) {
    if (key.fn === 'UP')    { this._panY += 20; return; }
    if (key.fn === 'DOWN')  { this._panY -= 20; return; }
    if (key.fn === 'LEFT')  { this._panX += 20; return; }
    if (key.fn === 'RIGHT') { this._panX -= 20; return; }
    if (key.fn === 'TONE1') { this._zoom = Math.min(4, this._zoom * 1.5); return; }
    if (key.fn === 'TONE2') { this._zoom = Math.max(0.3, this._zoom / 1.5); return; }
    if (key.fn === 'OK') {
      this._selectedNodeIdx = (this._selectedNodeIdx + 1) % this._nodes.length;
      return;
    }
    // Tab navigation
    if (key.fn === 'LEFT')  { this.goto('chat', 'slide_r'); return; }
    if (key.fn === 'BACK')  { this.goto('chat', 'slide_r'); return; }
  }

  handleKeyDown({ key }) {
    // Immediate pan on hold
    if (key.fn === 'UP')    this._panY += 5;
    if (key.fn === 'DOWN')  this._panY -= 5;
    if (key.fn === 'LEFT')  this._panX += 5;
    if (key.fn === 'RIGHT') this._panX -= 5;
  }
}
