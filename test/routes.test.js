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

async function startApp(server, { historyData, simulateHostBodyParser } = {}) {
  const app = express();
  if (historyData) {
    // fetchWindTrendHistory calls back into this same server's own loopback
    // port, so serving a fake History API route here lets routes exercise a
    // real (non-placeholder) wind-trend render end to end.
    app.get('/signalk/v2/api/history/values', (req, res) => res.json({ data: historyData }));
  }
  if (simulateHostBodyParser) {
    // Real signalk-server globally mounts bodyParser.json() on its shared
    // Express app before any plugin router runs, which fully consumes the
    // request stream and leaves req.body already populated. Mounting
    // express.json() here, before the plugin router, reproduces that so
    // tests can catch regressions that only manifest once something
    // upstream has already parsed the body.
    app.use(express.json());
  }
  const router = express.Router();
  const plugin = createPlugin(server);
  plugin.registerWithRouter(router);
  // Derived from plugin.id, not hardcoded, so this mount path can never
  // drift from the real one if the plugin id ever changes again.
  app.use(`/plugins/${plugin.id}`, router);
  const httpServer = http.createServer(app);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();
  return { httpServer, baseUrl: `http://localhost:${port}/plugins/${plugin.id}` };
}

test('GET /dashboard renders an HTML dashboard with an img per configured component', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }],
  });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  const res = await fetch(`${baseUrl}/dashboard`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const body = await res.text();
  assert.match(body, /<img src="components\/depth\/image\?t=\d+" width="100" height="50"/);
  httpServer.close();
});

test('GET /dashboard?page=N shows only that page\'s components and links onward to the next page', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    pages: [
      { title: 'Nav', components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }] },
      { title: 'Wind', components: [{ id: 'windtrend', type: 'windTrend', width: 100, height: 50 }] },
    ],
  });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const page0 = await (await fetch(`${baseUrl}/dashboard?page=0`)).text();
    assert.match(page0, /components\/depth\/image/);
    assert.doesNotMatch(page0, /components\/windtrend\/image/);
    assert.match(page0, /<a href="dashboard\?page=1"/);

    const page1 = await (await fetch(`${baseUrl}/dashboard?page=1`)).text();
    assert.match(page1, /components\/windtrend\/image/);
    assert.doesNotMatch(page1, /components\/depth\/image/);
  } finally {
    httpServer.close();
  }
});

test('GET /dashboard with no page param, or a garbage one, falls back to the first page', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    pages: [
      { title: 'Nav', components: [{ id: 'first', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }] },
      { title: 'Wind', components: [{ id: 'second', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }] },
    ],
  });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const noParam = await (await fetch(`${baseUrl}/dashboard`)).text();
    assert.match(noParam, /components\/first\/image/);

    const garbage = await (await fetch(`${baseUrl}/dashboard?page=not-a-number`)).text();
    assert.match(garbage, /components\/first\/image/);
  } finally {
    httpServer.close();
  }
});

test('GET /dashboard-live renders a live-updating dashboard with a WebSocket-fed span for numeric components', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer', unit: 'm', decimals: 1, label: 'Depth' }],
  });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const res = await fetch(`${baseUrl}/dashboard-live`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const body = await res.text();
    assert.match(body, /id="live-depth"/);
    assert.doesNotMatch(body, /components\/depth\/image/);
  } finally {
    httpServer.close();
  }
});

test('GET /components/:id/image renders a wind-trend component with the live navigation.speedOverGround value', async () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [{ id: 'twd', type: 'windDirectionTrend', width: 300, height: 150, windowMinutes: 30 }] });
  const historyData = [
    ['2026-01-01T00:00:00Z', 4.7, 5],
    ['2026-01-01T00:05:00Z', 4.8, 6],
    ['2026-01-01T00:10:00Z', 4.9, 5.5],
  ];

  const withoutSog = await startApp(makeServer(dir), { historyData });
  const withSog = await startApp(makeServer(dir, { 'navigation.speedOverGround': 2.5 }), { historyData });
  try {
    const bufWithout = Buffer.from(await (await fetch(`${withoutSog.baseUrl}/components/twd/image`)).arrayBuffer());
    const bufWith = Buffer.from(await (await fetch(`${withSog.baseUrl}/components/twd/image`)).arrayBuffer());
    assert.notDeepEqual(bufWithout, bufWith);
  } finally {
    withoutSog.httpServer.close();
    withSog.httpServer.close();
  }
});

test('GET /components/:id/image renders a maneuverScore component by detecting a tack from COG/TWD/polarSpeedRatio history', async () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [{ id: 'maneuver', type: 'maneuverScore', width: 300, height: 200, windowMinutes: 30 }] });

  const DEG = Math.PI / 180;
  const tackHistory = [
    ['2026-01-01T00:00:00Z', 320 * DEG, 0, 0.9],
    ['2026-01-01T00:00:15Z', 320 * DEG, 0, 0.9],
    ['2026-01-01T00:00:30Z', 40 * DEG, 0, 0.5],
    ['2026-01-01T00:00:45Z', 40 * DEG, 0, 0.9],
  ];
  const steadyHistory = [
    ['2026-01-01T00:00:00Z', 320 * DEG, 0, 0.9],
    ['2026-01-01T00:00:15Z', 321 * DEG, 0, 0.9],
    ['2026-01-01T00:00:30Z', 319 * DEG, 0, 0.9],
  ];

  const tackApp = await startApp(makeServer(dir), { historyData: tackHistory });
  const steadyApp = await startApp(makeServer(dir), { historyData: steadyHistory });
  try {
    const tackRes = await fetch(`${tackApp.baseUrl}/components/maneuver/image`);
    assert.equal(tackRes.status, 200);
    assert.equal(tackRes.headers.get('content-type'), 'image/png');
    const tackBuf = Buffer.from(await tackRes.arrayBuffer());

    const steadyRes = await fetch(`${steadyApp.baseUrl}/components/maneuver/image`);
    assert.equal(steadyRes.status, 200);
    const steadyBuf = Buffer.from(await steadyRes.arrayBuffer());

    assert.notDeepEqual(tackBuf, steadyBuf);
  } finally {
    tackApp.httpServer.close();
    steadyApp.httpServer.close();
  }
});

test('GET /components/:id/image?headerBoxes=0 renders a wind-trend chart without its SOG/TWS/TWD header boxes', async () => {
  const dir = tmpDir();
  writeConfig(dir, { components: [{ id: 'tws', type: 'windSpeedTrend', width: 300, height: 150, format: 'svg', windowMinutes: 30 }] });
  const historyData = [
    ['2026-01-01T00:00:00Z', 4.7, 5],
    ['2026-01-01T00:05:00Z', 4.8, 6],
  ];
  const { httpServer, baseUrl } = await startApp(makeServer(dir, { 'navigation.speedOverGround': 2.5 }), { historyData });
  try {
    const withBoxes = await (await fetch(`${baseUrl}/components/tws/image`)).text();
    assert.match(withBoxes, /text-anchor="end"[^>]*>SOG</);

    const withoutBoxes = await (await fetch(`${baseUrl}/components/tws/image?headerBoxes=0`)).text();
    assert.doesNotMatch(withoutBoxes, /text-anchor="end"[^>]*>SOG</);
  } finally {
    httpServer.close();
  }
});

test('registers the dashboard, components list, and component image routes as readonly-accessible', () => {
  // SignalK's security layer only exempts a plugin route from requiring admin
  // login (e.g. under allow_readonly) when the plugin opts it in via
  // router.access(level), as documented in signalk-server's plugin router
  // wrapper. "/" can't be opted in (SignalK treats it as reserved), which is
  // why the dashboard lives at "/dashboard" instead.
  const registered = [];
  const router = express.Router();
  router.access = (level) => ({
    get: (routePath, ...handlers) => {
      registered.push({ method: 'GET', path: routePath, permission: level });
      router.get(routePath, ...handlers);
    },
  });

  const plugin = createPlugin(makeServer(tmpDir()));
  plugin.registerWithRouter(router);

  const readonlyPaths = registered.filter((r) => r.permission === 'readonly').map((r) => r.path).sort();
  assert.deepEqual(readonlyPaths, ['/components', '/components/:id/image', '/dashboard', '/dashboard-live']);
  assert.ok(!readonlyPaths.includes('/admin/config'), 'admin/config must require admin auth, not be readonly-accessible');
  assert.ok(!readonlyPaths.includes('/admin/preview'), 'admin/preview must require admin auth, not be readonly-accessible');
});

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

test('GET /admin/config returns the current pages', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Nav', components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'a.b', format: 'png' }] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const res = await fetch(`${baseUrl}/admin/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pages.length, 1);
    assert.equal(body.pages[0].components[0].id, 'depth');
  } finally {
    httpServer.close();
  }
});

test('PUT /admin/config with a valid document writes it, and GET /components reflects the change', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Old', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const newConfig = { pages: [{ title: 'New', components: [{ id: 'sog', type: 'numeric', width: 200, height: 100, path: 'navigation.speedOverGround' }] }] };
    const putRes = await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    assert.equal(putRes.status, 200);

    const listRes = await fetch(`${baseUrl}/components`);
    const list = await listRes.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'sog');
  } finally {
    httpServer.close();
  }
});

test('PUT /admin/config accepts an empty pages array', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Old', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const res = await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: [] }),
    });
    assert.equal(res.status, 200);
    const getRes = await fetch(`${baseUrl}/admin/config`);
    assert.deepEqual((await getRes.json()).pages, []);
  } finally {
    httpServer.close();
  }
});

test('PUT /admin/config with an invalid component returns 400 with errors and does not modify the file', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Original', components: [{ id: 'keep', type: 'numeric', width: 100, height: 50, path: 'a.b', format: 'png' }] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const badConfig = { pages: [{ title: 'Bad', components: [{ id: 'oops', type: 'not-a-real-type', width: 100, height: 50 }] }] };
    const putRes = await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badConfig),
    });
    assert.equal(putRes.status, 400);
    const putBody = await putRes.json();
    assert.equal(putBody.errors.length, 1);
    assert.equal(putBody.errors[0].id, 'oops');

    const getRes = await fetch(`${baseUrl}/admin/config`);
    const getBody = await getRes.json();
    assert.equal(getBody.pages[0].title, 'Original');
    assert.equal(getBody.pages[0].components[0].id, 'keep');
  } finally {
    httpServer.close();
  }
});

test('PUT /admin/config rejects a duplicate id used across two different pages', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Original', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const dupConfig = {
      pages: [
        { title: 'A', components: [{ id: 'dup', type: 'numeric', width: 100, height: 50, path: 'a.b' }] },
        { title: 'B', components: [{ id: 'dup', type: 'numeric', width: 100, height: 50, path: 'c.d' }] },
      ],
    };
    const res = await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dupConfig),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.errors[0].message, /duplicate id/);
  } finally {
    httpServer.close();
  }
});

test('PUT /admin/config with a malformed JSON body returns 400', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Original', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const res = await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
  } finally {
    httpServer.close();
  }
});

test('PUT /admin/config with a null page entry returns 400 promptly instead of hanging (Finding 1 regression)', { timeout: 5000 }, async () => {
  // Regression test: validatePages used to do `page.components` with no
  // shape check on `page` itself, so a body like {"pages":[null]} threw
  // synchronously inside the async PUT handler with no surrounding
  // try/catch. Uncaught in an async Express handler, that becomes an
  // unhandled promise rejection: the response never gets sent and the
  // request hangs forever. The explicit timeout turns a regression back
  // into "hangs forever" into a fast, clear failure.
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Original', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const res = await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: [null] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.errors.length, 1);
    assert.equal(body.errors[0].page, 0);

    const getRes = await fetch(`${baseUrl}/admin/config`);
    const getBody = await getRes.json();
    assert.equal(getBody.pages[0].title, 'Original');
  } finally {
    httpServer.close();
  }
});

test('PUT /admin/config with a non-array "components" on a page returns 400 and does not write the file (Finding 1)', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Original', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const res = await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: [{ title: 'Bad', components: null }] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.errors[0].message, /"components" must be an array/);

    const getRes = await fetch(`${baseUrl}/admin/config`);
    const getBody = await getRes.json();
    assert.equal(getBody.pages[0].title, 'Original');
  } finally {
    httpServer.close();
  }
});

test('GET /admin/config reports skipped invalid components separately from the (unchanged) loaded pages (Finding 2)', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    pages: [
      {
        title: 'Mixed',
        components: [
          { id: 'good', type: 'numeric', width: 100, height: 50, path: 'a.b', format: 'png' },
          { id: 'bad', type: 'not-a-real-type', width: 100, height: 50 },
        ],
      },
    ],
  });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const res = await fetch(`${baseUrl}/admin/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pages[0].components.length, 1);
    assert.equal(body.pages[0].components[0].id, 'good');
    assert.equal(body.skipped.length, 1);
    assert.equal(body.skipped[0].page, 0);
    assert.equal(body.skipped[0].id, 'bad');
    assert.match(body.skipped[0].message, /invalid "type"/);
  } finally {
    httpServer.close();
  }
});

test('GET /admin/config returns an empty "skipped" array when nothing was dropped', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Nav', components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'a.b', format: 'png' }] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const res = await fetch(`${baseUrl}/admin/config`);
    const body = await res.json();
    assert.deepEqual(body.skipped, []);
  } finally {
    httpServer.close();
  }
});

test('PUT /admin/config still works when a host body-parser already populated req.body (real signalk-server behavior)', { timeout: 5000 }, async () => {
  // Regression test: signalk-server mounts bodyParser.json() on its shared
  // Express app before any plugin router runs, so by the time our route
  // handler sees the request, req.body is already a parsed object and the
  // raw stream has already been fully consumed (its 'data'/'end' events
  // already fired). readJsonBody must use req.body in that case instead of
  // trying to read the stream again, or the request hangs forever. The
  // explicit timeout turns "hangs forever" into a fast, clear failure
  // instead of blocking the whole suite if this regresses.
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Old', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir), { simulateHostBodyParser: true });
  try {
    const newConfig = { pages: [{ title: 'New', components: [{ id: 'sog', type: 'numeric', width: 200, height: 100, path: 'navigation.speedOverGround' }] }] };
    const putRes = await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    assert.equal(putRes.status, 200);

    const listRes = await fetch(`${baseUrl}/components`);
    const list = await listRes.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'sog');
  } finally {
    httpServer.close();
  }
});

test('POST /admin/preview renders a draft numeric component using live data', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: '', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir, { 'navigation.speedOverGround': 2.5 }));
  try {
    const draft = { id: 'preview-draft', type: 'numeric', width: 200, height: 100, path: 'navigation.speedOverGround', conversion: 'mpsToKnots', unit: 'kt' };
    const res = await fetch(`${baseUrl}/admin/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 0);
  } finally {
    httpServer.close();
  }
});

test('POST /admin/preview renders a placeholder (200, not an error) for a numeric draft whose path has no live value', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: '', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir)); // no selfValues at all
  try {
    const draft = { id: 'preview-draft', type: 'numeric', width: 200, height: 100, path: 'environment.does.not.exist' };
    const res = await fetch(`${baseUrl}/admin/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
  } finally {
    httpServer.close();
  }
});

test('POST /admin/preview renders a draft wind-trend component using history data', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: '', components: [] }] });
  const historyData = [
    ['2026-01-01T00:00:00Z', 4.7, 5],
    ['2026-01-01T00:05:00Z', 4.8, 6],
  ];
  const { httpServer, baseUrl } = await startApp(makeServer(dir), { historyData });
  try {
    const draft = { id: 'preview-draft', type: 'windSpeedTrend', width: 300, height: 150, windowMinutes: 30 };
    const res = await fetch(`${baseUrl}/admin/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
  } finally {
    httpServer.close();
  }
});

test('POST /admin/preview returns 400 for an invalid draft component', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: '', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    const draft = { id: 'bad', type: 'numeric', width: 200, height: 100 }; // missing required "path"
    const res = await fetch(`${baseUrl}/admin/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    assert.equal(res.status, 400);
  } finally {
    httpServer.close();
  }
});

test('two successive PUT /admin/config calls leave the second one in effect (last write wins, no corruption)', async () => {
  const dir = tmpDir();
  writeConfig(dir, { pages: [{ title: 'Start', components: [] }] });
  const { httpServer, baseUrl } = await startApp(makeServer(dir));
  try {
    await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: [{ title: 'First', components: [] }] }),
    });
    await fetch(`${baseUrl}/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: [{ title: 'Second', components: [] }] }),
    });
    const getRes = await fetch(`${baseUrl}/admin/config`);
    const body = await getRes.json();
    assert.equal(body.pages.length, 1);
    assert.equal(body.pages[0].title, 'Second');
  } finally {
    httpServer.close();
  }
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

for (const type of ['windSpeedTrend', 'windDirectionTrend']) {
  test(`GET /components/:id/image renders a ${type} placeholder when no history provider is reachable`, async () => {
    const dir = tmpDir();
    writeConfig(dir, { components: [{ id: 'split', type, width: 200, height: 100 }] });
    const { httpServer, baseUrl } = await startApp(makeServer(dir));
    const res = await fetch(`${baseUrl}/components/split/image`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    httpServer.close();
  });
}

test('GET /components/:id/image renders windSpeedTrend and windDirectionTrend as genuinely different, single-panel images (not both falling back to the combined chart)', async () => {
  const dir = tmpDir();
  writeConfig(dir, {
    components: [
      { id: 'speed', type: 'windSpeedTrend', width: 200, height: 100, windowMinutes: 30 },
      { id: 'direction', type: 'windDirectionTrend', width: 200, height: 100, windowMinutes: 30 },
      { id: 'combined', type: 'windTrend', width: 200, height: 100, windowMinutes: 30 },
    ],
  });
  const historyData = [
    ['2026-01-01T00:00:00Z', 4.7, 5],
    ['2026-01-01T00:05:00Z', 4.8, 6],
    ['2026-01-01T00:10:00Z', 4.9, 5.5],
  ];
  const { httpServer, baseUrl } = await startApp(makeServer(dir), { historyData });
  try {
    const speedBuf = Buffer.from(await (await fetch(`${baseUrl}/components/speed/image`)).arrayBuffer());
    const directionBuf = Buffer.from(await (await fetch(`${baseUrl}/components/direction/image`)).arrayBuffer());
    const combinedBuf = Buffer.from(await (await fetch(`${baseUrl}/components/combined/image`)).arrayBuffer());

    assert.notDeepEqual(speedBuf, directionBuf);
    assert.notDeepEqual(speedBuf, combinedBuf);
    assert.notDeepEqual(directionBuf, combinedBuf);
  } finally {
    httpServer.close();
  }
});
