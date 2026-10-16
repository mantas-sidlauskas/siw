'use strict';
const fs = require('fs');
const path = require('path');
const { loadComponents, loadPages, loadPagesWithSkipped, validatePages, validateComponent, normalizeComponent, ID_PATTERN } = require('./lib/config');
const { renderNumeric } = require('./lib/render-numeric');
const { renderWindTrend, renderWindSpeedTrend, renderWindDirectionTrend } = require('./lib/render-wind-trend');
const { renderManeuverScore } = require('./lib/render-maneuver');
const { fetchWindTrendHistory, fetchManeuverHistory } = require('./lib/history-client');
const { renderDashboardHtml } = require('./lib/render-dashboard');
const { renderLiveDashboardHtml } = require('./lib/render-live-dashboard');

const WIND_RENDERERS = {
  windTrend: renderWindTrend,
  windSpeedTrend: renderWindSpeedTrend,
  windDirectionTrend: renderWindDirectionTrend,
};

// Shared by both /components/:id/image (a saved component, looked up by
// id) and /admin/preview (an unsaved draft component) - identical
// per-type dispatch either way.
async function renderComponentNow(component, server, req) {
  if (component.type === 'numeric') {
    const node = server.getSelfPath(component.path);
    const value = node && typeof node.value === 'number' ? node.value : null;
    return renderNumeric(component, value);
  }
  if (component.type === 'maneuverScore') {
    const history = await fetchManeuverHistory(req, component.windowMinutes);
    return renderManeuverScore(component, history);
  }
  const history = await fetchWindTrendHistory(req, component.windowMinutes);
  const sogNode = server.getSelfPath('navigation.speedOverGround');
  const speedOverGround = sogNode && typeof sogNode.value === 'number' ? sogNode.value : null;
  const showHeaderBoxes = req.query.headerBoxes !== '0';
  return WIND_RENDERERS[component.type](component, history, { speedOverGround, showHeaderBoxes });
}

// Small bodies only (a config document or a single draft component), which
// is all these two routes ever receive.
function readJsonBody(req) {
  if (req.body !== undefined) {
    // signalk-server's host Express app globally mounts bodyParser.json()
    // before any plugin router runs, which already consumed and parsed the
    // request stream - req.on('data'/'end') below would never fire again in
    // that case. This is the path real deployments always take. (Even an
    // empty/non-JSON body still gets req.body set to {} by body-parser, so
    // "!== undefined" correctly distinguishes "already parsed" from "no
    // upstream parser ran at all".)
    return Promise.resolve(req.body);
  }
  // No upstream body-parser (e.g. this plugin's own bare-Express test
  // harness, which doesn't mount one) - read the raw stream ourselves.
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Any uncaught throw inside an async Express handler becomes an unhandled
// promise rejection, not a response - the client hangs forever and, in the
// worst case, an unhandled rejection can crash the whole host process. This
// wrapper guarantees every async route always sends SOME response.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
    });
  };
}

module.exports = function createPlugin(server) {
  const plugin = {
    id: 'siw',
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

      getReadonly('/dashboard-live', (req, res) => {
        let pages;
        try {
          pages = loadPages(server.getDataDirPath());
        } catch (err) {
          return res.status(500).send(`Failed to load components: ${err.message}`);
        }
        const requestedPage = Number.parseInt(req.query.page, 10);
        const pageIndex = Number.isInteger(requestedPage) ? requestedPage : 0;
        res.set('Content-Type', 'text/html').send(renderLiveDashboardHtml(pages, pageIndex));
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

      getReadonly('/components/:id/image', asyncHandler(async (req, res) => {
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
          const rendered = await renderComponentNow(component, server, req);
          res.set('Content-Type', rendered.contentType);
          res.set('Cache-Control', 'no-store');
          res.send(rendered.buffer);
        } catch (err) {
          server.error(`Error rendering component "${component.id}": ${err.message}`);
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
      }));

      // These three routes back the admin config UI and are deliberately
      // NOT registered via getReadonly - SignalK's plugin routes default to
      // requiring admin authentication, and writing config must keep that
      // default (every other route here is readonly-accessible so a Kindle
      // can read the dashboard without logging in; that exemption must not
      // extend to anything that writes).
      router.get('/admin/config', (req, res) => {
        let pagesWithSkipped;
        try {
          pagesWithSkipped = loadPagesWithSkipped(server.getDataDirPath());
        } catch (err) {
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
        const pages = pagesWithSkipped.map(({ title, components }) => ({ title, components }));
        const skipped = pagesWithSkipped.flatMap((page, pageIndex) =>
          page.skipped.map((s) => ({ page: pageIndex, id: s.id, message: s.message })),
        );
        res.json({ pages, skipped });
      });

      router.put('/admin/config', asyncHandler(async (req, res) => {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          return res.status(400).json({ state: 'FAILED', statusCode: 400, message: err.message });
        }
        if (!body || !Array.isArray(body.pages)) {
          return res.status(400).json({ state: 'FAILED', statusCode: 400, message: 'Request body must be { "pages": [...] }' });
        }
        const errors = validatePages(body.pages);
        if (errors.length > 0) {
          return res.status(400).json({ state: 'FAILED', statusCode: 400, errors });
        }
        try {
          fs.writeFileSync(path.join(server.getDataDirPath(), 'components.json'), JSON.stringify({ pages: body.pages }, null, 2));
        } catch (err) {
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
        res.json({ pages: body.pages });
      }));

      router.post('/admin/preview', asyncHandler(async (req, res) => {
        let component;
        try {
          component = await readJsonBody(req);
        } catch (err) {
          return res.status(400).json({ state: 'FAILED', statusCode: 400, message: err.message });
        }
        const validationError =
          component && typeof component === 'object' ? validateComponent(component) : 'Request body must be a component object';
        if (validationError) {
          return res.status(400).json({ state: 'FAILED', statusCode: 400, message: validationError });
        }
        try {
          const rendered = await renderComponentNow(normalizeComponent(component), server, req);
          res.set('Content-Type', rendered.contentType);
          res.set('Cache-Control', 'no-store');
          res.send(rendered.buffer);
        } catch (err) {
          server.error(`Error rendering preview component "${component.id}": ${err.message}`);
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
      }));

      server.setPluginStatus('Providing image-rendered components');
    },
  };

  return plugin;
};
