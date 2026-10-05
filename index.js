'use strict';
const { loadComponents } = require('./lib/config');
const { renderNumeric } = require('./lib/render-numeric');
const { renderWindTrend } = require('./lib/render-wind-trend');
const { fetchWindTrendHistory } = require('./lib/history-client');

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
      router.param('id', (req, res, next, id) => {
        if (!/^[A-Za-z0-9-]+$/.test(id)) {
          return res.status(400).json({ state: 'FAILED', statusCode: 400, message: 'Invalid component id' });
        }
        next();
      });

      router.get('/components', (req, res) => {
        let components;
        try {
          components = loadComponents(server.getDataDirPath());
        } catch (err) {
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
        res.json(components.map(({ id, type, width, height }) => ({ id, type, width, height })));
      });

      router.get('/components/:id/image', async (req, res) => {
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
          } else {
            const history = await fetchWindTrendHistory(req, component.windowMinutes);
            rendered = renderWindTrend(component, history);
          }

          res.set('Content-Type', rendered.contentType);
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
