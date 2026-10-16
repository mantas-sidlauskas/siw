'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImage } = require('@napi-rs/canvas');
const { createSvgContext } = require('../lib/svg-context');

test('toSvgString produces a well-formed SVG at the configured dimensions', async () => {
  const { toSvgString } = createSvgContext(200, 100);
  const buffer = Buffer.from(toSvgString());
  const image = await loadImage(buffer);
  assert.equal(image.width, 200);
  assert.equal(image.height, 100);
});

test('fillRect emits a filled rect with the current fillStyle', () => {
  const { ctx, toSvgString } = createSvgContext(50, 50);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(1, 2, 10, 20);
  const svg = toSvgString();
  assert.match(svg, /<rect[^>]*x="1"[^>]*y="2"[^>]*width="10"[^>]*height="20"[^>]*fill="#ff0000"/);
});

test('strokeRect emits an unfilled, stroked rect', () => {
  const { ctx, toSvgString } = createSvgContext(50, 50);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, 40, 40);
  const svg = toSvgString();
  assert.match(svg, /<rect[^>]*fill="none"[^>]*stroke="#000000"[^>]*stroke-width="1.5"/);
});

test('fillText escapes markup-significant characters', () => {
  const { ctx, toSvgString } = createSvgContext(100, 30);
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('<A&B>', 5, 5);
  const svg = toSvgString();
  assert.match(svg, />&lt;A&amp;B&gt;</);
});

test('fillText maps canvas textAlign to SVG text-anchor', () => {
  const { ctx, toSvgString } = createSvgContext(100, 30);
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('hi', 50, 15);
  assert.match(toSvgString(), /text-anchor="middle"/);
});

test('measureText delegates to a real canvas context, matching its metrics for the same font', () => {
  const { createCanvas } = require('@napi-rs/canvas');
  const reference = createCanvas(1, 1).getContext('2d');
  reference.font = 'bold 24px sans-serif';
  const expectedWidth = reference.measureText('12.3 kt').width;

  const { ctx } = createSvgContext(100, 30);
  ctx.font = 'bold 24px sans-serif';
  assert.equal(ctx.measureText('12.3 kt').width, expectedWidth);
});

test('stroke draws one connected subpath for a single moveTo/lineTo run', () => {
  const { ctx, toSvgString } = createSvgContext(50, 50);
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 10);
  ctx.lineTo(20, 5);
  ctx.stroke();
  const svg = toSvgString();
  const pathMatch = svg.match(/<path d="([^"]+)"/);
  assert.ok(pathMatch, 'expected a <path> element');
  assert.equal(pathMatch[1], 'M0 0 L10 10 L20 5');
});

test('stroke draws disconnected subpaths when moveTo is called mid-path, without a connecting segment', () => {
  // Mirrors render-wind-trend.js's divider: two unrelated line segments drawn
  // in one beginPath/stroke pair must not grow a spurious line between them.
  const { ctx, toSvgString } = createSvgContext(50, 50);
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(0, 10);
  ctx.moveTo(30, 5);
  ctx.lineTo(30, 20);
  ctx.stroke();
  const svg = toSvgString();
  const pathMatch = svg.match(/<path d="([^"]+)"/);
  assert.ok(pathMatch, 'expected a <path> element');
  assert.equal(pathMatch[1], 'M0 2 L0 10 M30 5 L30 20');
});

test('rgba fillStyle is split into a plain color plus fill-opacity', () => {
  const { ctx, toSvgString } = createSvgContext(50, 50);
  ctx.fillStyle = 'rgba(0, 112, 26, 0.18)';
  ctx.fillRect(0, 0, 10, 10);
  const svg = toSvgString();
  assert.match(svg, /fill="rgb\(0, 112, 26\)" fill-opacity="0.18"/);
});

test('rgba strokeStyle is split into a plain color plus stroke-opacity', () => {
  const { ctx, toSvgString } = createSvgContext(50, 50);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 10);
  ctx.stroke();
  const svg = toSvgString();
  assert.match(svg, /stroke="rgb\(0, 0, 0\)"[^>]*stroke-opacity="0.3"/);
});
