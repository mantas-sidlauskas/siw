'use strict';

// Accumulates a continuous value for each finite angle in `degrees` by adding
// the shortest signed delta at each step, so a wobble across the 0/360
// boundary (e.g. 350 -> 10) reads as a small continuous change instead of a
// ~360 degree cliff. Non-finite entries stay null (gaps); unwrapping resumes
// from the last finite raw angle once data returns.
function unwrapDegrees(degrees) {
  const result = new Array(degrees.length).fill(null);
  let prevRaw = null;
  let prevUnwrapped = null;
  for (let i = 0; i < degrees.length; i++) {
    const value = degrees[i];
    if (!Number.isFinite(value)) continue;
    const normalized = ((value % 360) + 360) % 360;
    if (prevRaw === null) {
      prevUnwrapped = normalized;
    } else {
      let delta = normalized - prevRaw;
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;
      prevUnwrapped += delta;
    }
    result[i] = prevUnwrapped;
    prevRaw = normalized;
  }
  return result;
}

// Axis range centered on the mean of `values` (ignoring non-finite entries),
// wide enough to fit every value with a little padding, never narrower than
// minSpan. Used for circular quantities (already unwrapped) so the axis
// window moves with the data instead of spanning a fixed 0-360.
function centeredRange(values, { minSpan = 30, padRatio = 0.1 } = {}) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const center = finite.reduce((sum, v) => sum + v, 0) / finite.length;
  const maxDeviation = Math.max(...finite.map((v) => Math.abs(v - center)));
  const halfSpan = Math.max(minSpan / 2, maxDeviation * (1 + padRatio));
  return { center, min: center - halfSpan, max: center + halfSpan };
}

// Boxcar moving average. A non-finite entry stays null in the output and is
// skipped when averaging its neighbors.
function movingAverage(values, windowSize) {
  const half = Math.floor(windowSize / 2);
  return values.map((value, i) => {
    if (!Number.isFinite(value)) return null;
    const start = Math.max(0, i - half);
    const end = Math.min(values.length - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      if (Number.isFinite(values[j])) {
        sum += values[j];
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  });
}

// Layout for the wind-trend chart: a shared right-hand time-axis column, and
// the remaining chart width split evenly between one panel per entry in
// `which` (e.g. ['speed', 'direction'] for the combined chart, or a single
// entry for a split-out speed- or direction-only chart).
function computePanelLayout(width, height, which) {
  const tickFontPx = Math.max(7, Math.floor(height * 0.03));
  // The header boxes (current speed/direction, plus SOG) are auxiliary data -
  // the trend line is the main content - so they get a modest, fixed-ratio
  // slice of the height rather than competing with the chart for space.
  const headerHeight = Math.max(36, Math.round(height * 0.15));
  const chartTop = headerHeight + tickFontPx + 4;
  const chartBottom = height - 2;

  const timeColWidth = Math.max(26, Math.round(width * 0.07));
  const chartWidth = width - timeColWidth;
  const panelWidth = chartWidth / which.length;
  const panels = which.map((key, i) => ({ key, x: i * panelWidth, width: panelWidth }));

  // Scale stroke widths with chart height so lines stay visible at a distance
  // on a large configured size, instead of looking skinny once the canvas
  // grows well past the sizes these floors were originally tuned for.
  const rawLineWidth = Math.max(1, height / 500);
  const trendLineWidth = Math.max(3, height / 140);
  const centerLineWidth = Math.max(1.5, height / 350);

  return {
    tickFontPx,
    headerHeight,
    chartTop,
    chartBottom,
    timeColWidth,
    chartWidth,
    panels,
    rawLineWidth,
    trendLineWidth,
    centerLineWidth,
  };
}

module.exports = { unwrapDegrees, centeredRange, movingAverage, computePanelLayout };
