# 訊息 App 樣本截圖

直式 1080×2340，App 原圖 96×144，以 10× 最近鄰放大（`imageSmoothingEnabled = false`，CSS `image-rendering: pixelated`）。正式 PNG 未重畫、未改色。

| 檔名 | 畫面 |
|---|---|
| `flip_list.png` | 翻蓋機收件匣（最後一句取自 `messages[]`，少聯絡朋友顯示時間標籤） |
| `flip_compose.png` | 翻蓋機撰寫簡訊（軟鍵「選項」「返回」，字數格） |
| `chat_list.png` | 智慧型手機聊天列表 |
| `chat_thread_photo.png` | 聊天對話，含對方照片氣泡 |
| `insufficient_savings.png` | 「存款不足，這則簡訊沒有送出。」 |
| `dead_readonly.png` | 過世家人對話只能看，不能傳 |
| `fade_label.png` | 「上次聊天是三年前」（公主 §四時間標籤） |

同批也存在 `/workspace/ala/小兵/2026-11-11/msgapp_shots/`。重拍：`python3 scripts/shoot_messages.py`（`?dev=1&screen=messages&shot&fixture=…`）。
