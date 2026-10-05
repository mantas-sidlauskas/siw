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

const DEFAULT_FETCH_TIMEOUT_MS = 5000;

function buildForwardedHeaders(req) {
  const headers = {};
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  return headers;
}

async function fetchWindTrendHistory(req, windowMinutes, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const url = buildHistoryUrl(req, windowMinutes);
  try {
    const response = await fetch(url, {
      headers: buildForwardedHeaders(req),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.error(`[signalk-image-widgets] History API returned ${response.status} - check that this request's credentials have read access to the SignalK History API`);
      }
      return null;
    }
    const body = await response.json();
    if (!body || !Array.isArray(body.data) || body.data.length === 0) return null;
    return body;
  } catch {
    return null;
  }
}

module.exports = { fetchWindTrendHistory, buildHistoryUrl, computeResolutionSeconds, WIND_PATHS };
