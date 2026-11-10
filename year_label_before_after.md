# Phone B 年分標籤 before/after

規則（王確認）：`year = 1998 + age`；季節取各事件／畫面的 `season`，缺則「春」。
實作：`game.js` 共用函式 `cornerLabel(age, season)`；每畫面 `scenes.json` 的 `age`/`season` 餵進去。

| screen | season | age | old label | new label |
|---|---|---:|---|---|
| (global default) | 春 | 5 | 二〇〇四年・春・你五歲 | 二〇〇三年・春・你五歲 |
| talent | 春 | 5 | 二〇〇四年・春・你五歲 | 二〇〇三年・春・你五歲 |
| month_end | 春 | 5 | 二〇〇四年・春・你五歲 | 二〇〇三年・春・你五歲 |
| scissors | 春 | 5 | 二〇〇四年・春・你五歲 | 二〇〇三年・春・你五歲 |
| test_long | 春 | 5 | 二〇〇四年・春・你五歲 | 二〇〇三年・春・你五歲 |
| test_reader | 春 | 5 | 二〇〇四年・春・你五歲 | 二〇〇三年・春・你五歲 |
| animal_dog | 春 | 1 | 二〇〇四年・春・你五歲 | 一九九九年・春・你一歲 |
| animal_kitten | 春 | 3 | 二〇〇四年・春・你五歲 | 二〇〇一年・春・你三歲 |
| animal_blanket | 春 | 1 | 二〇〇四年・春・你五歲 | 一九九九年・春・你一歲 |

