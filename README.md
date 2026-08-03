# 台鐵班次查詢

台鐵班次查詢是一個 Vue 3 + Vite 製作的靜態網頁 App，用來查詢台鐵班次、停靠站與分享單一班次頁面。專案目前部署為 GitHub Pages 靜態站，也支援自訂網域 `tra-timetable.cftang.dev`。

本專案只使用台鐵公開班次與車站資料，不串接即時動態 API。因此顯示內容是班次資料，不代表列車即時位置、誤點狀態或實際到點時間。

## 主要功能

- 查詢指定日期、起站、迄站、上車時間之後的可用班次。
- 每個班次可展開完整停靠站。
- 每個班次有獨立 URL，可用分享按鈕傳給其他人。
- 車站下拉選單依地區分組：北北基、桃竹苗、中彰、雲嘉南、高屏、宜蘭、花東、支線。
- 可使用瀏覽器定位找最近車站。
- 支援深色/淺色主題切換。
- 使用者偏好會存在 localStorage，包含語言、主題、日期、時間、起迄站與地區。
- 支援繁體中文、英文、日文。
- 最新消息支援多語內容。
- PWA 設定已保留，可被瀏覽器安裝到主畫面。

## 專案架構

```text
src/
  App.vue                 # 主要 UI 與查詢流程
  i18n.js                 # UI 文字語言包
  main.js                 # Vue app 入口，掛載 vue-i18n
  style.css               # Tailwind 與主題樣式

public/
  cars.json               # 台鐵車種原始資料
  stations.json           # 台鐵車站原始資料
  CNAME                   # GitHub Pages 自訂網域
  data/
    days/YYYYMMDD/
      trains.json         # 當日班次索引
      stopIndex.json      # 站碼到班次索引
    meta/
      carsMap.json        # 車種 metadata，多語 labels
      stationRegions.json # 車站分區 metadata，多語 labels 與 GPS
      stationJaLabels.json# 台鐵日文官方站名對照
      news.json           # 最新消息，多語內容

tools/
  download-and-preprocess.mjs    # 下載台鐵班次資料並產生 days/meta
  generate-station-regions.mjs   # 由 stations.json 產生 stationRegions.json
  update-ja-station-labels.mjs   # 從台鐵日文官方頁更新日文站名
  check-station-regions.mjs      # 檢查 stationRegions 是否 cover stations.json
```

## 開發環境

本專案以 Docker Compose 作為主要開發 workflow。請優先在 container 裡執行 Node/npm 相關命令。

啟動 local dev server：

```sh
docker compose up
```

Compose 會執行：

```sh
npm ci && npm run download && npm run dev -- --host 0.0.0.0
```

本機網址：

```text
http://localhost:5173/tra-timetable/
```

如果服務已經在背景執行，可用：

```sh
docker compose ps
docker compose logs app
```

## 常用指令

所有 npm 指令建議透過 compose 執行：

```sh
docker compose exec app npm run build
docker compose exec app npm run check:stations
docker compose exec app npm run download
docker compose exec app npm run generate:station-regions
```

更新台鐵日文站名：

```sh
docker compose exec app node tools/update-ja-station-labels.mjs
docker compose exec app npm run generate:station-regions
docker compose exec app npm run check:stations
```

## 資料來源與更新

車站原始資料：

- 檔案：`public/stations.json`
- 來源：政府資料開放平台「臺鐵車站基本資料集」
- Provider：國營臺灣鐵路股份有限公司
- Dataset：https://data.gov.tw/dataset/33425

班次資料：

- 由 `tools/download-and-preprocess.mjs` 從台鐵 ODS 下載。
- 目前產生今天起 28 天的 `public/data/days/YYYYMMDD/` 資料。

日文站名：

- 檔案：`public/data/meta/stationJaLabels.json`
- 來源：台鐵日文官方網站
- `https://www.railway.gov.tw/tra-tip-web/tip?lang=JA_JP`
- `https://www.railway.gov.tw/tra-tip-web/tip/tip00H/tipH41/viewStaInfo/1000?lang=JA_JP`

車種日文名稱目前只使用台鐵日文官方頁可佐證的名稱；找不到官方日文名稱時保留繁體中文，避免自行翻錯。

## Metadata Schema

### stationRegions.json

每個 station 都有：

```json
{
  "stationCode": "1000",
  "labels": {
    "zh-TW": "臺北",
    "en": "Taipei",
    "ja": "台北"
  },
  "stationName": "臺北",
  "stationEName": "Taipei",
  "gps": {
    "lat": 25.047923,
    "lng": 121.517081
  },
  "region": "北北基"
}
```

`region` 只允許以下八種：

- 北北基
- 桃竹苗
- 中彰
- 雲嘉南
- 高屏
- 宜蘭
- 花東
- 支線

### carsMap.json

每個車種都有：

```json
{
  "labels": {
    "zh-TW": "自強",
    "en": "Tze-Chiang Limited Express",
    "ja": "自強号"
  },
  "rawLabels": {
    "zh-TW": "自強(3000)(EMU3000 型電車)",
    "en": "Tze-Chiang Ltd. Express(3000)",
    "ja": "自強(3000)(EMU3000 型電車)"
  }
}
```

UI 顯示車種時會優先使用目前語言的 `labels`，找不到則 fallback 到 `zh-TW`。

## i18n 與新增語言

UI 文字放在 `src/i18n.js`：

1. 在 `SUPPORTED_LOCALES` 加入新語言代碼，例如 `ko`。
2. 在 `messages` 加入同名 key，並補齊所有 UI 文案。
3. 在 `src/App.vue` 的 `localeOptions` 加入下拉選單顯示文字。
4. 如果日期格式需要特定 locale，在 `intlLocale` 補上對應，例如 `ko-KR`。

車站、地區、車種名稱不放在 `src/i18n.js`，而是放在 metadata：

- 車站與地區：`public/data/meta/stationRegions.json`
- 車種：`public/data/meta/carsMap.json`
- 最新消息：`public/data/meta/news.json`

新增語言時，需要同步讓 metadata 產生新語言 label：

1. 調整 `tools/generate-station-regions.mjs` 的 `locales` 與 `regionLabels`。
2. 為車站新增對應語言來源或 label map。
3. 調整 `tools/download-and-preprocess.mjs`，讓 `carsMap.json` 產生新語言的 `labels` 與 `rawLabels`。
4. 若最新消息要支援新語言，在 `news.json` 的 `title/body` 物件中新增同語言 key。
5. 執行：

```sh
docker compose exec app npm run download
docker compose exec app npm run check:stations
docker compose exec app npm run build
```

## 下次接續開發建議流程

1. 先確認工作樹狀態：

```sh
git status --short
```

2. 啟動 Docker Compose：

```sh
docker compose up
```

3. 開啟本機站台：

```text
http://localhost:5173/tra-timetable/
```

4. 修改前先讀這幾個核心檔：

- `src/App.vue`
- `src/i18n.js`
- `tools/download-and-preprocess.mjs`
- `tools/generate-station-regions.mjs`
- `public/data/meta/stationRegions.json`
- `public/data/meta/carsMap.json`

5. 完成修改後至少執行：

```sh
docker compose exec app npm run check:stations
docker compose exec app npm run build
```

如果改到資料下載或 metadata，建議再執行：

```sh
docker compose exec app npm run download
```

## 部署

GitHub Actions 會 build 並部署到 GitHub Pages。`public/CNAME` 會讓 GitHub Pages 使用：

```text
tra-timetable.cftang.dev
```

`vite.config.js` 使用相對 base，讓自訂網域與原本 GitHub Pages path 都能讀到正確 assets。App 啟動時會把 `*.github.io/tra-timetable/...` 轉址到自訂網域，並保留 query/hash，班次分享連結也會跟著保留。
