'use strict';

// Fixed-point conversions duplicated here as literals (not required from
// lib/units.js) since this code runs client-side, not server-side.
const MPS_TO_KNOTS = 1.9438444924406;

const SOG_FIELD = { key: 'sog', caption: 'SOG', path: 'navigation.speedOverGround', unit: 'kt', decimals: 1, conversion: 'mpsToKnots' };
const TWS_FIELD = { key: 'tws', caption: 'TWS', path: 'environment.wind.speedTrue', unit: 'kt', decimals: 1, conversion: 'mpsToKnots' };
const TWD_FIELD = { key: 'twd', caption: 'TWD', path: 'environment.wind.directionTrue', unit: '°', decimals: 0, conversion: 'radiansToDegrees' };

// Which current-value boxes each wind-trend component type shows - mirrors
// exactly what lib/render-wind-trend.js's header boxes draw for that type,
// so splitting them out here as live values doesn't change what's shown,
// just how it updates.
const WIND_LIVE_FIELDS = {
  windTrend: [SOG_FIELD, TWS_FIELD, TWD_FIELD],
  windSpeedTrend: [SOG_FIELD, TWS_FIELD],
  windDirectionTrend: [SOG_FIELD, TWD_FIELD],
};

function escapeAttr(str) {
  return String(str).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
}

function renderLiveDashboardHtml(pages, pageIndex, { now = Date.now } = {}) {
  const timestamp = now();
  const clampedIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
  const page = pages[clampedIndex];

  const liveEntries = page.components.flatMap((c) => liveEntriesFor(c));
  const hasImages = page.components.some((c) => c.type !== 'numeric');

  const body = page.components.length
    ? page.components.map((c) => renderWidget(c, timestamp)).join('\n')
    : '<p>No components configured.</p>';

  const nextIndex = (clampedIndex + 1) % pages.length;
  const pager =
    pages.length > 1
      ? `<p><a href="dashboard-live?page=${nextIndex}">Next page (${nextIndex + 1} / ${pages.length}) →</a></p>\n`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
<title>SignalK Image Widgets (live)</title>
<style>
body { background: #fff; margin: 0; padding: 8px; font-family: sans-serif; image-rendering: pixelated; }
img { display: block; margin-bottom: 8px; max-width: 100%; max-height: 100vh; width: auto; height: auto; }
p { color: #000; }
a { display: inline-block; padding: 10px 16px; border: 2px solid #000; border-radius: 6px; color: #000; text-decoration: none; }
.live { box-sizing: border-box; border: 1px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 8px; max-width: 100%; max-height: 100vh; }
.live-label { font-size: 1rem; }
.live-value { font-size: 3rem; font-weight: bold; }
.live-row { display: flex; margin-bottom: 4px; }
.live-row .live { flex: 1; justify-content: center; align-items: center; height: 90px; margin-bottom: 0; margin-right: 4px; }
.live-row .live:last-child { margin-right: 0; }
.live-row .live-value { font-size: 4.5rem; }
</style>
</head>
<body>
${body}
${pager}${renderScript(liveEntries, hasImages)}</body>
</html>
`;
}

// Entries for the client-side LIVE table: {id, path, unit, decimals,
// conversion}. A plain numeric component is one entry; a wind-trend
// component expands into one entry per current-value box it shows.
function liveEntriesFor(component) {
  if (component.type === 'numeric') {
    return [{ id: component.id, path: component.path, unit: component.unit || '', decimals: component.decimals, conversion: component.conversion || '' }];
  }
  const fields = WIND_LIVE_FIELDS[component.type];
  if (!fields) return [];
  return fields.map((f) => ({ id: `${component.id}-${f.key}`, path: f.path, unit: f.unit, decimals: f.decimals, conversion: f.conversion }));
}

function renderWidget(component, timestamp) {
  if (component.type === 'numeric') return renderLiveWidget(component);
  const fields = WIND_LIVE_FIELDS[component.type];
  if (fields) return renderWindLiveWidget(component, fields, timestamp);
  return renderImageWidget(component, timestamp);
}

function renderLiveWidget(component) {
  const { id, width, height, label } = component;
  return `<div class="live" style="width:${width}px;height:${height}px;">
<div class="live-label">${escapeAttr(label || '')}</div>
<div class="live-value" id="live-${escapeAttr(id)}">--</div>
</div>`;
}

function renderWindLiveWidget(component, fields, timestamp) {
  const { id, width, height } = component;
  const boxes = fields
    .map(
      (f) => `<div class="live">
<div class="live-value" id="live-${escapeAttr(id)}-${f.key}">--</div>
</div>`,
    )
    .join('\n');
  return `<div class="live-row">
${boxes}
</div>
<img id="img-${escapeAttr(id)}" data-refresh src="components/${escapeAttr(id)}/image?headerBoxes=0&t=${timestamp}" width="${width}" height="${height}">`;
}

function renderImageWidget(component, timestamp) {
  const { id, width, height } = component;
  return `<img id="img-${escapeAttr(id)}" data-refresh src="components/${escapeAttr(id)}/image?t=${timestamp}" width="${width}" height="${height}">`;
}

function renderScript(liveEntries, hasImages) {
  if (liveEntries.length === 0 && !hasImages) return '';

  const liveJson = JSON.stringify(liveEntries);

  const imageRefreshBlock = hasImages
    ? `
  var images = document.querySelectorAll('img[data-refresh]');
  setInterval(function () {
    images.forEach(function (img) {
      var src = img.getAttribute('src').split('?')[0];
      var params = img.getAttribute('src').indexOf('headerBoxes=0') !== -1 ? '?headerBoxes=0&t=' : '?t=';
      img.setAttribute('src', src + params + Date.now());
    });
  }, 30000);`
    : '';

  const liveBlock =
    liveEntries.length > 0
      ? `
  var LIVE = ${liveJson};
  var MPS_TO_KNOTS = ${MPS_TO_KNOTS};
  var RAD_TO_DEG = 180 / Math.PI;
  var byPath = {};
  LIVE.forEach(function (entry) {
    (byPath[entry.path] = byPath[entry.path] || []).push(entry);
  });

  function normalizeDeg(v) {
    return ((v % 360) + 360) % 360;
  }

  function convert(value, name) {
    if (name === 'mpsToKnots') return value * MPS_TO_KNOTS;
    if (name === 'radiansToDegrees') return normalizeDeg(value * RAD_TO_DEG);
    return value;
  }

  function formatValue(entry, raw) {
    if (typeof raw !== 'number' || !isFinite(raw)) return '--';
    var text = convert(raw, entry.conversion).toFixed(entry.decimals);
    return entry.unit ? text + ' ' + entry.unit : text;
  }

  var reconnectDelayMs = 1000;

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var ws = new WebSocket(proto + '//' + location.host + '/signalk/v1/stream?subscribe=none');
    ws.onopen = function () {
      reconnectDelayMs = 1000;
      ws.send(JSON.stringify({
        context: 'vessels.self',
        subscribe: Object.keys(byPath).map(function (path) { return { path: path, period: 1000 }; }),
      }));
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      (msg.updates || []).forEach(function (update) {
        (update.values || []).forEach(function (v) {
          (byPath[v.path] || []).forEach(function (entry) {
            var el = document.getElementById('live-' + entry.id);
            if (el) el.textContent = formatValue(entry, v.value);
          });
        });
      });
    };
    ws.onerror = function () { ws.close(); };
    ws.onclose = function () {
      setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
    };
  }
  connect();`
      : '';

  return `<script>
(function () {${imageRefreshBlock}${liveBlock}
})();
</script>
`;
}

module.exports = { renderLiveDashboardHtml };
