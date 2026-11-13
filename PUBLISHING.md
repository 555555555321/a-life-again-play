# 網站發布（GitHub Pages）

王 2026-11-13：網站和手機B 開發分開。

- `main`：只放手機B 的開發檔。根目錄的 `index.html` 就是手機B，`scripts/shoot_*.py` 從這裡開頁面。`tests/root_index_test.js` 會檢查。
- `gh-pages`：只放建置好的網站。完整遊戲在根目錄，手機B 在 `phone-b/`。GitHub Pages 從這個分支的根目錄發布。

## 發布步驟

1. 在 A-Life-Again 要發布的 commit 上建置，`PHONE_B_DIR` 指向本 repo 要發布的 commit 的檢出：

   ```sh
   PHONE_B_DIR=<a-life-again-play 檢出> npm run build:pages   # → artifacts/pages/
   ```

2. 在本 repo 的 `gh-pages` 分支（建議用 `git worktree add <dir> gh-pages`）：
   - 刪掉舊檔（保留 `.git`）。
   - 把 `artifacts/pages/` 的內容整個複製進來，包含 `.nojekyll`。
   - 一般 commit 後 push，不要 rebase 或 force-push。

3. 等 Actions 的「pages build and deployment」跑完，再打開 https://555555555321.github.io/a-life-again-play/ 和 `/phone-b/` 確認。網址要加快取參數。

`build-info.json` 會記錄這次用的 A-Life-Again 和手機B commit。
