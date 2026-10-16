'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderLiveDashboardHtml } = require('../lib/render-live-dashboard');

test('renders a numeric component as a live value span, not an img', () => {
  const pages = [
    {
      title: '',
      components: [{ id: 'depth', type: 'numeric', width: 240, height: 120, path: 'environment.depth.belowTransducer', unit: 'm', decimals: 1, label: 'Depth' }],
    },
  ];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.doesNotMatch(html, /components\/depth\/image/);
  assert.match(html, /id="live-depth"/);
  assert.match(html, />Depth</);
});

test('embeds the live component\'s path, unit, decimals and conversion for client-side formatting', () => {
  const pages = [
    {
      title: '',
      components: [
        { id: 'sog', type: 'numeric', width: 240, height: 120, path: 'navigation.speedOverGround', unit: 'kt', decimals: 1, conversion: 'mpsToKnots', label: 'SOG' },
      ],
    },
  ];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /"id":"sog"/);
  assert.match(html, /"path":"navigation\.speedOverGround"/);
  assert.match(html, /"unit":"kt"/);
  assert.match(html, /"decimals":1/);
  assert.match(html, /"conversion":"mpsToKnots"/);
});

test('renders a non-numeric, non-wind-trend component as a periodically-refreshed img, not a live span', () => {
  const pages = [{ title: '', components: [{ id: 'maneuver', type: 'maneuverScore', width: 480, height: 200 }] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /<img[^>]*id="img-maneuver"[^>]*data-refresh[^>]*src="components\/maneuver\/image\?t=1700000000000"[^>]*width="480"[^>]*height="200"/);
  assert.doesNotMatch(html, /"id":"maneuver"/);
});

test('does not include a meta refresh tag, since the page updates itself via WebSocket/JS', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.doesNotMatch(html, /<meta http-equiv="refresh"/);
});

test('uses a white background, suited to a Kindle e-ink screen', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /body\s*\{[^}]*background:\s*#fff[^}]*\}/);
});

test('renders images pixelated rather than smoothed, so CSS-scaled images stay crisp on e-ink', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /body\s*\{[^}]*image-rendering:\s*pixelated[^}]*\}/);
});

test('scales images and live widgets down to fit the viewport instead of overflowing a smaller screen', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /img\s*\{[^}]*max-width:\s*100%[^}]*\}/);
  assert.match(html, /img\s*\{[^}]*max-height:\s*100vh[^}]*\}/);
  assert.match(html, /\.live\s*\{[^}]*max-width:\s*100%[^}]*\}/);
  assert.match(html, /\.live\s*\{[^}]*max-height:\s*100vh[^}]*\}/);
});

test('renders a friendly message when no components are configured', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /No components configured/);
});

test('renders only the current page\'s components, not other pages\'', () => {
  const pages = [
    { title: '', components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'a', unit: '', decimals: 1, label: '' }] },
    { title: '', components: [{ id: 'windtrend', type: 'windTrend', width: 100, height: 50 }] },
  ];
  const html = renderLiveDashboardHtml(pages, 1, { now: () => 1700000000000 });
  assert.doesNotMatch(html, /live-depth/);
  assert.match(html, /img-windtrend/);
});

test('does not show a pagination link when there is only one page', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.doesNotMatch(html, /<a href=/);
});

test('shows a next-page link to the following page, with the page count', () => {
  const pages = [{ title: '', components: [] }, { title: '', components: [] }, { title: '', components: [] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /<a href="dashboard-live\?page=1"[^>]*>[^<]*2 \/ 3[^<]*<\/a>/);
});

test('wraps the next-page link from the last page back to the first', () => {
  const pages = [{ title: '', components: [] }, { title: '', components: [] }];
  const html = renderLiveDashboardHtml(pages, 1, { now: () => 1700000000000 });
  assert.match(html, /<a href="dashboard-live\?page=0"/);
});

test('clamps an out-of-range page index to the last page', () => {
  const pages = [{ title: 'Only', components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'a', unit: '', decimals: 1, label: '' }] }];
  const html = renderLiveDashboardHtml(pages, 5, { now: () => 1700000000000 });
  assert.match(html, /live-depth/);
});

test('uses tighter margins between the wind-trend header-row boxes', () => {
  const pages = [{ title: '', components: [{ id: 'twd', type: 'windDirectionTrend', width: 300, height: 150 }] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /\.live-row\s*\{[^}]*margin-bottom:\s*4px[^}]*\}/);
  assert.match(html, /\.live-row \.live\s*\{[^}]*margin-right:\s*4px[^}]*\}/);
});

test('renders the wind-trend header-row value alone, with no label, centered and filling the box', () => {
  const pages = [{ title: '', components: [{ id: 'twd', type: 'windDirectionTrend', width: 300, height: 150 }] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.doesNotMatch(html, /<div class="live-label">/);
  assert.match(html, /\.live-row \.live\s*\{[^}]*justify-content:\s*center[^}]*align-items:\s*center[^}]*\}/);
  assert.match(html, /\.live-row \.live-value\s*\{[^}]*font-size:\s*4\.5rem[^}]*\}/);
});

test('renders windSpeedTrend as live SOG/TWS boxes plus a header-less chart image', () => {
  const pages = [{ title: '', components: [{ id: 'tws', type: 'windSpeedTrend', width: 300, height: 150 }] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });

  assert.match(html, /id="live-tws-sog"/);
  assert.match(html, /"path":"navigation\.speedOverGround"/);

  assert.match(html, /id="live-tws-tws"/);
  assert.match(html, /"path":"environment\.wind\.speedTrue"/);

  assert.doesNotMatch(html, /id="live-tws-twd"/);

  assert.match(html, /<img[^>]*id="img-tws"[^>]*data-refresh[^>]*src="components\/tws\/image\?headerBoxes=0&t=1700000000000"/);
});

test('renders windDirectionTrend as live SOG/TWD boxes (radiansToDegrees conversion) plus a header-less chart image', () => {
  const pages = [{ title: '', components: [{ id: 'twd', type: 'windDirectionTrend', width: 300, height: 150 }] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });

  assert.match(html, /id="live-twd-sog"/);
  assert.match(html, /id="live-twd-twd"/);
  assert.match(html, /"path":"environment\.wind\.directionTrue"[^}]*"conversion":"radiansToDegrees"/);
  assert.doesNotMatch(html, /id="live-twd-tws"/);
  assert.match(html, /src="components\/twd\/image\?headerBoxes=0&t=1700000000000"/);
});

test('renders windTrend (combined) as live SOG/TWS/TWD boxes plus a header-less chart image', () => {
  const pages = [{ title: '', components: [{ id: 'wind', type: 'windTrend', width: 300, height: 150 }] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });

  assert.match(html, /id="live-wind-sog"/);
  assert.match(html, /id="live-wind-tws"/);
  assert.match(html, /id="live-wind-twd"/);
});

test('leaves maneuverScore as a plain periodically-refreshed image, not a live widget', () => {
  const pages = [{ title: '', components: [{ id: 'maneuver', type: 'maneuverScore', width: 300, height: 200 }] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /<img[^>]*id="img-maneuver"[^>]*data-refresh[^>]*src="components\/maneuver\/image\?t=1700000000000"/);
  assert.doesNotMatch(html, /live-maneuver/);
});

test('includes a radiansToDegrees client-side conversion when a wind-direction live field is present', () => {
  const pages = [{ title: '', components: [{ id: 'twd', type: 'windDirectionTrend', width: 300, height: 150 }] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /radiansToDegrees/);
});

test('omits the WebSocket connection entirely when the page has no live components', () => {
  const pages = [{ title: '', components: [{ id: 'maneuver', type: 'maneuverScore', width: 100, height: 50 }] }];
  const html = renderLiveDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.doesNotMatch(html, /new WebSocket/);
});
