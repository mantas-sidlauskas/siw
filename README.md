# signalk-image-widgets

A simple SignalK server plugin that renders configured SignalK paths as
raster images (PNG or JPEG) — one image per configured component — for
simple/low-power clients that poll an `<img>` tag and can't run a full
SVG/JS UI.

## Component types

- **numeric** — current value of a configured SignalK path, as a label +
  big value + unit.
- **windTrend** — a trend chart of true wind direction and speed over a
  configurable window, read from SignalK's History API v2. Requires a
  History API provider plugin (e.g. `signalk-to-influxdb2` or
  `signalk-parquet`) installed and capturing `environment.wind.directionTrue`
  and `environment.wind.speedTrue`. Without one, this component renders a
  "No history data" placeholder instead of erroring.

## Configuration

Copy `components.sample.json` to `components.json` in this plugin's SignalK
data directory and edit it directly — there is no admin-UI configuration
form. The file is re-read on every request, so changes take effect
immediately.

## HTTP API

- `GET /components` — lists configured components (`id`, `type`, `width`,
  `height`).
- `GET /components/:id/image` — renders that component fresh and returns
  the image bytes with the matching `Content-Type`.

## Development

```bash
npm install
npm test
```
