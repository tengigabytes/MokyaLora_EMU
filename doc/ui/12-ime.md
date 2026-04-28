# 12 — G-3 IME 子模式（UI 套皮）

## 範圍界定

本規格僅規劃 **UI 套皮**：視覺呈現、版面、與其他 UI 元件銜接。

**不規劃**（由 repo 中已實作的 IME 引擎負責）：
- multitap timing 與 timeout
- 字典查詢與候選字排序
- 注音聲韻調合法性
- 句首大寫、自動補空格
- 學習頻率與上下文預測
- Preedit 緩衝管理

UI ↔ 引擎介面（假設引擎已提供類似這樣的 API）：

```c
typedef struct {
    char preedit_utf8[64];        // 當前 Preedit 字串
    char (*candidates)[16];       // 候選字陣列指標
    int candidate_count;
    int candidate_cursor;
    int candidate_page;
    int candidate_total_pages;
    bool has_candidates;          // IME Bar 顯隱開關
} ime_view_state_t;

void on_ime_state_changed(const ime_view_state_t* s);
void on_ime_commit_text(const char* utf8);  // 引擎決定 commit 某段文字
```

UI 端只負責**渲染這個狀態**，不解碼擊鍵。

## 兩種編輯模式

| | 模式 A 簡易編輯 | 模式 B 全螢幕編輯 |
|---|---|---|
| **用途** | 單行短文本 | 長文本、可換行 |
| **典型使用** | 設定值、暱稱、PSK、URL、搜尋框 | 訊息對話、Canned Message、記事本 |
| **文字框佔位** | 1 列 22-24px，App 內 | 全畫面（除 Status Bar） |
| **App 其他元素** | 仍可見 | 全部覆蓋 |
| **標題** | 沿用 App 標題 | 自帶標題列 22px |
| **換行** | 不允許 | OK 短按（<500ms） |
| **字數計數位置** | 框內右側 | 編輯區右下角 |
| **OK 短按** | 確認 → 回 App | 換行 |
| **OK 長按 ≥500ms** | 同短按 | 送出 → 回 App |
| **BACK** | 直接取消 | 自動存草稿 → 回 App |
| **Status Bar** | 顯示（含 IME 模式） | 顯示（含 IME 模式） |
| **適用文字框數** | 14 種 | 6 種 |

## 文字框類型對照表

| 文字框 | 模式 | IME | 上限 |
|---|---|---|---|
| 訊息對話輸入 | B | 注 | 240 |
| Canned Message 編輯 | B | 注 | 200 |
| 記事本內容 | B | 注 | 1000 |
| Admin Channel 註解 | B | 注 | 500 |
| 暱稱 Long Name | A | 注 | 39 |
| 暱稱 Short Name | A | 注 | 4 |
| 節點別名 | A | 注 | 20 |
| 頻道名稱 | A | 注 | 11 |
| 列表搜尋 | A | 注 | 20 |
| 航點名稱 | A | 注 | 30 |
| PSK / 加密金鑰 | A | Ab | 32 |
| MQTT URL | A | Ab | 64 |
| MQTT username | A | Ab | 32 |
| MQTT password | A | Ab | 64 |
| Wi-Fi SSID | A | Ab | 32 |
| Wi-Fi 密碼 | A | Ab | 64 |
| Admin Channel Key | A | Ab | 32 |
| 數值（hop limit、TX power、間隔） | A | Num | 依範圍 |
| 頻率覆寫 | A | Num | 8 |

## 模式 A 簡易編輯

### 線框圖

```
┌────────────────────────────────────────┐
│ STATUS BAR（注，橙）                    │ 16
├────────────────────────────────────────┤
│ App 標題                                │
│ 說明文字                                │
│ ┌──────────────────────────────────┐   │
│ │ 內容 ▒Preedit▒▌            14/39 │   │ 24  焦點態橙邊框
│ └──────────────────────────────────┘   │
│ App 其他內容                            │
├────────────────────────────────────────┤
│ ►候選字 候選字 候選字 ‹1/3›            │ 18 IME Bar（條件）
└────────────────────────────────────────┘
```

### 元素規格

| 元素 | 規格 |
|---|---|
| 文字框寬度 | 320px - 左右 padding 16px = 304px |
| 文字框高度 | 22-24px |
| 字數計數位置 | 框內靠右，padding 4px |
| 焦點邊框 | 橙 `#FFA657` 2px |
| 一般邊框 | 灰 `#30363D` 1px |
| 唯讀邊框 | 灰 `#30363D` 1px、背景 `#0B0F14` |
| 內部背景 | `#161C24` |
| 已確認文字 | 主色 `#E6EDF3` |
| Preedit 文字 | 橙 `#FFA657` |
| Preedit 背景塊 | `#2A2018`（深橙低飽和） |
| 游標 ▌ | 橙 `#FFA657` 1Hz 閃爍 |

### 字數計數顏色規則

| 狀態 | 顏色 |
|---|---|
| <80% | 次色 `#7D8590` |
| 80-99% | 黃 `#F1E05A` |
| 100% | 紅 `#F85149`，額外擊鍵丟棄 |

## 模式 B 全螢幕編輯

### 線框圖

```
┌────────────────────────────────────────┐
│ STATUS BAR（注，橙）                    │ 16
├────────────────────────────────────────┤
│ 標題（對象 / 設定項）                    │ 22
│ ──────────────────────────────────────│ 1
│                                        │
│ 已輸入內容                              │
│ 跨多行 word wrap                        │
│ 也可手動換行（OK 短按）                  │
│ ▒Preedit▒▌                            │
│                                        │
│                                                42/240 │ 字數靠右下
├────────────────────────────────────────┤
│ ►候選字 候選字 候選字 ‹1/3›            │ 18 IME Bar（條件）
└────────────────────────────────────────┘
```

### 元素規格

| 元素 | 規格 |
|---|---|
| 編輯區寬度 | 320px - 左右 padding 16px = 304px |
| 行高 | 22px（CJK 16px + padding 6px） |
| 可顯示行數 | 8-9 行（依 IME Bar 顯隱） |
| 字數計數位置 | 編輯區右下角，與最後一行同列 |
| 自動 word wrap | 是（半形單字不切斷、全形可任意切） |
| 捲動 | 自動，游標永遠可見，無捲軸 |
| 標題列 | 22px 高，主色，靠左對齊 |

### 訊息 App 對話內的特殊版面

模式 B 在訊息對話中時，標題列改為對話對象，並可能整合對話流預覽：

```
┌────────────────────────────────────────┐
│ STATUS BAR（注，橙）                    │ 16
├────────────────────────────────────────┤
│ 阿明                                    │ 22  對象名
│ ──────────────────────────────────────│ 1
│ [09:38] 阿明                           │
│   在嗎？我快到了                        │
│                                        │
│ [09:39] 我                             │   訊息歷史（捲動）
│   剛到停車場                            │
│                                        │
│ ──────────────────────────────────     │
│ ┌────────────────────────────────────┐ │
│ │ 我快到了 五分▒ㄓㄨㄥˊ▒▌            │ │  輸入區（緊鄰 IME Bar）
│ └────────────────────────────────────┘ │
│                                                28/240 │
├────────────────────────────────────────┤
│ ►鐘 中 種 眾 重 仲 鍾 終 ‹1/3›         │ 18 IME Bar
└────────────────────────────────────────┘
```

文字框緊鄰 IME Bar 上方，使用者輸入時眼睛在「文字框 → 候選字」的視線移動最短。

## 三種 IME 模式的視覺差異

| 模式 | Status Bar 標籤 | Preedit 行為 | IME Bar |
|---|---|---|---|
| 注（注音輸入） | 橙 `注` | 注音聲韻調序列 | 候選字翻頁式 |
| EN（英文字典） | 橙 `EN` | 英文字根 | 候選詞翻頁式 |
| Ab（純 multitap） | 橙 `Ab` | 短暫顯示 multitap 中的字元 | 不顯示 |
| Num（數字） | 橙 `Num` | 不顯示 | 不顯示 |

EN 智慧行為：
- 句首自動大寫（句點/問號之後也大寫）
- commit 候選詞後自動補空格
- 句點或問號後自動補空格 + 下個字大寫

Ab 模式：
- 無候選字、無字典查詢
- multitap 循環包含大小寫，例如 `[AS]` 鍵循環 `a→s→A→S→a...`
- 500ms timeout 後自動 commit

## IME Bar

### 顯隱條件

| 條件 | 高度 |
|---|---|
| 焦點不在文字框 | 0px |
| 焦點在文字框、無 Preedit/候選 | 0px |
| 焦點在文字框、有候選字 | 18px |

實作上：UI 訂閱引擎的 state 變更事件，根據 `has_candidates` 決定 `lv_obj_set_hidden()`。

### 候選字列版面

```
►鐘 中 種 眾 重 仲 鍾 終 ‹1/3›
```

| 元素 | 顏色 |
|---|---|
| `►` 標記 | 橙 `#FFA657` |
| 選中候選字 | 橙 `#FFA657` |
| 其他候選字 | 主色 `#E6EDF3` |
| 候選字間隔 | 1 全形空白 |
| `‹N/M›` 頁碼 | 次色 `#7D8590`，靠右 |
| 行背景 | `#161C24` |
| 上邊框 | `#30363D` 1px |

寬度：8 候選字 × 16px + 間隔 × 7 × 8px + 頁碼 32px + padding 16px ≈ 232px ≤ 320px ✓

候選字數量受設定控制（5-9 個，引擎決定，UI 只顯示）。

## Preedit 視覺

Inline 顯示在文字框內、游標位置：

```
┌──────────────────────────────────┐
│ 我快到了 五分▒ㄓㄨㄥˊ▒▌            │
└──────────────────────────────────┘
       已確認         ▲
                  Preedit 區
                  橙文字 + 淺橙背景塊
```

| 元素 | 顏色 |
|---|---|
| 已確認文本 | 主色 `#E6EDF3`，無背景 |
| Preedit 文字 | 橙 `#FFA657` |
| Preedit 背景塊 | `#2A2018`（深橙低飽和） |
| 游標 ▌ | 橙 `#FFA657`，1Hz 閃爍 |

**Preedit 背景塊規格**：
- 左右 padding：2px
- 上下 padding：0px（與行高貼齊）
- 圓角：1px

引擎 commit 後，Preedit 字串消失、被引擎送來的「正式文字」取代——視覺上是「橙色背景塊瞬間消失，內容變主色」。

## 鍵位行為（IME 態）

| 鍵 | 模式 A | 模式 B |
|---|---|---|
| 注音/字母鍵 | multitap 輸入 | multitap 輸入 |
| **OK 短按** | 確認 → 回 App | 換行 |
| **OK 長按 ≥500ms** | 同短按 | 送出 → 回 App |
| **BACK** | 取消 → 回 App | 存草稿 → 回 App |
| **D-pad ▲▼** | 候選字翻頁 / 游標 | 候選字翻頁 / 游標上下行 |
| **D-pad ◀▶** | 候選字游標 / 游標 | 候選字游標 / 游標 |
| **SPACE** | 注：一聲/空白；EN：commit+空格；Ab/Num：空格 | 同 |
| **DEL** | 刪 Preedit / 刪前字 | 同 |
| **MODE** | 切 IME（注→EN→Ab→Num） | 同 |
| **MODE 長按** | CapsLock | CapsLock |
| **，SYM** | 注：`，`；其他：`,`；長按進符號模式 | 同 |
| **。.?** | 注：`。`；其他：`.` | 同 |

## OK 長按 vs 短按邏輯

```
按下 OK
  │
  └── <500ms 放開 ─────→ 換行（模式 B）/ 確認（模式 A）
  └── ≥500ms 不放 ─────→ 送出（模式 B）/ 同短按（模式 A）
```

**無視覺提示**：使用者學會了就不需要視覺倒數條。回饋來自送出後文字框清空（模式 B 在訊息對話中會看到自己的訊息出現在對話流）。

## 草稿系統（模式 B 專用）

### 觸發

模式 B 編輯中按 BACK 且 buffer 非空 → 存草稿

### 規格

| 屬性 | 內容 |
|---|---|
| 儲存位置 | Flash `drafts.bin` |
| 每筆大小 | < 1KB |
| Key | 每個目的地一份（對話 ID、設定項 ID、記事 ID） |

### 草稿生命週期

| 事件 | 動作 |
|---|---|
| 模式 B + BACK + buffer 非空 | 存草稿 |
| OK 送出 / 確認 | 草稿清除 |
| 使用者選「重新開始」 | 草稿清除 |
| 30 天未動 | 自動清除 |
| 對話列表長按某對話選「清除草稿」 | 立即清除 |

### 草稿恢復畫面

下次進入該目的地時：

```
┌────────────────────────────────────────┐
│ STATUS BAR                             │
├────────────────────────────────────────┤
│ 阿明                                    │
│ ──────────────────────────────────────│
│                                        │
│       發現未完成的草稿                   │
│                                        │
│  「我已經到登山口了 預計 11 點...」      │
│              ──────                    │
│        建立於 2 小時前                  │
│                                        │
│      [►繼續編輯]    [重新開始]         │
│                                        │
└────────────────────────────────────────┘
```

D-pad ◀▶ 切換選項，OK 確認，BACK 取消（不進編輯，回上層）。

### 對話列表草稿提示

```
▶👤阿明     09:38 ●2 ✏ 我已經到登山口...
                       ↑ 橙色 ✏ 圖示
```

`✏` 圖示（橙色）取代 `●N` 位置，預覽文字改顯示草稿內容。

## App 端 widget API

### 共通定義

```c
typedef enum {
    IME_OP,
    IME_BOPOMOFO,    // 注
    IME_EN_DICT,     // EN
    IME_AB_MULTITAP, // Ab
    IME_NUM,         // Num
} ime_mode_t;
```

### 模式 A：簡易編輯

```c
typedef struct {
    char* buffer;
    int max_length;
    ime_mode_t default_ime;
    bool dict_enabled;
    void (*on_commit)(const char* text);
    void (*on_cancel)(void);
} inline_editor_config_t;

void show_inline_editor(const inline_editor_config_t* cfg);
```

### 模式 B：全螢幕編輯

```c
typedef struct {
    char* buffer;
    int max_length;
    const char* title;
    const char* draft_id;     // 草稿識別（如 "msg_!abc12345"）
    ime_mode_t default_ime;
    bool dict_enabled;
    void (*on_commit)(const char* text);
    void (*on_back)(void);    // 已存草稿，App 自行決定
} fullscreen_editor_config_t;

void show_fullscreen_editor(const fullscreen_editor_config_t* cfg);
```

### 草稿管理

```c
bool has_draft(const char* draft_id);
const char* get_draft(const char* draft_id);
uint32_t get_draft_age_seconds(const char* draft_id);
void clear_draft(const char* draft_id);
void cleanup_old_drafts(uint32_t older_than_days);

// 草稿恢復對話框
typedef enum {
    DRAFT_CHOICE_CONTINUE,
    DRAFT_CHOICE_RESTART,
    DRAFT_CHOICE_CANCEL,
} draft_choice_t;

draft_choice_t prompt_draft_recovery(const char* draft_id, const char* title);
```

## 設定 App 對應

新增於 `S-x 輸入法` 二級頁：

| 設定項 | 模板 | 預設 |
|---|---|---|
| 訊息輸入預設 IME | A 列舉 | 注 |
| 字數警示門檻 | B 數值 | 80%（70-95%） |
| 草稿保留天數 | B 數值 | 30（7-90） |
| 對話列表顯示草稿 | C 開關 | 開 |
| OK 長按送出時間 | B 數值 | 500ms（300-1000ms） |
| 啟用 EN 字典 | C 開關 | 開 |
| 候選字數量 | B 數值 | 8（5-9） |

## 配色完整表

| Token | Hex | 用途 |
|---|---|---|
| `bg_primary` | `#0B0F14` | 主背景 |
| `bg_secondary` | `#161C24` | 次背景（文字框內、IME Bar） |
| `bg_preedit` | `#2A2018` | Preedit 背景塊 |
| `text_primary` | `#E6EDF3` | 已確認文本、其他候選字 |
| `text_secondary` | `#7D8590` | 字數計數一般、頁碼 |
| `text_preedit` | `#FFA657` | Preedit 文字 |
| `accent_focus` | `#FFA657` | 焦點橙、候選字選中、`►`、游標 |
| `border_focus` | `#FFA657` | 焦點態邊框 2px |
| `border_normal` | `#30363D` | 一般邊框、IME Bar 上邊框 |
| `warn_yellow` | `#F1E05A` | 字數接近上限 |
| `warn_red` | `#F85149` | 字數超限 |

## 視覺語言摘要

整個 IME 套皮的視覺語言只用三種顏色：

- **橙 = IME 中 / 不確定 / 你按 D-pad 會做特殊事**（Preedit、候選字選中、模式區、文字框焦點、游標）
- **白 = 已確認**（已 commit 的文字、其他候選字、其他 UI）
- **灰 = 次要**（頁碼、邊框、空白提示）

使用者掃一眼就知道「畫面上哪些是已決定的、哪些還可以變」。

---

最後更新：2026-04
版本：v1.0
