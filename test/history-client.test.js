'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { fetchWindTrendHistory, buildHistoryUrl, computeResolutionSeconds } = require('../lib/history-client');

function fakeReq(localPort, overrides = {}) {
  return {
    headers: {},
    socket: { localPort, encrypted: false },
    ...overrides,
  };
}

test('computeResolutionSeconds caps at 120 datapoints, minimum 1 second', () => {
  assert.equal(computeResolutionSeconds(30), 15);
  assert.equal(computeResolutionSeconds(1), 1);
});

test('buildHistoryUrl targets the server\'s own loopback port and fixed wind paths', () => {
  const req = fakeReq(3000);
  const url = buildHistoryUrl(req, 30);
  assert.ok(url.startsWith('http://127.0.0.1:3000/signalk/v2/api/history/values'));
  assert.ok(url.includes(encodeURIComponent('environment.wind.directionTrue:avg,environment.wind.speedTrue:avg')));
  assert.ok(url.includes('context=vessels.self'));
  assert.ok(url.includes('resolution=15'));
});

test('buildHistoryUrl ignores a client-supplied Host header (SSRF via Host spoofing)', () => {
  const req = fakeReq(3000, { headers: { host: 'evil.example.com:9999' } });
  const url = buildHistoryUrl(req, 30);
  assert.ok(!url.includes('evil.example.com'));
  assert.ok(url.startsWith('http://127.0.0.1:3000/'));
});

test('buildHistoryUrl uses https when the request arrived over TLS', () => {
  const req = fakeReq(8443, { socket: { localPort: 8443, encrypted: true } });
  const url = buildHistoryUrl(req, 30);
  assert.ok(url.startsWith('https://127.0.0.1:8443/'));
});

function startFakeHistoryServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => resolve(server));
  });
}

test('returns parsed history on success', async () => {
  const body = { data: [['2026-01-01T00:00:00Z', 1, 2]] };
  const server = await startFakeHistoryServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  });
  const { port } = server.address();
  const result = await fetchWindTrendHistory(fakeReq(port), 30);
  assert.deepEqual(result, body);
  server.close();
});

test('returns null when the history endpoint errors (no provider installed)', async () => {
  const server = await startFakeHistoryServer((req, res) => {
    res.statusCode = 501;
    res.end('No history provider');
  });
  const { port } = server.address();
  const result = await fetchWindTrendHistory(fakeReq(port), 30);
  assert.equal(result, null);
  server.close();
});

test('returns null when the response has no data points', async () => {
  const server = await startFakeHistoryServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [] }));
  });
  const { port } = server.address();
  const result = await fetchWindTrendHistory(fakeReq(port), 30);
  assert.equal(result, null);
  server.close();
});

test('returns null when the host is unreachable', async () => {
  const result = await fetchWindTrendHistory(fakeReq(1), 30);
  assert.equal(result, null);
});
