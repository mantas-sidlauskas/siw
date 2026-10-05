'use strict';

const MPS_TO_KNOTS = 1.9438444924406;

function radiansToDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function mpsToKnots(metersPerSecond) {
  return metersPerSecond * MPS_TO_KNOTS;
}

module.exports = { radiansToDegrees, mpsToKnots };
