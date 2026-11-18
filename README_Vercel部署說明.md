# 2026–2027 聯校親子運動會：Vercel 版班代表投票系統

此版本專為 **Vercel + Neon Postgres** 設計。原版 `server.js` 不能直接在 Vercel 長期運行，而且儲存 `data/votes.json` 不適合 Vercel 的無狀態執行環境。本版本使用 Vercel Functions 接收登入、填報、修改及統計請求，使用 Neon Postgres 持久儲存資料。

## 一、檔案應如何放在 GitHub

把 ZIP 內的**所有檔案及資料夾**上傳到你已連結 Vercel 的 GitHub Repository 根目錄，更新或取代原版 `index.html`、`vote.html`，且不要繼續使用原版 `server.js`。

```
index.html
vote.html
vercel.json
package.json
api/
  login.js
  me.js
  logout.js
  votes.js
  summary.js
lib/
  voting.js
images/               ← 你原本的 16 款設計圖片，需從舊網站另外保留/上傳
```

注意：這次提供的附件沒有原本的 `images` 圖片資料夾。本 ZIP 不包含圖片，必須自行保留原站上的 `images/work-XX-XX.webp`。

## 二、Vercel 網站部署設定

1. 進入 Vercel Dashboard > 對應 Project > **Settings > Build and Deployment**。
2. **Framework Preset**：`Other`。
3. **Root Directory**：你的 `index.html` / `package.json` / `api` 所在的資料夾；如果放在 Repository 最外層，使用預設根目錄即可。
4. **Build Command**：不需要自訂，保持預設/留空。
5. **Output Directory**：不需要自訂，保持預設/留空。不要填 `public`、`dist` 或 `api`。
6. Node.js 請用 Vercel 支援的版本（例如 Node.js 22）。
7. GitHub Commit 推送後，Vercel 會自動重新部署；如有需要，到 Deployments 手動 Redeploy。

## 三、建立可永久儲存票數的資料庫（必做）

1. 進入 Vercel Project > **Storage** 或由 **Marketplace** 開啟 **Neon**（Neon Postgres）。
2. 建立 Neon Postgres database，選擇適用的方案、地區，並將 Neon 連接到此 Vercel Project。
3. 檢查 Project > **Settings > Environment Variables** 是否出現 `DATABASE_URL`，值應為 Neon PostgreSQL 的連接字串。如整合沒有自動建立，按照 Neon 的 Connect 畫面將連線字串加為 `DATABASE_URL`。
4. 確保 `DATABASE_URL` 對 Production 生效；如要使用 Preview 網址測試，也需要在 Preview 環境有資料庫設定。注意某些整合會讓 Preview 使用獨立資料庫分支，所以 Preview 和正式環境可能不會看到相同票數。
5. 檢查連接後**重新部署**，令新環境變數生效。

登入或第一次讀取時，系統會嘗試自動建立 `class_votes` 與 `vote_login_attempts` 資料表，不需自己手動建立表格。資料會保存在 Neon，不會因 Vercel 重新部署而被清空。

## 四、設定網站登入 Cookie 的簽署密鑰（必做）

在 Vercel Project > Settings > Environment Variables > Add New：

- **Name**: `VOTE_SESSION_SECRET`
- **Value**: 任意一組至少 **32 個字元**的不可預測隨機密鑰（建議 64 個）。這是伺服器密鑰，不是班代表登入密碼。
- **Environment**: Production（需要 Preview 測試時可加選 Preview）

可以在自己電腦的 Terminal 產生隨機字串：

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

請把結果貼到 Vercel 的環境變數欄位，**不要**貼到 GitHub、網頁程式或傳送給其他人。完成後 Redeploy。

另有可選環境變數 `VOTE_PASSWORD_SUFFIX`，預設值為 `111111`。如不設定則全部班別密碼採用原規則，例如 K2C 的密碼為 `K2C111111`。

## 五、完成後檢查

打開 `https://你的vercel網址/api/me`：

- 預期看見 `{"authenticated":false}`，代表 API 正常回傳 JSON（未登入是正常）。
- 如果回傳 HTML、404 或 405，通常代表你沒有把 `api` 資料夾放在 Vercel 的 Root Directory，或者 Framework/Output Directory 設定不正確。

接着打開 `https://你的vercel網址/vote.html`：

1. 選擇班別 `K2C`，輸入 `K2C111111`。
2. 作品 01 輸入 `2`，作品 02 輸入 `3`，其餘為 `0`；按「儲存」。
3. 在「總投票結果」應看到 5 票。
4. 登出，改登入 `K1A`，輸入 `K1A111111`，作品 01 填 `4`，其餘填 `0`。
5. 總結果應是作品 01 有 6 票、作品 02 有 3 票、合共 9 票。
6. 再次登入 `K2C` 將作品 01 的 `2` 改成 `1`，合計應改成 8 票，**不會重複累計**。

這些只是示範測試數字，正式開始投票前請改回正確票數（將該班 16 個數字填為 0 並儲存，也會算作已填報）。

## 六、常見錯誤

| 現象 | 原因與處理 |
| --- | --- |
| `伺服器回應無效` | `/api/login` 被回應成 HTML、404 頁面或沒有 API 函式。檢查 `api/` 路徑與 Vercel 的 Root Directory。 |
| `尚未連接資料庫` | `DATABASE_URL` 沒有設定或整合到目前 Environment，請連結 Neon 並 Redeploy。 |
| `尚未設定 VOTE_SESSION_SECRET` | 在 Environment Variables 新增至少 32 字元的隨機值，Redeploy。 |
| `資料庫連接或伺服器處理失敗` | Vercel > Deployments > 該版本 > Functions Logs 檢查資料庫錯誤；確認 Neon 連線字串及權限。 |
| 資料每次登入都消失 | 不可繼續使用原版 `server.js` / `votes.json`，需使用 Neon 版。 |
| 設計圖片沒有出現 | 原來的 `images/` 資料夾未一起上傳至 GitHub。 |
| 修改設定但沒變 | 確認目前瀏覽的是 **Production** 還是 **Preview**，然後重新部署最新版本。 |

## 七、安全備註

目前班別密碼規則為「班別 + 111111」，為你指定的示範式固定規則，**容易被其他人推測，不能視為保密程度高的驗證**。正式活動建議改為每班獨立的強密碼、只向班代表發放，並有投票截止鎖定及管理員備份/稽核。原始程式碼若公開放到 GitHub，也不應放入資料庫密碼或 `VOTE_SESSION_SECRET`。

**資料庫費用與用量**依 Vercel / Neon 當時的實際方案而定。只有一個簡單投票活動，通常需求不高，但仍應在建立資料庫時檢查配額與收費。
