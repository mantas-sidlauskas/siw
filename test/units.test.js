'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { radiansToDegrees, mpsToKnots, applyConversion } = require('../lib/units');

test('radiansToDegrees converts pi radians to 180 degrees', () => {
  assert.ok(Math.abs(radiansToDegrees(Math.PI) - 180) < 1e-9);
});

test('radiansToDegrees converts 0 to 0', () => {
  assert.equal(radiansToDegrees(0), 0);
});

test('mpsToKnots converts 1 m/s to approximately 1.943844 knots', () => {
  assert.ok(Math.abs(mpsToKnots(1) - 1.943844) < 1e-6);
});

test('applyConversion runs the named conversion on the value', () => {
  assert.ok(Math.abs(applyConversion(1, 'mpsToKnots') - 1.943844) < 1e-6);
});

test('applyConversion returns the value unchanged when no conversion is named', () => {
  assert.equal(applyConversion(5, undefined), 5);
  assert.equal(applyConversion(5, null), 5);
});

test('applyConversion returns the value unchanged for an unknown conversion name', () => {
  assert.equal(applyConversion(5, 'bogus'), 5);
});
