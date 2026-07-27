# Weather Instrument

A statistical, dense, stylish-minimal weather and air-quality instrument panel — for any city on Earth. No backend, no build step, no API keys: `docs/index.html`, `docs/style.css`, and `docs/app.js` fetch everything live, client-side, from [Open-Meteo](https://open-meteo.com/) (forecast, air quality, historical archive, and geocoding APIs — all free, no key).

**Live:** served by GitHub Pages from `docs/`, defaulting to Bengaluru. Installable as a PWA (works offline with the last-fetched data once visited once).

## City search

The search bar in the header (pre-filled with the current city) finds any place on Earth as you type, powered by the free [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api); a "Use my location" link in the results panel offers browser geolocation instead. The choice persists in `localStorage` and is reflected in the URL (`?lat=&lon=&name=…`), so a specific city's view is bookmarkable and shareable without any server-side routing. On first visit with nothing saved, the app tries geolocation and falls back to Bengaluru if it's denied or unavailable. Every fetch — forecast, air quality, historical archive, and the four-point "around the city" AQI table — re-targets the selected coordinates using Open-Meteo's `timezone=auto`, so day/night theming, sunrise/sunset, and local time all resolve correctly anywhere in the world. Switching cities never shows another city's stale cached data: every `localStorage` cache key is namespaced by coordinates, and a sequence counter drops any in-flight fetch for a city you've since navigated away from.

## What it shows

The site is organized into four tabs so each category of data gets room to breathe instead of one dense wall of numbers:

- **Now** — a gradient hero card (color shifts with dawn/day/dusk/night, computed from the selected city's own sunrise/sunset, desaturating under heavy cloud cover) with a hand-drawn animated weather icon, current temperature, feels-like/dew point, and a color-coded CPCB AQI chip (value, category, dominant pollutant) right alongside the temperature. Spacious stat cards for humidity, pressure (+3h trend arrow), wind (speed/gusts/direction as degrees + vector arrow), visibility, cloud cover, UV index + band, and precipitation; a Sun & Moon card; an Air Quality card (tinted 6% toward the current CPCB category color); and a minimal weather map (no street labels, live precipitation radar overlay) centered on the selected city.
- **Forecast** — 24h chart (today vs. yesterday vs. the historical normal for this calendar date, three directly-labeled lines) and a dense 48-hour hourly table (semantic `<table>`, zebra rows, sticky time column on mobile).
- **Trends & Records** — 7-day/30-day small-multiples for temperature, rainfall, humidity, and pressure; today's high vs. a 10-year distribution for this calendar date with record high/low, hottest/coldest/wettest day this month and this year, a plain-stated anomaly vs. seasonal norm, month-to-date/year-to-date rainfall vs. normal, and a GitHub-contribution-graph-style calendar heatmap of daily mean temperature.
- **Wind & Air** — a 7-day wind rose; a full PM2.5/PM10/NO2/SO2/O3/CO breakdown against **Indian CPCB National AQI (2014)** breakpoints with a plain-language health advisory per category; an "Around the City" table querying the same free Open-Meteo grid at four points ~15km N/S/E/W of the selected city (explicitly labeled as modeled estimates, not independent ground stations — there are no local place names to label these with for an arbitrary global city, so they're labeled by direction/distance instead); a 72-hour CPCB AQI forecast chart; and comfort metrics (heat index, wet-bulb temperature, a custom "drying index") — each formula labeled so nothing is mistaken for an official index.

A brief intro animation plays once per browser session before the dashboard fades in (skipped instantly if `prefers-reduced-motion` is set, or on repeat visits within the same session).

## Reliability & accessibility

- **Loading/error/stale states**: every fetch has a real 10s timeout (`AbortController`); a failed or timed-out panel shows an error card with a **Retry** button instead of a blank box. The last successful full state is cached in `localStorage`, so returning visitors see it instantly (with a "showing cached data" badge) while a fresh fetch runs in the background.
- **Color system**: one token set (`--bg`, `--card`, `--text-*`, `--accent`, a six-level CPCB semantic scale) drives every color in both themes — no hardcoded hex, no per-card decorative tints. Every text/background pairing actually used in the UI was checked against real WCAG contrast math (not eyeballed); see `test/run.js`.
- **Keyboard/screen-reader support**: one `<h1>` and a logical heading hierarchy, full ARIA APG tabs (arrow keys, Home/End, roving `tabindex`), visible `:focus-visible` rings, `aria-live="polite"` on every panel that updates from a fetch, and a `<noscript>` fallback.
- **Light theme**: same token names, white cards with soft shadows instead of borders, semantic colors individually re-tuned (not a flat percentage darken) to hold AA on white.

## Data sources & honesty

- Weather/forecast: Open-Meteo Forecast API, fetched with `past_days=30&forecast_days=7` in one call so current conditions, the 48h table, and 7d/30d trends all come from a single consistent dataset.
- Air quality: Open-Meteo Air Quality API (PM2.5/PM10/NO2/SO2/O3/CO). This is a modeled (CAMS) estimate, not a ground station reading — labeled as such wherever it's shown. AQI category/health advisory use the CPCB National AQI (2014), not the US EPA scale.
- Historical records/normals: Open-Meteo Historical Weather API, last 10 years, cached in `localStorage` for 24h so it isn't re-fetched (in full) every page load.
- Weather map: a minimal (no-labels) [CARTO](https://carto.com/attributions) basemap with a live precipitation overlay from [RainViewer](https://www.rainviewer.com/api.html), both free and keyless. This is the one place the site loads a small client-side library — [Leaflet](https://leafletjs.com/), via CDN — since there was no reasonable way to render map tiles without one; everything else on the page is still plain DOM/SVG.
- City search: Open-Meteo Geocoding API. Browser geolocation (when used) never leaves the browser — no reverse-geocoding call is made, so "my location" is labeled generically rather than guessing a place name from a third-party service.
- Auto-refreshes every 15 minutes; the footer states the interval and cites every source with a link.

## Offline / PWA

`docs/manifest.webmanifest` + `docs/sw.js` cache the app shell (HTML/CSS/JS/icons) for offline use and installability. The service worker **only** manages same-origin shell assets — every Open-Meteo/Leaflet/map-tile/font request passes straight to the network untouched, since the app already has its own `localStorage` freshness logic for live data. Bump the `?v=` on `style.css`/`app.js` in `index.html` *and* `CACHE_NAME` in `sw.js` together whenever either file changes (no build step means no content-hashed filenames to force a refetch automatically).

## Tests

`test/run.js` is a zero-dependency Node script (no `npm install`) that runs against the real shipped `docs/app.js`/`docs/style.css` — not a hand-copied re-implementation — checking:

- CPCB sub-index math at real breakpoint boundaries, and that "dominant pollutant" is always the worst sub-index.
- Every `-ink`-on-category-color pairing in both themes actually holds AA contrast at the small badge sizes they're rendered at.
- The sparkline SVG path generator never emits a malformed path (regression test for a shipped bug where the gradient fill path contained an invalid double command).

```
node test/run.js
```

Runs in CI on every push via `.github/workflows/test.yml`.

## Local development

No build step. Serve the `docs/` folder with any static file server and open it — e.g.:

```
cd docs
python -m http.server 8000
```

Then open `http://localhost:8000/`. A plain `file://` open will also mostly work since there's no server-side code, but some browsers restrict `fetch` from `file://` origins — a local server avoids that entirely. (The service worker also requires a server origin — `http://` or `https://` — to register at all.)

## Notes

- All four Open-Meteo endpoints (forecast, air quality, historical archive, geocoding) are CORS-open for direct browser fetches — no proxy needed.
- Dark mode follows the OS by default; the toggle persists an explicit override in `localStorage`.
- Respects `prefers-reduced-motion` (skeleton shimmer, value-fade, and hero-tilt transitions are disabled).
- This project previously ran a server-side pipeline (Python + GitHub Actions + WAQI ground-station data, committed to `data/`), and later a daily GitHub Action that logged forecast predictions to score against outcomes. Both have been retired — the site has no scheduled automation beyond the test workflow now, just the static files fetching live from Open-Meteo on each page load. If you still have a `WAQI_TOKEN` secret configured on the repo, it's no longer used and can be removed.
