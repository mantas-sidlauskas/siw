'use strict';

const MAX_DATAPOINTS = 120;
const WIND_PATHS = ['environment.wind.directionTrue', 'environment.wind.speedTrue'];

function computeResolutionSeconds(windowMinutes) {
  return Math.max(1, Math.round((windowMinutes * 60) / MAX_DATAPOINTS));
}

function buildHistoryUrl(req, windowMinutes) {
  const now = Date.now();
  const from = new Date(now - windowMinutes * 60_000).toISOString();
  const to = new Date(now).toISOString();
  const resolution = computeResolutionSeconds(windowMinutes);
  const paths = WIND_PATHS.map((p) => `${p}:avg`).join(',');
  // Deliberately NOT req.protocol/req.headers.host: both are client-controlled
  // (a spoofed Host header would make this server issue outbound requests
  // to an attacker-chosen host). The socket this request arrived on always
  // terminates at this SignalK server, so its own local port is the only
  // trustworthy way to reach this server's own History API.
  const scheme = req.socket && req.socket.encrypted ? 'https' : 'http';
  const host = `127.0.0.1:${req.socket.localPort}`;
  return `${scheme}://${host}/signalk/v2/api/history/values` +
    `?paths=${encodeURIComponent(paths)}` +
    `&context=vessels.self` +
    `&from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}` +
    `&resolution=${resolution}`;
}

async function fetchWindTrendHistory(req, windowMinutes) {
  const url = buildHistoryUrl(req, windowMinutes);
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const body = await response.json();
    if (!body || !Array.isArray(body.data) || body.data.length === 0) return null;
    return body;
  } catch {
    return null;
  }
}

module.exports = { fetchWindTrendHistory, buildHistoryUrl, computeResolutionSeconds, WIND_PATHS };
