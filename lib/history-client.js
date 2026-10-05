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
  const scheme = req.protocol || 'http';
  const host = req.headers.host;
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
