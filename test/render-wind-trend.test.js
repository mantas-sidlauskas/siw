'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImage } = require('@napi-rs/canvas');
const { renderWindTrend, renderWindSpeedTrend, renderWindDirectionTrend } = require('../lib/render-wind-trend');

const DEG = Math.PI / 180;

const RENDERERS = {
  renderWindTrend,
  renderWindSpeedTrend,
  renderWindDirectionTrend,
};

test('renders two trend lines when history data is present', async () => {
  const component = { width: 300, height: 150, format: 'png' };
  const history = {
    data: [
      ['2026-01-01T00:00:00Z', 270 * DEG, 10],
      ['2026-01-01T00:05:00Z', 275 * DEG, 11],
      ['2026-01-01T00:10:00Z', 280 * DEG, 9],
    ],
  };
  const { buffer, contentType } = renderWindTrend(component, history);
  assert.equal(contentType, 'image/png');
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
  assert.equal(image.height, 150);
});

test('does not throw when the wind direction wobbles across the 0/360 boundary', async () => {
  const component = { width: 300, height: 150, format: 'png' };
  const history = {
    data: [
      ['2026-01-01T00:00:00Z', 350 * DEG, 10],
      ['2026-01-01T00:05:00Z', 355 * DEG, 11],
      ['2026-01-01T00:10:00Z', 2 * DEG, 9],
      ['2026-01-01T00:15:00Z', 8 * DEG, 10],
    ],
  };
  const { buffer } = renderWindTrend(component, history);
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
  assert.equal(image.height, 150);
});

test('renders a placeholder at the configured size when history is null', async () => {
  const component = { width: 300, height: 150, format: 'png' };
  const { buffer } = renderWindTrend(component, null);
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
  assert.equal(image.height, 150);
});

test('renders a placeholder when history data is an empty array', async () => {
  const component = { width: 300, height: 150, format: 'png' };
  const { buffer } = renderWindTrend(component, { data: [] });
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
});

test('does not throw with a single data point', async () => {
  const component = { width: 200, height: 100, format: 'png' };
  const history = { data: [['2026-01-01T00:00:00Z', 270 * DEG, 10]] };
  assert.doesNotThrow(() => renderWindTrend(component, history));
});

for (const [name, render] of Object.entries(RENDERERS)) {
  test(`${name} renders at the configured size, with and without history data`, async () => {
    const component = { width: 300, height: 150, format: 'png' };
    const history = {
      data: [
        ['2026-01-01T00:00:00Z', 270 * DEG, 10],
        ['2026-01-01T00:05:00Z', 275 * DEG, 11],
        ['2026-01-01T00:10:00Z', 280 * DEG, 9],
      ],
    };
    const withData = await loadImage(render(component, history).buffer);
    assert.equal(withData.width, 300);
    assert.equal(withData.height, 150);

    const placeholder = await loadImage(render(component, null).buffer);
    assert.equal(placeholder.width, 300);
    assert.equal(placeholder.height, 150);
  });

  test(`${name} does not throw with a single data point`, () => {
    const component = { width: 200, height: 100, format: 'png' };
    const history = { data: [['2026-01-01T00:00:00Z', 270 * DEG, 10]] };
    assert.doesNotThrow(() => render(component, history));
  });
}

test('renderWindSpeedTrend and renderWindDirectionTrend each draw only their own panel, so their output differs', () => {
  const component = { width: 300, height: 150, format: 'png' };
  const history = {
    data: [
      ['2026-01-01T00:00:00Z', 270 * DEG, 10],
      ['2026-01-01T00:05:00Z', 275 * DEG, 11],
      ['2026-01-01T00:10:00Z', 280 * DEG, 9],
    ],
  };
  const speedOnly = renderWindSpeedTrend(component, history).buffer;
  const directionOnly = renderWindDirectionTrend(component, history).buffer;
  const combined = renderWindTrend(component, history).buffer;
  assert.notDeepEqual(speedOnly, directionOnly);
  assert.notDeepEqual(speedOnly, combined);
  assert.notDeepEqual(directionOnly, combined);
});

for (const [name, render] of Object.entries(RENDERERS)) {
  test(`${name} draws a different image when given a speedOverGround value than when omitted`, () => {
    const component = { width: 300, height: 150, format: 'png' };
    const history = {
      data: [
        ['2026-01-01T00:00:00Z', 270 * DEG, 10],
        ['2026-01-01T00:05:00Z', 275 * DEG, 11],
        ['2026-01-01T00:10:00Z', 280 * DEG, 9],
      ],
    };
    const withoutSog = render(component, history).buffer;
    const withSog = render(component, history, { speedOverGround: 2.5 }).buffer;
    assert.notDeepEqual(withoutSog, withSog);
  });

  test(`${name} does not throw when speedOverGround is omitted (backward compatible call)`, () => {
    const component = { width: 300, height: 150, format: 'png' };
    const history = { data: [['2026-01-01T00:00:00Z', 270 * DEG, 10]] };
    assert.doesNotThrow(() => render(component, history));
  });
}

for (const [name, render] of Object.entries(RENDERERS)) {
  test(`${name} renders SVG at the configured size, with and without history data`, async () => {
    const component = { width: 300, height: 150, format: 'svg' };
    const history = {
      data: [
        ['2026-01-01T00:00:00Z', 270 * DEG, 10],
        ['2026-01-01T00:05:00Z', 275 * DEG, 11],
        ['2026-01-01T00:10:00Z', 280 * DEG, 9],
      ],
    };
    const { buffer, contentType } = render(component, history);
    assert.equal(contentType, 'image/svg+xml');
    const withData = await loadImage(buffer);
    assert.equal(withData.width, 300);
    assert.equal(withData.height, 150);

    const placeholder = await loadImage(render(component, null).buffer);
    assert.equal(placeholder.width, 300);
    assert.equal(placeholder.height, 150);
  });
}

test('omits the header boxes (SOG/TWS/TWD) when showHeaderBoxes is false, keeping the chart', () => {
  const component = { width: 300, height: 150, format: 'svg' };
  const history = {
    data: [
      ['2026-01-01T00:00:00Z', 270 * DEG, 10],
      ['2026-01-01T00:05:00Z', 275 * DEG, 11],
      ['2026-01-01T00:10:00Z', 280 * DEG, 9],
    ],
  };
  // The header box captions are right-aligned (text-anchor="end"), unlike the
  // large faint background watermark labels (text-anchor="middle", also
  // "TWS"/"TWD") which stay regardless of showHeaderBoxes - so the assertion
  // must target the caption specifically, not just the bare text content.
  const withBoxes = renderWindTrend(component, history, { speedOverGround: 2.5 }).buffer.toString('utf8');
  assert.match(withBoxes, /text-anchor="end"[^>]*>SOG</);
  assert.match(withBoxes, /text-anchor="end"[^>]*>TWS</);

  const withoutBoxes = renderWindTrend(component, history, { speedOverGround: 2.5, showHeaderBoxes: false }).buffer.toString('utf8');
  assert.doesNotMatch(withoutBoxes, /text-anchor="end"[^>]*>SOG</);
  assert.doesNotMatch(withoutBoxes, /text-anchor="end"[^>]*>TWS</);
  // The watermark itself must still be there - only the header row is gone.
  assert.match(withoutBoxes, /text-anchor="middle"[^>]*>TWS</);
  // The chart itself (the trend line paths) must still be there - only the
  // header row is suppressed, not the whole render.
  assert.match(withoutBoxes, /<path /);
});

test('renders at the configured size whether or not showHeaderBoxes is set', async () => {
  const component = { width: 300, height: 150, format: 'png' };
  const history = { data: [['2026-01-01T00:00:00Z', 270 * DEG, 10], ['2026-01-01T00:05:00Z', 275 * DEG, 11]] };
  const { buffer } = renderWindSpeedTrend(component, history, { showHeaderBoxes: false });
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
  assert.equal(image.height, 150);
});

test('draws the raw (gust) line near-black instead of faint gray, for visibility from a distance', () => {
  const component = { width: 300, height: 150, format: 'svg' };
  const history = {
    data: [
      ['2026-01-01T00:00:00Z', 270 * DEG, 10],
      ['2026-01-01T00:05:00Z', 275 * DEG, 11],
      ['2026-01-01T00:10:00Z', 280 * DEG, 9],
    ],
  };
  const svg = renderWindSpeedTrend(component, history).buffer.toString('utf8');
  const rawLine = svg.match(/<path d="[^"]+"[^>]*stroke="rgb\(0, 0, 0\)"[^>]*stroke-opacity="([^"]+)"/);
  assert.ok(rawLine, 'expected the raw-line path to use a black stroke with opacity');
  assert.ok(Number(rawLine[1]) >= 0.7, `expected near-black (opacity >= 0.7), got ${rawLine[1]}`);
});

test('draws the smoothed (median) line fully black, whether above or below the center value', () => {
  const component = { width: 300, height: 150, format: 'svg' };
  // Values that go both below and above the centered range's mean, so both
  // branches of the old above/below-center color logic would have fired.
  const history = {
    data: [
      ['2026-01-01T00:00:00Z', 270 * DEG, 5],
      ['2026-01-01T00:05:00Z', 270 * DEG, 15],
      ['2026-01-01T00:10:00Z', 270 * DEG, 5],
      ['2026-01-01T00:15:00Z', 270 * DEG, 15],
    ],
  };
  const svg = renderWindSpeedTrend(component, history).buffer.toString('utf8');
  assert.doesNotMatch(svg, /#b00020/);
  assert.doesNotMatch(svg, /#00701a/);
  const trendSegments = [...svg.matchAll(/<path d="[^"]+" fill="none" stroke="(#[0-9a-f]{6})" stroke-width="6/g)];
  assert.ok(trendSegments.length > 0, 'expected trend-line segments at the doubled width');
  trendSegments.forEach(([, color]) => assert.equal(color, '#000000'));
});

test('SVG wind trend draws disconnected line segments across a data gap without a spurious connecting line', () => {
  // Mirrors the PNG raw-line behavior: a non-finite reading breaks the
  // polyline into separate subpaths instead of connecting across the gap.
  // Two points on each side of the gap so both subpaths actually draw
  // (a lone point either side of the gap wouldn't produce a segment).
  const component = { width: 300, height: 150, format: 'svg' };
  const history = {
    data: [
      ['2026-01-01T00:00:00Z', 270 * DEG, 10],
      ['2026-01-01T00:05:00Z', 275 * DEG, 11],
      ['2026-01-01T00:10:00Z', 280 * DEG, null],
      ['2026-01-01T00:15:00Z', 280 * DEG, 9],
      ['2026-01-01T00:20:00Z', 280 * DEG, 8],
    ],
  };
  const { buffer } = renderWindSpeedTrend(component, history);
  const svg = buffer.toString('utf8');
  const rawLinePath = svg.match(/<path d="([^"]+)"[^>]*stroke="rgb\(0, 0, 0\)"[^>]*stroke-opacity="0.75"/);
  assert.ok(rawLinePath, 'expected a raw-line <path> element');
  const moveCommands = rawLinePath[1].match(/M/g) || [];
  assert.equal(moveCommands.length, 2, `expected two disconnected subpaths, got d="${rawLinePath[1]}"`);
});
