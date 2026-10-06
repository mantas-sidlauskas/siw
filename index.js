'use strict';
const { loadComponents, loadPages, ID_PATTERN } = require('./lib/config');
const { renderNumeric } = require('./lib/render-numeric');
const { renderWindTrend, renderWindSpeedTrend, renderWindDirectionTrend } = require('./lib/render-wind-trend');
const { renderManeuverScore } = require('./lib/render-maneuver');
const { fetchWindTrendHistory, fetchManeuverHistory } = require('./lib/history-client');
const { renderDashboardHtml } = require('./lib/render-dashboard');

const WIND_RENDERERS = {
  windTrend: renderWindTrend,
  windSpeedTrend: renderWindSpeedTrend,
  windDirectionTrend: renderWindDirectionTrend,
};

module.exports = function createPlugin(server) {
  const plugin = {
    id: 'signalk-image-widgets',
    name: 'SignalK Image Widgets',
    description: 'Renders configured SignalK paths as raster images for simple/low-power displays.',
    start: () => {
      server.setPluginStatus('Started');
    },
    stop: () => {
      server.setPluginStatus('Stopped');
    },
    schema: () => ({ type: 'object', properties: {} }),
    registerWithRouter(router) {
      // "/" is reserved by signalk-server for its own plugin-metadata route and
      // can't be marked readonly-accessible, so the dashboard lives at
      // "/dashboard" instead. Routes are registered via router.access('readonly')
      // when the host router supports it (signalk-server does) so that
      // allow_readonly lets a browser without a login session fetch them;
      // on routers that don't support it (e.g. tests), fall back to a plain get.
      const getReadonly = typeof router.access === 'function'
        ? (path, handler) => router.access('readonly').get(path, handler)
        : (path, handler) => router.get(path, handler);

      router.param('id', (req, res, next, id) => {
        if (!ID_PATTERN.test(id)) {
          return res.status(400).json({ state: 'FAILED', statusCode: 400, message: 'Invalid component id' });
        }
        next();
      });

      getReadonly('/dashboard', (req, res) => {
        let pages;
        try {
          pages = loadPages(server.getDataDirPath());
        } catch (err) {
          return res.status(500).send(`Failed to load components: ${err.message}`);
        }
        const requestedPage = Number.parseInt(req.query.page, 10);
        const pageIndex = Number.isInteger(requestedPage) ? requestedPage : 0;
        res.set('Content-Type', 'text/html').send(renderDashboardHtml(pages, pageIndex));
      });

      getReadonly('/components', (req, res) => {
        let components;
        try {
          components = loadComponents(server.getDataDirPath());
        } catch (err) {
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
        res.json(components.map(({ id, type, width, height }) => ({ id, type, width, height })));
      });

      getReadonly('/components/:id/image', async (req, res) => {
        let components;
        try {
          components = loadComponents(server.getDataDirPath());
        } catch (err) {
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }

        const component = components.find((c) => c.id === req.params.id);
        if (!component) {
          return res.status(404).json({ state: 'FAILED', statusCode: 404, message: `Unknown component "${req.params.id}"` });
        }

        try {
          let rendered;
          if (component.type === 'numeric') {
            const node = server.getSelfPath(component.path);
            const value = node && typeof node.value === 'number' ? node.value : null;
            rendered = renderNumeric(component, value);
          } else if (component.type === 'maneuverScore') {
            const history = await fetchManeuverHistory(req, component.windowMinutes);
            rendered = renderManeuverScore(component, history);
          } else {
            const history = await fetchWindTrendHistory(req, component.windowMinutes);
            const sogNode = server.getSelfPath('navigation.speedOverGround');
            const speedOverGround = sogNode && typeof sogNode.value === 'number' ? sogNode.value : null;
            rendered = WIND_RENDERERS[component.type](component, history, { speedOverGround });
          }

          res.set('Content-Type', rendered.contentType);
          res.set('Cache-Control', 'no-store');
          res.send(rendered.buffer);
        } catch (err) {
          server.error(`Error rendering component "${component.id}": ${err.message}`);
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
      });

      server.setPluginStatus('Providing image-rendered components');
    },
  };

  return plugin;
};
