import fs from "node:fs/promises";

const stationsPath = process.argv[2] ?? "public/stations.json";
const regionsPath = process.argv[3] ?? "public/data/meta/stationRegions.json";
const jaLabelsPath = process.argv[4] ?? "public/data/meta/stationJaLabels.json";

const stations = JSON.parse(await fs.readFile(stationsPath, "utf-8"));
const stationRegions = JSON.parse(await fs.readFile(regionsPath, "utf-8"));
const stationJaLabels = JSON.parse(await fs.readFile(jaLabelsPath, "utf-8"));

const allowedRegions = new Set(stationRegions.allowedRegions ?? []);
const locales = stationRegions.locales ?? ["zh-TW", "en", "ja"];
const sourceByCode = new Map(stations.map((station) => [String(station.stationCode), station]));
const jaLabelByCode = stationJaLabels.labels ?? {};
const regionByCode = new Map();
const errors = [];

for (const station of stationRegions.stations ?? []) {
  const code = String(station.stationCode);
  const source = sourceByCode.get(code);

  if (regionByCode.has(code)) {
    errors.push(`duplicate stationCode in stationRegions: ${code}`);
  }
  regionByCode.set(code, station);

  if (!source) {
    errors.push(`extra stationRegions station not in stations.json: ${code} ${station.stationName}`);
    continue;
  }

  if (station.stationName !== source.stationName) {
    errors.push(
      `stationName mismatch for ${code}: stationRegions=${station.stationName}, stations.json=${source.stationName}`,
    );
  }

  if (station.stationEName !== (source.stationEName ?? source.ename ?? "")) {
    errors.push(
      `stationEName mismatch for ${code}: stationRegions=${station.stationEName}, stations.json=${source.stationEName}`,
    );
  }

  if (station.labels?.["zh-TW"] !== source.stationName) {
    errors.push(`zh-TW label mismatch for ${code}: ${station.labels?.["zh-TW"]}`);
  }

  if (station.labels?.en !== (source.stationEName ?? source.ename ?? source.stationName)) {
    errors.push(`en label mismatch for ${code}: ${station.labels?.en}`);
  }

  for (const locale of locales) {
    if (!station.labels?.[locale]) {
      errors.push(`missing ${locale} label for ${code} ${source.stationName}`);
    }
  }

  if (!jaLabelByCode[code]) {
    errors.push(`missing stationJaLabels label for ${code} ${source.stationName}`);
  } else if (station.labels?.ja !== jaLabelByCode[code]) {
    errors.push(`ja label mismatch for ${code}: stationRegions=${station.labels?.ja}, stationJaLabels=${jaLabelByCode[code]}`);
  }

  if (station.gpsText !== String(source.gps ?? "")) {
    errors.push(`gpsText mismatch for ${code} ${station.stationName}`);
  }

  if (!allowedRegions.has(station.region)) {
    errors.push(`invalid region for ${code} ${station.stationName}: ${station.region}`);
  }
}

for (const station of stations) {
  const code = String(station.stationCode);
  if (!regionByCode.has(code)) {
    errors.push(`missing stationRegions station from stations.json: ${code} ${station.stationName}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`stationRegions covers stations.json: ${stations.length} stations`);
