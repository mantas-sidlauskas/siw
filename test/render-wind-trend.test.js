'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImage } = require('canvas');
const { renderWindTrend } = require('../lib/render-wind-trend');

test('renders two trend lines when history data is present', async () => {
  const component = { width: 300, height: 150, format: 'png' };
  const history = {
    data: [
      ['2026-01-01T00:00:00Z', 270, 10],
      ['2026-01-01T00:05:00Z', 275, 11],
      ['2026-01-01T00:10:00Z', 280, 9],
    ],
  };
  const { buffer, contentType } = renderWindTrend(component, history);
  assert.equal(contentType, 'image/png');
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
  const history = { data: [['2026-01-01T00:00:00Z', 270, 10]] };
  assert.doesNotThrow(() => renderWindTrend(component, history));
});
