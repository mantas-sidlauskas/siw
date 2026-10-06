'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectLatestManeuver } = require('../lib/maneuver-detect');

const DEG = Math.PI / 180;

// rows: [timestamp, cogRadians, twdRadians, polarSpeedRatio]
function row(secondsFromStart, cogDeg, twdDeg, polarRatio) {
  const t = new Date(1700000000000 + secondsFromStart * 1000).toISOString();
  return [t, cogDeg * DEG, twdDeg * DEG, polarRatio];
}

test('detects a tack: course crosses through head-to-wind (relative angle near 0)', () => {
  // Wind steady from 0deg. Close-hauled at 320 (40deg off on one side), tacks to 40 (40deg off on the other).
  const rows = [
    row(0, 320, 0, null),
    row(15, 320, 0, null),
    row(30, 40, 0, null),
    row(45, 40, 0, null),
  ];
  const result = detectLatestManeuver(rows);
  assert.ok(result);
  assert.equal(result.type, 'tack');
});

test('detects a jibe: course crosses through dead-downwind (relative angle near 180)', () => {
  // Wind steady from 0deg. Running at 140 (40deg off downwind), jibes to 220 (40deg off on the other side).
  const rows = [
    row(0, 140, 0, null),
    row(15, 140, 0, null),
    row(30, 220, 0, null),
    row(45, 220, 0, null),
  ];
  const result = detectLatestManeuver(rows);
  assert.ok(result);
  assert.equal(result.type, 'jibe');
});

test('returns null when the course holds steady (no crossing)', () => {
  const rows = [row(0, 320, 0, null), row(15, 321, 0, null), row(30, 319, 0, null), row(45, 320, 0, null)];
  assert.equal(detectLatestManeuver(rows), null);
});

test('ignores a small course wander through head-to-wind that is not a deliberate tack', () => {
  // Drifts from -5deg to +5deg off the bow - crosses the 0deg boundary but far too small a swing to be a tack.
  const rows = [row(0, 355, 0, null), row(15, 358, 0, null), row(30, 2, 0, null), row(45, 5, 0, null)];
  assert.equal(detectLatestManeuver(rows), null);
});

test('picks the most recent crossing when there are multiple in the window', () => {
  const rows = [
    row(0, 320, 0, null), // close-hauled, tack 1 ->
    row(15, 40, 0, null), // ... other tack
    row(30, 40, 0, null),
    row(45, 320, 0, null), // tack 2 (the most recent) ->
    row(60, 320, 0, null),
  ];
  const result = detectLatestManeuver(rows);
  assert.equal(result.type, 'tack');
  assert.equal(result.timestamp, rows[3][0]);
});

test('returns null for fewer than two rows', () => {
  assert.equal(detectLatestManeuver([]), null);
  assert.equal(detectLatestManeuver([row(0, 320, 0, null)]), null);
});

test('still detects maneuver type when polarSpeedRatio data is entirely missing (score fields stay null)', () => {
  const rows = [row(0, 320, 0, null), row(15, 320, 0, null), row(30, 40, 0, null), row(45, 40, 0, null)];
  const result = detectLatestManeuver(rows);
  assert.equal(result.type, 'tack');
  assert.equal(result.dipPercent, null);
  assert.equal(result.recoverySeconds, null);
});

test('computes a dip percent and recovery time from polarSpeedRatio around the maneuver', () => {
  const rows = [
    row(0, 320, 0, 0.9),
    row(15, 320, 0, 0.9), // pre-maneuver average ~0.9
    row(30, 40, 0, 0.5), // tack happens here; speed drops hard
    row(45, 40, 0, 0.6),
    row(60, 40, 0, 0.8),
    row(75, 40, 0, 0.9), // recovered back to the pre-maneuver average
  ];
  const result = detectLatestManeuver(rows);
  assert.equal(result.type, 'tack');
  assert.ok(result.dipPercent > 30 && result.dipPercent < 50, `expected ~44% dip, got ${result.dipPercent}`);
  assert.equal(result.recoverySeconds, 45);
});

test('leaves recoverySeconds null when performance never climbs back to the pre-maneuver average', () => {
  const rows = [
    row(0, 320, 0, 0.9),
    row(15, 320, 0, 0.9),
    row(30, 40, 0, 0.5),
    row(45, 40, 0, 0.55),
    row(60, 40, 0, 0.6),
  ];
  const result = detectLatestManeuver(rows);
  assert.equal(result.recoverySeconds, null);
  assert.ok(result.dipPercent > 0);
});
