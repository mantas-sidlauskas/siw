'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { fetchWindTrendHistory, buildHistoryUrl, computeResolutionSeconds } = require('../lib/history-client');

test('computeResolutionSeconds caps at 120 datapoints, minimum 1 second', () => {
  assert.equal(computeResolutionSeconds(30), 15);
  assert.equal(computeResolutionSeconds(1), 1);
});

test('buildHistoryUrl uses the incoming request host/protocol and fixed wind paths', () => {
  const req = { protocol: 'http', headers: { host: 'localhost:3000' } };
  const url = buildHistoryUrl(req, 30);
  assert.ok(url.startsWith('http://localhost:3000/signalk/v2/api/history/values'));
  assert.ok(url.includes(encodeURIComponent('environment.wind.directionTrue:avg,environment.wind.speedTrue:avg')));
  assert.ok(url.includes('context=vessels.self'));
  assert.ok(url.includes('resolution=15'));
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
  const req = { protocol: 'http', headers: { host: `localhost:${port}` } };
  const result = await fetchWindTrendHistory(req, 30);
  assert.deepEqual(result, body);
  server.close();
});

test('returns null when the history endpoint errors (no provider installed)', async () => {
  const server = await startFakeHistoryServer((req, res) => {
    res.statusCode = 501;
    res.end('No history provider');
  });
  const { port } = server.address();
  const req = { protocol: 'http', headers: { host: `localhost:${port}` } };
  const result = await fetchWindTrendHistory(req, 30);
  assert.equal(result, null);
  server.close();
});

test('returns null when the response has no data points', async () => {
  const server = await startFakeHistoryServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [] }));
  });
  const { port } = server.address();
  const req = { protocol: 'http', headers: { host: `localhost:${port}` } };
  const result = await fetchWindTrendHistory(req, 30);
  assert.equal(result, null);
  server.close();
});

test('returns null when the host is unreachable', async () => {
  const req = { protocol: 'http', headers: { host: '127.0.0.1:1' } };
  const result = await fetchWindTrendHistory(req, 30);
  assert.equal(result, null);
});
