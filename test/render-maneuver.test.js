'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImage } = require('@napi-rs/canvas');
const { renderManeuverScore } = require('../lib/render-maneuver');

const DEG = Math.PI / 180;

function row(secondsFromNow, cogDeg, twdDeg, polarRatio) {
  const t = new Date(Date.now() - secondsFromNow * 1000).toISOString();
  return [t, cogDeg * DEG, twdDeg * DEG, polarRatio];
}

const TACK_ROWS = [
  row(60, 320, 0, 0.9),
  row(45, 320, 0, 0.9),
  row(30, 40, 0, 0.5),
  row(15, 40, 0, 0.7),
  row(0, 40, 0, 0.9),
];

const JIBE_ROWS = [
  row(60, 140, 0, 0.9),
  row(45, 140, 0, 0.9),
  row(30, 220, 0, 0.5),
  row(15, 220, 0, 0.7),
  row(0, 220, 0, 0.9),
];

test('renders at the configured size when a maneuver is detected', async () => {
  const component = { width: 300, height: 200, format: 'png' };
  const { buffer, contentType } = renderManeuverScore(component, { data: TACK_ROWS });
  assert.equal(contentType, 'image/png');
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
  assert.equal(image.height, 200);
});

test('renders a placeholder at the configured size when history is null', async () => {
  const component = { width: 300, height: 200, format: 'png' };
  const { buffer } = renderManeuverScore(component, null);
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
  assert.equal(image.height, 200);
});

test('renders a placeholder when history data is an empty array', async () => {
  const component = { width: 300, height: 200, format: 'png' };
  const { buffer } = renderManeuverScore(component, { data: [] });
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
});

test('renders a "no maneuver" placeholder at the configured size when the course never crossed the wind', async () => {
  const component = { width: 300, height: 200, format: 'png' };
  const steady = [row(60, 320, 0, 0.9), row(45, 321, 0, 0.9), row(30, 319, 0, 0.9), row(15, 320, 0, 0.9)];
  const { buffer } = renderManeuverScore(component, { data: steady });
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
  assert.equal(image.height, 200);
});

test('renders a tack and a jibe as genuinely different images', () => {
  const component = { width: 300, height: 200, format: 'png' };
  const tackBuf = renderManeuverScore(component, { data: TACK_ROWS }).buffer;
  const jibeBuf = renderManeuverScore(component, { data: JIBE_ROWS }).buffer;
  assert.notDeepEqual(tackBuf, jibeBuf);
});

test('does not throw when polarSpeedRatio data is entirely missing', () => {
  const component = { width: 300, height: 200, format: 'png' };
  const rows = [row(30, 320, 0, null), row(15, 40, 0, null), row(0, 40, 0, null)];
  assert.doesNotThrow(() => renderManeuverScore(component, { data: rows }));
});

test('renders JPEG when format is jpeg', () => {
  const component = { width: 300, height: 200, format: 'jpeg' };
  const { contentType, buffer } = renderManeuverScore(component, { data: TACK_ROWS });
  assert.equal(contentType, 'image/jpeg');
  assert.ok(buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
});

test('renders SVG with correct dimensions and the maneuver type as text', async () => {
  const component = { width: 300, height: 200, format: 'svg' };
  const { buffer, contentType } = renderManeuverScore(component, { data: TACK_ROWS });
  assert.equal(contentType, 'image/svg+xml');
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
  assert.equal(image.height, 200);
  assert.match(buffer.toString('utf8'), />TACK</);
});

test('renders an SVG placeholder at the configured size when history is null', async () => {
  const component = { width: 300, height: 200, format: 'svg' };
  const { buffer, contentType } = renderManeuverScore(component, null);
  assert.equal(contentType, 'image/svg+xml');
  const image = await loadImage(buffer);
  assert.equal(image.width, 300);
  assert.equal(image.height, 200);
});
