<script setup>
const BASE = import.meta.env.BASE_URL;
import { ref, onMounted, computed, watch } from "vue";

/* ---------- state ---------- */
const stations = ref({});
const carsMap = ref({}); // id -> { name, alias }

const trains = ref(null); // trainNo -> { carClass, stops: [[station, order, depMin, arrMin], ...], stopMap? }
const stopIndex = ref(null); // station -> [trainNo...]

const date = ref("");
const from = ref("");
const to = ref("");
const time = ref("00:00");

const results = ref([]);
const loading = ref(false);
const errorMsg = ref("");

/* ---------- localStorage keys ---------- */
const LS_FROM = "tra.from";
const LS_TO = "tra.to";

/* ---------- time/date helpers ---------- */
function yyyymmddLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

const today = new Date();
const minDate = computed(() => yyyymmddLocal(today));
const maxDate = computed(() => {
  const d = new Date(today);
  d.setDate(d.getDate() + 2);
  return yyyymmddLocal(d);
});

/* ---------- utils ---------- */
function hhmmToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildStopMap(stops) {
  // station -> { order, depMin, arrMin }
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

/* ---------- load meta ---------- */
async function loadStations() {
  const res = await fetch(`${BASE}/data/meta/stationsMap.json`);
  if (!res.ok) throw new Error(`stationsMap.json fetch failed: ${res.status}`);
  stations.value = await res.json();
}

async function loadCars() {
  // ✅ 改吃你 preprocess 產出的 meta（不再讀 /cars.json）
  const res = await fetch(`${BASE}/data/meta/carsMap.json`);
  if (!res.ok) throw new Error(`carsMap.json fetch failed: ${res.status}`);
  carsMap.value = await res.json();
}

/* ---------- load timetable ---------- */
async function loadDay(yyyy_mm_dd) {
  const key = yyyy_mm_dd.replaceAll("-", "");
  const base = `${BASE}/data/days/${key}`;
  const [tRes, sRes] = await Promise.all([
    fetch(`${base}/trains.json`),
    fetch(`${base}/stopIndex.json`),
  ]);

  if (!tRes.ok) throw new Error(`trains.json fetch failed: ${tRes.status}`);
  if (!sRes.ok) throw new Error(`stopIndex.json fetch failed: ${sRes.status}`);

  const t = await tRes.json();
  const idx = await sRes.json();

  // ✅ 建立 stopMap，避免 query 每次 find() O(n)
  for (const trainNo of Object.keys(t)) {
    const stops = t[trainNo]?.stops;
    if (Array.isArray(stops) && !t[trainNo].stopMap) {
      t[trainNo].stopMap = buildStopMap(stops);
    }
  }

  trains.value = t;
  stopIndex.value = idx;
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

    // ✅ O(1) lookup
    const a = t.stopMap?.[from.value];
    const b = t.stopMap?.[to.value];
    if (!a || !b) continue;

    if (a.order >= b.order) continue;
    if (a.dep < earliestMin) continue;

    const car = carsMap.value?.[t.carClass];
    results.value.push({
      trainNo,
      carName: car?.name ?? car?.alias ?? t.carClass,
      dep: minToHHMM(a.dep),
      arr: minToHHMM(b.arr),
    });
  }

  results.value.sort((x, y) => x.dep.localeCompare(y.dep));
}

/* ---------- actions ---------- */
const canSearch = computed(() => {
  return Boolean(date.value && from.value && to.value && !loading.value);
});

async function onSearch() {
  if (!date.value || !from.value || !to.value) return;

  errorMsg.value = "";
  results.value = [];
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

function swapStations() {
  if (!from.value && !to.value) return;
  const tmp = from.value;
  from.value = to.value;
  to.value = tmp;

  // ✅ 如果已載入當天資料，交換後直接更新結果
  if (trains.value && stopIndex.value) query();
}

/* ---------- persist from/to ---------- */
function loadFromToFromLocalStorage() {
  try {
    const f = localStorage.getItem(LS_FROM);
    const t = localStorage.getItem(LS_TO);
    if (f) from.value = f;
    if (t) to.value = t;
  } catch {}
}

watch(from, (v) => {
  try {
    if (v) localStorage.setItem(LS_FROM, v);
    else localStorage.removeItem(LS_FROM);
  } catch {}
});

watch(to, (v) => {
  try {
    if (v) localStorage.setItem(LS_TO, v);
    else localStorage.removeItem(LS_TO);
  } catch {}
});

/* ---------- init ---------- */
onMounted(async () => {
  // ✅ default date + Taipei now time
  date.value = minDate.value;
  time.value = hhmmNowTaipei();

  try {
    await Promise.all([loadStations(), loadCars()]);
  } catch (e) {
    errorMsg.value = e?.message ?? String(e);
  }

  // 站名載入後再回填（避免 value 存在但 option 還沒出現）
  loadFromToFromLocalStorage();
});
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-white shadow-sm">
      <div class="max-w-5xl mx-auto px-4 py-3">
        <h1 class="text-lg font-semibold">台鐵班次查詢</h1>
      </div>
    </header>

    <!-- Search Card -->
    <section class="max-w-5xl mx-auto px-4 mt-4">
      <div class="bg-white rounded-xl shadow p-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <!-- Date -->
        <div class="col-span-2 md:col-span-1">
          <label class="text-sm text-gray-600">日期</label>
          <div class="mt-1 w-full overflow-hidden rounded-lg">
            <input
              type="date"
              v-model="date"
              :min="minDate"
              :max="maxDate"
              class="w-full box-border min-w-0 max-w-full appearance-none rounded-lg border px-3 py-2 bg-white"
            />
          </div>
        </div>

        <!-- From + Swap + To (same row) -->
        <div class="col-span-2 md:col-span-2">
          <div class="flex items-end gap-2">
            <div class="flex-1 min-w-0">
              <label class="text-sm text-gray-600">起站</label>
              <select
                v-model="from"
                class="mt-1 w-full min-w-0 rounded-lg border px-3 py-2 bg-white"
              >
                <option value="">請選擇</option>
                <option v-for="(name, code) in stations" :key="code" :value="code">
                  {{ name }}
                </option>
              </select>
            </div>

            <button
              type="button"
              @click="swapStations"
              class="mb-0.5 h-10 w-10 shrink-0 rounded-full border bg-white shadow-sm
                     flex items-center justify-center active:scale-95"
              aria-label="交換起迄站"
              title="交換起迄站"
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

            <div class="flex-1 min-w-0">
              <label class="text-sm text-gray-600">迄站</label>
              <select
                v-model="to"
                class="mt-1 w-full min-w-0 rounded-lg border px-3 py-2 bg-white"
              >
                <option value="">請選擇</option>
                <option v-for="(name, code) in stations" :key="code" :value="code">
                  {{ name }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- Time -->
        <div class="col-span-2 md:col-span-1">
          <label class="text-sm text-gray-600">上車時間</label>
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
          class="col-span-2 md:col-span-4 mt-2 rounded-xl bg-blue-600 py-2 text-white font-medium
                 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          查詢班次
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
      <div v-if="loading" class="text-center text-gray-500">查詢中…</div>

      <div v-else-if="results.length === 0" class="text-center text-gray-400">
        尚無符合條件的班次
      </div>

      <ul class="space-y-3">
        <li
          v-for="r in results"
          :key="r.trainNo"
          class="bg-white rounded-xl shadow px-4 py-3"
        >
          <div class="flex justify-between items-center">
            <div class="font-semibold text-lg">{{ r.trainNo }}</div>
            <div class="text-sm text-gray-500">{{ r.carName }}</div>
          </div>
          <div class="mt-1 text-gray-700">
            {{ r.dep }} → {{ r.arr }}
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
