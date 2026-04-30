/**
 * SpectrumScreen — T-3 訊號頻譜(對齊 firmware spectrum_view.c)
 *
 * 從節點列表抓所有有 SNR 的 peer 排序顯示(SNR 由強到弱),最多 8 列。
 * Row format:`<name>  ±SS.S  [########]  Nh  <age>`,8 格 ASCII bar
 * 線性映射 -10..+10 dB → 0..8 cells。
 *
 * Keys: BACK 回 T-0
 */

import { BaseScreen } from '../screen-manager.js';
import { NODES }     from './nodes-data.js';

const HEADER_H = 16;
const ROW_H = 24;
const MAX_ROWS = 8;
const BAR_CELLS = 8;

function snrToCells(snrDb) {
  if (snrDb <= -10) return 0;
  if (snrDb >=  10) return BAR_CELLS;
  return Math.round(((snrDb + 10) * BAR_CELLS) / 20);
}

function formatAge(secs) {
  if (secs < 60)    return `${secs|0}s`;
  if (secs < 3600)  return `${(secs/60)|0}m`;
  if (secs < 86400) return `${(secs/3600)|0}h`;
  return `${(secs/86400)|0}d`;
}

export class SpectrumScreen extends BaseScreen {
  render(now) {
    const r = this.r;
    r.clear();

    r.drawStatusBar({
      time:    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      battery: 75, rssi: -82,
    });

    // Filter peers with valid snr; sort by snr desc.
    const peers = NODES
      .filter(n => n.snr !== null && n.snr !== undefined && n.user?.id !== this.serial?.myNodeId)
      .map(n => ({
        name: n.user?.short_name ?? '?',
        snr:  n.snr,
        hops: n.hops_away ?? 0xFF,
        age:  this._mockAge(n),
      }))
      .sort((a, b) => b.snr - a.snr);

    // Header
    r.drawLabel(4, 30, `T-3 訊號頻譜  ${peers.length} peers (SNR known)`, {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });

    if (peers.length === 0) {
      r.drawLabel(4, 60, '(no SNR data — cascade hasn\'t seen any peer yet)', {
        font: r.F.ZH_SM, color: r.C.TEXT,
      });
    } else {
      for (let i = 0; i < Math.min(MAX_ROWS, peers.length); i++) {
        const p = peers[i];
        const cells = snrToCells(p.snr);
        let bar = '[';
        for (let c = 0; c < BAR_CELLS; c++) bar += (c < cells) ? '#' : '.';
        bar += ']';
        const snrStr = (p.snr >= 0 ? '+' : '') + p.snr.toFixed(1);
        const hopStr = p.hops === 0xFF ? '--' : `${p.hops}h`;
        const ageStr = formatAge(p.age);
        const line = `${p.name.padEnd(9)} ${snrStr.padEnd(5)} ${bar} ${hopStr.padEnd(3)} ${ageStr}`;
        const y = 46 + i * ROW_H + 14;
        r.drawLabel(4, y, line, {
          font: r.F.MONO_MD ?? r.F.ZH_SM, color: r.C.TEXT,
        });
      }
    }

    r.drawLabel(4, 235, 'BACK 工具', {
      font: r.F.ZH_SM, color: r.C.TEXT_DIM,
    });
  }

  _mockAge(n) {
    // Convert "X 分前" / "X 秒前" mock string back into seconds.
    const lh = n.last_heard;
    if (typeof lh !== 'string') return 0;
    if (lh.includes('秒')) return parseInt(lh) || 0;
    if (lh.includes('分')) return (parseInt(lh) || 0) * 60;
    if (lh.includes('時')) return (parseInt(lh) || 0) * 3600;
    return 0;
  }

  handleKeyTap({ key }) {
    if (key.fn === 'BACK' || key.fn === 'FUNC') this.goBack();
  }
}
