<script setup>
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CANONICAL_HOST = "tra-timetable.cftang.dev";
const GITHUB_PAGES_PATH = "/tra-timetable";
import { ref, onMounted, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { DEFAULT_LOCALE, LS_LOCALE, SUPPORTED_LOCALES } from "./i18n";

const { locale, t } = useI18n();

/* ---------- state ---------- */
const carsMap = ref({}); // id -> { name, alias }
const stationRegionsMeta = ref({ locales: [], allowedRegions: [], regionLabels: {}, stations: [] });

const trains = ref(null); // trainNo -> { carClass, stops: [[station, order, depMin, arrMin], ...], stopMap? }
const stopIndex = ref(null); // station -> [trainNo...]

const date = ref("");
const from = ref("");
const to = ref("");
const time = ref("00:00");
const fromRegion = ref("北北基");
const toRegion = ref("北北基");
const theme = ref("light");

const results = ref([]);
const loading = ref(false);
const errorMsg = ref("");
const locating = ref(false);
const directTrainNo = ref("");
const toastMsg = ref("");
let toastTimer = null;

/* ✅ train detail (accordion) */
const selectedTrainNo = ref(""); // currently opened train

/* ✅ latest news drawer */
const showNews = ref(false);
const newsLoading = ref(false);
const newsError = ref("");
const newsItems = ref([]); // [{ id?, date?, title?, body?, link? }]

/* ---------- localStorage keys ---------- */
const LS_FROM = "tra.from";
const LS_TO = "tra.to";
const LS_FROM_REGION = "tra.from.region";
const LS_TO_REGION = "tra.to.region";
const LS_THEME = "tra.theme";

const isDarkTheme = computed(() => theme.value === "dark");
const activeLocale = computed(() => locale.value);
const localeOptions = [
  { value: "zh-TW", label: "🇹🇼 中文" },
  { value: "en", label: "🇺🇸 EN" },
  { value: "ja", label: "🇯🇵 日本語" },
];
const localeMeta = {
  "zh-TW": { htmlLang: "zh-Hant-TW", ogLocale: "zh_TW", urlLang: "zh-TW" },
  en: { htmlLang: "en", ogLocale: "en_US", urlLang: "en" },
  ja: { htmlLang: "ja", ogLocale: "ja_JP", urlLang: "ja" },
};

function applyTheme(nextTheme) {
  theme.value = nextTheme === "dark" ? "dark" : "light";
  document.documentElement.classList.toggle("theme-dark", isDarkTheme.value);
  document.documentElement.style.colorScheme = isDarkTheme.value ? "dark" : "light";
}

function toggleTheme() {
  applyTheme(isDarkTheme.value ? "light" : "dark");
  showToast(isDarkTheme.value ? t("darkMode") : t("lightMode"));
}

/* ---------- time/date helpers ---------- */
function yyyymmddTaipei(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function hhmmNowTaipei() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

const minDate = computed(() => yyyymmddTaipei());
const maxDate = computed(() => yyyymmddTaipei(2));
const intlLocale = computed(() => {
  if (activeLocale.value === "en") return "en-US";
  if (activeLocale.value === "ja") return "ja-JP";
  return "zh-TW";
});
const todayDateLabel = computed(() => formatDateWithWeekday(minDate.value));
const selectedDateLabel = computed(() => formatDateWithWeekday(date.value));

/* ---------- utils ---------- */
function formatDateWithWeekday(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const [year, month, day] = yyyyMmDd.split("-").map(Number);
  if (!year || !month || !day) return yyyyMmDd;

  return new Intl.DateTimeFormat(intlLocale.value, {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function hhmmToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeTrainNo(value) {
  return String(value ?? "").trim().match(/^[A-Za-z0-9]+/)?.[0] ?? "";
}

function normalizeDateParam(value) {
  const dateText = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return "";

  const [year, month, day] = dateText.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }

  if (dateText < minDate.value || dateText > maxDate.value) return "";
  return dateText;
}

function buildStopMap(stops) {
  // station -> { order, dep, arr }
  const map = {};
  for (const s of stops) {
    const station = s[0];
    const order = s[1];
    const dep = s[2];
    const arr = s[3];
    map[station] = { order, dep, arr };
  }
  return map;
}

function stationName(code) {
  const station = stationByCode.value.get(code);
  if (!station) return code;
  return labelFor(station.labels, station.stationName ?? code);
}

function labelFor(labels, fallback = "") {
  return labels?.[activeLocale.value] ?? labels?.["zh-TW"] ?? labels?.en ?? fallback;
}

function localizedText(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  return value?.[activeLocale.value] ?? value?.["zh-TW"] ?? value?.en ?? fallback;
}

function setMetaByName(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function currentSeoUrl(localeValue = activeLocale.value) {
  const url = new URL(`https://${CANONICAL_HOST}/`);
  if (localeValue !== "zh-TW") url.searchParams.set("lang", localeValue);
  return url.toString();
}

function updateSeoMeta() {
  const meta = localeMeta[activeLocale.value] ?? localeMeta["zh-TW"];
  const title = t("appTitle");
  const description = t("seoDescription");
  const keywords = t("seoKeywords");
  const url = currentSeoUrl();
  const canonical = document.querySelector('link[rel="canonical"]');

  document.documentElement.lang = meta.htmlLang;
  document.title = title;
  canonical?.setAttribute("href", url);
  setMetaByName("description", description);
  setMetaByName("keywords", keywords);
  setMetaByProperty("og:site_name", title);
  setMetaByProperty("og:title", title);
  setMetaByProperty("og:description", description);
  setMetaByProperty("og:url", url);
  setMetaByProperty("og:locale", meta.ogLocale);
  setMetaByName("twitter:title", title);
  setMetaByName("twitter:description", description);
}

function syncLocaleQuery(v) {
  const url = new URL(window.location.href);
  const current = url.searchParams.get("lang");
  if (current === v) return;

  if (v === "zh-TW") url.searchParams.delete("lang");
  else url.searchParams.set("lang", v);
  window.history.replaceState({}, "", url.toString());
}

function redirectGitHubPagesToCustomDomain() {
  if (!window.location.hostname.endsWith(".github.io")) return;
  if (!window.location.pathname.startsWith(GITHUB_PAGES_PATH)) return;

  const nextPath = window.location.pathname.slice(GITHUB_PAGES_PATH.length) || "/";
  const nextUrl = `https://${CANONICAL_HOST}${nextPath}${window.location.search}${window.location.hash}`;
  window.location.replace(nextUrl);
  return true;
}

const stationByCode = computed(() => {
  return new Map(stationRegionsMeta.value.stations.map((station) => [station.stationCode, station]));
});

const stationGroups = computed(() => {
  return stationRegionsMeta.value.allowedRegions.map((region) => ({
    id: region,
    label: labelFor(stationRegionsMeta.value.regionLabels?.[region]?.labels, region),
    stations: stationRegionsMeta.value.stations
      .filter((station) => station.region === region)
      .map((station) => ({
        code: station.stationCode,
        name: labelFor(station.labels, station.stationName),
      })),
  }));
});

const stationRegions = computed(() => {
  return stationGroups.value.map(({ id, label }) => ({ id, label }));
});

function stationOptions(regionId) {
  return stationGroups.value.find((region) => region.id === regionId)?.stations ?? [];
}

function stationRegion(code) {
  for (const group of stationGroups.value) {
    if (group.stations.some((station) => station.code === code)) return group.id;
  }
  return stationRegions.value[0]?.id ?? "北北基";
}

function syncRegionForStation(code, regionRef) {
  if (!code) return;
  regionRef.value = stationRegion(code);
}

function clearStationOutsideRegion(stationRef, regionId) {
  if (stationRef.value && stationRegion(stationRef.value) !== regionId) {
    stationRef.value = "";
    selectedTrainNo.value = "";
    results.value = [];
  }
}

function distanceKm(a, b) {
  const earthRadiusKm = 6371;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearestStation(position) {
  let nearest = null;
  for (const station of stationRegionsMeta.value.stations) {
    if (!station.gps) continue;
    const km = distanceKm(position, station.gps);
    if (!nearest || km < nearest.km) nearest = { station, km };
  }
  return nearest;
}

/* ---------- quick set now ---------- */
function setNowDate() {
  date.value = minDate.value;
  errorMsg.value = "";
  selectedTrainNo.value = "";
  results.value = [];
}

function setNowTime() {
  time.value = hhmmNowTaipei();
}

/* ✅ car type helpers */
function isLocalTrain(carClass) {
  // 區間 / 區間快
  const car = carsMap.value?.[carClass];
  return String(car?.name ?? car?.alias ?? carClass).includes("區間");
}

function carDisplayName(carClass) {
  const car = carsMap.value?.[carClass];
  if (!car) return carClass;
  return labelFor(car.labels, car.name ?? car.alias ?? carClass);
}

function getTrainEndpoints(trainObj) {
  const stops = Array.isArray(trainObj?.stops) ? trainObj.stops : [];
  if (!stops.length) return { start: "", end: "" };

  const sorted = stops.slice().sort((a, b) => a[1] - b[1]);
  const startCode = sorted[0]?.[0] ?? "";
  const endCode = sorted[sorted.length - 1]?.[0] ?? "";
  return { start: stationName(startCode), end: stationName(endCode) };
}

/* ---------- latest news ---------- */
async function loadNews() {
  newsLoading.value = true;
  newsError.value = "";
  try {
    const res = await fetch(`${BASE}/data/meta/news.json`, { cache: "no-store" });
    if (res.status === 404) {
      newsItems.value = [];
      return;
    }
    if (!res.ok) throw new Error(`news.json fetch failed: ${res.status}`);

    const data = await res.json();
    if (Array.isArray(data?.items)) newsItems.value = data.items;
    else if (Array.isArray(data)) newsItems.value = data;
    else newsItems.value = [];
  } catch (e) {
    newsError.value = e?.message ?? String(e);
  } finally {
    newsLoading.value = false;
  }
}

async function openNews() {
  showNews.value = true;
  await loadNews();
}

function closeNews() {
  showNews.value = false;
}

/* ---------- load meta ---------- */
async function loadCars() {
  const res = await fetch(`${BASE}/data/meta/carsMap.json`);
  if (!res.ok) throw new Error(`carsMap.json fetch failed: ${res.status}`);
  carsMap.value = await res.json();
}

async function loadStationRegions() {
  const res = await fetch(`${BASE}/data/meta/stationRegions.json`);
  if (!res.ok) throw new Error(`stationRegions.json fetch failed: ${res.status}`);

  const data = await res.json();
  stationRegionsMeta.value = {
    locales: Array.isArray(data?.locales) ? data.locales : [],
    allowedRegions: Array.isArray(data?.allowedRegions) ? data.allowedRegions : [],
    regionLabels: data?.regionLabels ?? {},
    stations: Array.isArray(data?.stations) ? data.stations : [],
  };
}

/* ---------- load timetable ---------- */
async function loadDay(yyyy_mm_dd) {
  const safeDate = normalizeDateParam(yyyy_mm_dd);
  if (!safeDate) throw new Error(t("noDataForDate"));

  const key = safeDate.replace(/-/g, "");
  const base = `${BASE}/data/days/${key}`;
  const [tRes, sRes] = await Promise.all([
    fetch(`${base}/trains.json`),
    fetch(`${base}/stopIndex.json`),
  ]);

  // ✅ Friendly message if date data not found
  if (tRes.status === 404 || sRes.status === 404) {
    const err = new Error(t("noDataForDate"));
    err.code = "NO_DATA";
    throw err;
  }

  if (!tRes.ok) throw new Error(`trains.json fetch failed: ${tRes.status}`);
  if (!sRes.ok) throw new Error(`stopIndex.json fetch failed: ${sRes.status}`);

  const dayTrains = await tRes.json();
  const dayStopIndex = await sRes.json();

  // ✅ build stopMap (O(1) lookup)
  for (const trainNo of Object.keys(dayTrains)) {
    const stops = dayTrains[trainNo]?.stops;
    if (Array.isArray(stops) && !dayTrains[trainNo].stopMap) {
      dayTrains[trainNo].stopMap = buildStopMap(stops);
    }
  }

  trains.value = dayTrains;
  stopIndex.value = dayStopIndex;
}

/* ---------- query ---------- */
function query() {
  results.value = [];
  if (!trains.value || !stopIndex.value) return;
  if (!from.value || !to.value) return;
  if (from.value === to.value) return;

  const fromList = stopIndex.value[from.value] || [];
  const toSet = new Set(stopIndex.value[to.value] || []);
  const earliestMin = hhmmToMin(time.value);

  for (const trainNo of fromList) {
    if (!toSet.has(trainNo)) continue;

    const t = trains.value[trainNo];
    if (!t) continue;

    const a = t.stopMap?.[from.value];
    const b = t.stopMap?.[to.value];
    if (!a || !b) continue;

    if (a.order >= b.order) continue;
    if (a.dep < earliestMin) continue;

    const carName = carDisplayName(t.carClass);

    const { start, end } = getTrainEndpoints(t);

    results.value.push({
      trainNo,
      carName,
      dep: minToHHMM(a.dep),
      arr: minToHHMM(b.arr),
      start,
      end,
      isLocal: isLocalTrain(t.carClass),
    });
  }

  results.value.sort((x, y) => x.dep.localeCompare(y.dep));
}

/* ---------- detail helpers ---------- */
function getTrainDetail(trainNo) {
  if (!trainNo || !trains.value) return null;
  const t = trains.value[trainNo];
  if (!t) return null;

  const carName = carDisplayName(t.carClass);

  const stops = Array.isArray(t.stops) ? t.stops : [];
  const rows = stops
    .slice()
    .sort((a, b) => a[1] - b[1])
    .map(([station, order, depMin, arrMin]) => ({
      station,
      order,
      name: stationName(station),
      arr: arrMin != null ? minToHHMM(arrMin) : "--:--",
      dep: depMin != null ? minToHHMM(depMin) : "--:--",
    }));

  return { trainNo, carName, rows };
}

const directTrainDetail = computed(() => getTrainDetail(directTrainNo.value));

function trainShareUrl(trainNo) {
  const normalizedTrainNo = normalizeTrainNo(trainNo);
  const normalizedDate = normalizeDateParam(date.value) || minDate.value;
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("date", normalizedDate);
  url.searchParams.set("train", normalizedTrainNo);
  if (activeLocale.value !== DEFAULT_LOCALE) url.searchParams.set("lang", activeLocale.value);
  return url.toString();
}

async function clearBrowserCaches() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {}

  try {
    if (navigator.serviceWorker?.getRegistrations) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {}
}

function returnToIndexAfterUnsupportedDate() {
  showToast(t("unsupportedDate"));
  window.setTimeout(async () => {
    await clearBrowserCaches();
    window.location.replace(new URL(window.location.pathname, window.location.origin).toString());
  }, 900);
}

function showToast(message) {
  toastMsg.value = message;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMsg.value = "";
    toastTimer = null;
  }, 2400);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

async function shareTrain(trainNo) {
  const normalizedTrainNo = normalizeTrainNo(trainNo);
  if (!normalizedTrainNo) return;

  const detail = getTrainDetail(normalizedTrainNo);
  const endpoints = detail?.rows?.length
    ? `${detail.rows[0].name} → ${detail.rows[detail.rows.length - 1].name}`
    : t("trainShareFallback");
  const title = `${t("trainShareTitle", { trainNo: normalizedTrainNo })} ${endpoints}`;
  const url = trainShareUrl(normalizedTrainNo);

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      showToast(t("shared"));
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
  }

  if (await copyText(url)) {
    showToast(t("copied"));
  } else {
    showToast(url);
  }
}

function clearDirectTrainPage() {
  directTrainNo.value = "";
  const url = new URL(window.location.href);
  url.searchParams.delete("train");
  window.history.replaceState({}, "", url.toString());
}

function toggleTrainDetail(trainNo) {
  selectedTrainNo.value = selectedTrainNo.value === trainNo ? "" : trainNo;

  requestAnimationFrame(() => {
    const el = document.getElementById(`train-${trainNo}`);
    el?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  });
}

/* ---------- actions ---------- */
const canSearch = computed(() => {
  return Boolean(date.value && from.value && to.value && !loading.value);
});

async function onSearch() {
  if (!date.value || !from.value || !to.value) return;

  errorMsg.value = "";
  directTrainNo.value = "";
  results.value = [];
  selectedTrainNo.value = "";
  loading.value = true;

  try {
    await loadDay(date.value);
    query();
  } catch (e) {
    errorMsg.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

async function openDirectTrainPage(trainNo) {
  const normalizedTrainNo = normalizeTrainNo(trainNo);
  if (!date.value || !normalizedTrainNo) return;

  errorMsg.value = "";
  results.value = [];
  directTrainNo.value = "";
  selectedTrainNo.value = "";
  loading.value = true;

  try {
    await loadDay(date.value);
    if (!trains.value?.[normalizedTrainNo]) throw new Error(t("trainNotFound"));

    directTrainNo.value = normalizedTrainNo;
    selectedTrainNo.value = normalizedTrainNo;
  } catch (e) {
    errorMsg.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

function swapStations() {
  if (!from.value && !to.value) return;
  const tmp = from.value;
  from.value = to.value;
  to.value = tmp;
  syncRegionForStation(from.value, fromRegion);
  syncRegionForStation(to.value, toRegion);

  selectedTrainNo.value = "";

  if (trains.value && stopIndex.value) query();
}

async function useNearestStation() {
  errorMsg.value = "";

  if (!navigator.geolocation) {
    showToast(t("geoUnsupported"));
    return;
  }

  locating.value = true;

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      });
    });

    const nearest = nearestStation({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });

    if (!nearest) {
      showToast(t("noGps"));
      return;
    }

    from.value = nearest.station.stationCode;
    fromRegion.value = nearest.station.region;
    selectedTrainNo.value = "";
    results.value = [];
    showToast(t("nearestSet", { name: stationName(nearest.station.stationCode), km: nearest.km.toFixed(1) }));
  } catch (e) {
    if (e?.code === 1) showToast(t("geoDenied"));
    else if (e?.code === 2) showToast(t("geoUnavailable"));
    else if (e?.code === 3) showToast(t("geoTimeout"));
    else showToast(e?.message ?? String(e));
  } finally {
    locating.value = false;
  }
}

/* ---------- persist preferences ---------- */
function loadPreferencesFromLocalStorage() {
  try {
    const savedTheme = localStorage.getItem(LS_THEME);
    const f = localStorage.getItem(LS_FROM);
    const t = localStorage.getItem(LS_TO);
    const fr = localStorage.getItem(LS_FROM_REGION);
    const tr = localStorage.getItem(LS_TO_REGION);

    applyTheme(savedTheme ?? theme.value);
    localStorage.removeItem("tra.date");
    localStorage.removeItem("tra.time");
    if (fr) fromRegion.value = fr;
    if (tr) toRegion.value = tr;
    if (f) from.value = f;
    if (t) to.value = t;
  } catch {}
}

watch(theme, (v) => {
  try {
    localStorage.setItem(LS_THEME, v);
  } catch {}
});

watch(locale, (v) => {
  if (!SUPPORTED_LOCALES.includes(v)) return;
  updateSeoMeta();
  syncLocaleQuery(v);
  try {
    localStorage.setItem(LS_LOCALE, v);
  } catch {}
});

watch(from, (v) => {
  syncRegionForStation(v, fromRegion);
  try {
    if (v) localStorage.setItem(LS_FROM, v);
    else localStorage.removeItem(LS_FROM);
  } catch {}
});

watch(to, (v) => {
  syncRegionForStation(v, toRegion);
  try {
    if (v) localStorage.setItem(LS_TO, v);
    else localStorage.removeItem(LS_TO);
  } catch {}
});

watch(fromRegion, (v) => {
  clearStationOutsideRegion(from, v);
  try {
    if (v) localStorage.setItem(LS_FROM_REGION, v);
    else localStorage.removeItem(LS_FROM_REGION);
  } catch {}
});

watch(toRegion, (v) => {
  clearStationOutsideRegion(to, v);
  try {
    if (v) localStorage.setItem(LS_TO_REGION, v);
    else localStorage.removeItem(LS_TO_REGION);
  } catch {}
});

/* ---------- init ---------- */
onMounted(async () => {
  if (redirectGitHubPagesToCustomDomain()) return;
  updateSeoMeta();
  date.value = minDate.value;
  time.value = hhmmNowTaipei();
  applyTheme(localStorage.getItem(LS_THEME) ?? theme.value);
  loadPreferencesFromLocalStorage();
  const params = new URLSearchParams(window.location.search);
  const sharedStationCode = params.get("station");
  const sharedDate = params.get("date");
  const rawSharedTrainNo = params.get("train");
  const normalizedSharedDate = normalizeDateParam(sharedDate);
  const sharedTrainNo = normalizeTrainNo(rawSharedTrainNo);
  if (sharedDate && !normalizedSharedDate) {
    returnToIndexAfterUnsupportedDate();
    return;
  }

  if (normalizedSharedDate) date.value = normalizedSharedDate;

  if (rawSharedTrainNo && rawSharedTrainNo !== sharedTrainNo) {
    const url = new URL(window.location.href);
    if (sharedTrainNo) url.searchParams.set("train", sharedTrainNo);
    else url.searchParams.delete("train");
    window.history.replaceState({}, "", url.toString());
  }

  try {
    await Promise.all([loadCars(), loadStationRegions()]);
  } catch (e) {
    errorMsg.value = e?.message ?? String(e);
  }

  if (sharedStationCode && stationByCode.value.has(sharedStationCode)) {
    from.value = sharedStationCode;
  }

  syncRegionForStation(from.value, fromRegion);
  syncRegionForStation(to.value, toRegion);

  if (sharedTrainNo) await openDirectTrainPage(sharedTrainNo);
});
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-white shadow-sm">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <h1 class="text-lg font-semibold">{{ t("appTitle") }}</h1>

        <div class="flex items-center gap-2">
          <select
            v-model="locale"
            class="h-9 w-24 rounded-lg border bg-white px-2 text-sm text-gray-700 shadow-sm"
            :title="t('switchLanguage')"
            :aria-label="t('switchLanguage')"
          >
            <option v-for="option in localeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>

          <button
            type="button"
            @click="toggleTheme"
            class="h-9 w-9 rounded-lg border bg-white text-gray-700 shadow-sm active:scale-95 flex items-center justify-center"
            :title="isDarkTheme ? t('switchToLight') : t('switchToDark')"
            :aria-label="isDarkTheme ? t('switchToLight') : t('switchToDark')"
          >
            <svg
              v-if="isDarkTheme"
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36 6.36-1.42-1.42M7.05 7.05 5.64 5.64m12.72 0-1.42 1.41M7.05 16.95l-1.41 1.41M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
              />
            </svg>
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z"
              />
            </svg>
          </button>

          <button
            type="button"
            @click="openNews"
            class="h-9 w-[6.75rem] rounded-lg border bg-white px-3 text-gray-700 shadow-sm active:scale-95 flex items-center justify-center gap-1.5"
            :title="t('latestNews')"
            :aria-label="t('latestNews')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M7 8h10M7 12h6m-8 8h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"
              />
            </svg>
            <span class="w-14 text-center text-sm font-medium truncate">{{ t("latestNews") }}</span>
          </button>
        </div>
      </div>
    </header>

    <!-- ✅ Latest News Drawer -->
    <div v-if="showNews" class="fixed inset-0 z-20">
      <div class="absolute inset-0 bg-black/30" @click="closeNews"></div>

      <aside
        class="absolute right-0 top-0 h-full w-[92%] max-w-md bg-white shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        :aria-label="t('latestNews')"
      >
        <div class="px-4 py-3 border-b flex items-center justify-between">
          <div class="font-semibold">{{ t("latestNews") }}</div>
          <button type="button" class="text-sm text-gray-500 underline" @click="closeNews">
            {{ t("close") }}
          </button>
        </div>

        <div class="p-4 overflow-y-auto">
          <div v-if="newsLoading" class="text-sm text-gray-500">{{ t("loading") }}</div>

          <div
            v-else-if="newsError"
            class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {{ newsError }}
          </div>

          <div v-else-if="newsItems.length === 0" class="text-sm text-gray-500">
            {{ t("noNews") }}
            <div class="mt-2 text-xs text-gray-400">
              {{ t("newsHint") }}<span class="font-mono">public/data/meta/news.json</span>
            </div>
          </div>

          <ul v-else class="space-y-3">
            <li
              v-for="(n, i) in newsItems"
              :key="n.id ?? (n.date + '-' + i)"
              class="rounded-xl border bg-slate-50 p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-medium text-gray-800 truncate">
                    {{ localizedText(n.title, t("defaultAnnouncementTitle")) }}
                  </div>
                  <div class="text-xs text-gray-500 mt-0.5">{{ n.date ?? "" }}</div>
                </div>

                <a
                  v-if="n.link"
                  :href="n.link"
                  target="_blank"
                  rel="noreferrer"
                  class="text-xs text-blue-600 underline shrink-0"
                >
                  {{ t("link") }}
                </a>
              </div>

              <div v-if="localizedText(n.body)" class="mt-2 text-sm text-gray-700 whitespace-pre-line">
                {{ localizedText(n.body) }}
              </div>
            </li>
          </ul>

          <button type="button" class="mt-4 text-xs text-gray-500 underline" @click="loadNews">
            {{ t("refresh") }}
          </button>
        </div>
      </aside>
    </div>

    <!-- Search Card -->
    <section class="max-w-5xl mx-auto px-4 mt-4">
      <div class="bg-white rounded-xl shadow p-4 grid grid-cols-2 gap-3 md:grid-cols-[minmax(7.5rem,0.75fr)_minmax(0,2.7fr)_minmax(7.5rem,0.75fr)]">
        <!-- Date -->
        <div class="col-span-2 md:col-span-1">
          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-600">{{ t("date") }}</label>
            <button
              type="button"
              @click="setNowDate"
              class="text-xs px-2 py-1 rounded-md border bg-white text-gray-600 active:scale-95"
              :title="todayDateLabel"
            >
              {{ t("todayDate") }}
            </button>
          </div>
          <div class="mt-1 w-full overflow-hidden rounded-lg">
            <input
              type="date"
              v-model="date"
              :min="minDate"
              :max="maxDate"
              class="w-full box-border min-w-0 max-w-full appearance-none rounded-lg border px-3 py-2 bg-white"
            />
          </div>
          <div class="mt-1 min-h-4 text-xs text-gray-500">{{ selectedDateLabel }}</div>
        </div>

        <!-- From + Swap + To -->
        <div class="col-span-2 md:col-span-1">
          <div class="flex flex-col md:flex-row md:items-end gap-2">
            <div class="w-full md:flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <label class="text-sm text-gray-600">{{ t("from") }}</label>
                <button
                  type="button"
                  @click="useNearestStation"
                  :disabled="locating"
                  class="text-xs px-2 py-1 rounded-md border bg-white text-gray-600 active:scale-95 disabled:opacity-50"
                  :title="t('nearestStation')"
                >
                  {{ locating ? t("locating") : t("nearestStation") }}
                </button>
              </div>
              <div class="mt-1 grid grid-cols-[minmax(7.5rem,1.15fr)_minmax(0,1fr)] gap-2">
                <select
                  v-model="fromRegion"
                  class="w-full min-w-0 rounded-lg border px-3 py-2 bg-white"
                  :aria-label="t('fromRegion')"
                >
                  <option v-for="region in stationRegions" :key="region.id" :value="region.id">
                    {{ region.label }}
                  </option>
                </select>

                <select
                  v-model="from"
                  class="w-full min-w-0 rounded-lg border px-3 py-2 bg-white"
                  :aria-label="t('fromStation')"
                >
                  <option value="">{{ t("choose") }}</option>
                  <option v-for="station in stationOptions(fromRegion)" :key="station.code" :value="station.code">
                    {{ station.name }}
                  </option>
                </select>
              </div>
            </div>

            <button
              type="button"
              @click="swapStations"
              class="self-center mt-4 mb-1 md:mt-0 md:mb-0.5 h-10 w-10 shrink-0 rounded-full border bg-white shadow-sm flex items-center justify-center active:scale-95 rotate-90 md:rotate-0 translate-y-2 md:translate-y-0"
              :aria-label="t('swapStations')"
              :title="t('swapStations')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </button>

            <div class="w-full md:flex-1 min-w-0">
              <label class="text-sm text-gray-600">{{ t("to") }}</label>
              <div class="mt-1 grid grid-cols-[minmax(7.5rem,1.15fr)_minmax(0,1fr)] gap-2">
                <select
                  v-model="toRegion"
                  class="w-full min-w-0 rounded-lg border px-3 py-2 bg-white"
                  :aria-label="t('toRegion')"
                >
                  <option v-for="region in stationRegions" :key="region.id" :value="region.id">
                    {{ region.label }}
                  </option>
                </select>

                <select
                  v-model="to"
                  class="w-full min-w-0 rounded-lg border px-3 py-2 bg-white"
                  :aria-label="t('toStation')"
                >
                  <option value="">{{ t("choose") }}</option>
                  <option v-for="station in stationOptions(toRegion)" :key="station.code" :value="station.code">
                    {{ station.name }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Time -->
        <div class="col-span-2 md:col-span-1">
          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-600">{{ t("boardingTime") }}</label>
            <button
              type="button"
              @click="setNowTime"
              class="text-xs px-2 py-1 rounded-md border bg-white text-gray-600 active:scale-95"
              :title="t('currentTime')"
            >
              {{ t("currentTime") }}
            </button>
          </div>
          <div class="mt-1 w-full overflow-hidden rounded-lg">
            <input
              type="time"
              v-model="time"
              class="w-full box-border min-w-0 max-w-full appearance-none rounded-lg border px-3 py-2 bg-white"
            />
          </div>
        </div>

        <button
          @click="onSearch"
          :disabled="!canSearch"
          class="col-span-2 md:col-span-3 mt-2 rounded-xl bg-blue-600 py-2 text-white font-medium active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ t("searchTrains") }}
        </button>
      </div>
    </section>

    <!-- Errors -->
    <section v-if="errorMsg" class="max-w-5xl mx-auto px-4 mt-3">
      <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {{ errorMsg }}
      </div>
    </section>

    <!-- Results -->
    <section class="max-w-5xl mx-auto px-4 mt-6 pb-10">
      <div v-if="loading" class="text-center text-gray-500">{{ t("searching") }}</div>

      <div v-else-if="directTrainDetail" class="bg-white rounded-xl shadow overflow-hidden">
        <div class="px-4 py-3 border-b flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold text-lg">
              {{ directTrainDetail.trainNo }} {{ directTrainDetail.carName }}
            </div>
            <div v-if="directTrainDetail.rows.length" class="text-sm text-gray-500 mt-0.5">
              {{ selectedDateLabel }} · {{ directTrainDetail.rows[0].name }} → {{ directTrainDetail.rows[directTrainDetail.rows.length - 1].name }}
            </div>
          </div>

          <div class="flex gap-2 shrink-0">
            <button
              type="button"
              class="text-xs px-3 py-1.5 rounded-lg border bg-white text-gray-600 active:scale-95"
              @click="shareTrain(directTrainDetail.trainNo)"
            >
              {{ t("share") }}
            </button>
            <button
              type="button"
              class="text-xs px-3 py-1.5 rounded-lg border bg-white text-gray-500 active:scale-95"
              @click="clearDirectTrainPage"
            >
              {{ t("back") }}
            </button>
          </div>
        </div>

        <div class="divide-y">
          <div
            v-for="(s, idx) in directTrainDetail.rows"
            :key="s.station + '-' + s.order"
            class="px-4 py-3 flex items-center justify-between"
          >
            <div class="min-w-0">
              <div class="font-medium text-gray-800 truncate">
                {{ idx + 1 }}. {{ s.name }}
              </div>
              <div class="text-xs text-gray-400">{{ s.station }}</div>
            </div>

            <div class="text-sm text-gray-700 flex gap-3 shrink-0">
              <div class="text-right">
                <div class="text-xs text-gray-400">{{ t("arrival") }}</div>
                <div>{{ s.arr }}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-gray-400">{{ t("departure") }}</div>
                <div>{{ s.dep }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="results.length === 0 && !errorMsg" class="text-center text-gray-400">
        {{ t("noResults") }}
      </div>

      <ul v-else class="space-y-3">
        <li
          v-for="r in results"
          :key="r.trainNo"
          :id="`train-${r.trainNo}`"
          class="bg-white rounded-xl shadow px-4 py-3"
        >
          <!-- Summary row -->
          <button
            type="button"
            class="w-full text-left cursor-pointer select-none active:scale-[0.99]"
            @click="toggleTrainDetail(r.trainNo)"
          >
            <div class="flex justify-between items-center">
              <div class="font-semibold text-lg flex items-center gap-2">
                {{ r.trainNo }}
                <span
                  class="text-xs rounded-full border px-2 py-0.5"
                  :class="selectedTrainNo === r.trainNo ? 'bg-slate-100 text-slate-600' : 'bg-white text-gray-400'"
                >
                  {{ selectedTrainNo === r.trainNo ? t("collapse") : t("expand") }}
                </span>
              </div>

              <!-- ✅ right side: car type + endpoints -->
              <div class="text-right">
                <div
                  class="text-sm font-medium"
                  :class="r.isLocal ? 'text-gray-500' : 'text-red-600'"
                  :title="r.isLocal ? t('localTrainTitle') : t('nonLocalTrainTitle')"
                >
                  {{ r.carName }}
                </div>
                <div class="text-xs text-gray-400">
                  {{ r.start }} → {{ r.end }}
                </div>
              </div>
            </div>

            <div class="mt-1 text-gray-700">
              {{ r.dep }} → {{ r.arr }}
            </div>

            <div class="mt-2 text-xs text-gray-400">{{ t("tapForStops") }}</div>
          </button>

          <div class="mt-3 flex justify-end">
            <button
              type="button"
              class="text-xs px-3 py-1.5 rounded-lg border bg-white text-gray-600 active:scale-95"
              @click="shareTrain(r.trainNo)"
            >
              {{ t("shareThisTrain") }}
            </button>
          </div>

          <!-- Detail accordion -->
          <div v-if="selectedTrainNo === r.trainNo" class="mt-3 rounded-xl border bg-slate-50 overflow-hidden">
            <div class="px-3 py-2 text-sm text-gray-600 flex items-center justify-between">
              <div class="font-medium">
                {{ t("stops") }}（{{ getTrainDetail(r.trainNo)?.rows?.length ?? 0 }}）
              </div>
              <button type="button" class="text-xs text-gray-500 underline" @click="selectedTrainNo = ''">
                {{ t("close") }}
              </button>
            </div>

            <div class="divide-y">
              <div
                v-for="(s, idx) in getTrainDetail(r.trainNo).rows"
                :key="s.station + '-' + s.order"
                class="px-3 py-2 flex items-center justify-between"
              >
                <div class="min-w-0">
                  <div class="font-medium text-gray-800 truncate">
                    {{ idx + 1 }}. {{ s.name }}
                  </div>
                  <div class="text-xs text-gray-400">{{ s.station }}</div>
                </div>

                <div class="text-sm text-gray-700 flex gap-3 shrink-0">
                  <div class="text-right">
                    <div class="text-xs text-gray-400">{{ t("arrival") }}</div>
                    <div>{{ s.arr }}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-xs text-gray-400">{{ t("departure") }}</div>
                    <div>{{ s.dep }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <footer class="max-w-5xl mx-auto px-4 pb-8 text-center text-sm text-gray-500">
      <a class="underline" href="/stations/">{{ t("stationInfo") }}</a>
      <span class="mx-2">·</span>
      <a class="underline" href="/guide/">{{ t("usageGuide") }}</a>
      <span class="mx-2">·</span>
      <a class="underline" href="/about/">{{ t("aboutSite") }}</a>
    </footer>

    <div
      v-if="toastMsg"
      class="fixed left-1/2 bottom-5 z-30 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg"
      role="status"
      aria-live="polite"
    >
      {{ toastMsg }}
    </div>
  </div>
</template>
