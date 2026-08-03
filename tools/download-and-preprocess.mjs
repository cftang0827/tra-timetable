// tools/update-7days.mjs
// Node 18+ (建議 Node 20+) / ESM
// 用法：node tools/update-7days.mjs ./cars.json ./stations.json
import fs from "node:fs/promises";
import path from "node:path";

const LIST_URL =
  "https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/railway_schedule/JSON/list";

const OUT_ROOT = "public/data";
const OUT_DAYS_DIR = path.join(OUT_ROOT, "days");
const OUT_META_DIR = path.join(OUT_ROOT, "meta");

function yyyymmddInTaipei(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}${m}${d}`;
}

function addDaysTaipei(yyyymmdd, deltaDays) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return yyyymmddInTaipei(dt);
}

function hhmmssToMin(t) {
  // "19:49:30" -> 1189 (忽略秒)
  if (!t) return null;
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

async function readJSON(p) {
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function writeJSON(p, obj) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj));
}

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

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Node)",
      Accept: "application/json,*/*",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Download failed ${res.status} ${res.statusText}: ${url}\n${body.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function parseListHtml(html) {
  // 抓出：YYYYMMDD.json 與對應的 exceptionDataResource 下載連結
  const out = [];
  const re =
    /href="([^"]+exceptionDataResource\/[^"]+)"[^>]*>\s*(\d{8}\.json)\s*<\/a>/g;

  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].startsWith("http") ? m[1] : `https://ods.railway.gov.tw${m[1]}`;
    const filename = m[2];
    out.push({ filename, href });
  }
  return out;
}

function trainTypeJaLabel(name, rawName = name) {
  if (rawName.startsWith("自強(3000)") || name === "自強3000") return "自強(3000)";

  const labels = {
    自強: "自強号",
    太魯閣: "タロコ号",
    普悠瑪: "プユマ号",
    區間: "区間",
    區間快: "区間快",
  };
  return labels[name] ?? name;
}

function rawTrainTypeJaLabel(rawName, name) {
  const normalized = trainTypeJaLabel(name, rawName);
  if (normalized === name) return rawName;

  const detail = rawName.startsWith("自強(3000)") ? rawName.slice("自強(3000)".length) : rawName.slice(name.length);
  return detail ? `${normalized}${detail}` : normalized;
}

function normalizeCarsMap(carsJson) {
  // ✅ New format only:
  // cars.json is an array like:
  // [{ TrainTypeID, TrainTypeName: { Zh_tw, En }, ... }, ...]
  if (!Array.isArray(carsJson)) {
    throw new Error("cars.json format unexpected (expected an array list)");
  }

  const map = {};
  for (const c of carsJson) {
    const id = String(c?.TrainTypeID ?? "");
    if (!id) continue;

    const rawName = String(c?.TrainTypeName?.Zh_tw ?? id);
    const rawNameEn = String(c?.TrainTypeName?.En ?? "");
    const name = rawName.replace(/\(.*?\)/g, ""); // keep consistent with UI cleanup
    map[id] = {
      labels: {
        "zh-TW": name,
        en: rawNameEn || name,
        ja: trainTypeJaLabel(name, rawName),
      },
      rawLabels: {
        "zh-TW": rawName,
        en: rawNameEn,
        ja: rawTrainTypeJaLabel(rawName, name),
      },
      name,
      nameEn: rawNameEn,
      rawName,
      rawNameEn,
      trainTypeCode: c?.TrainTypeCode != null ? String(c.TrainTypeCode) : "",
      alias: null,
    };
  }
  return map;
}


function preprocessDay(raw) {
  // outputs:
  // trains: trainNo -> { carClass, line, lineDir, stops: [[station, order, depMin, arrMin], ...] }
  // stopIndex: station -> [trainNo...]
  const trains = {};
  const stopIndex = {};

  const trainInfos = raw?.TrainInfos;
  if (!Array.isArray(trainInfos)) throw new Error("raw missing TrainInfos[]");

  for (const ti of trainInfos) {
    const trainNo = String(ti.Train ?? "");
    if (!trainNo) continue;

    const carClass = String(ti.CarClass ?? "");
    const line = String(ti.Line ?? "");
    const lineDir = String(ti.LineDir ?? "");

    const timeInfos = Array.isArray(ti.TimeInfos) ? ti.TimeInfos : [];
    const stops = [];

    for (const x of timeInfos) {
      const station = String(x.Station ?? "");
      const order = Number(x.Order ?? 0);
      const depMin = hhmmssToMin(x.DEPTime);
      const arrMin = hhmmssToMin(x.ARRTime);

      if (!station || !Number.isFinite(order)) continue;
      // 至少要有一個時間（有些資料可能缺 DEP 或 ARR）
      const dep = depMin ?? arrMin;
      const arr = arrMin ?? depMin;
      if (dep == null || arr == null) continue;

      stops.push([station, order, dep, arr]);

      if (!stopIndex[station]) stopIndex[station] = [];
      stopIndex[station].push(trainNo);
    }

    stops.sort((a, b) => a[1] - b[1]);
    trains[trainNo] = { train: trainNo, carClass, line, lineDir, stops };
  }

  for (const st of Object.keys(stopIndex)) {
    stopIndex[st] = Array.from(new Set(stopIndex[st]));
  }

  return { trains, stopIndex };
}

async function main() {
  const carsPath = process.argv[2] ?? "./public/cars.json";
  const days = 28;

  // 1) meta maps
  const carsMap = normalizeCarsMap(await readJSON(carsPath));

  await writeJSON(path.join(OUT_META_DIR, "carsMap.json"), carsMap);

  // 2) list page -> filename => url
  const html = await fetchText(LIST_URL);
  const entries = parseListHtml(html);
  if (!entries.length) throw new Error("Parse list failed: no entries found (HTML structure changed?)");

  const fileUrlMap = new Map(entries.map((e) => [e.filename, e.href]));

  // 3) decide targets (today..today+6)
  const today = yyyymmddInTaipei();
  const targets = Array.from({ length: days }, (_, i) => `${addDaysTaipei(today, i)}.json`);

  console.log("Today(Taipei):", today);
  console.log("Targets:", targets.join(", "));

  // 4) download + preprocess
  for (const filename of targets) {
    const url = fileUrlMap.get(filename);
    if (!url) {
      console.warn(`[SKIP] Not found in list: ${filename}`);
      continue;
    }

    console.log(`[GET] ${filename} <- ${url}`);
    const buf = await fetchBuffer(url);

    // // raw (optional) – 想省 repo 你可以不存 raw
    // const rawDir = path.join(OUT_ROOT, "raw");
    // await fs.mkdir(rawDir, { recursive: true });
    // await fs.writeFile(path.join(rawDir, filename), buf);

    const raw = JSON.parse(buf.toString("utf-8"));
    const { trains, stopIndex } = preprocessDay(raw);

    const dayKey = filename.replace(".json", "");
    const outDir = path.join(OUT_DAYS_DIR, dayKey);
    await writeJSON(path.join(outDir, "trains.json"), trains);
    await writeJSON(path.join(outDir, "stopIndex.json"), stopIndex);

    console.log(`[OK] ${dayKey}: trains=${Object.keys(trains).length}, stationsIndexed=${Object.keys(stopIndex).length}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
