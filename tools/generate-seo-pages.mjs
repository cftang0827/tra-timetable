import { mkdir, readFile, writeFile } from "node:fs/promises";
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

  return `<!doctype html>
<html lang="zh-Hant-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <meta name="description" content="${escapeHtml(name)}台鐵車站資料：站碼、地區${address ? "與地址" : ""}。可前往台鐵班次查詢選擇此站。" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="台鐵班次查詢" />
    <meta property="og:title" content="${escapeHtml(name)}車站｜台鐵班次查詢" />
    <meta property="og:description" content="${escapeHtml(name)}台鐵車站資料與班次查詢入口。" />
    <meta property="og:url" content="${url}" />
    <script type="application/ld+json">${stationJson}</script>
    <title>${escapeHtml(name)}車站｜台鐵班次查詢</title>
    <style>body{margin:0;background:#f8fafc;color:#1f2937;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7}main{max-width:720px;margin:0 auto;padding:32px 24px}a{color:#2563eb}h1{margin:0;color:#0f172a;font-size:clamp(2rem,5vw,3rem);line-height:1.2}.meta{margin:24px 0;padding:20px;background:#fff;border:1px solid #e5e7eb;border-radius:8px}.meta dt{margin-top:12px;color:#4b5563;font-size:.875rem}.meta dd{margin:2px 0 0}.action{display:inline-block;padding:10px 14px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none}</style>
  </head>
  <body>
    <main>
      <p><a href="/stations/">台鐵車站資訊</a> · <a href="/">台鐵班次查詢</a></p>
      <h1>${escapeHtml(name)}車站</h1>
      <div class="meta">
        <dl>
          <dt>站碼</dt><dd>${escapeHtml(station.stationCode)}</dd>
          <dt>地區</dt><dd>${escapeHtml(regionLabel)}</dd>
          ${englishName ? `<dt>English</dt><dd>${escapeHtml(englishName)}</dd>` : ""}
          ${japaneseName ? `<dt>日本語</dt><dd>${escapeHtml(japaneseName)}</dd>` : ""}
          ${address ? `<dt>地址</dt><dd>${escapeHtml(address)}</dd>` : ""}
        </dl>
      </div>
      <a class="action" href="/?station=${encodeURIComponent(station.stationCode)}">用${escapeHtml(name)}查詢班次</a>
    </main>
  </body>
</html>`;
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const stations = Array.isArray(metadata.stations) ? metadata.stations : [];
const validStations = stations.filter((station) => /^\d+$/.test(String(station.stationCode ?? "")));

if (validStations.length === 0) {
  throw new Error("No valid stations found in stationRegions.json");
}

await readFile(path.join(outputDir, "index.html"));

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
const stationDirectory = [...stationsByRegion.entries()]
  .map(([region, regionStations]) => {
    const regionLabel = metadata.regionLabels?.[region]?.labels?.["zh-TW"] ?? region;
    const links = regionStations
      .map((station) => {
        const name = station.labels?.["zh-TW"] ?? station.stationName ?? station.stationCode;
        return `<li><a href="/stations/${encodeURIComponent(station.stationCode)}/">${escapeHtml(name)}</a></li>`;
      })
      .join("");
    return `<section><h2>${escapeHtml(regionLabel)}</h2><ul class="station-list">${links}</ul></section>`;
  })
  .join("\n");

if (!stationIndex.includes("<!-- station-directory -->")) {
  throw new Error("Station directory placeholder is missing from dist/stations/index.html");
}
await writeFile(stationIndexPath, stationIndex.replace("<!-- station-directory -->", stationDirectory));

const staticUrls = ["/", "/about/", "/guide/", "/stations/"];
const stationUrls = validStations.map((station) => `/stations/${encodeURIComponent(station.stationCode)}/`);
const sitemapUrls = [...staticUrls, ...stationUrls];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls
  .map((url) => `  <url><loc>${SITE_URL}${url}</loc></url>`)
  .join("\n")}\n</urlset>\n`;

await writeFile(path.join(outputDir, "sitemap.xml"), sitemap);
console.log(`Generated ${validStations.length} station pages and sitemap.xml.`);
