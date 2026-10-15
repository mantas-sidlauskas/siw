# signalk-image-widgets

A simple SignalK server plugin that renders configured SignalK paths as
images — one image per configured component — for simple/low-power clients
that poll an `<img>` tag and can't run a full JS UI. Each component picks
its own output via `"format"`: `"png"` (default) or `"jpeg"` render a raster
image; `"svg"` renders the same layout as vector SVG instead — useful on
clients whose browser handles SVG more cleanly than raster decoding, or
where the sharper vector text is worth it. All three are served the same
way, from the same `<img src="...">` tag, so switching a component between
them is just an edit to `components.json`.

## Component types

- **numeric** — current value of a configured SignalK path, as a label +
  big value + unit.
- **windTrend** — a combined trend chart of true wind speed and direction,
  side by side, over a configurable window, read from SignalK's History API
  v2. Requires a History API provider plugin (e.g. `signalk-to-influxdb2` or
  `signalk-parquet`) installed and capturing `environment.wind.directionTrue`
  and `environment.wind.speedTrue`. Without one, this component renders a
  "No history data" placeholder instead of erroring.
- **windSpeedTrend** / **windDirectionTrend** — the same trend chart split
  into two independent single-panel components, so speed and direction can
  be sized, placed, or put on different dashboard pages independently
  instead of always appearing together. Same config fields and history
  requirements as `windTrend`.

## Configuration

Copy `components.sample.json` to `components.json` in this plugin's SignalK
data directory and edit it directly — there is no admin-UI configuration
form. The file is re-read on every request, so changes take effect
immediately.

The config can describe either a single implicit page (a flat `components`
array, as in `components.sample.json`) or multiple pages, each with its own
components, via a top-level `pages` array:

```json
{ "pages": [
  { "title": "Navigation", "components": [ /* ... */ ] },
  { "title": "Wind", "components": [ /* ... */ ] }
] }
```

Component `id`s must be unique across the whole config, not just within a
page.

## HTTP API

- `GET /dashboard` — an HTML dashboard showing the current page's
  configured components as `<img>`s, laid out one per line. Reloads itself
  every 30 seconds via `<meta http-equiv="refresh">` (no JavaScript
  required), making it suitable as a browser home page for low-power/e-ink
  clients such as a Kindle. (Not `/` — SignalK reserves that path on every
  plugin's router for its own plugin-metadata endpoint.)
  - `GET /dashboard?page=N` — shows page `N` (0-indexed). When the config
    defines more than one page, a "Next page" link/button appears at the
    bottom, cycling to the next page and wrapping back to the first after
    the last; the auto-refresh keeps reloading the same page. With zero or
    one page, no pagination control is shown.
- `GET /dashboard-live` — same pages/components as `/dashboard`, but
  **numeric** components render as a plain value that updates in place over
  a WebSocket to SignalK's own delta stream (`/signalk/v1/stream`), instead
  of a periodically-reloaded image — no 30-second lag, no full-page
  refresh. Other component types (the trend charts, maneuver score) still
  render as `<img>`s, refreshed via a 30-second JS interval instead of a
  page reload. This needs a browser capable of WebSockets and running JS
  reliably; `/dashboard` remains the safe, zero-JS fallback for clients
  that aren't, or where the simpler version is preferred. Supports
  `?page=N` the same way as `/dashboard`.
- `GET /components` — lists configured components (`id`, `type`, `width`,
  `height`).
- `GET /components/:id/image` — renders that component fresh and returns
  the image bytes with the matching `Content-Type`.

All four routes are registered as readonly-accessible (via
`router.access('readonly')` on servers that support it), so with SignalK's
`allow_readonly` security setting enabled they work without a login
session — useful for a browser, like a Kindle's, that can't do SignalK's
login flow.

## Development

```bash
npm install
npm test
```
