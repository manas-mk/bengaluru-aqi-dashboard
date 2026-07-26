#!/usr/bin/env node
// Zero-dependency regression tests for the parts of this static site that are easy to
// silently break: the CPCB AQI math, the WCAG contrast of the color tokens, and the
// sparkline SVG path generator (which previously shipped a malformed "L L..." path bug).
// Run with: node test/run.js — no npm install required.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DOCS = path.join(__dirname, "..", "docs");
const appJs = fs.readFileSync(path.join(DOCS, "app.js"), "utf8");
const styleCss = fs.readFileSync(path.join(DOCS, "style.css"), "utf8");

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error("FAIL: " + msg); }
  else console.log("ok   " + msg);
}

/* ---------------------------------------------------------------------------
   1. CPCB AQI math — extract the real block from app.js (not a re-implementation)
   and exercise the sub-index/category/overall functions against known values.
   --------------------------------------------------------------------------- */
function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error("marker not found: " + startMarker);
  const end = src.indexOf(endMarker, start);
  if (end === -1) throw new Error("end marker not found: " + endMarker);
  return src.slice(start, end);
}

const cpcbSrc = extractBetween(
  appJs,
  "/* ============================== CPCB NATIONAL AQI",
  "/* ============================== DATA FETCH"
);
const cpcbCtx = vm.createContext({ console });
vm.runInContext(cpcbSrc + "\nthis.cpcbSubIndex = cpcbSubIndex; this.cpcbCategoryForAqi = cpcbCategoryForAqi; this.cpcbOverall = cpcbOverall; this.CPCB_CATEGORIES = CPCB_CATEGORIES;", cpcbCtx);
const { cpcbSubIndex, cpcbCategoryForAqi, cpcbOverall, CPCB_CATEGORIES } = cpcbCtx;

// Breakpoint boundaries per CPCB National AQI (2014) for PM2.5: 0-30 Good, 31-60 Satisfactory.
assert(cpcbSubIndex("pm2_5", 30) === 50, "PM2.5=30 sits at the top of the Good sub-index band (50)");
assert(cpcbSubIndex("pm2_5", 31) === 51, "PM2.5=31 sits at the bottom of the Satisfactory sub-index band (51)");
assert(cpcbSubIndex("pm2_5", 0) === 0, "PM2.5=0 gives sub-index 0");
// The top band is intentionally left open-ended (matches real CPCB/SAFAR reporting,
// which shows figures like "AQI 700+" during severe pollution events rather than
// silently capping at 500) — cpcbCategoryForAqi still correctly reports "Severe" for
// any value past the last boundary regardless of how far it extrapolates.
assert(cpcbSubIndex("pm2_5", 1000) > 500, "PM2.5 far above range extrapolates past 500 rather than silently capping");
assert(cpcbCategoryForAqi(cpcbSubIndex("pm2_5", 1000)).name === "Severe", "An extrapolated sub-index above 500 still categorizes as Severe");
assert(cpcbSubIndex("pm2_5", null) === null, "Missing pollutant reading returns null, not a false zero");

assert(cpcbCategoryForAqi(50).name === "Good", "AQI 50 categorizes as Good");
assert(cpcbCategoryForAqi(51).name === "Satisfactory", "AQI 51 categorizes as Satisfactory");
assert(cpcbCategoryForAqi(500).name === "Severe", "AQI 500 categorizes as Severe");
assert(CPCB_CATEGORIES.length === 6, "Exactly six CPCB categories are defined");

// Overall AQI = the worst (max) sub-index across pollutants; that pollutant is dominant.
const overall = cpcbOverall({ pm2_5: 20, pm10: 40, nitrogen_dioxide: 20, sulphur_dioxide: 20, ozone: 300, carbon_monoxide: 500 });
assert(overall.dominant === "o3", "The pollutant with the worst sub-index is reported as dominant (O3 here)");
assert(overall.aqi === Math.max(...overall.all.map((s) => s.value)), "Overall AQI equals the worst sub-index, not an average");

/* ---------------------------------------------------------------------------
   2. Sparkline SVG path generator — regression test for the shipped bug where the
   gradient area-fill path contained a malformed "L L..." command sequence.
   --------------------------------------------------------------------------- */
const sparkSrc = extractBetween(appJs, "function sparklineSVG(", "function statCard(");
const sparkCtx = vm.createContext({ console, Math });
vm.runInContext("function sparklineSVG(" + sparkSrc.slice("function sparklineSVG(".length) + "\nthis.sparklineSVG = sparklineSVG;", sparkCtx);
const svg = sparkCtx.sparklineSVG([10, 12, 8, 15, 9, 20, 11], { width: 100, height: 28, color: "var(--accent)" });
assert(svg.includes("<svg"), "sparklineSVG produces an <svg> element for a valid series");
const pathDs = [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
assert(pathDs.length >= 2, "sparklineSVG emits both a fill path and a stroke path");
pathDs.forEach((d, i) => assert(!/[A-Za-z]\s+[A-Za-z]/.test(d), `path ${i} data has no adjacent bare command letters (the 'L L0.0' bug)`));
pathDs.forEach((d, i) => assert(/^M\s*-?[\d.]/.test(d), `path ${i} starts with a valid M command + number`));
assert(sparkCtx.sparklineSVG([5], {}) === "", "sparklineSVG returns empty string for a series with fewer than 2 points, not a broken path");

/* ---------------------------------------------------------------------------
   3. Color tokens — WCAG contrast math against the actual shipped style.css, not a
   hand-copied snapshot. Catches accidental hex edits that silently break AA.
   --------------------------------------------------------------------------- */
function luminance(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const chan = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
function contrast(hex1, hex2) {
  const l1 = luminance(hex1), l2 = luminance(hex2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function extractTokens(block) {
  const tokens = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) tokens[m[1]] = m[2];
  return tokens;
}
const darkBlock = styleCss.match(/:root\s*\{([^}]*)\}/)[1];
const lightBlock = styleCss.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/)[1];
const dark = extractTokens(darkBlock);
const light = extractTokens(lightBlock);

const CATS = ["good", "moderate", "poor", "unhealthy", "severe", "hazard"];
for (const [themeName, t] of [["dark", dark], ["light", light]]) {
  assert(contrast(t["text-hi"], t["card"]) >= 4.5, `${themeName}: --text-hi on --card holds normal-text AA (4.5:1)`);
  assert(contrast(t["text-mid"], t["card"]) >= 4.5, `${themeName}: --text-mid on --card holds normal-text AA (4.5:1)`);
  assert(contrast(t["text-low"], t["card"]) >= 4.5, `${themeName}: --text-low on --card holds normal-text AA (4.5:1)`);
  assert(contrast(t["temp-cold"], t["card"]) >= 4.5, `${themeName}: --temp-cold bare text on --card holds AA (4.5:1)`);
  assert(contrast(t["temp-hot"], t["card"]) >= 4.5, `${themeName}: --temp-hot bare text on --card holds AA (4.5:1)`);
  for (const cat of CATS) {
    // Small badge/pill text (9.5-12px): .aqi-band-pill, .pollutant-cat, .hero-aqi-chip .chip-badge
    // all render the -ink token as text directly on the category fill. Needs full 4.5:1.
    const inkOnFill = contrast(t[cat + "-ink"], t[cat]);
    assert(inkOnFill >= 4.5, `${themeName}: --${cat}-ink on --${cat} holds small-text AA (4.5:1), got ${inkOnFill.toFixed(2)}`);
    // .aqi-badge (28px/700 = large text, 3:1 floor) uses the same fill+ink pairing.
    assert(inkOnFill >= 3, `${themeName}: --${cat}-ink on --${cat} holds large-text floor (3:1)`);
  }
}

/* ---------------------------------------------------------------------------
   Summary
   --------------------------------------------------------------------------- */
console.log("");
if (failures) {
  console.error(failures + " check(s) failed.");
  process.exit(1);
} else {
  console.log("All checks passed.");
}
