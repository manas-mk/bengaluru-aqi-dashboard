// Daily forecast-verification logger, run by .github/workflows/forecast-log.yml.
//
// Each run: (1) records today's forecast for tomorrow/+2d/+3d as predictions
// for those future dates at 24h/48h/72h lead time, and (2) once a date's
// actual weather is known (1-2 days later), scores every prediction that
// was made for it against that actual, storing the signed error.
//
// The log is plain data (docs/data/forecast_log.json); the dashboard
// computes MAE/bias/etc from it client-side, same as every other panel.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const LAT = 12.9716, LON = 77.5946, TZ = "Asia/Kolkata";
const LOG_PATH = path.resolve("docs/data/forecast_log.json");
const LEAD_HOURS = [24, 48, 72];
const MAX_RECORDS = 400;

function kolkataISO(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function round2(n) { return n == null ? null : Math.round(n * 100) / 100; }

async function loadLog() {
  try {
    const raw = await readFile(LOG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { records: [] };
  }
}

async function main() {
  const todayISO = kolkataISO(new Date());
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&timezone=${encodeURIComponent(TZ)}&past_days=3&forecast_days=4` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Open-Meteo HTTP ${resp.status}`);
  const data = await resp.json();

  const byDate = {};
  for (let i = 0; i < data.daily.time.length; i++) {
    byDate[data.daily.time[i]] = {
      tmax: data.daily.temperature_2m_max[i],
      tmin: data.daily.temperature_2m_min[i],
      precip: data.daily.precipitation_sum[i],
    };
  }

  const log = await loadLog();
  const byTarget = new Map(log.records.map((r) => [r.target_date, r]));
  function getOrCreate(targetDate) {
    if (!byTarget.has(targetDate)) byTarget.set(targetDate, { target_date: targetDate, predictions: {}, actual: null, errors: {} });
    return byTarget.get(targetDate);
  }

  // 1. Log new predictions for each future lead time.
  for (const lead of LEAD_HOURS) {
    const targetDate = addDaysISO(todayISO, lead / 24);
    const pred = byDate[targetDate];
    if (!pred || pred.tmax == null) continue;
    const rec = getOrCreate(targetDate);
    rec.predictions[`${lead}h`] = { made_on: todayISO, tmax: pred.tmax, tmin: pred.tmin, precip: pred.precip };
  }

  // 2. Close out actuals + errors for recently-completed dates (yesterday, day before —
  // the latter is a defensive re-check in case a run was missed).
  for (const backDays of [1, 2]) {
    const targetDate = addDaysISO(todayISO, -backDays);
    const actual = byDate[targetDate];
    if (!actual || actual.tmax == null) continue;
    const rec = byTarget.get(targetDate);
    if (!rec) continue;
    rec.actual = { tmax: actual.tmax, tmin: actual.tmin, precip: actual.precip };
    for (const [leadKey, pred] of Object.entries(rec.predictions)) {
      rec.errors[leadKey] = {
        tmax: round2(actual.tmax - pred.tmax),
        tmin: round2(actual.tmin - pred.tmin),
        precip: round2(actual.precip - pred.precip),
      };
    }
  }

  const records = [...byTarget.values()].sort((a, b) => a.target_date.localeCompare(b.target_date)).slice(-MAX_RECORDS);
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  await writeFile(LOG_PATH, JSON.stringify({ generated: new Date().toISOString(), lead_hours: LEAD_HOURS, records }, null, 2) + "\n");
  console.log(`Logged ${records.length} records, ran for ${todayISO}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
