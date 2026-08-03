import fs from "node:fs/promises";
import path from "node:path";

const stationsPath = process.argv[2] ?? "public/stations.json";
const outPath = process.argv[3] ?? "public/data/meta/stationRegions.json";
const jaLabelsPath = process.argv[4] ?? "public/data/meta/stationJaLabels.json";

const allowedRegions = ["北北基", "桃竹苗", "中彰", "雲嘉南", "高屏", "宜蘭", "花東", "支線"];
const locales = ["zh-TW", "en", "ja"];
const regionLabels = {
  北北基: { labels: { "zh-TW": "北北基", en: "Taipei-Keelung", ja: "台北・基隆" } },
  桃竹苗: { labels: { "zh-TW": "桃竹苗", en: "Taoyuan-Hsinchu-Miaoli", ja: "桃園・新竹・苗栗" } },
  中彰: { labels: { "zh-TW": "中彰", en: "Taichung-Changhua", ja: "台中・彰化" } },
  雲嘉南: { labels: { "zh-TW": "雲嘉南", en: "Yunlin-Chiayi-Tainan", ja: "雲林・嘉義・台南" } },
  高屏: { labels: { "zh-TW": "高屏", en: "Kaohsiung-Pingtung", ja: "高雄・屏東" } },
  宜蘭: { labels: { "zh-TW": "宜蘭", en: "Yilan", ja: "宜蘭" } },
  花東: { labels: { "zh-TW": "花東", en: "Hualien-Taitung", ja: "花蓮・台東" } },
  支線: { labels: { "zh-TW": "支線", en: "Branch Lines", ja: "支線" } },
};

const branchStationCodes = new Set([
  "1190",
  "1191",
  "1192",
  "1193",
  "1194",
  "1201",
  "1202",
  "1203",
  "1204",
  "1205",
  "1206",
  "1207",
  "1208",
  "3430",
  "3431",
  "3432",
  "3433",
  "3434",
  "3435",
  "3436",
  "4270",
  "4271",
  "4272",
  "7330",
  "7331",
  "7332",
  "7333",
  "7334",
  "7335",
  "7336",
  "7360",
  "7361",
  "7362",
]);

const stationRegionOverrides = {
  1998: "北北基",
};

function regionForStation(station) {
  const code = String(station.stationCode);
  const address = String(station.stationAddrTw ?? "");

  if (stationRegionOverrides[code]) return stationRegionOverrides[code];
  if (branchStationCodes.has(code)) return "支線";
  if (address.includes("基隆市") || address.includes("臺北市") || address.includes("新北市")) return "北北基";
  if (address.includes("桃園市") || address.includes("新竹縣") || address.includes("新竹市") || address.includes("苗栗縣")) return "桃竹苗";
  if (address.includes("臺中市") || address.includes("彰化縣")) return "中彰";
  if (address.includes("雲林縣") || address.includes("嘉義縣") || address.includes("嘉義市") || address.includes("臺南市")) return "雲嘉南";
  if (address.includes("高雄市") || address.includes("屏東縣")) return "高屏";
  if (address.includes("宜蘭縣")) return "宜蘭";
  if (address.includes("花蓮縣") || address.includes("臺東縣")) return "花東";

  return "";
}

function parseGps(gps) {
  const [latRaw, lngRaw] = String(gps ?? "").trim().split(/\s+/);
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function readJaLabels() {
  try {
    const data = JSON.parse(await fs.readFile(jaLabelsPath, "utf-8"));
    return {
      source: data.source ?? null,
      labels: data.labels ?? {},
    };
  } catch (e) {
    if (e?.code === "ENOENT") return { source: null, labels: {} };
    throw e;
  }
}

const stations = JSON.parse(await fs.readFile(stationsPath, "utf-8"));
const jaLabels = await readJaLabels();
const stationRegions = {
  source: {
    name: "臺鐵車站基本資料集",
    datasetId: "33425",
    provider: "國營臺灣鐵路股份有限公司",
    datasetUrl: "https://data.gov.tw/dataset/33425",
    downloadUrl: "https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/0518b833e8964d53bfea3f7691aea0ee",
    localSource: stationsPath,
    localizedSources: {
      ja: jaLabels.source,
    },
  },
  locales,
  allowedRegions,
  regionLabels,
  stations: stations.map((station) => {
    const gpsText = String(station.gps ?? "");
    const stationName = station.stationName ?? "";
    const stationEName = station.stationEName ?? station.ename ?? "";
    return {
      stationCode: String(station.stationCode),
      labels: {
        "zh-TW": stationName,
        en: stationEName || stationName,
        ja: jaLabels.labels[String(station.stationCode)] ?? stationName,
      },
      stationName,
      stationEName,
      stationAddrTw: station.stationAddrTw ?? "",
      stationAddrEn: station.stationAddrEn ?? "",
      stationTel: station.stationTel ?? "",
      gpsText,
      gps: parseGps(gpsText),
      region: regionForStation(station),
    };
  }),
};

const missingRegion = stationRegions.stations.filter((station) => !station.region);
if (missingRegion.length) {
  console.error(
    missingRegion
      .map((station) => `missing region for ${station.stationCode} ${station.stationName}`)
      .join("\n"),
  );
  process.exit(1);
}

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(stationRegions, null, 2));
console.log(`Generated ${outPath}: ${stationRegions.stations.length} stations`);
