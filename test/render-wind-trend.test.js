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
