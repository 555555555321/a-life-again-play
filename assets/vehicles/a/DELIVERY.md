# 給王子的交付規格（2026-11-11）

王定：腳踏車、機車的 8 格合成圖（人已畫在車上）是定稿，用 `driver=dad|mom` 選檔。只要再交兩樣。

畫面是 480×270，`scale` 必須是 1。動畫 8 格、8 fps。黃昏用白天格乘 `[142, 115, 83]`，不用另畫黃昏。夜晚格只在開車燈時用。所有層對齊同一個原點。

## 1. 小型車：只有車身的條帶 ＋ 疊圖

每款 m0／m1／m2，白天與夜晚各 8 格。乘客人數、爸爸或媽媽開車、兒童座椅都要能換，所以不要再畫進同一張圖。三人擠的時候，乘客只露頭。

共用畫布與原點（與現有合成格相同；若夜晚車燈或媽媽頭髮超出，請把該款畫布加大，但 `ground_row` 要固定，多出來的像素加在上方或車頭方向）：

| 款 | 畫布 | ground_row | 原點 | px／格 |
|---|---:|---:|---|---:|
| smallcar_m0 圓潤 | 98×45 | 44 | (0, 44) | 5.497787143782138 |
| smallcar_m1 方正 | 94×49 | 48 | (0, 48) | 5.497787143782138 |
| smallcar_m2 短尾掀背 | 90×47 | 46 | (0, 46) | 7.0685834705770345 |

原點是畫布左緣、輪胎著地那一列。引擎把原點放在路面列 204（停放列 228）。

檔名（格號 `f00`–`f07`）：

```
assets/vehicles/a/smallcar_m{0|1|2}/body/{day|night}/f00.png
assets/vehicles/a/smallcar_m{0|1|2}/driver_{dad|mom}/{day|night}/f00.png
assets/vehicles/a/smallcar_m{0|1|2}/passengers_p{1|2|3}/{day|night}/f00.png
assets/vehicles/a/smallcar_m{0|1|2}/child_seat/{day|night}/f00.png
```

疊圖順序：`body` → `child_seat` → `passengers` → `driver`。`passengers_p3` 只畫頭。

引擎偵測到 `body/day/f00.png`（或 night）就改走分層；在那之前繼續用現有合成格，畫面上會寫「小型車車身條帶待王子」。

## 2. 機車全家款

小孩站在前面、大人在後面，與現有機車一樣畫進 8 格循環，不是分層。缺檔時退回單人合成格。

```
assets/vehicles/a/scooter_m{0|1|2}/frames/{day|night}_{dad|mom}_family/f00.png–f07.png
```

畫布、ground_row、原點、px／格與該款現有合成格相同（見 `config.json` → `vehicles.scooter.models`）。

## 不要改的

請不要改 `/workspace/ala/r8_art/` 裡已經交出的合成格。新檔直接依上面的路徑交到本倉庫，或另開資料夾再告訴小兵去複製。

## 登錄新檔

新檔複製進上述路徑後，把相對路徑加進 `assets/vehicles/a/manifest.json` 的 `extra` 陣列（例如 `smallcar_m0/body/day`、`scooter_m1/frames/day_dad_family`）。引擎只讀這份清單，不會去探測還不存在的檔。


---

## 已交（2026-11-11 第 9 節）

王子已交出小型車 m0–m2 的 `overlays/`（含 `manifest.json`，這是尺寸／原點／px_per_frame 的唯一來源）、折疊車縮小騎士 `bicycle_m2_v2/`，以及 `scooter_m0_family/`。引擎在 `?dev=1` 試看畫面已接上，不再使用舊合成圖（車身矮 1 px，禁止混用）。背景暫時仍用舊 240 街景 ×2，行駛底 y=204、停放底 y=228。

尚未交付、仍待補：機車 m1／m2 全家款；480 背景雖已畫在 ala 資料夾，先不換進正式路徑，等王子用同檔名替換。第 2 關簽名仍待小兵2號。
