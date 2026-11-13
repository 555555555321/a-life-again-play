# 網站發布（GitHub Pages）

`main` 放手機 B 開發檔；`gh-pages` 放完整網站，手機 B 位於 `phone-b/`。
需要 Node.js 20 以上、Git、npm，以及含 `build:pages` 指令的 A-Life-Again checkout。

## 建置與準備

先準備獨立且乾淨的 `gh-pages` checkout，例如 `git worktree add <目標路徑> gh-pages`。
三個參數都必須是 Git checkout 根目錄；目標不能與任一來源互相包含。

```sh
node scripts/publish-gh-pages.mjs "<A-Life-Again>" "<Phone B>" "<gh-pages checkout>"
```

腳本在 A-Life-Again 內設定 `PHONE_B_DIR` 並執行 `npm run build:pages`，讀取
`artifacts/pages/`，清除目標舊檔後複製整份產物。保留目標 `.git`、`.nojekyll`；
沒有 `.nojekyll` 時建立空檔。先驗證產物包含有效 JSON 的 `build-info.json`、非空的
`index.html`、`phone-b/index.html`，並拒絕產物中的符號連結與 `.git`。

預設只準備檔案，列出 tracked diff 統計及新增檔案清單，不暫存、不 commit、不 push。
**目標既有網站檔案會被替換**，因此執行前必須乾淨。檢視結果後，若要重新執行，
請先自行處理目標的未提交變更；腳本不會自動丟棄未提交內容。

只使用已存在產物（本地乾跑、不建置）：

```sh
node scripts/publish-gh-pages.mjs "<A-Life-Again>" "<Phone B>" "<假 gh-pages checkout>" --skip-build
```

`--skip-build` 不驗證既有產物是否來自目前 HEAD，不能與 `--push` 合用。

## 實際發布

```sh
node scripts/publish-gh-pages.mjs "<A-Life-Again>" "<Phone B>" "<gh-pages checkout>" --push
```

兩個來源須乾淨；目標的 `origin` push URL 必須指向
`555555555321/a-life-again-play` 的 GitHub HTTPS 或 SSH 位址。
建置與複製後，以 `pages: A-Life-Again <短 hash> + Phone B <短 hash>` commit，
再執行普通 `git push origin HEAD:refs/heads/gh-pages`，不 force、不 rebase。
沒有檔案變更時略過 commit，仍 push 並檢查。分支落後或分歧時讓普通 push 失敗，
交由操作者處理，不自動改寫歷史。

push 成功後，最長輪詢 10 分鐘，每約 15 秒以快取參數及 `no-store` 抓取
<https://555555555321.github.io/a-life-again-play/> 的 `build-info.json`、
`index.html`、`phone-b/index.html`。三者均須與本次建置產物文字完全一致；
不依賴未知的版本欄位名稱，也不只依賴 HTTP 200。單次請求最多 20 秒，
受整體截止時間限制。逾時或操作失敗以非零狀態結束；已完成的 push 不會回滾。
此檢查驗證部署內容，沒有執行瀏覽器互動測試。

選用 `--push --request-build`：等待兩分鐘仍未匹配時，使用已登入的 `gh` 執行一次
`gh api -X POST repos/555555555321/a-life-again-play/pages/builds`。
這是部署尚未匹配時的一次補救，不判斷 Actions 是否正在執行。要求重建失敗會警告並繼續
原來的輪詢；不延長 10 分鐘期限。預設不要求重建。

## 本地驗證

```sh
node --test tests/publish-gh-pages.test.mjs
```

只執行一次。測試在工作目錄 `_tmp_ghpages/` 建立本地 shared clones 與假產物，
用 `--skip-build` 乾跑一次；沒有 build、commit、push 或網路請求。
另外用模擬 HTTP 回應檢查版本符合與舊首頁逾時。
乾跑輸出保留在 `_tmp_ghpages/dry-run-output.txt`；若目錄已存在，測試直接失敗，
不清除既有資料。假產物不是正式 A-Life-Again 建置結果。
