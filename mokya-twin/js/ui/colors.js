/**
 * MokyaLora UI 配色 token — 對齊 doc/ui/00-design-charter.md
 *
 * 全域配色憲章(深色主題)。所有 renderer / screen / component 都應從這裡
 * 取色,**不要**內嵌 hex 字面量。
 *
 * 配色記憶:
 *   主色白 = 預設、Op 態
 *   綠     = 良好、TX 完成、未讀計數、3D Fix
 *   黃     = 注意、2D Fix、電量警告
 *   紅     = 嚴重、無 GPS、低電、SOS
 *   橙     = TX 動作、IME 輸入態、焦點(D-pad 行為已變)
 *   灰     = 不動作、停用、無資料
 */
export const C = {
  // 背景
  bg_primary:         '#0B0F14',   // 主背景
  bg_secondary:       '#161C24',   // 次背景(卡片、文字框內、內容區框)
  bg_secondary2:      '#1F2731',   // 次背景變體(更亮的層)
  bg_preedit:         '#2A2018',   // Preedit 背景塊(深橙低飽和)

  // 文字
  text_primary:       '#E6EDF3',
  text_secondary:     '#7D8590',
  text_muted:         '#30363D',
  text_preedit:       '#FFA657',

  // 焦點 / IME
  accent_focus:       '#FFA657',   // 焦點橙、候選字選中、游標、IME 模式
  accent_focus_dim:   '#8B5A2B',   // 焦點態邊框中間調(暗橙)

  // 狀態色
  accent_success:     '#39D353',   // 主色綠(成功、未讀、3D Fix、TX 完成)
  accent_success_dim: '#1A7A36',
  warn_yellow:        '#F1E05A',
  warn_red:           '#F85149',

  // 邊框
  border_focus:       '#FFA657',
  border_normal:      '#30363D',

  // 警告態整條覆蓋
  alert_bg_critical:  '#8B1A1A',   // SOS 啟動 / 收到 SOS
  alert_bg_warning:   '#6E1A1A',   // 極低電量 <5%

  // 對話氣泡(沿用 Meshtastic-style,但底色改深色)
  bubble_out:         '#1C3A24',   // 我發出(綠系深底)
  bubble_in:          '#161C24',   // 他人(用 bg_secondary)

  // 特殊
  lora_purple:        '#BF5AF2',   // LoRa 波形動畫
  info_blue:          '#64D2FF',   // 通用 info
};
