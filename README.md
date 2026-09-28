# 瑞城排車台（獨立網頁版）

拍出貨單／取貨單 → 讀出客戶、地址、營業時間、調貨 → 用 Google 地圖排三台車的路線（汽車走汽車路線＋路況，機車走機車路線）→ 司機手機開網頁逐站回報。

架構：一個 Cloudflare Worker（後端 API＋靜態網頁）＋ D1 資料庫。免伺服器、免維護，小量使用落在免費額度內。
Google 地圖在瀏覽器端呼叫（金鑰限制網域），Anthropic 照片辨識由 Worker 代呼叫（金鑰不會出現在瀏覽器）。

```
src/worker.js      後端：PIN 登入、資料 API、照片辨識代理
public/index.html  前端頁面（排車員＋司機共用，依 PIN 分角色）
public/app.js      前端邏輯
public/core.js     排車演算法（分車、時間窗、先取貨再送貨）
public/gmaps.js    Google 地圖包裝（地址轉座標、車程表、完整路線）
schema.sql         資料表
wrangler.toml      Cloudflare 設定
```

---

## 一、第一次部署（約 30 分鐘）

### 1. 準備帳號
- **Cloudflare**：<https://dash.cloudflare.com> 免費註冊。
- **Google Cloud**：<https://console.cloud.google.com> 建專案、啟用計費（需綁卡；Google Maps 每月有免費額度，本工具用量通常在額度內，實際請以 Google 價目表為準）。
- **Anthropic**：<https://console.anthropic.com> 建 API 金鑰（照片辨識用，依用量計費；不設定也能用，改用「貼上 Claude 整理好的 JSON」）。

### 2. Google Maps 金鑰
1. Google Cloud Console →「API 和服務」→「程式庫」，啟用：
   - **Maps JavaScript API**
   - **Routes API**
   - **Geocoding API**
2. 「憑證」→ 建立 API 金鑰。
3. 點金鑰進去設定限制：
   - 應用程式限制：**HTTP 參照網址**，新增 `https://你的worker名稱.你的帳號.workers.dev/*`（部署後會知道網址；也可先部署再回來補）。
   - API 限制：只勾上面三個 API。
4. 記下這把金鑰 → 等一下設成 `GOOGLE_MAPS_BROWSER_KEY`。

### 3. 安裝與部署
需要 Node.js 18 以上（<https://nodejs.org>）。在這個資料夾打開終端機：

```bash
npm install
npx wrangler login                 # 會開瀏覽器登入 Cloudflare

# 建資料庫，把印出來的 database_id 貼到 wrangler.toml 的 database_id
npx wrangler d1 create ruicheng-dispatch
npx wrangler d1 execute ruicheng-dispatch --remote --file=schema.sql

# 機密設定（每一行會要你輸入值）
npx wrangler secret put SESSION_SECRET            # 隨便打一串 30 字以上亂碼
npx wrangler secret put DISPATCH_PIN              # 排車員 PIN，例如 6 位數
npx wrangler secret put DRIVER_PIN                # 司機 PIN，和上面不同
npx wrangler secret put GOOGLE_MAPS_BROWSER_KEY   # 第 2 步的金鑰
npx wrangler secret put ANTHROPIC_API_KEY         # 沒有可先跳過

npx wrangler deploy
```

部署完會印出網址，例如 `https://ruicheng-dispatch.xxx.workers.dev`。回到 Google 金鑰把這個網域加進「HTTP 參照網址」。

倉庫地址在 `wrangler.toml` 的 `WAREHOUSE_*`，改了要重新 `npx wrangler deploy`。

### 4. 第一次使用
1. 用排車員 PIN 登入 →「客戶」→「從 ERP 匯入客戶」：從 VMASTER 匯出客戶主檔（Excel／CSV，至少要有客戶編號、名稱、地址），對好欄位匯入。
2. 按「補座標（Google）」，把地址轉成座標（1,300 家大約 5 分鐘，只需做一次；新客戶再補）。
3. 在客戶表格補**營業時間**和**公休日**。可以先補常送的，其他遇到再補；沒填的當成整天營業。
4. 「供應商」新增常去取貨的供應商地址與時間。
5. 「設定」填司機名字、每站停留時間。
6. 把網址和司機 PIN 給司機，手機瀏覽器開啟 → 加到主畫面。

---

## 二、每天怎麼用

1. **拍照排單**：把當天的出貨單（含要去供應商取貨的單）拍照上傳，一次最多 8 張。系統讀出客戶編號後自動帶入客戶檔的地址、電話、營業時間。
2. **確認**：每筆都能改；⚠ 表示看不清楚或客戶檔找不到。要先去供應商拿貨的勾「先取貨」並選供應商。按「加入」。
3. **用 Google 排車**：
   - 大件（輪胎、整箱機油）或離倉超過設定距離 → 汽車；其餘依方位分兩台機車。
   - 汽車用 Google **汽車**路線＋當時路況；機車用 Google **機車**路線（TWO_WHEELER）。
   - 取貨站一定排在該客戶前面、同一台車；照營業時間排，快打烊的先送；急件最優先；今天公休的留在未分配。
   - 每站顯示預計到達時間；趕不上打烊會標紅。
4. 手動微調：換車（下拉）、上下移動。改完按「只更新時間」重新向 Google 要時間。
5. **複製路線傳 LINE**，或司機直接開網頁看「我的路線」，每站按已送達／已取貨／無法送達。
6. 臨時急件：新增時勾「急件」，會自動插到離司機目前位置最近那台車的下一站。

照片辨識沒設定時：把照片傳給 Claude 對話請它整理成 JSON，貼到「貼上 Claude 整理好的 JSON」即可。

---

## 三、常見問題

- **地圖沒出現／排車說沒有金鑰**：檢查 `GOOGLE_MAPS_BROWSER_KEY` 有設、金鑰的「HTTP 參照網址」有包含這個網域、三個 API 都有啟用、專案有啟用計費。
- **機車時間和汽車一樣**：Google 機車路線在台灣屬 Beta，偶爾不可用時會退回汽車路線並在畫面提示。
- **地址轉不出座標**：地址缺「區」或門牌打錯。在客戶表格改地址後再按「補」。
- **站數上限**：一天最多 60 站（Google 車程表限制）。已完成的舊站也算，跨日不會累計。
- **改 PIN**：重新 `npx wrangler secret put DISPATCH_PIN`，所有人要重新登入。
- **備份**：`npx wrangler d1 export ruicheng-dispatch --remote --output=backup.sql`

## 四、本機測試（開發用）

```bash
cp .dev.vars.example .dev.vars      # 填入測試用 PIN 與金鑰
npx wrangler d1 execute ruicheng-dispatch --local --file=schema.sql
npx wrangler dev
```
