import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_URL = "https://tra-timetable.cftang.dev";
const outputDir = path.resolve(process.cwd(), process.argv[2] ?? "dist");
const metadataPath = path.resolve(process.cwd(), "public/data/meta/stationRegions.json");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const siteNavCopy = {
  "zh-TW": { stations: "車站資訊", guide: "使用說明", about: "資料來源", news: "最新消息", api: "JSON 資源" },
  en: { stations: "Stations", guide: "Guide", about: "Data source", api: "JSON resources" },
  ja: { stations: "駅情報", guide: "使い方", about: "データソース", api: "JSON リソース" },
};

function localizedSitePath(locale, path) {
  return locale === "zh-TW" ? path : `/${locale}${path}`;
}

function siteNavigationLinks(locale) {
  const copy = siteNavCopy[locale];
  const links = [
    [localizedSitePath(locale, "/stations/"), copy.stations],
    [localizedSitePath(locale, "/guide/"), copy.guide],
    [localizedSitePath(locale, "/about/"), copy.about],
    ...(locale === "zh-TW" ? [["/news/", copy.news]] : []),
    ["/api/", copy.api],
  ];
  return `<nav class="site-nav-links" aria-label="Site navigation">${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</nav>`;
}

const navbarLabels = {
  "zh-TW": { title: "台鐵時刻表查詢", language: "選擇語言", theme: "切換深淺色模式" },
  en: { title: "TRA Timetable", language: "Select language", theme: "Toggle color theme" },
  ja: { title: "台湾鉄道時刻表", language: "言語を選択", theme: "配色を切り替える" },
};

function staticNavigation(locale) {
  return `<site-nav locale="${locale}"></site-nav>`;
}

function staticPageDocument(html, locale = "zh-TW", pagePath = "/", hasLocalizedVariants = true) {
  if (html.includes('class="site-header"')) return html;
  const sharedHead = `<link rel="stylesheet" href="/site-nav.css"><script src="/site-nav.js" defer></script><style>
    :root{color-scheme:light;--site-bg:#f8fafc;--site-surface:#fff;--site-text:#1f2937;--site-muted:#64748b;--site-border:#e2e8f0;--site-accent:#2563eb}
    html.theme-dark{color-scheme:dark;--site-bg:#0f172a;--site-surface:#111827;--site-text:#e5e7eb;--site-muted:#cbd5e1;--site-border:#334155;--site-accent:#93c5fd}
    html.theme-dark body{background:var(--site-bg)!important;color:var(--site-text)!important}
    html.theme-dark h1,html.theme-dark h2{color:var(--site-text)!important}
    html.theme-dark .panel,html.theme-dark .meta{background:var(--site-surface)!important;border-color:var(--site-border)!important}
    html.theme-dark p,html.theme-dark li,html.theme-dark dd,html.theme-dark .meta dt{color:var(--site-muted)!important}
  </style><script>try{if(localStorage.getItem("tra.theme")==="dark")document.documentElement.classList.add("theme-dark")}catch{}</script>`;
  return html.replace("</head>", `${sharedHead}</head>`).replace("<body>", `<body>${staticNavigation(locale, pagePath, hasLocalizedVariants)}`);
}

function stationPage(station, regionLabel) {
  const name = station.labels?.["zh-TW"] ?? station.stationName ?? station.stationCode;
  const englishName = station.labels?.en ?? station.stationEName;
  const japaneseName = station.labels?.ja;
  const url = `${SITE_URL}/stations/${encodeURIComponent(station.stationCode)}/`;
  const address = station.stationAddrTw;
  const stationJson = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TrainStation",
    name,
    identifier: station.stationCode,
    url,
    ...(address ? { address } : {}),
  }).replaceAll("<", "\\u003c");

  return staticPageDocument(`<!doctype html>
<html lang="zh-Hant-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <meta name="description" content="查詢${escapeHtml(name)}出發與抵達的台鐵時刻表，可查看近期班次、車次、出發時間、抵達時間與沿途停靠站。" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="台鐵班次查詢" />
    <meta property="og:title" content="${escapeHtml(name)}時刻表｜台鐵班次與火車時刻查詢" />
    <meta property="og:description" content="查${escapeHtml(name)}的近期台鐵班次、車次與停靠站。" />
    <meta property="og:url" content="${url}" />
    <script type="application/ld+json">${stationJson}</script>
    <title>${escapeHtml(name)}時刻表｜台鐵班次與火車時刻查詢</title>
    <style>body{margin:0;background:#f8fafc;color:#1f2937;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7}main{max-width:720px;margin:0 auto;padding:32px 24px}a{color:#2563eb}h1{margin:0;color:#0f172a;font-size:clamp(2rem,5vw,3rem);line-height:1.2}.meta{margin:24px 0;padding:20px;background:#fff;border:1px solid #e5e7eb;border-radius:8px}.meta dt{margin-top:12px;color:#4b5563;font-size:.875rem}.meta dd{margin:2px 0 0}.action{display:inline-block;padding:10px 14px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none}</style>
  </head>
  <body>
    <main>
      <p><a href="/stations/">所有車站</a> · <a href="/app/">查時刻表</a></p>
      <h1>${escapeHtml(name)}車站時刻表</h1>
      <p>從${escapeHtml(name)}出發，或是要搭車到${escapeHtml(name)}，都可以在這裡先帶入車站再找近期班次。</p>
      <div class="meta">
        <dl>
          <dt>站碼</dt><dd>${escapeHtml(station.stationCode)}</dd>
          <dt>地區</dt><dd>${escapeHtml(regionLabel)}</dd>
          ${englishName ? `<dt>English</dt><dd>${escapeHtml(englishName)}</dd>` : ""}
          ${japaneseName ? `<dt>日本語</dt><dd>${escapeHtml(japaneseName)}</dd>` : ""}
          ${address ? `<dt>地址</dt><dd>${escapeHtml(address)}</dd>` : ""}
        </dl>
      </div>
      <a class="action" href="/app/?station=${encodeURIComponent(station.stationCode)}">從${escapeHtml(name)}開始查</a>
    </main>
  </body>
</html>`);
}

const infoCopy = {
  en: {
    stations: { title: "TRA Stations | Find a station and timetable", heading: "TRA station directory", intro: "Browse stations by area, or return to the timetable search to choose an origin and destination.", groups: "Find a station by area", groupsText: "Stations are grouped into Taipei–Keelung, Taoyuan–Hsinchu–Miaoli, Taichung–Changhua, Yunlin–Chiayi–Tainan, Kaohsiung–Pingtung, Yilan, Hualien–Taitung and branch lines.", nearby: "Find the nearest station", nearbyText: "If you allow location access, the timetable search can fill in the nearest TRA station.", footer: "Station and timetable data may change following official adjustments. Please check TRA announcements and station information before travel." },
    guide: { title: "How to use the TRA timetable search", heading: "How to search the TRA timetable", intro: "Select a date, origin, destination and boarding time to find matching services.", sections: [["Start with the basics", "Choose your travel date, origin and destination. Setting a boarding time lists services after that time; open a service to see departure, arrival and all stops."], ["Share a service", "After finding a service, use the share option to send its link and stop information."], ["Install it on your home screen or desktop", "You can install this site as an app icon. On iPhone or iPad, open it in Safari, use Share, then choose Add to Home Screen. On Android or desktop Chrome, use the browser menu and choose Install app."], ["Timetable, not live service status", "Results are based on published timetables. For delays, cancellations, platforms and temporary changes, check official TRA information."]] },
    about: { title: "TRA timetable data source and site information", heading: "About this site and its data", intro: "This site makes it easier to look up published TRA timetables by date, station and boarding time.", sections: [["Data source", "Train and station data are compiled from publicly available TRA timetable data and prepared for this site."], ["Updates", "Updated data is published with the site. The search only shows dates that have been prepared."], ["Limitations", "This is a timetable tool, not live train status. Delays, cancellations, platforms, fares and seat availability are not included."], ["Independent site", "This is not an official TRA website and does not represent TRA services or announcements."]] },
  },
  ja: {
    stations: { title: "台湾鉄道 駅一覧 | 駅と時刻表を探す", heading: "台湾鉄道の駅一覧", intro: "地域から駅を探すか、時刻表検索に戻って出発駅と到着駅を選択できます。", groups: "地域から駅を探す", groupsText: "駅は台北・基隆、桃園・新竹・苗栗、台中・彰化、雲林・嘉義・台南、高雄・屏東、宜蘭、花蓮・台東、支線に分けて表示しています。", nearby: "最寄り駅を探す", nearbyText: "位置情報を許可すると、時刻表検索で最寄りの台湾鉄道駅を自動入力できます。", footer: "駅と時刻表の情報は公式の調整により変更される場合があります。実際の情報は台湾鉄道の案内と駅でご確認ください。" },
    guide: { title: "台湾鉄道時刻表の調べ方", heading: "台湾鉄道時刻表の使い方", intro: "日付、出発駅、到着駅、乗車時刻を選択すると、条件に合う列車を検索できます。", sections: [["基本の検索", "乗車日、出発駅、到着駅を選びます。乗車時刻を設定すると、その時刻以降の列車を表示します。列車を開くと出発、到着、途中停車駅を確認できます。"], ["列車を共有する", "列車を見つけたら共有機能でリンクを送り、停車駅情報を共有できます。"], ["ホーム画面やデスクトップに追加する", "このサイトはアプリのアイコンとして追加できます。iPhone・iPad は Safari で開き、共有から「ホーム画面に追加」を選びます。Android またはパソコン版 Chrome はブラウザのメニューから「アプリをインストール」を選びます。"], ["時刻表と運行情報", "検索結果は公開時刻表に基づきます。遅延、運休、ホーム、臨時変更は台湾鉄道の公式情報をご確認ください。"]] },
    about: { title: "台湾鉄道時刻表のデータソースとサイトについて", heading: "このサイトとデータについて", intro: "このサイトは、日付、駅、乗車時刻から公開されている台湾鉄道時刻表を調べやすくするためのものです。", sections: [["データソース", "列車と駅のデータは公開されている台湾鉄道の時刻表データを整理して使用しています。"], ["更新", "更新済みのデータはサイトとともに公開されます。検索できるのは準備済みの日付のみです。"], ["制限", "このサイトは時刻表ツールであり、リアルタイムの運行情報ではありません。遅延、運休、ホーム、運賃、空席情報は含まれません。"], ["非公式サイト", "このサイトは台湾鉄道の公式サイトではなく、公式のサービスや案内を代表するものではありません。"]] },
  },
};

function localizedInfoPage(type, locale, directory = "") {
  const copy = infoCopy[locale][type];
  const pagePath = `/${locale}/${type}/`;
  const appUrl = `/app/?lang=${locale}`;
  const stationContent = type === "stations" ? `<section><h2>${copy.groups}</h2><p>${copy.groupsText}</p></section><section><h2>${copy.nearby}</h2><p>${copy.nearbyText}</p></section>${directory}` : copy.sections.map(([heading, text], index) => `<section${index === 0 ? ' class="panel"' : ""}><h2>${heading}</h2><p>${text}</p></section>`).join("");
  return staticPageDocument(`<!doctype html><html lang="${locale}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="index,follow"><meta name="description" content="${escapeHtml(copy.intro)}"><link rel="canonical" href="${SITE_URL}${pagePath}"><title>${escapeHtml(copy.title)}</title><style>body{margin:0;background:#f8fafc;color:#1f2937;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.75}header,main,footer{max-width:880px;margin:0 auto;padding:24px}header{padding-top:32px}a{color:#2563eb}h1{margin:0;color:#0f172a;font-size:clamp(1.8rem,4vw,2.5rem);line-height:1.25}h2{margin-top:32px;color:#111827;font-size:1.2rem}.panel{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px}.station-list{columns:2 12rem;column-gap:2rem;padding-left:1.25rem}.station-list li{break-inside:avoid}@media(max-width:680px){header,main,footer{padding-left:16px;padding-right:16px}}</style></head><body><header><p><a href="/${locale}/">${locale === "ja" ? "時刻表検索に戻る" : "Back to timetable search"}</a></p><h1>${copy.heading}</h1><p>${copy.intro}</p></header><main>${stationContent}</main><footer><p>${copy.footer ?? ""}</p></footer></body></html>`, locale, `/${type}/`);
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const stations = Array.isArray(metadata.stations) ? metadata.stations : [];
const validStations = stations.filter((station) => /^\d+$/.test(String(station.stationCode ?? "")));

if (validStations.length === 0) {
  throw new Error("No valid stations found in stationRegions.json");
}

await readFile(path.join(outputDir, "app", "index.html"));

const dayDirectory = path.resolve(process.cwd(), "public/data/days");
const availableDays = (await readdir(dayDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^\d{8}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const newsData = JSON.parse(await readFile("public/data/meta/news.json", "utf8"));
const newsItems = Array.isArray(newsData?.items) ? newsData.items : Array.isArray(newsData) ? newsData : [];
const apiDirectory = path.join(outputDir, "api/v1");
await mkdir(apiDirectory, { recursive: true });
await writeFile(
  path.join(apiDirectory, "index.json"),
  `${JSON.stringify(
    {
      version: "v1",
      generatedAt: new Date().toISOString(),
      resources: {
        stations: "/api/v1/stations.json",
        cars: "/api/v1/cars.json",
        news: "/api/v1/news.json",
        timetable: "/data/days/{YYYYMMDD}/trains.json",
        stopIndex: "/data/days/{YYYYMMDD}/stopIndex.json",
      },
      availableDates: availableDays.map((day) => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`),
    },
    null,
    2,
  )}\n`,
);
await writeFile(path.join(apiDirectory, "stations.json"), `${JSON.stringify(metadata)}\n`);
await writeFile(path.join(apiDirectory, "cars.json"), await readFile("public/data/meta/carsMap.json"));
await writeFile(path.join(apiDirectory, "news.json"), `${JSON.stringify(newsData)}\n`);

const legacyHomePage = `<!doctype html>
<html lang="zh-Hant-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="index,follow"><meta name="description" content="台鐵班次查詢提供近期台鐵時刻表、起迄站查詢、完整停靠站與可分享班次連結。資料依台鐵公開資料定期更新。"><link rel="canonical" href="${SITE_URL}/"><meta property="og:type" content="website"><meta property="og:site_name" content="台鐵班次查詢"><meta property="og:title" content="台鐵班次查詢｜時刻表、停靠站與車站資訊"><meta property="og:description" content="用近期公開時刻表快速查詢台鐵班次、停靠站與車站資訊。"><meta property="og:url" content="${SITE_URL}/"><meta property="og:image" content="${SITE_URL}/logo.png"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"台鐵班次查詢","url":"${SITE_URL}/","inLanguage":"zh-Hant-TW"},{"@type":"WebApplication","name":"台鐵班次查詢","url":"${SITE_URL}/app/","applicationCategory":"TravelApplication","operatingSystem":"Web"}]}</script><title>台鐵班次查詢｜時刻表、停靠站與車站資訊</title><style>body{margin:0;background:#f8fafc;color:#1f2937;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.75}header,main,footer{max-width:960px;margin:auto;padding:24px}.hero{padding-top:64px}.eyebrow{color:#2563eb;font-weight:700}.lead{max-width:46rem;font-size:1.15rem}h1{margin:0;color:#0f172a;font-size:clamp(2.2rem,6vw,4rem);line-height:1.15}h2{color:#0f172a}.actions,nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}.button{display:inline-block;padding:11px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700}.alt{background:#fff;color:#1d4ed8;border:1px solid #bfdbfe}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px}.note{background:#eff6ff;border-left:4px solid #2563eb;padding:16px 20px}a{color:#2563eb}</style></head><body><header class="hero"><p class="eyebrow">台鐵公開時刻表整理工具</p><h1>出發前，快速查台鐵班次與完整停靠站</h1><p class="lead">本站整理台鐵公開班次與車站資料，讓你依日期、起站、迄站與上車時間查找近期可搭乘班次，也能分享單一列車的停靠站資訊。</p><div class="actions"><a class="button" href="/app/">開始查詢班次</a><a class="button alt" href="/guide/">查看使用說明</a></div><nav aria-label="主要導覽"><a href="/stations/">台鐵車站資訊</a><a href="/about/">資料來源與限制</a><a href="/api/">JSON 資源說明</a></nav></header><main><section class="grid" aria-label="本站提供的資訊"><article class="card"><h2>近期班次查詢</h2><p>選擇日期、起迄站與預計上車時間，快速篩選時刻表中的可搭乘班次。</p></article><article class="card"><h2>完整停靠站</h2><p>展開班次即可查看各站到開時間，並建立可分享給同行者的連結。</p></article><article class="card"><h2>車站資料</h2><p>依地區瀏覽車站，使用繁中、英文與日文站名協助選擇起迄站。</p></article></section><section><h2>資料如何提供</h2><p>班次資料會隨網站部署成靜態 JSON，瀏覽器直接向 GitHub Pages 讀取，不需帳號或伺服器 API。可用日期與資源網址由 <a href="/api/v1/index.json">API v1 manifest</a> 提供。</p><p class="note">本站不是台鐵官方服務，也不提供即時誤點、停駛、月台、票價或餘票資訊；實際搭乘請以台鐵官方公告與現場資訊為準。</p></section></main><footer><p>資料可用日期：${availableDays.length ? `${availableDays[0]} 至 ${availableDays.at(-1)}` : "建置時尚無資料"}。<a href="/about/">了解更新方式</a></p></footer></body></html>`;
const homeCopy = {
  "zh-TW": {
    lang: "zh-Hant-TW",
    title: "台鐵時刻表查詢",
    description: "快速查詢台鐵時刻表與火車班次，選擇日期、出發站、抵達站與時間，即可查看車次、出發時間、抵達時間及沿途停靠站。",
    query: "查詢班次",
    guide: "使用說明",
    stations: "車站資訊",
    about: "資料來源",
    api: "JSON 資源",
    heading: "台鐵時刻表查詢",
    intro: "本站提供台鐵純時刻表查詢。選擇日期、出發站、抵達站與上車時間後，可查看班次、車次、出發與抵達時間，以及沿途停靠站。",
    scheduleTitle: "查詢班次",
    scheduleText: "依日期、出發站、抵達站與上車時間篩選可搭乘班次。",
    stopsTitle: "查看停靠站",
    stopsText: "展開班次後，可查看列車各站的到達與開車時間。",
    sourceTitle: "資料說明",
    sourceText: "資料整理自公開台鐵時刻表，並定期更新。",
    note: "本站未提供即時列車動態。誤點、停駛、月台與臨時異動，請以台鐵官方資訊為準。",
    availability: "目前資料範圍",
    themeLabel: "切換深淺色模式",
    languageLabel: "選擇語言",
  },
  en: {
    lang: "en",
    title: "TRA Timetable",
    description: "Search recent Taiwan Railway schedules, stations, train stops, and share direct train links. Data is periodically published from TRA open data.",
    query: "Search trains",
    guide: "Guide",
    stations: "Stations",
    about: "Data source",
    api: "JSON resources",
    heading: "TRA timetable search",
    intro: "Search recent schedules by date, origin, destination, and boarding time. View every stop and share a direct train link.",
    scheduleTitle: "Recent schedules",
    scheduleText: "Filter available trains from published timetable data.",
    stopsTitle: "Stop information",
    stopsText: "Review arrival and departure times at every station.",
    sourceTitle: "Open data, prepared",
    sourceText: "Data is published as static JSON and updated periodically; it is not live train status.",
    note: "Before travelling, confirm details with official TRA notices and station information.",
    availability: "Available data range",
    themeLabel: "Toggle color theme",
    languageLabel: "Select language",
  },
  ja: {
    lang: "ja",
    title: "台湾鉄道時刻表",
    description: "台湾鉄道の直近の時刻表、駅、停車駅を検索し、列車リンクを共有できます。データは公開資料から定期更新しています。",
    query: "列車を検索",
    guide: "使い方",
    stations: "駅情報",
    about: "データソース",
    api: "JSON リソース",
    heading: "台湾鉄道時刻表検索",
    intro: "日付、出発駅、到着駅、乗車時刻から直近の列車を検索できます。全停車駅を確認し、列車リンクを共有できます。",
    scheduleTitle: "直近の時刻表",
    scheduleText: "公開時刻表から条件に合う列車を検索します。",
    stopsTitle: "停車駅情報",
    stopsText: "各駅の到着時刻と出発時刻を確認できます。",
    sourceTitle: "公開データを整理",
    sourceText: "データは静的 JSON として定期更新され、リアルタイムの運行情報ではありません。",
    note: "ご利用前に、台湾鉄道の公式案内と駅の最新情報をご確認ください。",
    availability: "提供中のデータ範囲",
    themeLabel: "配色を切り替える",
    languageLabel: "言語を選択",
  },
};

function staticHomePage(locale) {
  const copy = homeCopy[locale];
  const prefix = locale === "zh-TW" ? "" : `/${locale}`;
  const appUrl = `/app/${locale === "zh-TW" ? "" : `?lang=${locale}`}`;
  const localeOptions = [
    ["zh-TW", "/", "中文"],
    ["en", "/en/", "EN"],
    ["ja", "/ja/", "日本語"],
  ]
    .map(([value, url, label]) => `<option value="${url}"${value === locale ? " selected" : ""}>${label}</option>`)
    .join("");
  return `<!doctype html>
<html lang="${copy.lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="index,follow"><meta name="description" content="${copy.description}"><meta name="theme-color" content="#f8fafc"><link rel="canonical" href="${SITE_URL}${prefix}/"><link rel="alternate" hreflang="zh-Hant-TW" href="${SITE_URL}/"><link rel="alternate" hreflang="en" href="${SITE_URL}/en/"><link rel="alternate" hreflang="ja" href="${SITE_URL}/ja/"><link rel="alternate" hreflang="x-default" href="${SITE_URL}/"><meta property="og:type" content="website"><meta property="og:site_name" content="${copy.title}"><meta property="og:title" content="${copy.heading}｜${copy.title}"><meta property="og:description" content="${copy.description}"><meta property="og:url" content="${SITE_URL}${prefix}/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"${copy.title}","url":"${SITE_URL}${prefix}/","inLanguage":"${copy.lang}"}</script><title>${copy.heading}｜${copy.title}</title><style>:root{color-scheme:light;--bg:#f8fafc;--surface:#fff;--text:#1f2937;--muted:#64748b;--border:#e2e8f0;--accent:#2563eb;--accent-soft:#eff6ff}html.theme-dark{color-scheme:dark;--bg:#0f172a;--surface:#111827;--text:#e5e7eb;--muted:#cbd5e1;--border:#334155;--accent:#93c5fd;--accent-soft:#172554}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7}.site-header{position:sticky;top:0;z-index:10;background:var(--surface);border-bottom:1px solid var(--border)}.nav-wrap,main,footer{max-width:960px;margin:auto;padding:0 24px}.nav-wrap{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{color:var(--text);font-size:1.05rem;font-weight:700;text-decoration:none}.controls{display:flex;align-items:center;gap:8px}select,button{height:36px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:.875rem;padding:0 10px}button{width:36px;padding:0;cursor:pointer}main{padding-top:36px;padding-bottom:24px}h1{margin:0 0 8px;color:var(--text);font-size:clamp(1.6rem,4vw,2.25rem);line-height:1.25}h2{margin:0 0 6px;font-size:1.05rem}.intro{max-width:680px;margin:0;color:var(--muted);font-size:1.05rem}.actions,.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.button-link{display:inline-flex;align-items:center;min-height:38px;width:auto;border:0;border-radius:8px;padding:0 14px;background:var(--accent);color:#fff;text-decoration:none;font-weight:700}.install-button{background:var(--surface);border:1px solid var(--border);color:var(--text)}.links a{color:var(--accent);text-decoration:none;font-size:.9rem}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:32px}.card{border:1px solid var(--border);border-radius:10px;background:var(--surface);padding:18px}.card p,.note,footer{margin:0;color:var(--muted);font-size:.94rem}.note{margin-top:20px;border-left:3px solid var(--accent);background:var(--accent-soft);padding:12px 14px;border-radius:0 8px 8px 0}footer{border-top:1px solid var(--border);padding-top:18px;padding-bottom:28px}@media(max-width:680px){.nav-wrap,main,footer{padding-left:16px;padding-right:16px}.grid{grid-template-columns:1fr}.brand{font-size:.95rem}}</style><script>try{if(localStorage.getItem("tra.theme")==="dark")document.documentElement.classList.add("theme-dark")}catch{};window.__traInstallPrompt=null;window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();window.__traInstallPrompt=event});window.traInstall=async()=>{if(window.__traInstallPrompt){window.__traInstallPrompt.prompt();await window.__traInstallPrompt.userChoice;window.__traInstallPrompt=null}else{alert(${JSON.stringify(copy.installHelp)})}};</script></head><body><header class="site-header"><div class="nav-wrap"><a class="brand" href="${prefix || "/"}">${copy.title}</a><div class="controls"><select aria-label="${copy.languageLabel}" onchange="location.href=this.value">${localeOptions}</select><button type="button" aria-label="${copy.themeLabel}" title="${copy.themeLabel}" onclick="document.documentElement.classList.toggle('theme-dark');try{localStorage.setItem('tra.theme',document.documentElement.classList.contains('theme-dark')?'dark':'light')}catch{}">◐</button></div></div></header><main><h1>${copy.heading}</h1><p class="intro">${copy.intro}</p><div class="actions"><a class="button-link" href="${appUrl}">${copy.query}</a><button class="button-link install-button" type="button" onclick="traInstall()">${copy.install}</button></div><nav class="links" aria-label="Site navigation"><a href="/stations/">${copy.stations}</a><a href="/guide/">${copy.guide}</a><a href="/about/">${copy.about}</a><a href="/api/">${copy.api}</a></nav><section class="grid" aria-label="Service overview"><article class="card"><h2>${copy.scheduleTitle}</h2><p>${copy.scheduleText}</p></article><article class="card"><h2>${copy.stopsTitle}</h2><p>${copy.stopsText}</p></article><article class="card"><h2>${copy.sourceTitle}</h2><p>${copy.sourceText}</p></article></section><p class="note">${copy.note}</p></main><footer><p>${copy.availability}：${availableDays.length ? `${availableDays[0]} 至 ${availableDays.at(-1)}` : "-"}</p></footer></body></html>`;
}

function staticNewsPage() {
  const content = newsItems
    .slice(0, 5)
    .map((item) => {
      const itemTitle = item?.title?.["zh-TW"] ?? item?.title ?? "";
      const body = item?.body?.["zh-TW"] ?? item?.body ?? "";
      const link = item?.link ? `<p><a href="${escapeHtml(item.link)}" rel="noreferrer">查看連結</a></p>` : "";
      return `<details><summary><time>${escapeHtml(item?.date ?? "")}</time>${escapeHtml(itemTitle)}</summary><div class="news-body"><p>${escapeHtml(body).replaceAll("\n", "<br>")}</p>${link}</div></details>`;
    })
    .join("");
  return staticPageDocument(`<!doctype html><html lang="zh-Hant-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="index,follow"><meta name="description" content="台鐵時刻表查詢網站的最新消息。"><link rel="canonical" href="${SITE_URL}/news/"><title>最新消息｜台鐵時刻表查詢</title><style>body{margin:0;background:#f8fafc;color:#1f2937;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7}main{max-width:880px;margin:0 auto;padding:32px 24px 48px}h1{margin:0;font-size:clamp(1.6rem,4vw,2.25rem);line-height:1.25}p{color:#64748b}a{color:#2563eb}.back{font-size:.9rem}details{border-top:1px solid #e2e8f0;padding:14px 0}details:last-child{border-bottom:1px solid #e2e8f0}summary{cursor:pointer;font-weight:700}time{display:inline-block;min-width:6.5rem;margin-right:12px;color:#64748b;font-size:.875rem;font-weight:400}.news-body{padding:0 0 2px 6.5rem}.news-body p{margin:10px 0 0}@media(max-width:680px){main{padding:24px 16px 40px}.news-body{padding-left:0}time{display:block;margin-bottom:3px}}</style></head><body><main><p class="back"><a href="/">返回台鐵時刻表查詢</a></p><h1>最新消息</h1><p>網站更新與資料狀態。</p>${content || "<p>目前沒有消息。</p>"}</main></body></html>`, "zh-TW", "/news/", false);
}

function staticHomeDocument(locale) {
  const firstDay = availableDays[0];
  const lastDay = availableDays.at(-1);
  const dateRange =
    firstDay && lastDay
      ? `${firstDay.slice(0, 4)}/${firstDay.slice(4, 6)}/${firstDay.slice(6, 8)}–${lastDay.slice(4, 6)}/${lastDay.slice(6, 8)}`
      : "-";
  let document = staticHomePage(locale).replace(
    `<button class="button-link install-button" type="button" onclick="traInstall()">${homeCopy[locale].install}</button>`,
    "",
  ).replace(/;window\.__traInstallPrompt=.*?<\/script>/, "</script>")
    .replace(
      /(<footer><p>).*?(<\/p><\/footer>)/,
      `$1${homeCopy[locale].availability}：<span class="date-range">${dateRange}</span>$2`,
    )
    .replace(
      "</style>",
      ".date-range{white-space:nowrap}main{padding-top:24px}h1{font-size:clamp(1.45rem,3vw,1.8rem)}footer{width:min(960px,100%);margin:0 auto;padding-left:24px;padding-right:24px}.faq{margin-top:28px}.faq h2{margin-bottom:12px}.faq details{border-top:1px solid var(--border);padding:12px 0}.faq summary{cursor:pointer;font-weight:700}.faq p{color:var(--muted);margin:8px 0 0}@media(max-width:680px){footer{padding-left:16px;padding-right:16px}}</style>",
    );
  const localizedPath = locale === "zh-TW" ? "" : `/${locale}`;
  document = document
    .replace('href="/stations/"', `href="${localizedPath}/stations/"`)
    .replace('href="/guide/"', `href="${localizedPath}/guide/"`)
    .replace('href="/about/"', `href="${localizedPath}/about/"`);
  document = document.replace(/<nav class="links" aria-label="Site navigation">.*?<\/nav>/, "");
  document = document.replace(/<header class="site-header">.*?<\/header>/, staticNavigation(locale));
  document = document.replace("</head>", '<link rel="stylesheet" href="/site-nav.css"><script src="/site-nav.js" defer></script></head>');
  if (locale === "zh-TW") {
    const faq = `<section class="faq" aria-labelledby="faq-title"><h2 id="faq-title">常見問題</h2><details><summary>這裡查得到即時誤點嗎？</summary><p>目前主要提供時刻表查詢，不是即時列車動態。遇到誤點、停駛或臨時異動，建議再確認台鐵官方資訊。</p></details><details><summary>可以看這班車停哪些站嗎？</summary><p>可以。打開班次後，就能看到這班車沿途的停靠站。</p></details><details><summary>自強號、莒光號、區間車都查得到嗎？</summary><p>只要班次在目前下載的公開時刻表資料裡，就會出現在查詢結果中。</p></details><details><summary>查到的班次可以傳給別人嗎？</summary><p>可以。找到班次後按分享，就能把這班車的連結傳出去。</p></details></section>`;
    const faqJson = `{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"這裡查得到即時誤點嗎？","acceptedAnswer":{"@type":"Answer","text":"目前主要提供時刻表查詢，不是即時列車動態。遇到誤點、停駛或臨時異動，建議再確認台鐵官方資訊。"}},{"@type":"Question","name":"可以看這班車停哪些站嗎？","acceptedAnswer":{"@type":"Answer","text":"可以。打開班次後，就能看到這班車沿途的停靠站。"}},{"@type":"Question","name":"查到的班次可以傳給別人嗎？","acceptedAnswer":{"@type":"Answer","text":"可以。找到班次後按分享，就能把這班車的連結傳出去。"}}]}`;
    document = document
      .replace("</main>", `${faq}</main>`)
      .replace("</head>", `<script type="application/ld+json">${faqJson}</script></head>`)
      .replace("<title>台鐵時刻表查詢｜台鐵時刻表查詢</title>", "<title>台鐵時刻表查詢｜火車班次、車次與停靠站</title>")
      .replace(
        'content="台鐵時刻表查詢｜台鐵時刻表查詢"',
        'content="台鐵時刻表查詢｜火車班次、車次與停靠站"',
      );
  }
  return document;
}

await writeFile(path.join(outputDir, "index.html"), staticHomeDocument("zh-TW"));
for (const locale of ["en", "ja"]) {
  const localeDirectory = path.join(outputDir, locale);
  await mkdir(localeDirectory, { recursive: true });
  await writeFile(path.join(localeDirectory, "index.html"), staticHomeDocument(locale));
}
await mkdir(path.join(outputDir, "api"), { recursive: true });
await writeFile(path.join(outputDir, "api/index.html"), staticPageDocument(`<!doctype html><html lang="zh-Hant-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex,follow"><title>JSON 資源｜台鐵班次查詢</title><style>body{margin:0;background:#f8fafc;color:#1f2937;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.75}main{max-width:880px;margin:0 auto;padding:32px 24px 48px}h1{margin:0;font-size:clamp(1.6rem,4vw,2.25rem);line-height:1.25}a{color:#2563eb}.panel{margin-top:24px;padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:10px}code{padding:2px 5px;border-radius:4px;background:#eef2f7;word-break:break-all}@media(max-width:680px){main{padding:24px 16px 40px}}</style></head><body><main><p><a href="/">返回台鐵時刻表查詢</a></p><h1>JSON 資源</h1><p>提供網站使用的靜態 JSON 資料，適合程式讀取或自行建立工具。</p><section class="panel"><h2>API v1</h2><p>從 <a href="/api/v1/index.json">API v1 manifest</a> 取得目前可用日期與端點。</p><p>班次資料：<code>/data/days/{YYYYMMDD}/trains.json</code></p><p>站碼索引：<code>/data/days/{YYYYMMDD}/stopIndex.json</code></p></section></main></body></html>`, "zh-TW"));

await mkdir(path.join(outputDir, "news"), { recursive: true });
await writeFile(path.join(outputDir, "news/index.html"), staticNewsPage());

for (const station of validStations) {
  const regionLabel =
    metadata.regionLabels?.[station.region]?.labels?.["zh-TW"] ?? station.region ?? "未分類";
  const directory = path.join(outputDir, "stations", station.stationCode);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), stationPage(station, regionLabel));
}

const stationIndexPath = path.join(outputDir, "stations", "index.html");
const stationIndex = await readFile(stationIndexPath, "utf8");
const stationsByRegion = new Map();
for (const station of validStations) {
  const region = station.region ?? "未分類";
  if (!stationsByRegion.has(region)) stationsByRegion.set(region, []);
  stationsByRegion.get(region).push(station);
}
function stationDirectoryFor(locale = "zh-TW") {
  return [...stationsByRegion.entries()]
  .map(([region, regionStations]) => {
    const regionLabel = metadata.regionLabels?.[region]?.labels?.[locale] ?? metadata.regionLabels?.[region]?.labels?.["zh-TW"] ?? region;
    const links = regionStations
      .map((station) => {
        const name = station.labels?.[locale] ?? station.labels?.["zh-TW"] ?? station.stationName ?? station.stationCode;
        return `<li><a href="/stations/${encodeURIComponent(station.stationCode)}/">${escapeHtml(name)}</a></li>`;
      })
      .join("");
    return `<section><h2>${escapeHtml(regionLabel)}</h2><ul class="station-list">${links}</ul></section>`;
  })
  .join("\n");
}

const stationDirectory = stationDirectoryFor();

if (!stationIndex.includes("<!-- station-directory -->")) {
  throw new Error("Station directory placeholder is missing from dist/stations/index.html");
}
await writeFile(
  stationIndexPath,
  stationIndex.replace("<!-- station-directory -->", stationDirectory),
);

for (const locale of ["en", "ja"]) {
  for (const type of ["about", "guide", "stations"]) {
    const directory = path.join(outputDir, locale, type);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "index.html"), localizedInfoPage(type, locale, type === "stations" ? stationDirectoryFor(locale) : ""));
  }
}

const staticUrls = ["/", "/en/", "/ja/", "/about/", "/guide/", "/stations/", "/news/", "/en/about/", "/en/guide/", "/en/stations/", "/ja/about/", "/ja/guide/", "/ja/stations/"];
const stationUrls = validStations.map((station) => `/stations/${encodeURIComponent(station.stationCode)}/`);
const sitemapUrls = ["/"];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls
  .map((url) => `  <url>\n    <loc>${SITE_URL}${url}</loc>\n  </url>`)
  .join("\n")}\n</urlset>\n`;

await writeFile(path.join(outputDir, "sitemap.xml"), sitemap);
console.log(`Generated ${validStations.length} station pages and sitemap.xml.`);
