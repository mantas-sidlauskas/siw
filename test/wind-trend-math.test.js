'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { unwrapDegrees, centeredRange, movingAverage, computePanelLayout } = require('../lib/wind-trend-math');

test('unwrapDegrees leaves a non-wrapping series unchanged', () => {
  assert.deepEqual(unwrapDegrees([10, 20, 30]), [10, 20, 30]);
});

test('unwrapDegrees turns a 350->10 wobble into a continuous climb instead of a cliff', () => {
  assert.deepEqual(unwrapDegrees([350, 355, 2, 8]), [350, 355, 362, 368]);
});

test('unwrapDegrees preserves null gaps and keeps unwrapping across them', () => {
  assert.deepEqual(unwrapDegrees([350, null, 2]), [350, null, 362]);
});

test('unwrapDegrees returns an all-null array when nothing is finite', () => {
  assert.deepEqual(unwrapDegrees([null, NaN]), [null, null]);
});

test('unwrapDegrees handles an empty array', () => {
  assert.deepEqual(unwrapDegrees([]), []);
});

test('centeredRange centers on the mean and never goes narrower than minSpan', () => {
  assert.deepEqual(centeredRange([100, 110, 120], { minSpan: 30 }), { center: 110, min: 95, max: 125 });
});

test('centeredRange widens past minSpan to fit a larger spread with padding', () => {
  const range = centeredRange([0, 60, 120], { minSpan: 30 });
  assert.equal(range.center, 60);
  assert.equal(range.min, -6);
  assert.equal(range.max, 126);
});

test('centeredRange returns null when there is no finite data', () => {
  assert.equal(centeredRange([null, NaN]), null);
});

test('movingAverage smooths a simple ramp with partial windows at the edges', () => {
  assert.deepEqual(movingAverage([1, 2, 3, 4, 5], 3), [1.5, 2, 3, 4, 4.5]);
});

test('movingAverage keeps null gaps as null and skips them when averaging neighbors', () => {
  assert.deepEqual(movingAverage([1, null, 3], 3), [1, null, 3]);
});

test('computePanelLayout splits the chart width evenly between two side-by-side panels', () => {
  const layout = computePanelLayout(300, 200, ['speed', 'direction']);
  assert.equal(layout.panels.length, 2);
  assert.equal(layout.panels[0].key, 'speed');
  assert.equal(layout.panels[0].x, 0);
  assert.equal(layout.panels[1].key, 'direction');
  assert.equal(layout.panels[1].x, layout.panels[0].width);
  assert.equal(layout.panels[0].width, layout.panels[1].width);
  assert.equal(layout.panels[0].width * 2, layout.chartWidth);
});

test('computePanelLayout gives a single panel the full chart width', () => {
  const layout = computePanelLayout(300, 200, ['speed']);
  assert.equal(layout.panels.length, 1);
  assert.equal(layout.panels[0].x, 0);
  assert.equal(layout.panels[0].width, layout.chartWidth);
});

test('computePanelLayout reserves a time-axis column narrower than the full width', () => {
  const layout = computePanelLayout(300, 200, ['speed']);
  assert.ok(layout.timeColWidth > 0);
  assert.equal(layout.chartWidth, 300 - layout.timeColWidth);
});

test('computePanelLayout keeps the header boxes a modest fraction of the chart height, since the trend line is the main content', () => {
  const layout = computePanelLayout(300, 860, ['speed']);
  assert.ok(layout.headerHeight < 860 * 0.2);
});

test('computePanelLayout keeps the axis tick/time-label font small relative to the chart height', () => {
  const layout = computePanelLayout(300, 860, ['speed']);
  assert.ok(layout.tickFontPx < 860 * 0.04);
});

test('computePanelLayout keeps line widths at their historical minimums for small chart sizes', () => {
  // rawLineWidth/trendLineWidth were doubled (2026-10) for e-ink visibility
  // from a distance - the raw ("gust") and smoothed ("median") lines were
  // barely visible at the old widths.
  const layout = computePanelLayout(300, 150, ['speed']);
  assert.equal(layout.rawLineWidth, 2);
  assert.equal(layout.trendLineWidth, 6);
  assert.equal(layout.centerLineWidth, 1.5);
});

test('computePanelLayout reserves no header space when showHeaderBoxes is false, so the chart fills the full height', () => {
  const layout = computePanelLayout(300, 860, ['speed'], { showHeaderBoxes: false });
  assert.equal(layout.headerHeight, 0);
  assert.equal(layout.chartTop, layout.tickFontPx + 4);
});

test('computePanelLayout scales line widths up for a much taller chart, so they stay visible at a distance', () => {
  const small = computePanelLayout(300, 150, ['speed']);
  const big = computePanelLayout(720, 860, ['speed']);
  assert.ok(big.trendLineWidth > small.trendLineWidth);
  assert.ok(big.rawLineWidth > small.rawLineWidth);
  assert.ok(big.centerLineWidth > small.centerLineWidth);
});
