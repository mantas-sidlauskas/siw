'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImage } = require('@napi-rs/canvas');
const { renderNumeric } = require('../lib/render-numeric');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

test('renders a numeric value as PNG with correct dimensions', async () => {
  const component = { width: 200, height: 100, format: 'png', label: 'Depth', unit: 'm', decimals: 1 };
  const { buffer, contentType } = renderNumeric(component, 12.34);
  assert.equal(contentType, 'image/png');
  assert.ok(buffer.subarray(0, 4).equals(PNG_SIGNATURE));
  const image = await loadImage(buffer);
  assert.equal(image.width, 200);
  assert.equal(image.height, 100);
});

test('renders a placeholder when value is null, at the configured size', async () => {
  const component = { width: 150, height: 80, format: 'png', label: '', unit: '', decimals: 1 };
  const { buffer } = renderNumeric(component, null);
  const image = await loadImage(buffer);
  assert.equal(image.width, 150);
  assert.equal(image.height, 80);
});

test('renders a placeholder when value is not finite', async () => {
  const component = { width: 150, height: 80, format: 'png', label: '', unit: '', decimals: 1 };
  const { buffer } = renderNumeric(component, NaN);
  const image = await loadImage(buffer);
  assert.equal(image.width, 150);
});

test('renders JPEG when format is jpeg', () => {
  const component = { width: 100, height: 60, format: 'jpeg', label: '', unit: '', decimals: 0 };
  const { buffer, contentType } = renderNumeric(component, 5);
  assert.equal(contentType, 'image/jpeg');
  assert.ok(buffer.subarray(0, 3).equals(JPEG_SIGNATURE));
});

test('renders SVG with correct dimensions when format is svg', async () => {
  const component = { width: 200, height: 100, format: 'svg', label: 'Depth', unit: 'm', decimals: 1 };
  const { buffer, contentType } = renderNumeric(component, 12.34);
  assert.equal(contentType, 'image/svg+xml');
  const image = await loadImage(buffer);
  assert.equal(image.width, 200);
  assert.equal(image.height, 100);
});

test('SVG output contains the formatted value and label as text', () => {
  const component = { width: 200, height: 100, format: 'svg', label: 'Depth', unit: 'm', decimals: 1 };
  const { buffer } = renderNumeric(component, 12.34);
  const svg = buffer.toString('utf8');
  assert.match(svg, /<svg/);
  assert.match(svg, />Depth</);
  assert.match(svg, />12\.3 m</);
});

test('renders an SVG placeholder at the configured size when value is null', async () => {
  const component = { width: 150, height: 80, format: 'svg', label: '', unit: '', decimals: 1 };
  const { buffer, contentType } = renderNumeric(component, null);
  assert.equal(contentType, 'image/svg+xml');
  const image = await loadImage(buffer);
  assert.equal(image.width, 150);
  assert.equal(image.height, 80);
});

test('applies the configured conversion to the raw value before display', () => {
  const converted = { width: 150, height: 80, format: 'png', label: '', unit: 'kt', decimals: 1, conversion: 'mpsToKnots' };
  const raw = { width: 150, height: 80, format: 'png', label: '', unit: 'kt', decimals: 1 };
  // 5 m/s in knots renders different text ("9.7 kt") than 5 m/s shown unconverted ("5.0 kt"),
  // so the two PNGs must differ when the conversion is actually applied.
  assert.notDeepEqual(renderNumeric(converted, 5).buffer, renderNumeric(raw, 5).buffer);
});
