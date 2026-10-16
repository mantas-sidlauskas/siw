'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const createPlugin = require('../index');

test('plugin factory exposes required SignalK plugin fields', () => {
  const server = { setPluginStatus: () => {}, setPluginError: () => {} };
  const plugin = createPlugin(server);
  assert.equal(plugin.id, 'siw');
  assert.equal(typeof plugin.name, 'string');
  assert.deepEqual(plugin.schema(), { type: 'object', properties: {} });
  assert.equal(typeof plugin.start, 'function');
  assert.equal(typeof plugin.stop, 'function');
  assert.equal(typeof plugin.registerWithRouter, 'function');
  assert.doesNotThrow(() => plugin.start());
  assert.doesNotThrow(() => plugin.stop());
});
