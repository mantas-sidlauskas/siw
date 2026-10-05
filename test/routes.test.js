'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const express = require('express');
const createPlugin = require('../index');

function writeConfig(dir, obj) {
  fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify(obj));
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'siw-'));
}

function makeServer(dataDir, selfValues = {}) {
  return {
    getDataDirPath: () => dataDir,
    getSelfPath: (p) => (p in selfValues ? { value: selfValues[p] } : undefined),
    setPluginStatus: () => {},
    setPluginError: () => {},
    error: () => {},
  };
}

async function startApp(server) {
  const app = express();
  const router = express.Router();
  const plugin = createPlugin(server);
  plugin.registerWithRouter(router);
  app.use('/plugins/signalk-image-widgets', router);
  const httpServer = http.createServer(app);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();
  return { httpServer, baseUrl: `http://localhost:${port}/plugins/signalk-image-widgets` };
}

test('GET /components lists configured components', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }],
  });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  const res = await fetch(`${baseUrl}/components`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body, [{ id: 'depth', type: 'numeric', width: 100, height: 50 }]);
  httpServer.close();
});

test('GET /components/:id/image renders a numeric PNG with a real value', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }],
  });
  const { httpServer, baseUrl } = await startApp(makeServer(dir, { 'environment.depth.belowTransducer': 4.2 }));
  const res = await fetch(`${baseUrl}/components/depth/image`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  httpServer.close();
});

test('GET /components/:id/image renders a numeric placeholder when the path has no data', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }],
  });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  const res = await fetch(`${baseUrl}/components/depth/image`);
  assert.equal(res.status, 200);
  httpServer.close();
});

test('GET /components/:id/image returns 404 for an unknown id', async () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  const res = await fetch(`${baseUrl}/components/nope/image`);
  assert.equal(res.status, 404);
  httpServer.close();
});

test('GET /components/:id/image rejects an id with invalid characters', async () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  const res = await fetch(`${baseUrl}/components/${encodeURIComponent('bad id')}/image`);
  assert.equal(res.status, 400);
  httpServer.close();
});

test('GET /components/:id/image returns 500 instead of crashing when the renderer throws unexpectedly', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }],
  });
  const server = {
    getDataDirPath: () => dir,
    getSelfPath: () => {
      throw new Error('simulated SignalK server fault');
    },
    setPluginStatus: () => {},
    setPluginError: () => {},
    error: () => {},
  };
  const { httpServer, baseUrl } = await startApp(server);
  try {
    const res = await fetch(`${baseUrl}/components/depth/image`);
    assert.equal(res.status, 500);
  } finally {
    httpServer.close();
  }
});

test('GET /components/:id/image accepts ids containing dots and underscores', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'wind_speed.avg', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }],
  });
  const { httpServer, baseUrl } = await startApp(makeServer(dir, { 'environment.depth.belowTransducer': 4.2 }));
  const res = await fetch(`${baseUrl}/components/${encodeURIComponent('wind_speed.avg')}/image`);
  assert.equal(res.status, 200);
  httpServer.close();
});

test('GET /components/:id/image renders a windTrend placeholder when no history provider is reachable', async () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [{ id: 'windtrend', type: 'windTrend', width: 200, height: 100 }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  const res = await fetch(`${baseUrl}/components/windtrend/image`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  httpServer.close();
});
