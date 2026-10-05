'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImage } = require('canvas');
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
