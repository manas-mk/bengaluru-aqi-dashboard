"use strict";

/* ============================== CONFIG ============================== */
const DEFAULT_CITY = { name: "Bengaluru", admin1: "Karnataka", country: "India", lat: 12.9716, lon: 77.5946 };
const CITY_STORAGE_KEY = "bwi_city_v1";
const REFRESH_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const HIST_YEARS = 10;
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const CACHE_STATE_KEY = "bwi_last_good_state_v2";

// Every per-city cache is namespaced by rounded coordinates so switching cities never
// shows another city's stale localStorage data while its own fresh fetch is in flight.
function cityCacheKey(base) {
  return `${base}:${state.city.lat.toFixed(3)},${state.city.lon.toFixed(3)}`;
}
function formatLatLon(lat, lon) {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`;
}
function cityLabel(city, opts) {
  const parts = [city.name, city.admin1, city.country].filter(Boolean);
  return (opts && opts.short) ? parts.slice(0, 2).join(", ") : parts.join(", ");
}

// A short, recognizable code (mostly IATA-style) for well-known global cities, purely for
// display ("Bengaluru (BLR)") — this is a small curated list, not a live lookup (there's no
// free/keyless API for it), so it only covers major cities. Anything not in the list just
// shows its plain name rather than fabricating a code that might be wrong.
const CITY_CODES = {
  bengaluru: "BLR", bangalore: "BLR", mumbai: "BOM", delhi: "DEL", "new delhi": "DEL",
  chennai: "MAA", kolkata: "CCU", hyderabad: "HYD", pune: "PNQ", ahmedabad: "AMD",
  jaipur: "JAI", kochi: "COK", goa: "GOI", lucknow: "LKO", chandigarh: "IXC",
  "new york": "NYC", "los angeles": "LAX", chicago: "CHI", "san francisco": "SFO",
  washington: "WAS", boston: "BOS", seattle: "SEA", miami: "MIA", "las vegas": "LAS",
  toronto: "YTO", vancouver: "YVR", montreal: "YUL", "mexico city": "MEX",
  london: "LON", paris: "PAR", berlin: "BER", munich: "MUC", frankfurt: "FRA",
  rome: "ROM", milan: "MIL", madrid: "MAD", barcelona: "BCN", lisbon: "LIS",
  amsterdam: "AMS", brussels: "BRU", vienna: "VIE", zurich: "ZRH", geneva: "GVA",
  dublin: "DUB", stockholm: "STO", oslo: "OSL", copenhagen: "CPH", helsinki: "HEL",
  warsaw: "WAW", prague: "PRG", budapest: "BUD", athens: "ATH", istanbul: "IST",
  moscow: "MOW", dubai: "DXB", "abu dhabi": "AUH", doha: "DOH", riyadh: "RUH",
  "tel aviv": "TLV", cairo: "CAI", casablanca: "CAS", lagos: "LOS", nairobi: "NBO",
  johannesburg: "JNB", "cape town": "CPT", tokyo: "TYO", osaka: "OSA", seoul: "SEL",
  beijing: "BJS", shanghai: "SHA", "hong kong": "HKG", taipei: "TPE", singapore: "SIN",
  bangkok: "BKK", "kuala lumpur": "KUL", jakarta: "JKT", manila: "MNL",
  "ho chi minh city": "SGN", hanoi: "HAN", sydney: "SYD", melbourne: "MEL",
  brisbane: "BNE", perth: "PER", auckland: "AKL", wellington: "WLG",
  "são paulo": "SAO", "sao paulo": "SAO", "rio de janeiro": "RIO",
  "buenos aires": "BUE", santiago: "SCL", lima: "LIM", bogotá: "BOG", bogota: "BOG",
};
function cityShortLabel(city) {
  const code = CITY_CODES[city.name.trim().toLowerCase()];
  return code ? `${city.name} (${code})` : city.name;
}

// A small curated set of hand-drawn landmark silhouettes for the hero card's background —
// same honest, no-fabrication pattern as CITY_CODES: only the cities below get one, drawn
// faint and low-opacity via CSS (.hero-landmark) so it never competes with the temperature/
// condition text; everywhere else just keeps the plain ambient sky gradient.
const CITY_LANDMARKS = {
  paris: `<path d="M100,10 L70,128 L59,128 L96,24 Z" fill="currentColor"/>
    <path d="M100,10 L130,128 L141,128 L104,24 Z" fill="currentColor"/>
    <line x1="73" y1="86" x2="127" y2="86" stroke="currentColor" stroke-width="3"/>
    <line x1="64" y1="110" x2="136" y2="110" stroke="currentColor" stroke-width="3"/>`,
  london: `<rect x="85" y="40" width="30" height="88" fill="currentColor"/>
    <rect x="80" y="34" width="40" height="8" fill="currentColor"/>
    <circle cx="100" cy="58" r="9" fill="rgba(0,0,0,.55)"/>
    <polygon points="82,34 100,4 118,34" fill="currentColor"/>`,
  "new york": `<rect x="15" y="60" width="24" height="68" fill="currentColor"/>
    <rect x="42" y="78" width="20" height="50" fill="currentColor"/>
    <rect x="66" y="30" width="26" height="98" fill="currentColor"/>
    <line x1="79" y1="30" x2="79" y2="8" stroke="currentColor" stroke-width="3"/>
    <rect x="96" y="70" width="22" height="58" fill="currentColor"/>
    <rect x="122" y="45" width="24" height="83" fill="currentColor"/>
    <rect x="150" y="85" width="20" height="43" fill="currentColor"/>`,
  tokyo: `<path d="M100,8 L74,128 L126,128 Z" fill="currentColor"/>
    <line x1="82" y1="90" x2="118" y2="90" stroke="rgba(0,0,0,.55)" stroke-width="4"/>
    <line x1="87" y1="60" x2="113" y2="60" stroke="rgba(0,0,0,.55)" stroke-width="4"/>`,
  sydney: `<rect x="30" y="118" width="140" height="10" fill="currentColor"/>
    <path d="M45,118 Q60,55 85,118 Z" fill="currentColor"/>
    <path d="M80,118 Q100,35 125,118 Z" fill="currentColor"/>
    <path d="M115,118 Q133,60 155,118 Z" fill="currentColor"/>`,
  rome: `<rect x="15" y="55" width="170" height="73" rx="30" fill="currentColor"/>
    <g fill="rgba(0,0,0,.5)">
      <rect x="30" y="70" width="9" height="14"/><rect x="46" y="66" width="9" height="14"/>
      <rect x="62" y="63" width="9" height="14"/><rect x="78" y="61" width="9" height="14"/>
      <rect x="95" y="60" width="9" height="14"/><rect x="112" y="61" width="9" height="14"/>
      <rect x="128" y="63" width="9" height="14"/><rect x="144" y="66" width="9" height="14"/>
      <rect x="160" y="70" width="9" height="14"/>
    </g>`,
  dubai: `<rect x="85" y="95" width="30" height="33" fill="currentColor"/>
    <rect x="90" y="55" width="20" height="40" fill="currentColor"/>
    <rect x="94" y="25" width="12" height="30" fill="currentColor"/>
    <line x1="100" y1="25" x2="100" y2="2" stroke="currentColor" stroke-width="2"/>`,
  cairo: `<polygon points="40,128 68,82 96,128" fill="currentColor" opacity="0.6"/>
    <polygon points="62,128 100,58 138,128" fill="currentColor"/>
    <polygon points="122,128 147,92 172,128" fill="currentColor" opacity="0.6"/>`,
  "rio de janeiro": `<path d="M55,128 Q100,100 145,128 Z" fill="currentColor"/>
    <circle cx="100" cy="38" r="6" fill="currentColor"/>
    <rect x="96" y="44" width="8" height="55" fill="currentColor"/>
    <rect x="60" y="50" width="80" height="7" fill="currentColor"/>`,
  moscow: `<rect x="25" y="112" width="150" height="16" fill="currentColor"/>
    <rect x="42" y="88" width="10" height="24" fill="currentColor"/>
    <path d="M47,88 C36,78 36,62 47,58 C58,62 58,78 47,88 Z" fill="currentColor"/>
    <rect x="72" y="80" width="10" height="32" fill="currentColor"/>
    <path d="M77,80 C64,68 64,48 77,42 C90,48 90,68 77,80 Z" fill="currentColor"/>
    <rect x="95" y="72" width="10" height="40" fill="currentColor"/>
    <path d="M100,72 C86,58 86,32 100,24 C114,32 114,58 100,72 Z" fill="currentColor"/>
    <rect x="118" y="80" width="10" height="32" fill="currentColor"/>
    <path d="M123,80 C110,68 110,48 123,42 C136,48 136,68 123,80 Z" fill="currentColor"/>
    <rect x="148" y="88" width="10" height="24" fill="currentColor"/>
    <path d="M153,88 C142,78 142,62 153,58 C164,62 164,78 153,88 Z" fill="currentColor"/>`,
  bengaluru: `<rect x="35" y="92" width="130" height="36" fill="currentColor"/>
    <path d="M75,92 A25,25 0 0,1 125,92 Z" fill="currentColor"/>
    <path d="M42,92 A12,12 0 0,1 66,92 Z" fill="currentColor"/>
    <path d="M134,92 A12,12 0 0,1 158,92 Z" fill="currentColor"/>
    <g stroke="rgba(0,0,0,.5)" stroke-width="3">
      <line x1="55" y1="98" x2="55" y2="122"/><line x1="75" y1="98" x2="75" y2="122"/>
      <line x1="100" y1="98" x2="100" y2="122"/><line x1="125" y1="98" x2="125" y2="122"/>
      <line x1="145" y1="98" x2="145" y2="122"/>
    </g>`,
  bangalore: null, // filled in below to alias bengaluru
  singapore: `<rect x="45" y="45" width="16" height="83" fill="currentColor"/>
    <rect x="92" y="30" width="16" height="98" fill="currentColor"/>
    <rect x="139" y="45" width="16" height="83" fill="currentColor"/>
    <path d="M40,50 Q100,25 160,50 L160,62 Q100,40 40,62 Z" fill="currentColor"/>`,
};
CITY_LANDMARKS.bangalore = CITY_LANDMARKS.bengaluru;

function landmarkSVG(city) {
  const inner = CITY_LANDMARKS[city.name.trim().toLowerCase()];
  if (!inner) return "";
  return `<svg viewBox="0 0 200 130" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">${inner}</svg>`;
}

const svgNS = "http://www.w3.org/2000/svg";

/* ============================== UTILS ============================== */
function $(sel, root) { return (root || document).querySelector(sel); }
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function fmt(n, d) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(d == null ? 1 : d);
}
function pad2(n) { return String(n).padStart(2, "0"); }
function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + "th";
  return n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
}
function isoDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function dayOfYear(d) { const start = new Date(d.getFullYear(), 0, 0); return Math.floor((d - start) / 86400000); }

// Every network call goes through this: a hung connection (dead wifi, stalled CDN) would
// otherwise leave a panel showing a skeleton forever with no way out except a manual reload.
async function fetchJSON(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return await resp.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Timed out after " + Math.round((timeoutMs || FETCH_TIMEOUT_MS) / 1000) + "s");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function cacheGet(key, maxAgeMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (maxAgeMs != null && Date.now() - t > maxAgeMs) return null;
    return { value: v, age: Date.now() - t };
  } catch (e) { return null; }
}
function cacheSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) { /* quota etc */ }
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
function degToCompass(deg) { return COMPASS[Math.round(deg / 22.5) % 16]; }

function uvBand(uv) {
  if (uv == null) return "—";
  if (uv < 3) return "LOW";
  if (uv < 6) return "MODERATE";
  if (uv < 8) return "HIGH";
  if (uv < 11) return "VERY HIGH";
  return "EXTREME";
}

// Heat index (NWS Rothfusz regression). Valid roughly for T >= 27C and RH >= 40%; else returns null.
function heatIndexC(tC, rh) {
  const tF = tC * 9 / 5 + 32;
  if (tF < 80 || rh == null) return null;
  const T = tF, R = rh;
  let hi = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R
    - 0.00683783 * T * T - 0.05481717 * R * R + 0.00122874 * T * T * R
    + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
  return (hi - 32) * 5 / 9;
}

// Wet-bulb temperature, Stull (2011) empirical approximation. Valid 5-45C, 5-99% RH.
function wetBulbC(tC, rh) {
  if (tC == null || rh == null) return null;
  return tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(tC + rh) - Math.atan(rh - 1.67633)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
}

// Drying index: a simple composite of evaporative demand — (T - dewpoint) spread scaled by wind.
// Not a standard named index; formula shown in the UI so it's never mistaken for an official one.
function dryingIndex(tC, dewC, windKmh) {
  if (tC == null || dewC == null || windKmh == null) return null;
  const spread = Math.max(0, tC - dewC);
  return spread * (1 + windKmh / 20);
}

// Moon phase via synodic month approximation. Returns {frac 0..1, name}.
function moonPhase(date) {
  const synodic = 29.530588853;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC
  const days = (date.getTime() - knownNewMoon) / 86400000;
  let frac = (days % synodic) / synodic;
  if (frac < 0) frac += 1;
  const names = [
    [0.0335, "New Moon"], [0.216, "Waxing Crescent"], [0.283, "First Quarter"],
    [0.466, "Waxing Gibbous"], [0.533, "Full Moon"], [0.716, "Waning Gibbous"],
    [0.783, "Last Quarter"], [0.966, "Waning Crescent"], [1.001, "New Moon"],
  ];
  for (const [upto, name] of names) if (frac <= upto) return { frac, name };
  return { frac, name: "New Moon" };
}

// Draws the moon's illuminated silhouette as two overlapping circles (no astronomy library,
// no emoji — emoji moon glyphs render at wildly inconsistent sizes across fonts/platforms and
// clash with the instrument aesthetic).
function moonPhaseSVG(frac, size) {
  const r = size / 2 - 1.5;
  const cx = size / 2, cy = size / 2;
  const illum = (1 - Math.cos(2 * Math.PI * frac)) / 2;
  const dir = frac < 0.5 ? -1 : 1;
  const offsetX = dir * 2 * r * illum;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--text-hi)" stroke="var(--text-low)" stroke-width="1"/>
    <circle cx="${cx + offsetX}" cy="${cy}" r="${r}" fill="var(--card)"/>
  </svg>`;
}

function percentileRank(value, arr) {
  const clean = arr.filter((v) => v != null && !Number.isNaN(v));
  if (!clean.length || value == null) return null;
  const below = clean.filter((v) => v < value).length;
  return Math.round((below / clean.length) * 100);
}

/* ============================== CPCB NATIONAL AQI (India) ==============================
   Breakpoints per the CPCB National Air Quality Index (2014), sub-index computed by linear
   interpolation within each pollutant's band; overall AQI = the worst (highest) sub-index,
   and that pollutant is reported as "dominant." Units: µg/m³ for all except CO (mg/m³) —
   Open-Meteo reports CO in µg/m³, converted /1000 before use. */
const CPCB_BREAKPOINTS = {
  pm2_5: [[0, 30], [31, 60], [61, 90], [91, 120], [121, 250], [251, 500]],
  pm10: [[0, 50], [51, 100], [101, 250], [251, 350], [351, 430], [431, 600]],
  no2: [[0, 40], [41, 80], [81, 180], [181, 280], [281, 400], [401, 600]],
  so2: [[0, 40], [41, 80], [81, 380], [381, 800], [801, 1600], [1601, 2000]],
  o3: [[0, 50], [51, 100], [101, 168], [169, 208], [209, 748], [749, 1000]],
  co: [[0, 1.0], [1.1, 2.0], [2.1, 10], [10.1, 17], [17.1, 34], [34.1, 50]],
};
const CPCB_AQI_BANDS = [[0, 50], [51, 100], [101, 200], [201, 300], [301, 400], [401, 500]];
const CPCB_CATEGORIES = [
  { name: "Good", token: "good" },
  { name: "Satisfactory", token: "moderate" },
  { name: "Moderate", token: "poor" },
  { name: "Poor", token: "unhealthy" },
  { name: "Very Poor", token: "severe" },
  { name: "Severe", token: "hazard" },
];
const POLLUTANT_LABELS = { pm2_5: "PM2.5", pm10: "PM10", no2: "NO₂", so2: "SO₂", o3: "O₃", co: "CO" };
// CPCB's own published health-effect guidance per category (National AQI, 2014).
const CPCB_ADVISORY = [
  "Minimal impact on health.",
  "May cause minor breathing discomfort to sensitive people.",
  "May cause breathing discomfort to people with lung disease such as asthma, and discomfort to people with heart disease, children and older adults.",
  "May cause breathing discomfort to people on prolonged exposure, and discomfort to people with heart disease.",
  "May cause respiratory illness on prolonged exposure. Effects may be more pronounced in people with lung and heart disease.",
  "May cause respiratory effects even on healthy people, and serious health impacts on people with lung or heart disease — even during light physical activity.",
];

function cpcbSubIndex(pollutant, conc) {
  if (conc == null || Number.isNaN(conc)) return null;
  const bands = CPCB_BREAKPOINTS[pollutant];
  for (let i = 0; i < bands.length; i++) {
    const [lo, hi] = bands[i];
    if (conc <= hi || i === bands.length - 1) {
      const [siLo, siHi] = CPCB_AQI_BANDS[i];
      const frac = hi === lo ? 0 : Math.max(0, conc - lo) / (hi - lo);
      return Math.round(siLo + frac * (siHi - siLo));
    }
  }
  return null;
}

function cpcbCategoryForAqi(aqi) {
  if (aqi == null) return CPCB_CATEGORIES[0];
  for (let i = 0; i < CPCB_AQI_BANDS.length; i++) {
    if (aqi <= CPCB_AQI_BANDS[i][1] || i === CPCB_AQI_BANDS.length - 1) return CPCB_CATEGORIES[i];
  }
  return CPCB_CATEGORIES[CPCB_CATEGORIES.length - 1];
}

// Overall CPCB AQI = worst sub-index across pollutants; that pollutant is "dominant."
function cpcbOverall(pollutants) {
  const co_mgm3 = pollutants.carbon_monoxide != null ? pollutants.carbon_monoxide / 1000 : null;
  const subs = [
    { key: "pm2_5", value: cpcbSubIndex("pm2_5", pollutants.pm2_5) },
    { key: "pm10", value: cpcbSubIndex("pm10", pollutants.pm10) },
    { key: "no2", value: cpcbSubIndex("no2", pollutants.nitrogen_dioxide) },
    { key: "so2", value: cpcbSubIndex("so2", pollutants.sulphur_dioxide) },
    { key: "o3", value: cpcbSubIndex("o3", pollutants.ozone) },
    { key: "co", value: cpcbSubIndex("co", co_mgm3) },
  ].filter((s) => s.value != null);
  if (!subs.length) return null;
  subs.sort((a, b) => b.value - a.value);
  return { aqi: subs[0].value, dominant: subs[0].key, all: subs };
}

/* ============================== DATA FETCH ============================== */
// timezone=auto asks Open-Meteo to resolve the IANA timezone from lat/lon itself — this
// is what lets every fetch below work for any coordinate on Earth, not just Bengaluru.
async function fetchForecast() {
  const { lat, lon } = state.city;
  const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&timezone=auto` +
    `&past_days=30&forecast_days=7` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m,pressure_msl,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,uv_index,precipitation,weather_code,is_day` +
    `&hourly=temperature_2m,apparent_temperature,dew_point_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,uv_index,precipitation,precipitation_probability,visibility,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max,wind_direction_10m_dominant,weather_code`;
  return fetchJSON(url);
}

async function fetchAirQuality() {
  const { lat, lon } = state.city;
  const url = `${AQ_URL}?latitude=${lat}&longitude=${lon}&timezone=auto` +
    `&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide` +
    `&hourly=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide&forecast_days=3`;
  return fetchJSON(url);
}

async function fetchHistorical() {
  const cacheKey = cityCacheKey("hist_archive_v1");
  const cached = cacheGet(cacheKey, 24 * 3600 * 1000);
  if (cached) return cached.value;
  const { lat, lon } = state.city;
  const end = addDays(new Date(), -2); // archive lag safety margin
  const start = new Date(end.getFullYear() - HIST_YEARS, 0, 1);
  const url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}&timezone=auto` +
    `&start_date=${isoDate(start)}&end_date=${isoDate(end)}` +
    `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum`;
  const data = await fetchJSON(url, 15000);
  cacheSet(cacheKey, data);
  return data;
}

// A city is one grid cell in Open-Meteo's modeled (CAMS) air-quality data — there's no
// multi-station API available without a keyed provider, which this project deliberately
// avoids. This queries the same free/keyless endpoint at four points offset ~15km N/S/E/W
// of whatever city is selected: real numbers, honestly labeled as modeled estimates, not
// ground stations, and labeled by direction/distance since we don't have local place names
// for an arbitrary global city.
function nearbyPoints(city) {
  const dKm = 15;
  const dLat = dKm / 111;
  const dLon = dKm / (111 * Math.max(0.05, Math.cos((city.lat * Math.PI) / 180)));
  return [
    { name: `~${dKm} km north`, lat: city.lat + dLat, lon: city.lon },
    { name: `~${dKm} km south`, lat: city.lat - dLat, lon: city.lon },
    { name: `~${dKm} km east`, lat: city.lat, lon: city.lon + dLon },
    { name: `~${dKm} km west`, lat: city.lat, lon: city.lon - dLon },
  ];
}
async function fetchCityPointsAqi() {
  const points = nearbyPoints(state.city);
  const results = await Promise.allSettled(points.map((p) => {
    const url = `${AQ_URL}?latitude=${p.lat}&longitude=${p.lon}&timezone=auto&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide`;
    return fetchJSON(url, 8000);
  }));
  return points.map((p, i) => ({ ...p, data: results[i].status === "fulfilled" ? results[i].value.current : null }));
}

/* ============================== DERIVED DAILY MAP ============================== */
// Build date -> {tmax,tmin,tmean,precip} from hourly forecast data (covers the archive-to-now lag).
function dailyFromHourly(hourly) {
  const byDate = {};
  for (let i = 0; i < hourly.time.length; i++) {
    const date = hourly.time[i].slice(0, 10);
    if (!byDate[date]) byDate[date] = { temps: [], precip: 0 };
    const t = hourly.temperature_2m[i];
    if (t != null) byDate[date].temps.push(t);
    byDate[date].precip += hourly.precipitation[i] || 0;
  }
  const out = {};
  for (const date in byDate) {
    const temps = byDate[date].temps;
    if (!temps.length) continue;
    out[date] = {
      tmax: Math.max(...temps), tmin: Math.min(...temps),
      tmean: temps.reduce((a, b) => a + b, 0) / temps.length,
      precip: Math.round(byDate[date].precip * 10) / 10,
    };
  }
  return out;
}

function mergeDailyMaps(archiveDaily, hourlyDerived) {
  const map = {};
  if (archiveDaily && archiveDaily.time) {
    for (let i = 0; i < archiveDaily.time.length; i++) {
      map[archiveDaily.time[i]] = {
        tmax: archiveDaily.temperature_2m_max[i], tmin: archiveDaily.temperature_2m_min[i],
        tmean: archiveDaily.temperature_2m_mean[i], precip: archiveDaily.precipitation_sum[i],
      };
    }
  }
  for (const date in hourlyDerived) if (!(date in map)) map[date] = hourlyDerived[date];
  return map;
}

/* ============================== APP STATE ============================== */
const state = { city: DEFAULT_CITY, forecast: null, aq: null, historicalDaily: null, lastLoad: null, nowHourlyIdx: null, stale: false };
let citySeq = 0;

/* ============================== WEATHER ICONS ============================== */
function cloudPath() {
  return `<g class="cloud" fill="currentColor" opacity="0.95">
    <rect x="16" y="56" width="66" height="26" rx="13"/>
    <circle cx="36" cy="52" r="17"/>
    <circle cx="58" cy="45" r="21"/>
    <circle cx="77" cy="55" r="14"/>
  </g>`;
}
function sunGroup(r, opacity) {
  return `<g class="sun-rays" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" opacity="${opacity}">
      <line x1="50" y1="6" x2="50" y2="18"/><line x1="50" y1="82" x2="50" y2="94"/>
      <line x1="6" y1="50" x2="18" y2="50"/><line x1="82" y1="50" x2="94" y2="50"/>
      <line x1="19" y1="19" x2="28" y2="28"/><line x1="72" y1="72" x2="81" y2="81"/>
      <line x1="19" y1="81" x2="28" y2="72"/><line x1="72" y1="28" x2="81" y2="19"/>
    </g>
    <circle class="sun-core" cx="50" cy="50" r="${r}" fill="currentColor" opacity="${opacity}"/>`;
}
function crescentPath(opacity) {
  return `<path d="M62,14 A34,34 0 1 0 62,86 A25,25 0 1 1 62,14 Z" fill="currentColor" opacity="${opacity}"/>
    <circle cx="22" cy="30" r="2" fill="currentColor" opacity="${opacity * 0.8}"/>
    <circle cx="14" cy="48" r="1.3" fill="currentColor" opacity="${opacity * 0.6}"/>`;
}
function rainDrops(n) {
  const xs = [30, 44, 58, 72].slice(0, n);
  return xs.map((x, i) => `<line class="rain-drop" x1="${x}" y1="80" x2="${x - 4}" y2="92" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" style="animation-delay:${i * 0.18}s"/>`).join("");
}
function boltPath() {
  return `<polygon class="bolt" points="55,58 42,58 50,78 38,78 62,50 52,50 60,34" fill="#ffd54a"/>`;
}
function fogLines() {
  return [40, 56, 72].map((y, i) => `<line class="fog-line" x1="14" y1="${y}" x2="86" y2="${y}" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" opacity="${0.9 - i * 0.15}" style="animation-delay:${i * 0.3}s"/>`).join("");
}

function weatherIconSVG(code, isDay) {
  let inner;
  if (code === 0 || code === 1) {
    inner = isDay ? sunGroup(20, 1) : crescentPath(1);
  } else if (code === 2) {
    inner = (isDay ? sunGroup(15, 0.9) : crescentPath(0.9)) + `<g transform="translate(6,10) scale(0.82)">${cloudPath()}</g>`;
  } else if (code === 3) {
    inner = `<g class="cloud-back" fill="currentColor" opacity="0.5" transform="translate(-8,-14) scale(0.7)">${cloudPath().replace('class="cloud"', '')}</g>${cloudPath()}`;
  } else if (code === 45 || code === 48) {
    inner = `<g transform="translate(0,-10) scale(0.85)" opacity="0.85">${cloudPath()}</g>${fogLines()}`;
  } else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    const heavy = [65, 67, 82].includes(code);
    inner = `${cloudPath()}${rainDrops(heavy ? 4 : 3)}`;
  } else if ([71, 73, 75, 77, 85, 86].includes(code)) {
    inner = `${cloudPath()}<g fill="currentColor">
      <circle class="rain-drop" cx="34" cy="84" r="2.4"/><circle class="rain-drop" cx="50" cy="90" r="2.4" style="animation-delay:.3s"/><circle class="rain-drop" cx="66" cy="84" r="2.4" style="animation-delay:.6s"/>
    </g>`;
  } else if ([95, 96, 99].includes(code)) {
    inner = `${cloudPath()}${boltPath()}`;
  } else {
    inner = isDay ? sunGroup(20, 1) : crescentPath(1);
  }
  return `<svg class="w-icon" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">${inner}</svg>`;
}

function weatherConditionLabel(code) {
  const map = {
    0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Rain showers", 81: "Rain showers", 82: "Violent showers",
    85: "Snow showers", 86: "Snow showers",
    95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, hail",
  };
  return map[code] || "—";
}

function todayDailyIndex(daily) {
  const idx = daily.time.indexOf(isoDate(new Date()));
  return idx >= 0 ? idx : daily.time.length - 1;
}

function nearestHourlyIndex(hourly, targetIso) {
  let best = 0, bestDiff = Infinity;
  const target = new Date(targetIso).getTime();
  for (let i = 0; i < hourly.time.length; i++) {
    const diff = Math.abs(new Date(hourly.time[i]).getTime() - target);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

function last24hRange(hourly, idx, key) {
  const start = Math.max(0, idx - 24);
  const vals = hourly[key].slice(start, idx + 1).filter((v) => v != null);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function pressureTrend(hourly, idx) {
  const past = idx - 3;
  if (past < 0 || hourly.pressure_msl[idx] == null || hourly.pressure_msl[past] == null) return { dir: "steady", delta: 0 };
  const delta = hourly.pressure_msl[idx] - hourly.pressure_msl[past];
  if (delta > 0.5) return { dir: "rising", delta };
  if (delta < -0.5) return { dir: "falling", delta };
  return { dir: "steady", delta };
}

// Compact 24h trend charts inside a stat card, with a soft gradient fill under the line —
// real information (the last day's shape) instead of empty space, with a touch more depth
// than a bare stroke.
function sparklineSVG(values, opts = {}) {
  const w = opts.width || 100, h = opts.height || 28;
  const color = opts.color || "currentColor";
  const nums = values.filter((v) => v != null);
  if (nums.length < 2) return "";
  const n = values.length;
  const step = w / (n - 1);
  const gradId = "sg" + Math.random().toString(36).slice(2, 9);

  if (opts.mode === "bars") {
    const max = Math.max(...nums, 0.1);
    const barW = Math.max(1.5, step * 0.55);
    const bars = values.map((v, i) => {
      const val = v || 0;
      const bh = Math.max(1.5, (val / max) * h);
      return `<rect x="${(i * step - barW / 2).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${color}" opacity="${val > 0 ? 0.85 : 0.18}"/>`;
    }).join("");
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
  }

  const min = Math.min(...nums), max = Math.max(...nums), range = (max - min) || 1;
  let d = "", lastX = 0, lastY = h / 2, firstX = null, firstY = null;
  values.forEach((v, i) => {
    if (v == null) return;
    const x = i * step, y = h - ((v - min) / range) * h;
    d += (d ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    if (firstX == null) { firstX = x; firstY = y; }
    lastX = x; lastY = y;
  });
  const fillD = `M ${firstX} ${h} ${d.replace(/^M/, "L").trim()} L ${lastX} ${h} Z`;
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".35"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${fillD}" fill="url(#${gradId})" stroke="none"/>
    <path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.2" fill="${color}"/>
  </svg>`;
}

function statCard(label, valueHTML, subHTML, areaClass, sparkHTML) {
  const d = el("div", "stat-card" + (areaClass ? " " + areaClass : ""));
  d.appendChild(el("div", "s-label", label));
  const v = el("div", "s-value num");
  v.innerHTML = valueHTML;
  d.appendChild(v);
  if (sparkHTML) {
    const sp = el("div", "s-spark");
    sp.innerHTML = sparkHTML;
    d.appendChild(sp);
  }
  if (subHTML) {
    const s = el("div", "s-sub");
    s.innerHTML = subHTML;
    d.appendChild(s);
  }
  return d;
}

// Kinetic numeral: the hero temperature's variable-font weight tracks the value itself
// (hotter reads heavier), on a modest 500-800 range so it stays legible, not cartoonish.
function tempToWeight(tempC) {
  const clamped = Math.max(15, Math.min(40, tempC));
  return Math.round(500 + ((clamped - 15) / 25) * 300);
}

function isDarkTheme() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit) return explicit === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/* ============================== AMBIENT SKY GRADIENT ==============================
   A continuous blend across four keyframe skies (night -> dawn -> day -> dusk -> night)
   driven by how far "now" sits between sunrise and sunset, not a hard 4-bucket snap —
   and desaturated under heavy cloud cover. Computed in JS (not CSS) because it needs
   real interpolation math across more than two colors. */
function mixRgb(c1, c2, f) {
  return [Math.round(c1[0] + (c2[0] - c1[0]) * f), Math.round(c1[1] + (c2[1] - c1[1]) * f), Math.round(c1[2] + (c2[2] - c1[2]) * f)];
}
function toRgbStr(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function desaturate(c, amount) {
  const gray = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return mixRgb(c, [gray, gray, gray], amount);
}

const SKY_KEYFRAMES = {
  night: { a: [10, 12, 30], b: [4, 5, 14] },
  dawn: { a: [255, 154, 108], b: [106, 90, 205] },
  day: { a: [79, 166, 255], b: [22, 86, 184] },
  dusk: { a: [255, 126, 95], b: [61, 43, 107] },
};

function skyGradient(now, sunrise, sunset, cloudCoverPct) {
  const t = now.getTime(), sr = sunrise.getTime(), ss = sunset.getTime();
  const dayLen = ss - sr;
  const twilight = Math.min(50 * 60000, dayLen * 0.12);
  let frame1, frame2, mix;
  if (t < sr - twilight) { frame1 = frame2 = "night"; mix = 0; }
  else if (t < sr + twilight) { frame1 = "dawn"; frame2 = "day"; mix = (t - (sr - twilight)) / (2 * twilight); if (t < sr) { frame1 = "night"; frame2 = "dawn"; mix = (t - (sr - twilight)) / twilight; } }
  else if (t < ss - twilight) { frame1 = frame2 = "day"; mix = 0; }
  else if (t < ss + twilight) { frame1 = "day"; frame2 = "dusk"; mix = (t - (ss - twilight)) / twilight; if (t > ss) { frame1 = "dusk"; frame2 = "night"; mix = (t - ss) / twilight; } }
  else { frame1 = frame2 = "night"; mix = 0; }
  mix = Math.max(0, Math.min(1, mix));

  const kf1 = SKY_KEYFRAMES[frame1], kf2 = SKY_KEYFRAMES[frame2];
  let a = mixRgb(kf1.a, kf2.a, mix), b = mixRgb(kf1.b, kf2.b, mix);
  const cloudFrac = Math.max(0, Math.min(1, (cloudCoverPct || 0) / 100)) * 0.5;
  a = desaturate(a, cloudFrac); b = desaturate(b, cloudFrac);
  return `linear-gradient(135deg, ${toRgbStr(a)}, ${toRgbStr(b)})`;
}

function renderHero() {
  const { current, hourly, daily } = state.forecast;
  const idx = state.nowHourlyIdx;
  const todayIdx = todayDailyIndex(daily);
  const sunrise = new Date(daily.sunrise[todayIdx]), sunset = new Date(daily.sunset[todayIdx]);
  const now = new Date(current.time);

  const card = $("#hero-card");
  card.style.setProperty("--hero-bg", skyGradient(now, sunrise, sunset, current.cloud_cover));
  $("#hero-icon").innerHTML = weatherIconSVG(current.weather_code, current.is_day);
  $("#hero-temp").textContent = fmt(current.temperature_2m, 1);
  $("#hero-temp").style.setProperty("--temp-weight", tempToWeight(current.temperature_2m));
  $("#hero-condition").textContent = weatherConditionLabel(current.weather_code);
  $("#hero-feels").textContent = `Feels like ${fmt(current.apparent_temperature, 1)}°C · Dew point ${fmt(current.dew_point_2m, 1)}°C`;

  // A small, always-current confirmation of which city this card describes — separate from
  // the search bar, which is mid-typing/ambiguous while the user is actively searching.
  const cityEl = $("#hero-city");
  if (cityEl) cityEl.textContent = state.city.country ? `${state.city.name}, ${state.city.country}` : state.city.name;
  const landmarkEl = $("#hero-landmark");
  if (landmarkEl) landmarkEl.innerHTML = landmarkSVG(state.city);

  const weatherTime = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  $("#hero-updated").textContent = `AS OF ${weatherTime}`;
  const r24temp = last24hRange(hourly, idx, "temperature_2m");
  $("#hero-range").textContent = r24temp ? `24H ${fmt(r24temp.min, 1)}–${fmt(r24temp.max, 1)}°C` : "";

  renderHeroAqiChip();
}

// Item 2: AQI belongs on the front page, not buried at the bottom — value, category, and
// dominant pollutant sit right in the hero next to temperature.
function renderHeroAqiChip() {
  const chip = $("#hero-aqi-chip");
  if (!chip) return;
  const aq = state.aq ? state.aq.current : null;
  if (!aq) { chip.innerHTML = ""; chip.hidden = true; return; }
  const overall = cpcbOverall(aq);
  if (!overall) { chip.hidden = true; return; }
  chip.hidden = false;
  const cat = cpcbCategoryForAqi(overall.aqi);
  chip.innerHTML = `<span class="chip-badge" style="background:var(--${cat.token});color:var(--${cat.token}-ink)">${overall.aqi}</span>` +
    `<span>AQI · ${cat.name} · ${POLLUTANT_LABELS[overall.dominant]} dominant</span>`;
}

function last24hSeries(hourly, idx, key) {
  return hourly[key].slice(Math.max(0, idx - 23), idx + 1);
}

function renderNowStats() {
  const { current, hourly, daily } = state.forecast;
  const idx = state.nowHourlyIdx;
  const todayIdx = todayDailyIndex(daily);
  const grid = $("#now-stats");
  grid.innerHTML = "";

  grid.appendChild(statCard("Dew Point", `${fmt(current.dew_point_2m, 1)}<span class="unit">°C</span>`,
    "Condensation threshold", "area-dew",
    sparklineSVG(last24hSeries(hourly, idx, "dew_point_2m"), { color: "var(--accent)" })));

  const r24hum = last24hRange(hourly, idx, "relative_humidity_2m");
  grid.appendChild(statCard("Humidity", `${fmt(current.relative_humidity_2m, 0)}<span class="unit">%</span>`,
    r24hum ? `24H range ${fmt(r24hum.min, 0)}–${fmt(r24hum.max, 0)}%` : "", "area-humid",
    sparklineSVG(last24hSeries(hourly, idx, "relative_humidity_2m"), { color: "var(--accent)" })));

  const pt = pressureTrend(hourly, idx);
  const arrowGlyph = pt.dir === "rising" ? "▲" : pt.dir === "falling" ? "▼" : "→";
  const arrowClass = pt.dir === "rising" ? "up" : pt.dir === "falling" ? "down" : "";
  grid.appendChild(statCard("Pressure", `${fmt(current.pressure_msl, 1)}<span class="unit">hPa</span><span class="arrow ${arrowClass}">${arrowGlyph}</span>`,
    `3h trend: <span class="accent">${pt.dir}</span> ${fmt(Math.abs(pt.delta), 1)} hPa`, "area-pressure",
    sparklineSVG(last24hSeries(hourly, idx, "pressure_msl"), { color: "var(--accent)" })));

  const windArrow = `<svg class="vec" width="14" height="14" viewBox="0 0 12 12" style="transform:rotate(${current.wind_direction_10m}deg)"><path d="M6 1 L9 8 L6 6 L3 8 Z" fill="currentColor"/></svg>`;
  grid.appendChild(statCard("Wind", `${fmt(current.wind_speed_10m, 1)}<span class="unit">km/h</span>${windArrow}`,
    `From ${fmt(current.wind_direction_10m, 0)}° ${degToCompass(current.wind_direction_10m)} · gusts ${fmt(current.wind_gusts_10m, 1)} km/h`, "area-wind",
    sparklineSVG(last24hSeries(hourly, idx, "wind_speed_10m"), { color: "var(--accent)", width: 220 })));

  const vis = hourly.visibility[idx];
  grid.appendChild(statCard("Visibility", vis != null ? `${fmt(vis / 1000, 1)}<span class="unit">km</span>` : "—", "Cloud cover " + fmt(current.cloud_cover, 0) + "%", "area-vis"));

  grid.appendChild(statCard("UV Index", `${fmt(current.uv_index, 1)}`, `<span class="accent">${uvBand(current.uv_index)}</span>`, "area-uv",
    sparklineSVG(last24hSeries(hourly, idx, "uv_index"), { color: "var(--accent)" })));

  const todayPrecip = daily.precipitation_sum[todayIdx];
  const rainProb = hourly.precipitation_probability[idx];
  grid.appendChild(statCard("Precipitation", `${fmt(current.precipitation, 1)}<span class="unit">mm/hr</span>`,
    `${fmt(rainProb, 0)}% chance next hour · ${fmt(todayPrecip, 1)}mm today`, "area-precip",
    sparklineSVG(last24hSeries(hourly, idx, "precipitation"), { mode: "bars", color: "var(--accent)" })));
}

function renderSunCard() {
  const { current, daily } = state.forecast;
  const todayIdx = todayDailyIndex(daily);
  const sunrise = new Date(daily.sunrise[todayIdx]), sunset = new Date(daily.sunset[todayIdx]);
  const dayLenMs = sunset - sunrise;
  const dayLenH = Math.floor(dayLenMs / 3600000), dayLenM = Math.round((dayLenMs % 3600000) / 60000);
  const moon = moonPhase(new Date());

  const box = $("#sun-body");
  box.innerHTML = "";
  const rows = [
    ["Sunrise", `${pad2(sunrise.getHours())}:${pad2(sunrise.getMinutes())}`],
    ["Sunset", `${pad2(sunset.getHours())}:${pad2(sunset.getMinutes())}`],
    ["Day length", `${dayLenH}h ${dayLenM}m`],
  ];
  rows.forEach(([k, v]) => {
    const row = el("div", "kv-row");
    row.appendChild(el("span", "k", k));
    row.appendChild(el("span", "v num", v));
    box.appendChild(row);
  });
  const moonRow = el("div", "kv-row");
  const moonK = el("span", "k");
  moonK.style.display = "flex"; moonK.style.alignItems = "center"; moonK.style.gap = "8px";
  moonK.innerHTML = moonPhaseSVG(moon.frac, 20);
  moonK.appendChild(document.createTextNode("Moon"));
  moonRow.appendChild(moonK);
  moonRow.appendChild(el("span", "v", moon.name));
  box.appendChild(moonRow);
}

function renderAqiCard() {
  const box = $("#aqi-body");
  box.innerHTML = "";
  const aq = state.aq ? state.aq.current : null;
  if (!aq) {
    box.appendChild(buildErrorCard("Air quality feed unavailable.", () => scheduleFeedRetry("aq", true)));
    return;
  }
  const overall = cpcbOverall(aq);
  const cat = overall ? cpcbCategoryForAqi(overall.aqi) : null;
  // Item 9: tint the card 6% toward the current AQI category's semantic color, transitioning
  // over 2s (see .area-aqi in style.css); reset to the neutral card color if data is missing.
  const card = $("#aqi-card");
  if (card) card.style.setProperty("--aqi-tint", cat ? `var(--${cat.token})` : "transparent");
  if (overall && cat) {
    const badge = el("div", "aqi-badge num", String(overall.aqi));
    badge.style.background = `var(--${cat.token})`;
    badge.style.color = `var(--${cat.token}-ink)`;
    box.appendChild(badge);
    const pill = el("span", "aqi-band-pill", cat.name);
    pill.style.background = `var(--${cat.token})`;
    pill.style.color = `var(--${cat.token}-ink)`;
    box.appendChild(pill);
    box.appendChild(el("p", "aqi-dominant", `Dominant pollutant: ${POLLUTANT_LABELS[overall.dominant]}`));
    box.appendChild(el("p", "aqi-advisory", CPCB_ADVISORY[CPCB_CATEGORIES.indexOf(cat)]));
  }
  const sub = el("div", "kv-row");
  sub.style.marginTop = "14px";
  sub.appendChild(el("span", "k", "PM2.5"));
  sub.appendChild(el("span", "v num", fmt(aq.pm2_5, 0) + " µg/m³"));
  box.appendChild(sub);
}

function pollutantRow(label, key, val, unit, ref) {
  const sub = cpcbSubIndex(key, key === "co" ? (val != null ? val / 1000 : null) : val);
  const cat = sub != null ? cpcbCategoryForAqi(sub) : null;
  const row = el("div", "pollutant-row");
  row.title = `${label}: ${fmt(val, 1)} ${unit}` + (cat ? ` — ${cat.name} (CPCB sub-index ${sub})` : "");
  const top = el("div", "kv-row");
  const k = el("span", "k");
  k.innerHTML = `${label}` + (cat ? `<span class="pollutant-cat" style="background:var(--${cat.token});color:var(--${cat.token}-ink)">${cat.name}</span>` : "");
  top.appendChild(k);
  top.appendChild(el("span", "v num", fmt(val, 1) + " " + unit));
  row.appendChild(top);
  const track = el("div", "pollutant-track");
  const fill = el("div", "pollutant-fill");
  fill.style.background = cat ? `var(--${cat.token})` : "var(--accent)";
  track.appendChild(fill);
  row.appendChild(track);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.width = val != null ? Math.min(100, (val / ref) * 100) + "%" : "0%";
  }));
  return row;
}

function renderAqiDetail() {
  const box = $("#aqi-detail-box");
  box.innerHTML = "";
  const aq = state.aq ? state.aq.current : null;
  if (!aq) {
    box.appendChild(buildErrorCard("Air quality feed unavailable.", () => scheduleFeedRetry("aq", true)));
    return;
  }
  const overall = cpcbOverall(aq);
  const cat = overall ? cpcbCategoryForAqi(overall.aqi) : null;
  if (overall && cat) {
    const head = el("div", "kv-row");
    const badge = el("span", "aqi-badge num", String(overall.aqi));
    badge.style.background = `var(--${cat.token})`;
    badge.style.color = `var(--${cat.token}-ink)`;
    head.appendChild(badge);
    const pill = el("span", "aqi-band-pill", cat.name);
    pill.style.background = `var(--${cat.token})`;
    pill.style.color = `var(--${cat.token}-ink)`;
    head.appendChild(pill);
    box.appendChild(head);
    box.appendChild(el("p", "aqi-dominant", `Dominant pollutant: ${POLLUTANT_LABELS[overall.dominant]} (drives the overall reading)`));
    box.appendChild(el("p", "aqi-advisory", CPCB_ADVISORY[CPCB_CATEGORIES.indexOf(cat)]));
  }

  const pollutants = el("div", "pollutant-list");
  pollutants.appendChild(pollutantRow("PM2.5", "pm2_5", aq.pm2_5, "µg/m³", 250));
  pollutants.appendChild(pollutantRow("PM10", "pm10", aq.pm10, "µg/m³", 430));
  pollutants.appendChild(pollutantRow("NO₂", "no2", aq.nitrogen_dioxide, "µg/m³", 400));
  pollutants.appendChild(pollutantRow("SO₂", "so2", aq.sulphur_dioxide, "µg/m³", 800));
  pollutants.appendChild(pollutantRow("O₃", "o3", aq.ozone, "µg/m³", 400));
  pollutants.appendChild(pollutantRow("CO", "co", aq.carbon_monoxide, "µg/m³", 17000));
  box.appendChild(pollutants);

  const note = el("p", "panel-note", "Source: Open-Meteo Air Quality API — a modeled (CAMS) estimate, not a ground-station reading. Sub-index bars use CPCB National AQI (2014) breakpoints; category labels are shown alongside color, never color alone.");
  note.style.marginTop = "12px";
  box.appendChild(note);

  renderCityPointsTable();
}

// Item 3 "multiple stations" — see fetchCityPointsAqi(): honestly labeled multi-point
// modeled data, not real monitoring stations (Open-Meteo has no such API, and this project
// doesn't introduce a keyed provider to get one).
function renderCityPointsTable() {
  const box = $("#aqi-detail-box");
  const wrap = el("div");
  wrap.style.marginTop = "16px";
  wrap.appendChild(el("h3", "eyebrow", "Around the City"));
  const note = el("p", "panel-note", `Modeled (CAMS) estimates at 4 points around ${state.city.name} — not independent ground monitoring stations.`);
  wrap.appendChild(note);
  const tableWrap = el("div");
  const table = document.createElement("table");
  table.className = "station-table";
  table.innerHTML = `<thead><tr><th>Location</th><th>AQI</th><th>Category</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);
  box.appendChild(wrap);

  fetchCityPointsAqi().then((points) => {
    tbody.innerHTML = "";
    points.forEach((p) => {
      const tr = document.createElement("tr");
      if (!p.data) {
        tr.innerHTML = `<td>${p.name}</td><td colspan="2" class="num-col">—</td>`;
        tbody.appendChild(tr);
        return;
      }
      const overall = cpcbOverall(p.data);
      const cat = overall ? cpcbCategoryForAqi(overall.aqi) : null;
      const td1 = el("td", null, p.name);
      const td2 = el("td", "num num-col", overall ? String(overall.aqi) : "—");
      const td3 = document.createElement("td");
      if (cat) {
        const pill = el("span", "pollutant-cat", cat.name);
        pill.style.background = `var(--${cat.token})`; pill.style.color = `var(--${cat.token}-ink)`;
        td3.appendChild(pill);
      } else {
        td3.textContent = "—";
      }
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbody.appendChild(tr);
    });
  }).catch(() => { tbody.innerHTML = `<tr><td colspan="3">Unavailable</td></tr>`; });
}

/* ============================== AQI FORECAST CHART ============================== */
function renderAqiForecastChart() {
  const root = $("#chart-aqi-forecast");
  if (!root) return;
  const hourly = state.aq && state.aq.hourly;
  if (!hourly || !hourly.time) {
    root.innerHTML = "";
    root.appendChild(buildErrorCard("Air quality forecast unavailable.", () => scheduleFeedRetry("aq", true)));
    return;
  }
  const nowT = state.aq.current ? new Date(state.aq.current.time) : new Date();
  const series = hourly.time.map((t, i) => {
    const overall = cpcbOverall({
      pm2_5: hourly.pm2_5[i], pm10: hourly.pm10[i],
      nitrogen_dioxide: hourly.nitrogen_dioxide[i], sulphur_dioxide: hourly.sulphur_dioxide[i],
      ozone: hourly.ozone[i], carbon_monoxide: hourly.carbon_monoxide[i],
    });
    return { x: new Date(t), y: overall ? overall.aqi : null };
  }).filter((p) => p.x.getTime() >= nowT.getTime() - 3600000);
  drawLineChart(root, {
    ariaLabel: "CPCB AQI, next 72 hours",
    height: 180,
    xTickFmt: (d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + pad2(d.getHours()) + ":00",
    nowX: nowT,
    yUnit: " AQI",
    fill: true,
    series: [{ data: series, className: "series-a", label: "CPCB AQI", directLabel: true }],
  });
}

function flashUpdated() {
  document.querySelectorAll(".s-value, .hero-temp").forEach((v) => {
    v.classList.add("fade");
    setTimeout(() => v.classList.remove("fade"), 320);
  });
  const heroTemp = $(".hero-temp");
  if (heroTemp) {
    heroTemp.classList.add("kinetic");
    setTimeout(() => heroTemp.classList.remove("kinetic"), 950);
  }
}

/* ============================== GENERIC CHART ============================== */
function drawLineChart(root, opts) {
  const { series, height = 200, yUnit = "", xTickFmt, yDomain, nowX } = opts;
  root.innerHTML = "";
  const width = root.clientWidth || 480;
  const mL = 42, mR = 14, mT = 14, mB = 22;

  const allPts = series.flatMap((s) => s.data);
  if (!allPts.length) {
    root.appendChild(el("p", "chart-empty", "No data available."));
    return;
  }
  const xs = allPts.map((p) => p.x.getTime());
  const ys = allPts.map((p) => p.y).filter((v) => v != null);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin, yMax;
  if (yDomain) { [yMin, yMax] = yDomain; }
  else {
    const rawMin = Math.min(...ys), rawMax = Math.max(...ys);
    const pad = (rawMax - rawMin) * 0.12 || 1;
    yMin = rawMin - pad; yMax = rawMax + pad;
  }

  const sx = (t) => mL + (t - xMin) / ((xMax - xMin) || 1) * (width - mL - mR);
  const sy = (v) => height - mB - (v - yMin) / ((yMax - yMin) || 1) * (height - mT - mB);

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "chart-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", opts.ariaLabel || "Chart");

  const defs = document.createElementNS(svgNS, "defs");
  const grad = document.createElementNS(svgNS, "linearGradient");
  grad.setAttribute("id", "sparkFillGrad"); grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
  grad.innerHTML = `<stop offset="0%" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>`;
  defs.appendChild(grad);
  svg.appendChild(defs);

  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const v = yMin + (yMax - yMin) * i / gridCount;
    const y = sy(v);
    const gl = document.createElementNS(svgNS, "line");
    gl.setAttribute("x1", mL); gl.setAttribute("x2", width - mR);
    gl.setAttribute("y1", y); gl.setAttribute("y2", y);
    gl.setAttribute("class", "grid-line");
    svg.appendChild(gl);
    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", mL - 6); lbl.setAttribute("y", y + 3);
    lbl.setAttribute("class", "axis-lbl"); lbl.setAttribute("text-anchor", "end");
    lbl.textContent = fmt(v, Math.abs(yMax - yMin) < 5 ? 1 : 0);
    svg.appendChild(lbl);
  }

  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const t = xMin + (xMax - xMin) * i / tickCount;
    const x = sx(t);
    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", x); lbl.setAttribute("y", height - 6);
    lbl.setAttribute("class", "axis-lbl");
    lbl.setAttribute("text-anchor", i === 0 ? "start" : i === tickCount ? "end" : "middle");
    lbl.textContent = xTickFmt ? xTickFmt(new Date(t)) : new Date(t).toLocaleDateString();
    svg.appendChild(lbl);
  }

  if (nowX != null) {
    const x = sx(nowX.getTime());
    const nl = document.createElementNS(svgNS, "line");
    nl.setAttribute("x1", x); nl.setAttribute("x2", x);
    nl.setAttribute("y1", mT); nl.setAttribute("y2", height - mB);
    nl.setAttribute("class", "now-line");
    svg.appendChild(nl);
  }

  const pendingLabels = [];
  series.forEach((s) => {
    const pts = s.data.filter((p) => p.y != null);
    if (!pts.length) return;
    if (opts.fill && s.className === "series-a") {
      const fillD = `M ${sx(pts[0].x.getTime())} ${sy(yMin)} ` +
        pts.map((p) => `L ${sx(p.x.getTime())} ${sy(p.y)}`).join(" ") +
        ` L ${sx(pts[pts.length - 1].x.getTime())} ${sy(yMin)} Z`;
      const fillPath = document.createElementNS(svgNS, "path");
      fillPath.setAttribute("d", fillD);
      fillPath.setAttribute("class", "fill-a");
      svg.appendChild(fillPath);
    }
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x.getTime())} ${sy(p.y)}`).join(" ");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", s.className || "series-a");
    svg.appendChild(path);
    if (s.directLabel) {
      const last = pts[pts.length - 1];
      pendingLabels.push({ x: Math.min(sx(last.x.getTime()) + 5, width - mR - 2), y: sy(last.y), text: s.label });
    }
  });
  // Declutter: when two series end close together, their direct labels would otherwise
  // overlap into unreadable text. Nudge them apart vertically, top to bottom.
  pendingLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < pendingLabels.length; i++) {
    const minY = pendingLabels[i - 1].y + 11;
    if (pendingLabels[i].y < minY) pendingLabels[i].y = minY;
  }
  pendingLabels.forEach((lbl) => {
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", lbl.x); t.setAttribute("y", lbl.y + 3);
    t.setAttribute("class", "direct-label");
    t.textContent = lbl.text;
    svg.appendChild(t);
  });

  const crosshair = document.createElementNS(svgNS, "line");
  crosshair.setAttribute("y1", mT); crosshair.setAttribute("y2", height - mB);
  crosshair.setAttribute("class", "crosshair");
  svg.appendChild(crosshair);

  root.appendChild(svg);
  svg.classList.add("draw-in");
  requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add("shown")));
  const tooltip = el("div", "chart-tooltip");
  root.style.position = "relative";
  root.appendChild(tooltip);

  svg.addEventListener("pointermove", (e) => {
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * width;
    const t = xMin + (px - mL) / (width - mL - mR) * (xMax - xMin);
    let nearest = null, bestDiff = Infinity;
    allPts.forEach((p) => { const diff = Math.abs(p.x.getTime() - t); if (diff < bestDiff) { bestDiff = diff; nearest = p; } });
    if (!nearest) return;
    const x = sx(nearest.x.getTime());
    crosshair.setAttribute("x1", x); crosshair.setAttribute("x2", x);
    crosshair.style.opacity = 1;
    const lines = series.map((s) => {
      const p = s.data.find((pt) => pt.x.getTime() === nearest.x.getTime());
      return p && p.y != null ? `${s.label}: ${fmt(p.y, 1)}${yUnit}` : null;
    }).filter(Boolean);
    tooltip.innerHTML = `${nearest.x.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}<br>` + lines.join("<br>");
    tooltip.style.left = x + "px";
    tooltip.style.top = sy(nearest.y != null ? nearest.y : (yMin + yMax) / 2) + "px";
    tooltip.style.opacity = 1;
  });
  svg.addEventListener("pointerleave", () => { crosshair.style.opacity = 0; tooltip.style.opacity = 0; });
}

/* ============================== 24H TODAY/YESTERDAY/NORMAL CHART ============================== */
function renderTodayChart() {
  const { hourly } = state.forecast;
  const idx = state.nowHourlyIdx;
  const todayDate = new Date(hourly.time[idx]).toDateString();
  const yestDate = addDays(new Date(hourly.time[idx]), -1).toDateString();

  const todaySeries = [], yestSeries = [];
  for (let i = 0; i < hourly.time.length; i++) {
    const d = new Date(hourly.time[i]);
    const hour = d.getHours();
    if (d.toDateString() === todayDate) todaySeries[hour] = { x: new Date(2000, 0, 1, hour), y: hourly.temperature_2m[i], real: d };
    if (d.toDateString() === yestDate) yestSeries[hour] = { x: new Date(2000, 0, 1, hour), y: hourly.temperature_2m[i], real: d };
  }

  let normalSeries = [];
  if (state.historicalDaily) {
    const monthDay = isoDate(new Date()).slice(5);
    const matches = Object.keys(state.historicalDaily).filter((d) => d.slice(5) === monthDay && d.slice(0, 4) !== String(new Date().getFullYear()));
    const meanTemps = matches.map((d) => state.historicalDaily[d].tmean).filter((v) => v != null);
    if (meanTemps.length && yestSeries.filter(Boolean).length) {
      const histAvg = meanTemps.reduce((a, b) => a + b, 0) / meanTemps.length;
      const yestAvg = yestSeries.filter(Boolean).reduce((a, b) => a + b.y, 0) / yestSeries.filter(Boolean).length;
      const offset = histAvg - yestAvg;
      normalSeries = yestSeries.map((p) => p ? { x: p.x, y: p.y + offset } : null).filter(Boolean);
    }
  }

  const nowHour = new Date(hourly.time[idx]).getHours();
  drawLineChart($("#chart-today"), {
    ariaLabel: "24 hour temperature: today vs yesterday vs historical normal",
    height: 220,
    xTickFmt: (d) => pad2(d.getHours()) + ":00",
    nowX: new Date(2000, 0, 1, nowHour),
    yUnit: "°C",
    series: [
      { data: todaySeries.filter(Boolean), className: "series-a", label: "TODAY", directLabel: true },
      { data: yestSeries.filter(Boolean), className: "series-b", label: "YESTERDAY", directLabel: true },
      { data: normalSeries, className: "series-c", label: "NORMAL", directLabel: normalSeries.length > 0 },
    ],
  });
  $("#today-chart-note").textContent = normalSeries.length ? "" : `${HIST_YEARS}Y normal unavailable — insufficient historical match`;
}

/* ============================== TREND SMALL MULTIPLES ============================== */
let trendRange = 7;
function dailySeriesFromHourly(hourly, days, valueKey, agg) {
  const map = {};
  for (let i = 0; i < hourly.time.length; i++) {
    const date = hourly.time[i].slice(0, 10);
    if (!map[date]) map[date] = [];
    const v = hourly[valueKey][i];
    if (v != null) map[date].push(v);
  }
  const today = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const iso = isoDate(d);
    const vals = map[iso] || [];
    if (!vals.length) continue;
    let y;
    if (agg === "sum") y = vals.reduce((a, b) => a + b, 0);
    else if (agg === "max") y = Math.max(...vals);
    else y = vals.reduce((a, b) => a + b, 0) / vals.length;
    out.push({ x: d, y: Math.round(y * 10) / 10 });
  }
  return out;
}

function renderTrendGrid() {
  const { hourly } = state.forecast;
  const grid = $("#trend-grid");
  grid.innerHTML = "";
  const specs = [
    { key: "temperature_2m", agg: "mean", label: "TEMPERATURE, MEAN °C", unit: "°C" },
    { key: "precipitation", agg: "sum", label: "RAINFALL, DAILY TOTAL mm", unit: "mm" },
    { key: "relative_humidity_2m", agg: "mean", label: "HUMIDITY, MEAN %", unit: "%" },
    { key: "pressure_msl", agg: "mean", label: "PRESSURE, MEAN hPa", unit: "hPa" },
  ];
  specs.forEach((spec) => {
    const box = el("div", "box");
    box.appendChild(el("h3", null, spec.label));
    const chartDiv = el("div", "chart-wrap");
    box.appendChild(chartDiv);
    grid.appendChild(box);
    const data = dailySeriesFromHourly(hourly, trendRange, spec.key, spec.agg);
    drawLineChart(chartDiv, {
      ariaLabel: spec.label,
      height: 140,
      xTickFmt: (d) => (d.getMonth() + 1) + "/" + d.getDate(),
      yUnit: spec.unit,
      series: [{ data, className: "series-a", label: spec.unit }],
    });
  });
}

/* ============================== 48H FORECAST TABLE ============================== */
function renderForecastTable() {
  const { hourly } = state.forecast;
  const idx = state.nowHourlyIdx;
  const tbody = $("#forecast-tbody");
  tbody.innerHTML = "";
  for (let i = idx; i < Math.min(idx + 48, hourly.time.length); i++) {
    const d = new Date(hourly.time[i]);
    const tr = el("tr", i === idx ? "now-row" : "");
    tr.appendChild(el("th", null, `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${pad2(d.getHours())}:00`));
    tr.lastChild.setAttribute("scope", "row");
    tr.appendChild(el("td", "num", fmt(hourly.temperature_2m[i], 1)));
    tr.appendChild(el("td", "num", fmt(hourly.apparent_temperature[i], 1)));
    tr.appendChild(el("td", "num", fmt(hourly.precipitation_probability[i], 0)));
    tr.appendChild(el("td", "num", fmt(hourly.precipitation[i], 1)));
    tr.appendChild(el("td", "num", `${fmt(hourly.wind_speed_10m[i], 1)} ${degToCompass(hourly.wind_direction_10m[i])}`));
    tr.appendChild(el("td", "num", fmt(hourly.relative_humidity_2m[i], 0)));
    tr.appendChild(el("td", "num", fmt(hourly.pressure_msl[i], 1)));
    tbody.appendChild(tr);
  }
}

/* ============================== RECORDS & PERCENTILES ============================== */
function renderRecords() {
  const box = $("#records-box");
  box.innerHTML = "";
  const { daily } = state.forecast;
  const todayHigh = daily.temperature_2m_max[todayDailyIndex(daily)];

  if (!state.historicalDaily) {
    box.appendChild(buildErrorCard("Historical archive unavailable.", () => scheduleFeedRetry("hist", true)));
    return;
  }
  const monthDay = isoDate(new Date()).slice(5);
  const thisYear = String(new Date().getFullYear());
  const matches = Object.entries(state.historicalDaily).filter(([d]) => d.slice(5) === monthDay && d.slice(0, 4) !== thisYear);
  const highs = matches.map(([, v]) => v.tmax).filter((v) => v != null);
  const lows = matches.map(([, v]) => v.tmin).filter((v) => v != null);

  const pct = percentileRank(todayHigh, highs);
  const row1 = el("div", "stat-row");
  row1.appendChild(el("span", "k", `Today's high vs ${highs.length}y same date`));
  row1.appendChild(el("span", "v num", pct != null ? `${pct}TH PCTL` : "—"));
  box.appendChild(row1);
  if (pct != null) {
    const barWrap = el("div", "percentile-bar");
    const fill = el("div", "fill"); fill.style.width = pct + "%";
    barWrap.appendChild(fill);
    const median = el("div", "marker"); median.style.left = "50%"; median.title = "50th percentile (typical)";
    barWrap.appendChild(median);
    box.appendChild(barWrap);

    const rank = highs.filter((h) => h > todayHigh).length + 1;
    const monthDayLabel = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" });
    const totalYears = highs.length + 1;
    box.appendChild(el("p", "pull-quote",
      `Today's high of ${fmt(todayHigh, 1)}°C is the ${ordinal(rank)} hottest ${monthDayLabel} in ${totalYears} years of record.`));
  }

  if (highs.length) {
    const recHigh = Math.max(...highs);
    const recHighYear = matches.find(([, v]) => v.tmax === recHigh)[0].slice(0, 4);
    const recLow = Math.min(...lows);
    const recLowYear = matches.find(([, v]) => v.tmin === recLow)[0].slice(0, 4);
    [
      ["Record high, this date", `${fmt(recHigh, 1)}°C (${recHighYear})`, "temp-hot"],
      ["Record low, this date", `${fmt(recLow, 1)}°C (${recLowYear})`, "temp-cold"],
    ].forEach(([k, v, cls]) => {
      const row = el("div", "stat-row");
      row.appendChild(el("span", "k", k));
      const val = el("span", "v num " + cls, v);
      row.appendChild(val);
      box.appendChild(row);
    });

    const histAvg = highs.reduce((a, b) => a + b, 0) / highs.length;
    const anomaly = todayHigh - histAvg;
    const row = el("div", "stat-row");
    row.appendChild(el("span", "k", `Anomaly vs ${HIST_YEARS}y seasonal norm`));
    const v = el("span", "v num");
    v.innerHTML = `<span class="${anomaly >= 0 ? "temp-hot" : "temp-cold"}">${anomaly >= 0 ? "+" : ""}${fmt(anomaly, 1)}°C</span>`;
    row.appendChild(v);
    box.appendChild(row);
  }

  const now = new Date();
  const monthPrefix = thisYear + "-" + pad2(now.getMonth() + 1);
  const monthEntries = Object.entries(state.historicalDaily).filter(([d]) => d.startsWith(monthPrefix));
  const yearEntries = Object.entries(state.historicalDaily).filter(([d]) => d.startsWith(thisYear));
  function extreme(entries, key, mode) {
    const withVal = entries.filter(([, v]) => v[key] != null);
    if (!withVal.length) return null;
    return withVal.reduce((best, cur) => (mode === "max" ? cur[1][key] > best[1][key] : cur[1][key] < best[1][key]) ? cur : best);
  }
  const hottestMonth = extreme(monthEntries, "tmax", "max");
  const coldestMonth = extreme(monthEntries, "tmin", "min");
  const wettestMonth = extreme(monthEntries, "precip", "max");
  const hottestYear = extreme(yearEntries, "tmax", "max");
  const coldestYear = extreme(yearEntries, "tmin", "min");
  const wettestYear = extreme(yearEntries, "precip", "max");

  [
    ["Hottest day this month", hottestMonth ? `${fmt(hottestMonth[1].tmax, 1)}°C (${hottestMonth[0].slice(8)})` : "—"],
    ["Coldest day this month", coldestMonth ? `${fmt(coldestMonth[1].tmin, 1)}°C (${coldestMonth[0].slice(8)})` : "—"],
    ["Wettest day this month", wettestMonth ? `${fmt(wettestMonth[1].precip, 1)}mm (${wettestMonth[0].slice(8)})` : "—"],
    ["Hottest day this year", hottestYear ? `${fmt(hottestYear[1].tmax, 1)}°C (${hottestYear[0].slice(5)})` : "—"],
    ["Coldest day this year", coldestYear ? `${fmt(coldestYear[1].tmin, 1)}°C (${coldestYear[0].slice(5)})` : "—"],
    ["Wettest day this year", wettestYear ? `${fmt(wettestYear[1].precip, 1)}mm (${wettestYear[0].slice(5)})` : "—"],
  ].forEach(([k, v]) => {
    const row = el("div", "stat-row");
    row.appendChild(el("span", "k", k));
    row.appendChild(el("span", "v num", v));
    box.appendChild(row);
  });
}

/* ============================== RAINFALL ACCOUNTING ============================== */
function renderRainfall() {
  const box = $("#rainfall-box");
  box.innerHTML = "";
  if (!state.historicalDaily) {
    box.appendChild(buildErrorCard("Historical archive unavailable.", () => scheduleFeedRetry("hist", true)));
    return;
  }
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth(), dom = now.getDate(), doy = dayOfYear(now);

  let mtdActual = 0, ytdActual = 0;
  for (const [date, v] of Object.entries(state.historicalDaily)) {
    const d = new Date(date);
    if (d.getFullYear() === year) {
      if (v.precip != null) ytdActual += v.precip;
      if (d.getMonth() === month) mtdActual += v.precip || 0;
    }
  }

  const years = new Set(Object.keys(state.historicalDaily).map((d) => d.slice(0, 4)).filter((y) => y !== String(year)));
  let mtdNormalSum = 0, mtdNormalCount = 0, ytdNormalSum = 0, ytdNormalCount = 0;
  years.forEach((y) => {
    let mSum = 0, mHas = false, ySum = 0, yHas = false;
    for (const [date, v] of Object.entries(state.historicalDaily)) {
      if (!date.startsWith(y)) continue;
      const d = new Date(date);
      if (d.getMonth() === month && d.getDate() <= dom) { mSum += v.precip || 0; mHas = true; }
      if (dayOfYear(d) <= doy) { ySum += v.precip || 0; yHas = true; }
    }
    if (mHas) { mtdNormalSum += mSum; mtdNormalCount++; }
    if (yHas) { ytdNormalSum += ySum; ytdNormalCount++; }
  });
  const mtdNormal = mtdNormalCount ? mtdNormalSum / mtdNormalCount : null;
  const ytdNormal = ytdNormalCount ? ytdNormalSum / ytdNormalCount : null;

  function bullet(label, actual, normal) {
    const wrap = el("div", "bullet");
    const row = el("div", "row");
    row.appendChild(el("span", null, label));
    const delta = normal != null ? actual - normal : null;
    const deltaTxt = delta != null ? `${delta >= 0 ? "+" : ""}${fmt(delta, 0)}mm vs normal` : "";
    row.appendChild(el("span", "num", `${fmt(actual, 0)}mm ${deltaTxt}`));
    wrap.appendChild(row);
    const track = el("div", "track");
    const maxScale = Math.max(actual, normal || 0, 1) * 1.2;
    const bar = el("div", "actual"); bar.style.width = Math.min(100, (actual / maxScale) * 100) + "%";
    track.appendChild(bar);
    if (normal != null) {
      const mark = el("div", "normal-mark"); mark.style.left = Math.min(100, (normal / maxScale) * 100) + "%";
      track.appendChild(mark);
    }
    wrap.appendChild(track);
    box.appendChild(wrap);
  }
  bullet("Month-to-date", mtdActual, mtdNormal);
  bullet("Year-to-date", ytdActual, ytdNormal);
  const note = el("div", "panel-note", `Normal = ${years.size}-year average for the equivalent period. Accent mark = normal.`);
  note.style.marginTop = "6px";
  box.appendChild(note);

  let rainyDaysActual = 0;
  for (let d = 1; d <= dom; d++) {
    const v = state.historicalDaily[`${year}-${pad2(month + 1)}-${pad2(d)}`];
    if (v && v.precip > 0.1) rainyDaysActual++;
  }
  let rainyNormalSum = 0, rainyNormalCount = 0;
  years.forEach((y) => {
    let count = 0, has = false;
    for (let d = 1; d <= dom; d++) {
      const v = state.historicalDaily[`${y}-${pad2(month + 1)}-${pad2(d)}`];
      if (v) { has = true; if (v.precip > 0.1) count++; }
    }
    if (has) { rainyNormalSum += count; rainyNormalCount++; }
  });
  const rainyNormal = rainyNormalCount ? rainyNormalSum / rainyNormalCount : null;

  const rainyRow = el("div", "stat-row");
  rainyRow.style.marginTop = "16px";
  rainyRow.appendChild(el("span", "k", "Rainy days this month"));
  const rainyVal = el("span", "v num");
  rainyVal.innerHTML = `${rainyDaysActual}${rainyNormal != null ? ` <span class="panel-note" style="display:inline">(avg ${fmt(rainyNormal, 1)})</span>` : ""}`;
  rainyRow.appendChild(rainyVal);
  box.appendChild(rainyRow);

  const sortedDates = Object.keys(state.historicalDaily).filter((d) => new Date(d) <= now).sort();
  let streak = 0, streakWet = null;
  for (let i = sortedDates.length - 1; i >= 0; i--) {
    const v = state.historicalDaily[sortedDates[i]];
    if (v.precip == null) break;
    const isWet = v.precip > 0.1;
    if (streakWet === null) { streakWet = isWet; streak = 1; }
    else if (isWet === streakWet) streak++;
    else break;
  }
  if (streak > 0) {
    const streakRow = el("div", "stat-row");
    streakRow.appendChild(el("span", "k", "Current streak"));
    streakRow.appendChild(el("span", "v num", `${streak} day${streak === 1 ? "" : "s"} ${streakWet ? "wet" : "dry"}`));
    box.appendChild(streakRow);
  }

  if (mtdNormal) {
    const pctVsNormal = Math.round(((mtdActual - mtdNormal) / mtdNormal) * 100);
    const monthName = now.toLocaleDateString(undefined, { month: "long" });
    box.appendChild(el("p", "pull-quote",
      `This month's rainfall is ${Math.abs(pctVsNormal)}% ${pctVsNormal >= 0 ? "above" : "below"} normal for ${monthName} so far.`));
  }
}

/* ============================== CALENDAR HEATMAP ============================== */
// Diverging cold(blue)->neutral->hot(red) scale for the month's own range, using the same
// theme-aware temp-cold/temp-hot tokens as the Records panel — one consistent heat language.
function heatColorForMonth(t, lo, hi) {
  const cold = getComputedStyle(document.documentElement).getPropertyValue("--temp-cold").trim() || "#6D9BFF";
  const hot = getComputedStyle(document.documentElement).getPropertyValue("--temp-hot").trim() || "#FF7A6E";
  const mid = isDarkTheme() ? "rgb(150,152,165)" : "rgb(190,190,196)";
  const frac = Math.max(0, Math.min(1, (t - lo) / ((hi - lo) || 1)));
  const parse = (c) => {
    if (c.startsWith("#")) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  };
  const mix = (c1, c2, f) => c1.map((v, i) => Math.round(v + (c2[i] - v) * f));
  const c1 = parse(cold), c2 = parse(mid), c3 = parse(hot);
  const rgb = frac < 0.5 ? mix(c1, c2, frac / 0.5) : mix(c2, c3, (frac - 0.5) / 0.5);
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function renderCalendar() {
  const box = $("#calendar-box");
  box.innerHTML = "";
  if (!state.historicalDaily) { box.appendChild(buildErrorCard("Historical data unavailable.", () => scheduleFeedRetry("hist", true))); return; }
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  const monthVals = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const v = state.historicalDaily[iso];
    if (v && v.tmean != null) monthVals.push(v.tmean);
  }
  const vMin = monthVals.length ? Math.min(...monthVals) : 20, vMax = monthVals.length ? Math.max(...monthVals) : 30;
  const colorFor = (t) => heatColorForMonth(t, vMin, vMax);

  const todayNum = now.getDate();
  let hasForecastCell = false;
  const grid = el("div", "cal-grid");
  ["S", "M", "T", "W", "T", "F", "S"].forEach((d) => grid.appendChild(el("div", "cal-cell empty", d)));
  for (let i = 0; i < firstDow; i++) grid.appendChild(el("div", "cal-cell empty"));
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const v = state.historicalDaily[iso];
    const isFuture = day > todayNum;
    const cell = el("div", "cal-cell" + (day === todayNum ? " today" : ""));
    if (v && v.tmean != null) {
      cell.style.background = colorFor(v.tmean);
      cell.textContent = day;
      if (isFuture) {
        cell.classList.add("forecast");
        cell.title = `${iso}: forecast mean ${fmt(v.tmean, 1)}°C`;
        hasForecastCell = true;
      } else {
        cell.title = `${iso}: mean ${fmt(v.tmean, 1)}°C`;
      }
    } else {
      cell.classList.add("placeholder");
      cell.textContent = day;
      cell.title = `${iso}: no data yet`;
    }
    grid.appendChild(cell);
  }
  box.appendChild(grid);
  const legend = el("div", "cal-legend");
  legend.innerHTML = `<span>${fmt(vMin, 0)}°C</span>` +
    [0, 0.25, 0.5, 0.75, 1].map((f) => `<span class="sw" style="background:${colorFor(vMin + f * (vMax - vMin))}"></span>`).join("") +
    `<span>${fmt(vMax, 0)}°C</span>` +
    (hasForecastCell ? `<span class="cal-legend-note">◌ dashed = forecast, not yet observed</span>` : "");
  box.appendChild(legend);
}

/* ============================== WIND ROSE ============================== */
function renderWindRose() {
  const box = $("#windrose-box");
  box.innerHTML = "";
  const { hourly } = state.forecast;
  const idx = state.nowHourlyIdx;
  const start = Math.max(0, idx - 24 * 7);
  const dirs = hourly.wind_direction_10m.slice(start, idx + 1);
  const speeds = hourly.wind_speed_10m.slice(start, idx + 1);

  const buckets = 16;
  const speedBands = [{ max: 10, label: "0–10" }, { max: 20, label: "10–20" }, { max: 30, label: "20–30" }, { max: Infinity, label: "30+" }];
  const data = Array.from({ length: buckets }, () => speedBands.map(() => 0));
  for (let i = 0; i < dirs.length; i++) {
    if (dirs[i] == null || speeds[i] == null) continue;
    const b = Math.round(dirs[i] / (360 / buckets)) % buckets;
    const bandIdx = speedBands.findIndex((sb) => speeds[i] <= sb.max);
    data[b][bandIdx]++;
  }
  const total = dirs.filter((d) => d != null).length || 1;

  const size = 220, cx = size / 2, cy = size / 2, maxR = size / 2 - 26;
  const maxCount = Math.max(...data.map((b) => b.reduce((a, c) => a + c, 0)), 1);

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", size); svg.setAttribute("height", size);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Wind rose, last 7 days");

  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", maxR * f);
    c.setAttribute("fill", "none"); c.setAttribute("class", "radar-ring");
    svg.appendChild(c);
  });
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 - 90) * Math.PI / 180;
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", cx); line.setAttribute("y1", cy);
    line.setAttribute("x2", cx + Math.cos(angle) * maxR); line.setAttribute("y2", cy + Math.sin(angle) * maxR);
    line.setAttribute("class", "radar-spoke");
    svg.appendChild(line);
  }
  ["N", "E", "S", "W"].forEach((label, i) => {
    const angle = (i * 90 - 90) * Math.PI / 180;
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", cx + Math.cos(angle) * (maxR + 13));
    t.setAttribute("y", cy + Math.sin(angle) * (maxR + 13) + 4);
    t.setAttribute("class", "radar-compass"); t.setAttribute("text-anchor", "middle");
    t.textContent = label;
    svg.appendChild(t);
  });

  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#8B8FF0";
  const shades = [0.35, 0.55, 0.75, 1].map((a) => `color-mix(in srgb, ${accent} ${a * 100}%, transparent)`);
  for (let b = 0; b < buckets; b++) {
    let acc = 0;
    const angleStart = (b * (360 / buckets) - 90 - (360 / buckets) / 2) * Math.PI / 180;
    const angleEnd = (b * (360 / buckets) - 90 + (360 / buckets) / 2) * Math.PI / 180;
    for (let s = 0; s < speedBands.length; s++) {
      const count = data[b][s];
      if (!count) continue;
      const r0 = (acc / maxCount) * maxR;
      const r1 = ((acc + count) / maxCount) * maxR;
      acc += count;
      const path = document.createElementNS(svgNS, "path");
      const p1 = [cx + Math.cos(angleStart) * r0, cy + Math.sin(angleStart) * r0];
      const p2 = [cx + Math.cos(angleStart) * r1, cy + Math.sin(angleStart) * r1];
      const p3 = [cx + Math.cos(angleEnd) * r1, cy + Math.sin(angleEnd) * r1];
      const p4 = [cx + Math.cos(angleEnd) * r0, cy + Math.sin(angleEnd) * r0];
      path.setAttribute("d", `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} L ${p4[0]} ${p4[1]} Z`);
      path.setAttribute("fill", shades[s]);
      path.setAttribute("stroke", "var(--card)");
      path.setAttribute("stroke-width", "1");
      path.setAttribute("class", "rose-petal");
      path.style.transitionDelay = (b * 0.025) + "s";
      const pct = Math.round((count / total) * 1000) / 10;
      const t = document.createElementNS(svgNS, "title");
      t.textContent = `${degToCompass(b * (360 / buckets))}, ${speedBands[s].label} km/h: ${pct}%`;
      path.appendChild(t);
      svg.appendChild(path);
    }
  }

  const wrap = el("div", "windrose-wrap");
  wrap.appendChild(svg);
  const legend = el("div", "windrose-legend");
  speedBands.forEach((sb, i) => {
    const row = el("div");
    row.innerHTML = `<span class="sw" style="background:${shades[i]}"></span>${sb.label} km/h`;
    legend.appendChild(row);
  });
  wrap.appendChild(legend);
  box.appendChild(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("grown")));
}

/* ============================== COMFORT METRICS ============================== */
function renderComfort() {
  const grid = $("#comfort-grid");
  grid.innerHTML = "";
  const { current } = state.forecast;
  const hi = heatIndexC(current.temperature_2m, current.relative_humidity_2m);
  const wb = wetBulbC(current.temperature_2m, current.relative_humidity_2m);
  const di = dryingIndex(current.temperature_2m, current.dew_point_2m, current.wind_speed_10m);

  const items = [
    { label: "HEAT INDEX", value: hi != null ? `${fmt(hi, 1)}°C` : "N/A", formula: "NWS Rothfusz regression. Valid ≥27°C." },
    { label: "WET-BULB TEMPERATURE", value: wb != null ? `${fmt(wb, 1)}°C` : "N/A", formula: "Stull (2011) empirical approximation." },
    { label: "DRYING INDEX", value: di != null ? fmt(di, 1) : "N/A", formula: "(T − dew point) × (1 + wind/20). Unitless, custom composite — higher = faster drying." },
  ];
  items.forEach((it) => {
    const box = el("div", "box");
    const item = el("div", "comfort-item");
    item.appendChild(el("div", "t-label", it.label));
    item.appendChild(el("div", "cv num", it.value));
    item.appendChild(el("div", "cf", it.formula));
    box.appendChild(item);
    grid.appendChild(box);
  });
}

/* ============================== STATUS / FOOTER ============================== */
let refreshTimer = null, countdownTimer = null, nextRefreshAt = null;

function setStatus(text, staleFlag) {
  $("#status-text").textContent = text;
  $("#status-dot").classList.toggle("stale", !!staleFlag);
}

function startCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const remain = Math.max(0, nextRefreshAt - Date.now());
    const m = Math.floor(remain / 60000), s = Math.floor((remain % 60000) / 1000);
    setStatus(`Updated ${state.lastLoad ? Math.round((Date.now() - state.lastLoad) / 60000) : 0}m ago · next in ${m}:${pad2(s)}`);
  }, 1000);
}

function renderFooter() {
  $("#footer").innerHTML =
    `Weather &amp; forecast: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo Forecast API</a>. ` +
    `Air quality: <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener">Open-Meteo Air Quality API</a> (US AQI + pollutants, CAMS model — not ground-station); AQI category shown on this page uses <a href="https://cpcb.nic.in/displaypdf.php?id=aXRzZW5hL0FpcnF1YWxpdHkvTkFRSV9SZXBvcnRfMTQtMDktMjAxNC5wZGY=" target="_blank" rel="noopener">CPCB National AQI (2014)</a> breakpoints. ` +
    `Historical records &amp; normals: <a href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noopener">Open-Meteo Historical Weather API</a>, ${HIST_YEARS} years, cached 24h in your browser. ` +
    `City search: <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noopener">Open-Meteo Geocoding API</a>. ` +
    `"Use my location" resolves your coordinates to a place name via <a href="https://nominatim.org/" target="_blank" rel="noopener">Nominatim</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>. ` +
    `All fetches run client-side; no server, no API key. Coordinates ${formatLatLon(state.city.lat, state.city.lon)} (${cityLabel(state.city)}).` +
    `<span class="refresh-note">Auto-refreshes every ${Math.round(REFRESH_MS / 60000)} minutes — see the countdown at top right.</span>`;
}

/* ============================== INDEPENDENT FEED RETRY ============================== */
const feedRetryTimers = { aq: null, hist: null };
function scheduleFeedRetry(kind, immediate) {
  clearTimeout(feedRetryTimers[kind]);
  const run = async () => {
    if (!immediate && nextRefreshAt != null && Date.now() >= nextRefreshAt) return;
    try {
      if (kind === "aq") {
        state.aq = await fetchAirQuality();
        if (document.body.dataset.tab === "now") { renderAqiCard(); renderHeroAqiChip(); }
        if (document.body.dataset.tab === "wind") { renderAqiDetail(); renderAqiForecastChart(); }
      } else {
        const histRes = await fetchHistorical();
        state.historicalDaily = mergeDailyMaps(histRes.daily, dailyFromHourly(state.forecast.hourly));
        if (document.body.dataset.tab === "trends") { renderRecords(); renderRainfall(); renderCalendar(); }
      }
    } catch (e) {
      if (!immediate) scheduleFeedRetry(kind);
    }
  };
  if (immediate) run(); else feedRetryTimers[kind] = setTimeout(run, 60000);
}

function buildErrorCard(message, onRetry) {
  const card = el("div", "error-card");
  const msg = el("div", "msg");
  msg.innerHTML = `<strong>Unavailable.</strong> ${message}`;
  card.appendChild(msg);
  const btn = el("button", "retry-btn", "Retry");
  btn.type = "button";
  btn.addEventListener("click", () => { btn.textContent = "Retrying…"; btn.disabled = true; onRetry(); setTimeout(() => { btn.textContent = "Retry"; btn.disabled = false; }, 2000); });
  card.appendChild(btn);
  return card;
}

/* ============================== LOAD / ORCHESTRATION ============================== */
function showLoadingSkeleton() {
  // On a fresh page load these are already "--"/"Loading…" from the static HTML; this
  // matters most when switching cities, where the hero would otherwise keep showing the
  // previous city's temperature/AQI while every other card correctly goes to skeleton.
  $("#hero-temp").textContent = "--";
  $("#hero-condition").textContent = "Loading…";
  $("#hero-feels").textContent = "";
  // Unlike the rest of the hero, this one is set (not blanked) here — state.city is already
  // the newly-selected city by this point, so showing it during the loading state itself
  // reassures the user which city's data is on its way in, not just once it arrives.
  const cityEl = $("#hero-city");
  if (cityEl) cityEl.textContent = state.city.country ? `${state.city.name}, ${state.city.country}` : state.city.name;
  const landmarkEl = $("#hero-landmark");
  if (landmarkEl) landmarkEl.innerHTML = landmarkSVG(state.city);
  $("#hero-updated").textContent = "—";
  $("#hero-range").textContent = "—";
  const chip = $("#hero-aqi-chip");
  if (chip) { chip.innerHTML = ""; chip.hidden = true; }
  const aqiCard = $("#aqi-card");
  if (aqiCard) aqiCard.style.setProperty("--aqi-tint", "transparent");
  $("#now-stats").innerHTML = Array(6).fill('<div class="stat-card"><div class="skel skel-line" style="width:50%"></div><div class="skel skel-line" style="width:70%;height:24px"></div></div>').join("");
  $("#sun-body").innerHTML = '<div class="skel skel-line"></div><div class="skel skel-line"></div><div class="skel skel-line"></div>';
  $("#aqi-body").innerHTML = '<div class="skel skel-line" style="width:40%;height:30px"></div>';
  $("#chart-today").innerHTML = '<div class="skel skel-block"></div>';
  $("#trend-grid").innerHTML = Array(4).fill('<div class="box"><div class="skel skel-line" style="width:60%"></div><div class="skel skel-block"></div></div>').join("");
  $("#forecast-tbody").innerHTML = "";
  $("#records-box").innerHTML = '<div class="skel skel-line"></div><div class="skel skel-line"></div><div class="skel skel-line"></div>';
  $("#rainfall-box").innerHTML = '<div class="skel skel-line"></div><div class="skel skel-block" style="height:60px"></div>';
  $("#windrose-box").innerHTML = '<div class="skel skel-block" style="height:220px"></div>';
  $("#aqi-detail-box").innerHTML = '<div class="skel skel-line"></div><div class="skel skel-line"></div><div class="skel skel-line"></div>';
  $("#chart-aqi-forecast").innerHTML = '<div class="skel skel-block"></div>';
  $("#comfort-grid").innerHTML = Array(3).fill('<div class="box"><div class="skel skel-line" style="height:30px"></div></div>').join("");
}

function updateStaleBadge() {
  const badge = $("#stale-badge");
  if (!badge) return;
  if (state.stale && state.lastLoad) {
    const mins = Math.round((Date.now() - state.lastLoad) / 60000);
    badge.hidden = false;
    badge.textContent = `Showing cached data · updated ${mins < 1 ? "just now" : mins + "m ago"}`;
  } else {
    badge.hidden = true;
  }
}

async function loadAll(isRefresh) {
  // Guards against a race where a slow fetch for a previously-selected city resolves after
  // the user has already switched to a different one — the stale response is just dropped.
  const mySeq = citySeq;
  if (!isRefresh) {
    // Stale-while-revalidate: a returning visitor sees last-known-good data immediately
    // (clearly labeled) instead of a blank skeleton, while a fresh fetch runs underneath.
    const cached = cacheGet(cityCacheKey(CACHE_STATE_KEY), null);
    if (cached && cached.value && cached.value.forecast) {
      state.forecast = cached.value.forecast;
      state.aq = cached.value.aq;
      state.historicalDaily = cached.value.historicalDaily;
      state.nowHourlyIdx = nearestHourlyIndex(state.forecast.hourly, state.forecast.current.time);
      state.lastLoad = Date.now() - cached.age;
      state.stale = true;
      render(false);
      updateStaleBadge();
    } else {
      showLoadingSkeleton();
    }
  }
  setStatus("Refreshing…");

  const results = await Promise.allSettled([fetchForecast(), fetchAirQuality(), fetchHistorical()]);
  if (mySeq !== citySeq) return; // a newer city was selected while these were in flight
  const [fRes, aqRes, histRes] = results;

  if (fRes.status === "fulfilled") {
    state.forecast = fRes.value;
    state.nowHourlyIdx = nearestHourlyIndex(state.forecast.hourly, state.forecast.current.time);
  } else {
    if (!state.stale) {
      setStatus("Forecast feed unavailable", true);
      $("#now-stats").innerHTML = "";
      $("#now-stats").appendChild(buildErrorCard(String(fRes.reason && fRes.reason.message || "Request failed") + ".", () => loadAll(false)));
    } else {
      setStatus("Refresh failed — showing cached data", true);
    }
    refreshTimer = setTimeout(() => loadAll(true), 60000);
    return;
  }

  state.aq = aqRes.status === "fulfilled" ? aqRes.value : (state.aq || null);
  if (aqRes.status !== "fulfilled") { console.warn("AQ fetch failed", aqRes.reason); scheduleFeedRetry("aq"); }
  else clearTimeout(feedRetryTimers.aq);

  if (histRes.status === "fulfilled") {
    const archiveDaily = histRes.value.daily;
    const derived = dailyFromHourly(state.forecast.hourly);
    state.historicalDaily = mergeDailyMaps(archiveDaily, derived);
    clearTimeout(feedRetryTimers.hist);
  } else if (!state.historicalDaily) {
    console.warn("Historical fetch failed", histRes.reason);
    scheduleFeedRetry("hist");
  }

  state.stale = false;
  updateStaleBadge();
  cacheSet(cityCacheKey(CACHE_STATE_KEY), { forecast: state.forecast, aq: state.aq, historicalDaily: state.historicalDaily });

  render(isRefresh);
  state.lastLoad = Date.now();
  nextRefreshAt = Date.now() + REFRESH_MS;
  startCountdown();
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadAll(true), REFRESH_MS);
}

function renderLocationCard() {
  const note = $("#location-note");
  if (!note || !state.forecast) return;
  const elevation = state.forecast.elevation;
  const elevationTxt = elevation != null ? ` · ${Math.round(elevation)}m elevation` : "";
  note.textContent = `${formatLatLon(state.city.lat, state.city.lon)}${elevationTxt} — every reading on this page describes this single point.`;
}

/* ============================== WEATHER MAP ============================== */
let weatherMap = null, weatherMapBasemap = null, weatherMapMarker = null;

function weatherMapBasemapUrl() {
  return isDarkTheme()
    ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
}

// Called on init and again whenever the user picks a new city.
function updateWeatherMapLocation() {
  const mapEl = $("#weather-map");
  if (mapEl) mapEl.setAttribute("aria-label", `Minimal map of ${state.city.name} with live precipitation radar overlay`);
  if (!weatherMap) return;
  const { lat, lon } = state.city;
  weatherMap.setView([lat, lon], 9);
  if (weatherMapMarker) weatherMapMarker.setLatLng([lat, lon]);
}

function initWeatherMap() {
  const el = document.getElementById("weather-map");
  if (!el || typeof L === "undefined" || weatherMap) return;

  weatherMap = L.map(el, { center: [state.city.lat, state.city.lon], zoom: 9, scrollWheelZoom: false, attributionControl: true });

  weatherMapBasemap = L.tileLayer(weatherMapBasemapUrl(), {
    subdomains: "abcd", maxZoom: 18,
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(weatherMap);

  const markerIcon = L.divIcon({ className: "map-marker", html: '<span class="map-marker-dot"></span>', iconSize: [14, 14], iconAnchor: [7, 7] });
  weatherMapMarker = L.marker([state.city.lat, state.city.lon], { icon: markerIcon, interactive: false }).addTo(weatherMap);

  fetch("https://api.rainviewer.com/public/weather-maps.json")
    .then((r) => r.json())
    .then((data) => {
      const frames = data.radar && data.radar.past;
      if (!frames || !frames.length) return;
      const latest = frames[frames.length - 1];
      L.tileLayer(`${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        opacity: 0.55, maxNativeZoom: 7,
        attribution: 'Radar: <a href="https://www.rainviewer.com/api.html">RainViewer</a>',
      }).addTo(weatherMap);
      const radarTimeEl = $("#radar-time");
      if (radarTimeEl) {
        const t = new Date(latest.time * 1000);
        radarTimeEl.textContent = `Radar as of ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
      }
    })
    .catch((e) => console.warn("RainViewer fetch failed", e));
}

function applyWeatherMapTheme() {
  if (!weatherMap || !weatherMapBasemap) return;
  weatherMapBasemap.setUrl(weatherMapBasemapUrl());
}

function renderNowTab() {
  renderHero();
  renderNowStats();
  renderSunCard();
  renderAqiCard();
  renderLocationCard();
}
function renderForecastTab() {
  renderTodayChart();
  renderForecastTable();
}
function renderTrendsTab() {
  renderTrendGrid();
  renderRecords();
  renderRainfall();
  renderCalendar();
}
function renderWindTab() {
  renderWindRose();
  renderAqiDetail();
  renderAqiForecastChart();
  renderComfort();
}
const TAB_RENDERERS = { now: renderNowTab, forecast: renderForecastTab, trends: renderTrendsTab, wind: renderWindTab };

function render(isRefresh) {
  renderNowTab();
  renderForecastTab();
  renderTrendsTab();
  renderWindTab();
  if (isRefresh) flashUpdated();
  renderFooter();
}

/* ============================== THEME TOGGLE ============================== */
function initTheme() {
  const btn = $("#theme-toggle");
  const stored = localStorage.getItem("theme");
  if (stored) document.documentElement.setAttribute("data-theme", stored);
  function label() {
    const cur = document.documentElement.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    btn.textContent = cur === "dark" ? "LIGHT" : "DARK";
    btn.setAttribute("aria-pressed", cur === "dark");
  }
  label();
  btn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    label();
    applyWeatherMapTheme();
    if (state.forecast) render(true);
  });
}

/* ============================== TREND RANGE TOGGLE ============================== */
function initTrendToggle() {
  document.querySelectorAll(".seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg button").forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      trendRange = Number(btn.dataset.range);
      if (state.forecast) renderTrendGrid();
    });
  });
}

/* ============================== FORECAST TABLE EXPAND ============================== */
function initForecastExpand() {
  const btn = $("#forecast-expand-btn");
  const wrap = $("#forecast-table-scroll");
  if (!btn || !wrap) return;
  btn.addEventListener("click", () => {
    const collapsed = wrap.classList.toggle("collapsed");
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.innerHTML = collapsed ? 'Show all 48 hours <span class="chevron">⌄</span>' : 'Show fewer hours <span class="chevron">⌃</span>';
  });
}

/* ============================== TABS ============================== */
// Full ARIA APG tabs pattern: click OR arrow-key navigation moves focus and selection
// together, Home/End jump to the first/last tab — not just mouse-clickable buttons.
function initTabs() {
  const buttons = Array.from(document.querySelectorAll(".tab-btn"));
  function activate(btn, focus) {
    const name = btn.dataset.tab;
    buttons.forEach((b) => { b.classList.toggle("active", b === btn); b.setAttribute("aria-selected", b === btn ? "true" : "false"); b.tabIndex = b === btn ? 0 : -1; });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      const isTarget = p.id === "tab-" + name;
      p.classList.toggle("active", isTarget);
      p.hidden = !isTarget;
    });
    document.body.dataset.tab = name;
    if (focus) btn.focus();
    if (state.forecast && TAB_RENDERERS[name]) TAB_RENDERERS[name]();
  }
  buttons.forEach((btn, i) => {
    btn.tabIndex = btn.classList.contains("active") ? 0 : -1;
    btn.addEventListener("click", () => activate(btn, false));
    btn.addEventListener("keydown", (e) => {
      let target = null;
      if (e.key === "ArrowRight") target = buttons[(i + 1) % buttons.length];
      else if (e.key === "ArrowLeft") target = buttons[(i - 1 + buttons.length) % buttons.length];
      else if (e.key === "Home") target = buttons[0];
      else if (e.key === "End") target = buttons[buttons.length - 1];
      if (target) { e.preventDefault(); activate(target, true); }
    });
  });
  document.body.dataset.tab = "now";
}

/* ============================== INTRO ============================== */
function playIntro() {
  const intro = $("#intro");
  const app = $("#app");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seen = sessionStorage.getItem("intro_seen");
  if (reduced || seen) {
    intro.classList.add("hide");
    app.classList.add("ready");
    return;
  }
  sessionStorage.setItem("intro_seen", "1");
  setTimeout(() => {
    intro.classList.add("hide");
    app.classList.add("ready");
  }, 1200);
}

/* ============================== HERO TILT ============================== */
function initHeroTilt() {
  const card = $("#hero-card");
  if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  card.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(900px) rotateX(${(-py * 4).toFixed(2)}deg) rotateY(${(px * 5).toFixed(2)}deg)`;
  });
  card.addEventListener("pointerleave", () => { card.style.transform = ""; });
}

/* ============================== CITY SEARCH ============================== */
async function searchCities(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
  try {
    const data = await fetchJSON(url, 6000);
    return (data.results || []).map((r) => ({
      name: r.name, admin1: r.admin1 || "", country: r.country || "", lat: r.latitude, lon: r.longitude,
    }));
  } catch (e) {
    return [];
  }
}

function updatePageMeta() {
  document.title = `${state.city.name} — Weather Instrument`;
  const desc = $('meta[name="description"]');
  if (desc) desc.setAttribute("content", `Live weather, CPCB-referenced air quality, and climate records for ${cityLabel(state.city)}.`);
}

function updateCityInputDisplay() {
  const input = $("#city-search-input");
  if (input) input.value = cityShortLabel(state.city);
}

// Reflects the selected city in the URL (?lat=&lon=&name=…) so a specific city's view is
// bookmarkable/shareable without any server-side routing.
function updateUrlForCity(city) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("lat", city.lat.toFixed(4));
    url.searchParams.set("lon", city.lon.toFixed(4));
    url.searchParams.set("name", city.name);
    if (city.admin1) url.searchParams.set("admin1", city.admin1); else url.searchParams.delete("admin1");
    if (city.country) url.searchParams.set("country", city.country); else url.searchParams.delete("country");
    window.history.replaceState({}, "", url);
  } catch (e) { /* ignore */ }
}
function cityFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    const lat = parseFloat(p.get("lat")), lon = parseFloat(p.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { name: p.get("name") || "Selected location", admin1: p.get("admin1") || "", country: p.get("country") || "", lat, lon };
  } catch (e) { return null; }
}

function selectCity(city) {
  citySeq++; // invalidates any in-flight fetch for the previously selected city
  clearTimeout(refreshTimer);
  clearTimeout(feedRetryTimers.aq);
  clearTimeout(feedRetryTimers.hist);
  clearInterval(countdownTimer);
  state.city = city;
  state.forecast = null; state.aq = null; state.historicalDaily = null; state.nowHourlyIdx = null; state.stale = false;
  try { localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify(city)); } catch (e) { /* quota etc */ }
  updateUrlForCity(city);
  updateCityInputDisplay();
  updatePageMeta();
  updateWeatherMapLocation();
  closeCityPanel();
  loadAll(false);
}

// Reverse geocoding: Open-Meteo has no free reverse-lookup endpoint, so this uses
// Nominatim (OpenStreetMap's free, keyless service — this project already uses OSM data
// for the basemap). Falls back to a generic label if the lookup fails or times out; the
// coordinates and every fetched reading are correct either way, only the display name changes.
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`;
  try {
    const data = await fetchJSON(url, 6000);
    const a = data.address || {};
    const name = a.city || a.town || a.village || a.municipality || a.county || a.state;
    if (!name) return null;
    return { name, admin1: a.state || "", country: a.country || "", lat, lon };
  } catch (e) {
    return null;
  }
}

function locateMe(onDone) {
  if (!("geolocation" in navigator)) { onDone(null); return; }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const resolved = await reverseGeocode(lat, lon);
      onDone(resolved || { name: "My Location", admin1: "", country: "", lat, lon });
    },
    () => onDone(null),
    { timeout: 8000, maximumAge: 600000 }
  );
}

// URL param (shared link) > last city the user picked > browser geolocation > Bengaluru default.
function bootCity(done) {
  const fromUrl = cityFromUrl();
  if (fromUrl) { done(fromUrl); return; }
  try {
    const stored = localStorage.getItem(CITY_STORAGE_KEY);
    if (stored) { done(JSON.parse(stored)); return; }
  } catch (e) { /* ignore */ }
  locateMe((city) => done(city || DEFAULT_CITY));
}

let cityPanelOpen = false, cityActiveIndex = -1, cityResults = [];

function openCityPanel() {
  const panel = $("#city-panel"), input = $("#city-search-input");
  if (!panel || !input) return;
  cityPanelOpen = true;
  panel.hidden = false;
  input.setAttribute("aria-expanded", "true");
  renderCityResults([]);
}
// Also restores the input's text to the current city — covers both "closed after picking a
// new city" (already correct, harmless no-op) and "closed after typing something and backing
// out via Escape/click-away" (reverts the abandoned query text) with one code path.
function closeCityPanel() {
  const panel = $("#city-panel"), input = $("#city-search-input");
  if (!panel || !input) return;
  cityPanelOpen = false;
  panel.hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.value = cityShortLabel(state.city);
  // If the input is still focused (e.g. a city was just picked, which never blurred it —
  // see the mousedown/preventDefault on options above), leave the text selected so typing
  // again immediately replaces it instead of inserting into the middle of it.
  if (document.activeElement === input) input.select();
  cityActiveIndex = -1;
}

function renderCityResults(results) {
  cityResults = results;
  cityActiveIndex = results.length ? 0 : -1;
  const list = $("#city-results");
  if (!list) return;
  list.innerHTML = "";
  results.forEach((r, i) => {
    const li = el("li", "city-option" + (i === cityActiveIndex ? " active" : ""), cityLabel(r));
    li.id = `city-opt-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", i === cityActiveIndex ? "true" : "false");
    li.addEventListener("mousedown", (e) => { e.preventDefault(); selectCity(r); });
    list.appendChild(li);
  });
  const input = $("#city-search-input");
  if (input) input.setAttribute("aria-activedescendant", cityActiveIndex >= 0 ? `city-opt-${cityActiveIndex}` : "");
}

function highlightCityOption(delta) {
  if (!cityResults.length) return;
  cityActiveIndex = (cityActiveIndex + delta + cityResults.length) % cityResults.length;
  const list = $("#city-results");
  if (list) {
    list.querySelectorAll(".city-option").forEach((opt, i) => {
      opt.classList.toggle("active", i === cityActiveIndex);
      opt.setAttribute("aria-selected", i === cityActiveIndex ? "true" : "false");
    });
  }
  const input = $("#city-search-input");
  if (input) input.setAttribute("aria-activedescendant", `city-opt-${cityActiveIndex}`);
}

function initCitySearch() {
  const panel = $("#city-panel"), input = $("#city-search-input"), locateBtn = $("#city-locate-btn");
  if (!panel || !input) return;

  // Focus opens the panel and selects the current text so typing immediately replaces it —
  // the bar doubles as "here's your current city" and "type to change it" in one control.
  // The select() is deferred a tick because focusing via a mouse click also places the
  // cursor at the click point as part of that same click's default action, which would
  // otherwise collapse the selection right after this handler sets it.
  input.addEventListener("focus", () => {
    openCityPanel();
    setTimeout(() => input.select(), 0);
  });
  // A click on an *already-focused* input never re-fires "focus", so a second click (e.g.
  // right after picking a city, which leaves the field focused) would otherwise just place
  // the cursor at the click point instead of re-selecting — this is the address-bar-style
  // "always ready to type over" pattern, so every click re-selects, not just the first.
  input.addEventListener("click", () => { setTimeout(() => input.select(), 0); });

  // A short delay (rather than closing on blur immediately) lets a click on a result option
  // or the locate button register first — both move focus, which would otherwise race the close.
  input.addEventListener("blur", () => {
    setTimeout(() => { if (!panel.contains(document.activeElement)) closeCityPanel(); }, 150);
  });

  let debounceTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value;
    debounceTimer = setTimeout(async () => {
      const results = await searchCities(q);
      if (cityPanelOpen) renderCityResults(results);
    }, 300);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); highlightCityOption(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlightCityOption(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (cityActiveIndex >= 0 && cityResults[cityActiveIndex]) selectCity(cityResults[cityActiveIndex]); }
    else if (e.key === "Escape") { closeCityPanel(); }
  });

  if (locateBtn) {
    locateBtn.addEventListener("click", () => {
      locateBtn.disabled = true;
      locateBtn.textContent = "Locating…";
      locateMe((city) => {
        locateBtn.disabled = false;
        locateBtn.textContent = "Use my location";
        if (city) selectCity(city);
      });
    });
  }
}

/* ============================== INIT ============================== */
let resizeDebounce = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(() => {
    if (weatherMap) weatherMap.invalidateSize();
    if (!state.forecast) return;
    const active = document.body.dataset.tab || "now";
    if (TAB_RENDERERS[active]) TAB_RENDERERS[active]();
  }, 150);
});

playIntro();
initTheme();
initTrendToggle();
initForecastExpand();
initHeroTilt();
initWeatherMap();
initTabs();
initCitySearch();
bootCity((city) => {
  state.city = city;
  updateCityInputDisplay();
  updatePageMeta();
  updateWeatherMapLocation();
  loadAll(false);
});

// Offline app-shell support — never intercepts the weather/AQI API calls or map tiles
// (see sw.js), which already have their own localStorage-based freshness handling.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
