'use strict';
const { radiansToDegrees } = require('./units');
const { unwrapDegrees } = require('./wind-trend-math');

const DEFAULT_MIN_SWING_DEGREES = 40;
const DEFAULT_PRE_WINDOW_SECONDS = 30;
const DEFAULT_DIP_SEARCH_SECONDS = 90;
const DEFAULT_RECOVERY_THRESHOLD_RATIO = 0.95;

// Finds the most recent tack or jibe in `rows` ([timestamp, cogRadians,
// twdRadians, polarSpeedRatio], oldest first) and scores how much polar
// performance it cost.
//
// The boat's course relative to the wind (TWD - COG, normalized to [0,360))
// is unwrapped into a continuous series (reusing the same technique as the
// wind-trend chart's direction axis). A tack is a crossing of that series
// through a multiple of 360 degrees (wind dead ahead); a jibe is a crossing
// through an odd multiple of 180 (wind dead astern). A crossing only counts
// as a maneuver - not ordinary course wander - once the swing across it
// exceeds `minSwingDegrees`.
function detectLatestManeuver(rows, options = {}) {
  const {
    minSwingDegrees = DEFAULT_MIN_SWING_DEGREES,
    preWindowSeconds = DEFAULT_PRE_WINDOW_SECONDS,
    dipSearchSeconds = DEFAULT_DIP_SEARCH_SECONDS,
    recoveryThresholdRatio = DEFAULT_RECOVERY_THRESHOLD_RATIO,
  } = options;

  if (!Array.isArray(rows) || rows.length < 2) return null;

  const relativeWindAngle = rows.map((r) => {
    const cog = r[1];
    const twd = r[2];
    if (!Number.isFinite(cog) || !Number.isFinite(twd)) return null;
    const diff = radiansToDegrees(twd) - radiansToDegrees(cog);
    return ((diff % 360) + 360) % 360;
  });
  const unwrapped = unwrapDegrees(relativeWindAngle);

  const crossingIndex = findLatestCrossingIndex(unwrapped, minSwingDegrees);
  if (crossingIndex === null) return null;

  const polarRatio = rows.map((r) => (Number.isFinite(r[3]) ? r[3] : null));
  const score = scoreManeuver(rows, polarRatio, crossingIndex.index, {
    preWindowSeconds,
    dipSearchSeconds,
    recoveryThresholdRatio,
  });

  return {
    type: crossingIndex.type,
    timestamp: rows[crossingIndex.index][0],
    ...score,
  };
}

function findLatestCrossingIndex(unwrapped, minSwingDegrees) {
  let latest = null;
  for (let i = 0; i < unwrapped.length - 1; i++) {
    const a = unwrapped[i];
    const b = unwrapped[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = b - a;
    if (Math.abs(delta) < minSwingDegrees) continue;

    const beforeHalf = Math.floor(a / 180);
    const afterHalf = Math.floor(b / 180);
    if (beforeHalf === afterHalf) continue; // didn't cross a 180-degree boundary

    const boundary = delta > 0 ? (beforeHalf + 1) * 180 : beforeHalf * 180;
    const boundaryMod360 = ((boundary % 360) + 360) % 360;
    const type = boundaryMod360 < 90 || boundaryMod360 > 270 ? 'tack' : 'jibe';
    latest = { index: i + 1, type };
  }
  return latest;
}

function scoreManeuver(rows, polarRatio, crossingIndex, { preWindowSeconds, dipSearchSeconds, recoveryThresholdRatio }) {
  const crossingTime = new Date(rows[crossingIndex][0]).getTime();

  const preValues = [];
  for (let i = 0; i < crossingIndex; i++) {
    if (polarRatio[i] === null) continue;
    const elapsed = crossingTime - new Date(rows[i][0]).getTime();
    if (elapsed >= 0 && elapsed <= preWindowSeconds * 1000) preValues.push(polarRatio[i]);
  }
  const preAvg = preValues.length ? preValues.reduce((sum, v) => sum + v, 0) / preValues.length : null;

  let minDuring = null;
  let minDuringTime = null;
  for (let i = crossingIndex; i < rows.length; i++) {
    if (polarRatio[i] === null) continue;
    const t = new Date(rows[i][0]).getTime();
    if (t - crossingTime > dipSearchSeconds * 1000) break;
    if (minDuring === null || polarRatio[i] < minDuring) {
      minDuring = polarRatio[i];
      minDuringTime = t;
    }
  }

  const dipPercent = preAvg !== null && minDuring !== null && preAvg > 0
    ? Math.max(0, Math.round(((preAvg - minDuring) / preAvg) * 100))
    : null;

  let recoverySeconds = null;
  if (preAvg !== null && minDuringTime !== null) {
    const threshold = preAvg * recoveryThresholdRatio;
    for (let i = crossingIndex; i < rows.length; i++) {
      if (polarRatio[i] === null) continue;
      const t = new Date(rows[i][0]).getTime();
      if (t < minDuringTime) continue;
      if (polarRatio[i] >= threshold) {
        recoverySeconds = Math.round((t - crossingTime) / 1000);
        break;
      }
    }
  }

  return { preAvg, minDuring, dipPercent, recoverySeconds };
}

module.exports = { detectLatestManeuver };
