# Phone B 年分標籤 before/after

規則（王確認，生日 1998 年 5 月）：`season==春` → `year=1998+age+1`，否則 `year=1998+age`。
實作：`game.js` 共用函式 `cornerLabel(age, season)`；每畫面 `scenes.json` 的 `age`/`season` 餵進去。

對照 r9-logic：`game-calendar.js` 以 day0=1 月 1 日、年分偏移計日（分支上常數曾為 2000；UI 角標常另用出生年+age）。**不**內建「春→+1」的五月生日角標規則；Phone B 角標依五月生日規則單獨實作。

| screen | season | age | label before this morning (1998+age) | label now (May rule) |
|---|---|---:|---|---|
| (global default) | 春 | 5 | 二〇〇三年・春・你五歲 | 二〇〇四年・春・你五歲 |
| talent | 春 | 5 | 二〇〇三年・春・你五歲 | 二〇〇四年・春・你五歲 |
| month_end | 春 | 5 | 二〇〇三年・春・你五歲 | 二〇〇四年・春・你五歲 |
| scissors | 春 | 5 | 二〇〇三年・春・你五歲 | 二〇〇四年・春・你五歲 |
| test_long | 春 | 5 | 二〇〇三年・春・你五歲 | 二〇〇四年・春・你五歲 |
| test_reader | 春 | 5 | 二〇〇三年・春・你五歲 | 二〇〇四年・春・你五歲 |
| animal_dog | 春 | 1 | 一九九九年・春・你一歲 | 二〇〇〇年・春・你一歲 |
| animal_kitten | 春 | 3 | 二〇〇一年・春・你三歲 | 二〇〇二年・春・你三歲 |
| animal_blanket | 春 | 1 | 一九九九年・春・你一歲 | 二〇〇〇年・春・你一歲 |
| walk_test | 春 | 5 | 二〇〇三年・春・你五歲 | 二〇〇四年・春・你五歲 |

