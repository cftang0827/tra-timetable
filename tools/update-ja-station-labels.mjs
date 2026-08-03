import fs from "node:fs/promises";
import path from "node:path";

const stationsPath = process.argv[2] ?? "public/stations.json";
const outPath = process.argv[3] ?? "public/data/meta/stationJaLabels.json";

const source = {
  name: "台鐵日文站名",
  provider: "國營臺灣鐵路股份有限公司",
  homeUrl: "https://www.railway.gov.tw/tra-tip-web/tip?lang=JA_JP",
  stationInfoUrl:
    "https://www.railway.gov.tw/tra-tip-web/tip/tip00H/tipH41/viewStaInfo/1000?lang=JA_JP",
};

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Node)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${url}`);
  return await res.text();
}

function addCodeLabel(labels, code, name) {
  if (!/^\d{4}$/.test(code) || !name) return;
  labels.set(code, name.trim());
}

function parseStationLabels(html) {
  const labels = new Map();
  const tagsMatch = html.match(/availableTags\s*=\s*(\[[\s\S]*?\]);/);
  if (tagsMatch) {
    for (const tag of JSON.parse(tagsMatch[1])) {
      const sep = tag.indexOf("-");
      if (sep > 0) addCodeLabel(labels, tag.slice(0, sep), tag.slice(sep + 1));
    }
  }

  for (const match of html.matchAll(/title="(\d{4})-([^"]+)"\s*>\s*([^<]*)<\/button>/g)) {
    addCodeLabel(labels, match[1], match[2] || match[3]);
  }

  return labels;
}

const stations = JSON.parse(await fs.readFile(stationsPath, "utf-8"));
const stationCodes = new Set(stations.map((station) => String(station.stationCode)));

const labels = new Map();
for (const url of [source.homeUrl, source.stationInfoUrl]) {
  const html = await fetchText(url);
  for (const [code, label] of parseStationLabels(html)) {
    if (stationCodes.has(code)) labels.set(code, label);
  }
}

const missing = stations.filter((station) => !labels.has(String(station.stationCode)));
if (missing.length) {
  console.warn(
    `Missing Japanese labels, falling back to zh-TW: ${missing
      .map((station) => `${station.stationCode} ${station.stationName}`)
      .join(", ")}`,
  );
}

const out = {
  source,
  labels: Object.fromEntries([...labels.entries()].sort(([a], [b]) => a.localeCompare(b))),
};

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(out, null, 2));
console.log(`Generated ${outPath}: ${Object.keys(out.labels).length} labels`);
