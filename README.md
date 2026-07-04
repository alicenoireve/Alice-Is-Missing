# 🃏 密談室｜跑團 / 密室聊天網站

2–5 人使用的即時聊天室，含全員群組訊息、一對一私訊、不限時的「場外」討論頻道，以及固定 1.5 小時的場次計時器。純前端網站，可直接部署在 **GitHub Pages**。

---

## 這個網站怎麼運作

因為 GitHub Pages 只能放「靜態網頁」（沒有自己的伺服器），要讓多台手機/電腦即時同步訊息，這裡使用 **Google Firebase 的 Realtime Database** 當作訊息中繼站——它完全在瀏覽器端呼叫，不需要你自己寫後端程式，而且免費額度對 2–5 人跑團使用綽綽有餘。

所以整體架構是：

```
你的 GitHub Pages 網站（純靜態 HTML/CSS/JS）
        │  瀏覽器端直接呼叫
        ▼
   Firebase Realtime Database（你自己申請，免費）
```

---

## 第一步：建立你自己的 Firebase 專案（約 5 分鐘，一次性設定）

1. 前往 [Firebase Console](https://console.firebase.google.com)，用 Google 帳號登入，點「新增專案」，專案名稱隨意（例如 `mimi-room`）。可以關閉 Google Analytics，不影響使用。
2. 專案建立後，左側選單找到 **Build → Realtime Database**，點「建立資料庫」。地區選擇離你近的（例如 asia-southeast1），安全性規則先選 **測試模式**（30 天內任何人可讀寫，之後可依下方規則自行調整）。
3. 回到左上角齒輪 → **專案設定**，頁面下方「你的應用程式」點 **網頁 (</>)** 圖示，註冊一個應用程式（暱稱隨意，不需要勾選 Hosting）。
4. 系統會顯示一段 `firebaseConfig = {...}` 的物件，把 **大括號裡的內容整段複製**下來，格式大約長這樣：

```json
{
  "apiKey": "AIza...",
  "authDomain": "mimi-room.firebaseapp.com",
  "databaseURL": "https://mimi-room-default-rtdb.asia-southeast1.firebasedatabase.app",
  "projectId": "mimi-room",
  "storageBucket": "mimi-room.appspot.com",
  "messagingSenderId": "...",
  "appId": "..."
}
```

5. **把這段設定寫進 `firebase-config.js` 這個檔案裡**（在這次下載的資料夾裡可以找到），打開它，把 `window.FIREBASE_CONFIG = null;` 換成：
   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "...",
     databaseURL: "https://xxx.firebasedatabase.app",
     projectId: "..."
   };
   ```
   存檔後，把整個資料夾（含這個檔案）上傳/更新到 GitHub 即可。

   **這樣設定之後，只有你自己要做這一步**——之後所有玩家打開你的網站網址，「設置」頁籤裡的「連線設定」整張都不會出現，他們只要輸入暱稱、建立或加入房間代碼就能直接玩，完全不用下載任何東西、也不用貼任何 JSON。

> 如果你想先在自己電腦測試、還沒決定要不要寫進檔案，也可以暫時不改 `firebase-config.js`，網站會退回舊模式：「設置」頁籤出現「連線設定」讓你手動貼一次（存在瀏覽器本機，換一台裝置就要重貼）。正式要給朋友玩之前，記得改用上面寫進檔案的方式，體驗會好很多。

> 想更安全一點，可以之後把測試模式的規則換成下面這組（只允許在 `rooms/` 底下讀寫，避免被陌生人濫用整個資料庫）：
> ```json
> {
>   "rules": {
>     "rooms": {
>       "$roomId": {
>         ".read": true,
>         ".write": true
>       }
>     },
>     ".read": false,
>     ".write": false
>   }
> }
> ```
> 位置在 Realtime Database → 規則 分頁貼上並發布。

---

## 第二步：部署到 GitHub Pages

這個資料夾裡有 140 多張卡牌圖片（`assets/cards/`），用網頁拖拉上傳一次最多只能選 100 個檔案，所以**強烈建議用 GitHub Desktop**（一個免費小程式），比較不會卡住。

### 方法 A：GitHub Desktop（推薦，全程點滑鼠即可）

1. 前往 [desktop.github.com](https://desktop.github.com) 下載安裝 GitHub Desktop。
2. 打開後用你的 GitHub 帳號登入（沒有帳號的話，先到 [github.com](https://github.com) 免費註冊一個）。
3. 左上角 `File → New repository`，Name 隨意（例如 `alice-is-missing-room`），Local Path 選一個你電腦上方便找到的位置，按 `Create Repository`。
4. 用檔案總管（Windows）或 Finder（Mac）打開剛剛建立的那個資料夾，把這次下載的 `index.html`、`styles.css`、`app.js`、`game.js`、`README.md`，以及整個 `assets` 資料夾，全部複製貼上進去（保持資料夾結構，`assets/cards/...` 要維持原本的路徑）。
5. 回到 GitHub Desktop，左側會列出偵測到的新增檔案，下方「Summary」隨便寫一句話（例如 `first upload`），按藍色的 `Commit to main`。
6. 按上方的 `Publish repository`（可以取消勾選 "Keep this code private"，選公開才能用免費的 Pages），按 `Publish`。
7. 打開瀏覽器到 `github.com/你的帳號/repo名稱`，點上方 `Settings → Pages`。
8. `Build and deployment → Source` 選 `Deploy from a branch`；`Branch` 選 `main`，資料夾選 `/ (root)`，按 `Save`。
9. 等 1–2 分鐘，重新整理這個 Pages 頁面，會出現一個網址，長得像：
   `https://你的帳號.github.io/repo名稱/`
   打開它就是正式的遊戲網站，之後每個人都用手機瀏覽器打開這個網址即可。

之後想要更新網站內容（例如我幫你調整程式碼後重新給你檔案），只要把新檔案覆蓋貼到同一個本機資料夾，回到 GitHub Desktop 按 `Commit` 再按 `Push origin` 就會自動更新到網站上，不用重新走一次設定流程。

### 方法 B：純網頁上傳（檔案較多，需分批）

1. [github.com](https://github.com) 登入後右上角 `+ → New repository`，建立一個新的 repo（記得選 Public）。
2. 進入空的 repo 頁面，點 `uploading an existing file`，把 `index.html`、`styles.css`、`app.js`、`game.js`、`README.md` 拖進去，按 `Commit changes`。
3. 回到 repo 首頁，點 `Add file → Create new file`，檔名輸入 `assets/cards/.gitkeep`（這會順便建立資料夾），隨便存檔。
4. 進入 `assets/cards` 資料夾，點 `Add file → Upload files`，把 144 張卡圖分兩批（一次不要超過 100 張）拖進去上傳。
5. 同方法 A 的第 7–9 步驟啟用 GitHub Pages。

---

## 怎麼開一場

1. 房主：「設置」頁籤 → 輸入暱稱 → 「建立新房間」，會拿到一組 6 碼房間代碼。
2. 把代碼傳給其他 1–4 位玩家，他們在自己手機上打開同一個網址，「設置」頁籤輸入暱稱 + 貼上代碼 → 「加入」。
3. 任何人都可以在「設置」頁籤按「開始計時」啟動 1.5 小時倒數，所有人畫面會同步顯示。
4. 切到「訊息」頁籤開始聊天：上方頻道列可切換「群組」或跟某位玩家的「私訊」；右上角小圖示是「匯出紀錄」與「場外」討論（不限時、跟遊戲內聊天分開顯示）。

---

## 檔案結構

```
index.html   主頁面（設置 / 訊息 兩個頁籤）
styles.css   LINE 風格樣式，含手機版最佳化
app.js       Firebase 連線、房間、聊天、計時器、匯出邏輯
```

---

## 已知限制 / 之後可以做的事

- 目前沒有登入驗證機制，房間代碼即是唯一門檻，請勿用於需要嚴格保密的場合。
- 劇情卡的分配是主持人手動指派，尚未做「自動平均分配」；抽卡是單次隨機（已排除全場用過的卡），不會重複抽到同一張。
- 時間提醒目前是「到點後計時器文字變色」的被動提示，不會跳出彈窗或發出聲音，需要主持人自己留意。
- 若同時有超過 5 人嘗試加入同一房間，第 6 人會被系統拒絕。
