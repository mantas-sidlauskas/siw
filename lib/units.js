'use strict';

const MPS_TO_KNOTS = 1.9438444924406;

function radiansToDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function mpsToKnots(metersPerSecond) {
  return metersPerSecond * MPS_TO_KNOTS;
}

const CONVERSIONS = { mpsToKnots };

// Applies a named conversion (e.g. for displaying a SignalK SI value, such as
// m/s, in a more familiar unit). Unknown or absent names pass the value
// through unchanged rather than erroring, since config.js validates the name
// against VALID_CONVERSIONS before it ever reaches here.
function applyConversion(value, conversionName) {
  const convert = CONVERSIONS[conversionName];
  return convert ? convert(value) : value;
}

module.exports = { radiansToDegrees, mpsToKnots, applyConversion, CONVERSIONS };
