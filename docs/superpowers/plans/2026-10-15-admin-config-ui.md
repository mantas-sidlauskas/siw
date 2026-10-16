# Admin Configuration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-authenticated UI, embedded in SignalK's Plugin Config screen, for creating/editing/reordering dashboard pages and components — replacing the current hand-edit-`components.json` workflow.

**Architecture:** Two new backend routes (`GET`/`PUT /admin/config`, `POST /admin/preview`) added to the existing plugin router in `index.js`, backed by a new `validatePages()` export in `lib/config.js`. A new `public/` folder (mounted automatically by SignalK as a `signalk-plugin-configurator` webapp) holds a plain HTML/CSS/JS editor that borrows its visual theme from the sibling plugin `signalk-replay-plugin` — no custom design system, just the host admin's own Bootstrap/CoreUI stylesheet loaded at runtime.

**Tech Stack:** Plain Node.js (no new runtime dependencies), Express `Router` (already used), plain HTML/CSS/JS on the frontend (no build step, no framework) — matching the rest of this plugin.

**Spec:** `docs/superpowers/specs/2026-10-15-admin-config-ui-design.md`

## Global Constraints

- All browser-facing JS stays within an ES2019 ceiling: no `?.`, no `??` (this project already targets this for the Kindle-facing dashboards; `admin.js` isn't Kindle-facing but stays consistent).
- `admin.js` is a single `'use strict'` IIFE, `var` throughout (not `let`/`const`) — matches `signalk-replay-plugin/public/app.js`'s established convention.
- No Bootstrap JS bundle is loaded by `index.html` — only plain form controls (`select`/`input`/`button`/`textarea`); never a JS-dependent Bootstrap component (modal, dropdown, tooltip).
- `PUT /admin/config` and `POST /admin/preview` must be registered as plain `router.put`/`router.post` — **never** through the `getReadonly` helper already in `index.js`. SignalK's plugin routes default to requiring admin authentication unless explicitly downgraded, so simply not opting these in is sufficient; this is intentionally the opposite of every existing route.
- `components.json` stays the on-disk source of truth, in the same `plugin-config-data/<pluginId>/` location `loadPages` already reads from. No new storage mechanism.
- No `credentials: 'include'` on any `fetch()` call in `admin.js` — same-origin requests already send cookies by default; confirmed unnecessary against `signalk-replay-plugin`'s working code, which doesn't set it either.
- No new npm dependencies. The new routes need a JSON request body; write a ~10-line manual body reader rather than pulling in `express.json()` (which would require promoting `express` from `devDependencies` to a real runtime dependency for no other reason).

## Review Focus

- **Empty config.** A page with zero components, or zero pages at all, must be a valid, saveable state (the existing dashboards already render a "No components configured" message for this) — not rejected by `validatePages` or the save route. Pinned in Task 2.
- **Cross-page duplicate IDs surfaced clearly.** The structured form has no way to prevent typing an `id` that collides with a component on a *different* page — this is only caught server-side at Save time. A user must see exactly which save failed and why, not a silent failure or a generic error. Pinned in Task 2 (backend error shape) and Task 8 (frontend renders it).
- **Preview of a not-yet-valid draft.** While a user is mid-edit (a path that doesn't resolve to any live SignalK value yet, or a width/height field that's momentarily blank/non-numeric between keystrokes), the debounced preview call will routinely hit an unknown path or fail `validateComponent`. A placeholder render (unknown path) must return 200 with a placeholder image, not an error — and a validation failure (bad width) must return 400 cleanly, which the frontend must treat as "no preview yet," not flash a scary error on every keystroke. Pinned in Task 2 (placeholder-render test) and Task 7 (frontend handling).
- **Stale overwrite on save.** There's no file locking or optimistic-concurrency check (a deliberate spec simplification) — if `components.json` changes on disk between `GET /admin/config` and `PUT /admin/config` (e.g. someone edits it directly, as this project's own workflow has done all along), the save silently overwrites it. This plan doesn't fix that, but Task 2 pins that two successive saves still behave predictably ("last write wins," not a corrupted merge) so the accepted limitation doesn't hide an actual bug.
- **Refactor regression on the existing image route.** Task 2 extracts the per-type render dispatch out of the already-shipped `/components/:id/image` handler into a shared `renderComponentNow()`. Every existing test in `test/routes.test.js` that exercises that route (numeric, wind-trend with/without SOG, maneuverScore, PNG/SVG) must still pass unchanged after the extraction — this is a pure refactor, not a behavior change.

---

## Task 1: `validatePages()` in `lib/config.js`

**Files:**
- Modify: `lib/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces: `validatePages(pages)` — `pages` is an array of `{ title, components }` (same shape `loadPages` returns/consumes). Returns an array of `{ page, componentIndex, id, message }` objects, one per problem found; empty array means the whole config is valid. Assumes `pages` is already an array (callers are responsible for that top-level shape check).
- Produces: `validateComponent` and `normalizeComponent` become exported (they already exist in this file, currently private) — Task 2 needs both directly.

- [ ] **Step 1: Write the failing tests**

Add to `test/config.test.js`, after the existing `normalizes numeric defaults` test block (anywhere after the `loadComponents`/`loadPages` import — the import line needs `validatePages` added too):

```js
const { loadComponents, loadPages, validatePages } = require('../lib/config');
```

```js
test('validatePages returns no errors for a valid multi-page config', () => {
  const pages = [
    { title: 'Nav', components: [{ id: 'depth', type: 'numeric', width: 100, height: 50, path: 'environment.depth.belowTransducer' }] },
    { title: 'Wind', components: [{ id: 'windtrend', type: 'windTrend', width: 300, height: 150 }] },
  ];
  assert.deepEqual(validatePages(pages), []);
});

test('validatePages returns no errors for an empty config (no pages, or a page with no components)', () => {
  assert.deepEqual(validatePages([]), []);
  assert.deepEqual(validatePages([{ title: 'Empty', components: [] }]), []);
});

test('validatePages reports the page and componentIndex of an invalid component', () => {
  const pages = [
    { title: 'Nav', components: [{ id: 'good', type: 'numeric', width: 100, height: 50, path: 'a.b' }] },
    { title: 'Bad', components: [{ id: 'bad', type: 'nope', width: 100, height: 50 }] },
  ];
  const errors = validatePages(pages);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].page, 1);
  assert.equal(errors[0].componentIndex, 0);
  assert.equal(errors[0].id, 'bad');
  assert.match(errors[0].message, /invalid "type"/);
});

test('validatePages reports a duplicate id used across two different pages', () => {
  const pages = [
    { title: 'A', components: [{ id: 'dup', type: 'numeric', width: 100, height: 50, path: 'a.b' }] },
    { title: 'B', components: [{ id: 'dup', type: 'numeric', width: 100, height: 50, path: 'c.d' }] },
  ];
  const errors = validatePages(pages);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].page, 1);
  assert.equal(errors[0].componentIndex, 0);
  assert.match(errors[0].message, /duplicate id/);
});

test('validatePages does not flag an id that only appears once', () => {
  const pages = [{ title: 'A', components: [{ id: 'solo', type: 'numeric', width: 100, height: 50, path: 'a.b' }] }];
  assert.deepEqual(validatePages(pages), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/config.test.js` (or `node --test test/config.test.js`)
Expected: FAIL — `validatePages is not a function` (it isn't exported yet).

- [ ] **Step 3: Implement `validatePages` and export it alongside `validateComponent`/`normalizeComponent`**

In `lib/config.js`, add this function after `normalizeComponent` and before `module.exports`:

```js
// Validates an entire pages array (the shape loadPages produces/PUT
// /admin/config accepts): every component via validateComponent, plus the
// one rule validateComponent can't check on its own - that ids are unique
// across the WHOLE config, not just within one page (loadPages's single-page
// validateComponent loop never had to enforce this; only the admin UI's
// write path needs it, since loadPages silently drops invalid entries
// instead of rejecting the whole file).
function validatePages(pages) {
  const errors = [];
  const seenIds = new Set();
  pages.forEach((page, pageIndex) => {
    const components = Array.isArray(page.components) ? page.components : [];
    components.forEach((entry, componentIndex) => {
      const error = validateComponent(entry);
      if (error) {
        errors.push({ page: pageIndex, componentIndex, id: entry && entry.id, message: error });
        return;
      }
      if (seenIds.has(entry.id)) {
        errors.push({
          page: pageIndex,
          componentIndex,
          id: entry.id,
          message: `duplicate id "${entry.id}" (ids must be unique across the whole config, not just within a page)`,
        });
      } else {
        seenIds.add(entry.id);
      }
    });
  });
  return errors;
}
```

Change the final line of the file from:
```js
module.exports = { loadComponents, loadPages, VALID_TYPES, VALID_FORMATS, DEFAULT_FORMAT, ID_PATTERN };
```
to:
```js
module.exports = {
  loadComponents,
  loadPages,
  validatePages,
  validateComponent,
  normalizeComponent,
  VALID_TYPES,
  VALID_FORMATS,
  DEFAULT_FORMAT,
  ID_PATTERN,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/config.test.js`
Expected: PASS, all tests including the 5 new ones.

- [ ] **Step 5: Run the full suite (this file is shared, broad-impact)**

Run: `npm test`
Expected: PASS, no regressions (this only adds exports, doesn't change any existing function's behavior).

- [ ] **Step 6: Commit**

```bash
git add lib/config.js test/config.test.js
git commit -m "Add validatePages() for cross-page id-uniqueness checking

Exports validateComponent/normalizeComponent too, both needed by the
upcoming admin config routes."
```

---

## Task 2: Backend routes — `GET`/`PUT /admin/config`, `POST /admin/preview`

**Files:**
- Modify: `index.js`
- Test: `test/routes.test.js`

**Interfaces:**
- Consumes: `validatePages(pages)`, `validateComponent(entry)`, `normalizeComponent(entry)` from Task 1.
- Produces: `renderComponentNow(component, server, req)` — an `async` function, module-scoped in `index.js`, returning `{ buffer, contentType }` or throwing. Used by both the existing `/components/:id/image` handler and the new `/admin/preview` handler — this is the one change to existing route code, and it's a pure extraction (identical behavior, same three branches: numeric / maneuverScore / wind-trend-family).
- Produces: `readJsonBody(req)` — an `async` function, module-scoped in `index.js`, resolving to the parsed JSON body (or rejecting with an `Error` whose `.message` is user-facing, on empty/malformed bodies). No Express body-parsing middleware is added; this reads `req` (the raw stream) directly.

- [ ] **Step 1: Write the failing tests**

Add to `test/routes.test.js`. These go anywhere after the existing `GET /components lists configured components` test (end of file is fine) — all use the existing `writeConfig`/`tmpDir`/`makeServer`/`startApp` helpers already in this file.

```js
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
```

Also extend the existing readonly-registration test (find `test('registers the dashboard, components list, and component image routes as readonly-accessible'`) by appending these two lines right after the existing `assert.deepEqual(readonlyPaths, ...)` line, inside the same test:

```js
  assert.ok(!readonlyPaths.includes('/admin/config'), 'admin/config must require admin auth, not be readonly-accessible');
  assert.ok(!readonlyPaths.includes('/admin/preview'), 'admin/preview must require admin auth, not be readonly-accessible');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/routes.test.js`
Expected: FAIL — `/admin/config` and `/admin/preview` don't exist yet (404s / connection resets), and the two new readonly-exclusion assertions currently pass vacuously (routes don't exist) but will be re-verified meaningfully once the routes exist in step 4.

- [ ] **Step 3: Extract `renderComponentNow` and add `readJsonBody`**

In `index.js`, add two new module-scoped functions after the `WIND_RENDERERS` constant (before `module.exports = function createPlugin...`):

```js
const fs = require('fs');
const path = require('path');
```
(add these two `require`s at the very top of the file, alongside the existing ones)

```js
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

// No express.json() middleware is mounted (would require promoting express
// from a devDependency to a real one for no other reason) - this reads the
// raw request body directly. Small bodies only (a config document or a
// single draft component), which is all these two routes ever receive.
function readJsonBody(req) {
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
```

Update the `require('./lib/config')` line to pull in the three new exports from Task 1:

```js
const { loadComponents, loadPages, validatePages, validateComponent, normalizeComponent, ID_PATTERN } = require('./lib/config');
```

Replace the body of the existing `/components/:id/image` handler's inner `try` block — this:

```js
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
            const showHeaderBoxes = req.query.headerBoxes !== '0';
            rendered = WIND_RENDERERS[component.type](component, history, { speedOverGround, showHeaderBoxes });
          }

          res.set('Content-Type', rendered.contentType);
          res.set('Cache-Control', 'no-store');
          res.send(rendered.buffer);
        } catch (err) {
          server.error(`Error rendering component "${component.id}": ${err.message}`);
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
```

becomes:

```js
        try {
          const rendered = await renderComponentNow(component, server, req);
          res.set('Content-Type', rendered.contentType);
          res.set('Cache-Control', 'no-store');
          res.send(rendered.buffer);
        } catch (err) {
          server.error(`Error rendering component "${component.id}": ${err.message}`);
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
```

- [ ] **Step 4: Run the full suite to confirm the refactor is behavior-preserving**

Run: `npm test`
Expected: PASS — every existing `/components/:id/image` test (numeric, wind-trend with/without SOG, maneuverScore, PNG/SVG) still passes unchanged. This is the regression check called out in Review Focus; do not proceed to step 5 until this is green.

- [ ] **Step 5: Add the three new routes**

In `index.js`, add this inside `registerWithRouter(router)`, after the existing `/components/:id/image` route and before `server.setPluginStatus('Providing image-rendered components');`:

```js
      // These three routes back the admin config UI and are deliberately
      // NOT registered via getReadonly - SignalK's plugin routes default to
      // requiring admin authentication, and writing config must keep that
      // default (every other route here is readonly-accessible so a Kindle
      // can read the dashboard without logging in; that exemption must not
      // extend to anything that writes).
      router.get('/admin/config', (req, res) => {
        let pages;
        try {
          pages = loadPages(server.getDataDirPath());
        } catch (err) {
          return res.status(500).json({ state: 'FAILED', statusCode: 500, message: err.message });
        }
        res.json({ pages });
      });

      router.put('/admin/config', async (req, res) => {
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
      });

      router.post('/admin/preview', async (req, res) => {
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
      });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- test/routes.test.js`
Expected: PASS, all new tests.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, no regressions anywhere.

- [ ] **Step 8: Commit**

```bash
git add index.js test/routes.test.js
git commit -m "Add GET/PUT /admin/config and POST /admin/preview routes

Extracts renderComponentNow() out of the existing /components/:id/image
handler so both it and the new preview route share the exact same
per-type render dispatch. Both new routes default to SignalK's
admin-auth requirement (not registered via the readonly helper)."
```

---

## Task 3: Static shell, icon, and `package.json`

**Files:**
- Create: `public/index.html`
- Create: `public/admin.css`
- Create: `public/icon.svg`
- Modify: `package.json`

**Interfaces:**
- Produces: the DOM element ids `admin.js` (Tasks 4-9) will attach to: `#message`, `#saveButton`, `#rawJsonToggle`, `#rawJsonPanel`, `#rawJsonText`, `#rawJsonApply`, `#structuredPanel`, `#pageList`, `#addPage`, `#componentList`, `#addComponent`, `#componentForm`, `#previewWrap`, `#previewImage`.

- [ ] **Step 1: Write `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Image Widgets Admin</title>

<!-- Load the admin UI's own stylesheet so this page renders with the same
     CoreUI/Bootstrap look as the rest of signalk-server's admin, instead
     of inventing a separate visual style - same approach as the sibling
     plugin signalk-replay-plugin. Reads the Vite manifest (server >=
     2.27.0); falls back to scraping the admin root page on older servers.
     No Bootstrap JS bundle comes with it, so this page only uses plain
     form controls (select/input/button/textarea), never JS-dependent
     Bootstrap components like modals or dropdowns. -->
<script>
(async () => {
  const appendStylesheet = (href) => {
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    document.head.appendChild(el);
  };
  try {
    const res = await fetch('/admin/.vite/manifest.json');
    if (res.ok) {
      const manifest = await res.json();
      const stylesheets = new Set();
      for (const entry of Object.values(manifest)) {
        if (entry.file && entry.file.endsWith('.css')) stylesheets.add(entry.file);
        if (entry.isEntry) for (const css of entry.css || []) stylesheets.add(css);
      }
      if (stylesheets.size > 0) {
        for (const css of stylesheets) appendStylesheet('/admin/' + css);
        return;
      }
    }
  } catch (e) { /* fall through to the legacy scrape below */ }
  try {
    const res = await fetch('/');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const link = doc.querySelector('link[rel="stylesheet"]');
    if (link) appendStylesheet(new URL(link.getAttribute('href'), res.url).href);
  } catch (e) {
    console.warn('[signalk-image-widgets] Could not load the admin UI stylesheet:', e);
  }
})();
</script>

<link rel="stylesheet" href="admin.css">
</head>
<body class="app header-fixed">

<header class="app-header navbar navbar-light bg-white">
  <div class="d-flex align-items-center">
    <a class="d-flex align-items-center gap-2 text-decoration-none" href="#">
      <img src="icon.svg" alt="" style="height:36px;width:auto;">
      <span class="app-title">Image Widgets</span>
    </a>
  </div>
  <span id="message" class="small ms-auto me-3"></span>
</header>

<div class="app-body">
  <main class="main">
    <div class="container-fluid pt-3">

      <div class="d-flex align-items-center gap-2 mb-3">
        <button id="saveButton" class="btn btn-primary">Save</button>
        <button id="rawJsonToggle" class="btn btn-outline-secondary">Raw JSON</button>
      </div>

      <div id="rawJsonPanel" class="card mb-3" hidden>
        <div class="card-header fw-bold text-uppercase">Raw JSON</div>
        <div class="card-body">
          <textarea id="rawJsonText" class="form-control" rows="20" spellcheck="false"></textarea>
          <button id="rawJsonApply" class="btn btn-primary mt-2">Apply</button>
        </div>
      </div>

      <div id="structuredPanel" class="row">
        <div class="col-md-3">
          <div class="card">
            <div class="card-header fw-bold text-uppercase d-flex align-items-center justify-content-between">
              Pages
              <button id="addPage" class="btn btn-sm btn-outline-primary">+ Page</button>
            </div>
            <ul id="pageList" class="list-group list-group-flush"></ul>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card">
            <div class="card-header fw-bold text-uppercase d-flex align-items-center justify-content-between">
              Components
              <button id="addComponent" class="btn btn-sm btn-outline-primary" disabled>+ Component</button>
            </div>
            <ul id="componentList" class="list-group list-group-flush"></ul>
          </div>
        </div>

        <div class="col-md-5">
          <div class="card">
            <div class="card-header fw-bold text-uppercase">Edit component</div>
            <div class="card-body">
              <div id="componentForm"></div>
              <div id="previewWrap" class="mt-3" hidden>
                <div class="small text-muted mb-1">Preview</div>
                <img id="previewImage" alt="" style="max-width:100%;border:1px solid #dee2e6;">
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </main>
</div>

<script src="admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/admin.css`**

```css
/* ─── Suppress SignalK navbar-brand logo/text injected by CoreUI ──────── */
.app-header .navbar-brand {
  background-image: none !important;
  width: auto !important;
}
.app-header .navbar-brand::before,
.app-header .navbar-brand::after {
  display: none !important;
  content: none !important;
}

/* ─── Bootstrap's .d-flex (and similar display utilities) set display
   with !important, which otherwise beats the native [hidden] attribute's
   un-prefixed display:none — toggling an element's `hidden` property
   from admin.js would silently stop working on anything also using one
   of those utility classes without this. ─────────────────────────────── */
[hidden] {
  display: none !important;
}

/* ─── App title ─────────────────────────────────────────────────────── */
.app-title {
  font-size: 1.1rem;
  font-weight: 500;
  color: #29363d;
}

/* ─── Selected page/component row in the sidebar/list ─────────────────── */
.list-group-item.active-item {
  background-color: #e7f1ff;
}

#message.text-danger {
  color: #dc3545;
}
```

- [ ] **Step 3: Write `public/icon.svg`**

A minimal, single-color icon (a 2x2 grid of squares, echoing "widgets") — not an elaborate asset, matching the sibling plugin's minimal icon:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <rect x="1" y="1" width="10" height="10" rx="1" fill="#000000"/>
  <rect x="13" y="1" width="10" height="10" rx="1" fill="#000000"/>
  <rect x="1" y="13" width="10" height="10" rx="1" fill="#000000"/>
  <rect x="13" y="13" width="10" height="10" rx="1" fill="#000000"/>
</svg>
```

- [ ] **Step 4: Update `package.json`**

Change:
```json
  "keywords": [
    "signalk-node-server-plugin"
  ],
```
to:
```json
  "keywords": [
    "signalk-node-server-plugin",
    "signalk-plugin-configurator"
  ],
  "signalk": {
    "displayName": "SignalK Image Widgets",
    "appIcon": "./icon.svg"
  },
```
(inserted as a new top-level `signalk` key right after `keywords`, matching where `signalk-replay-plugin`'s `package.json` places it; `appIcon` is relative to the `public/` folder's own root, not the package root — confirmed by checking the sibling plugin's identical `"./icon.svg"` value against its `public/icon.svg` layout.)

- [ ] **Step 5: Deploy to the `signalk` container and verify the shell loads**

This plugin has no test harness for static files, so verify manually against the real container already set up this session:

```bash
cd /Users/mantas/go/src/github.com/mantas-sidlauskas/signalk-image-widgets
rm -f /tmp/signalk-image-widgets.tar
tar -cf /tmp/signalk-image-widgets.tar $(git ls-files)
docker cp /tmp/signalk-image-widgets.tar signalk:/home/node/.signalk/local-plugins/signalk-image-widgets.tar
docker exec -w /home/node/.signalk/local-plugins/signalk-image-widgets signalk tar -xf ../signalk-image-widgets.tar
docker exec signalk rm /home/node/.signalk/local-plugins/signalk-image-widgets.tar
docker restart signalk
```

Wait for it to come back up (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/signalk` returns 200), then use the `claude-in-chrome` tools to navigate to `http://localhost:3000/signalk-image-widgets/` (SignalK mounts a webapp's `public/` folder at `/<pluginId>/`) and take a screenshot. Confirm:
- The page loads with Bootstrap/CoreUI styling applied (not unstyled HTML) — the stylesheet-loading script worked.
- The header shows the icon and "Image Widgets" title.
- The three-column layout (Pages / Components / Edit component cards) renders, empty.

If the stylesheet fails to load (unstyled page), check the browser console for the actual error from the `console.warn` in the loader script before debugging further — don't guess.

Also separately check the real admin UI's Plugin Config screen (`http://localhost:3000/admin/#/serverConfiguration/plugins`, or navigate via Server → Plugin Config in the UI) to see whether `signalk-plugin-configurator` embeds this same page there. Per the spec's noted open risk, if this doesn't work as expected (blank, 404, or still shows the generic auto-form), fall back to changing the `package.json` keyword from `signalk-plugin-configurator` to `signalk-webapp` (exactly matching `signalk-replay-plugin`) — the direct `/signalk-image-widgets/` URL already verified above works unchanged either way.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/admin.css public/icon.svg package.json
git commit -m "Add admin UI static shell, reusing signalk-replay-plugin's theme

Loads the host admin's own CoreUI/Bootstrap stylesheet at runtime
instead of a custom design. Registered as a signalk-plugin-configurator
webapp (package.json)."
```

---

## Task 4: `admin.js` — load config, page list CRUD

**Files:**
- Create: `public/admin.js`

**Interfaces:**
- Consumes: `GET /admin/config` (Task 2), DOM ids from Task 3 (`#pageList`, `#addPage`, `#message`).
- Produces (for Tasks 5-9 to call): `state` (module-scope object: `{ pages, selectedPageIndex, selectedComponentIndex }`), `renderAll()` (re-renders every panel from current `state`), `showError(message)`, `showMessage(message)`, `selectedPage()` (returns `state.pages[state.selectedPageIndex]` or `null`).

- [ ] **Step 1: Write `public/admin.js`**

```js
(function () {
  'use strict';

  var API = '/plugins/signalk-image-widgets';

  var pageListEl = document.getElementById('pageList');
  var addPageButton = document.getElementById('addPage');
  var messageEl = document.getElementById('message');

  var state = {
    pages: [],
    selectedPageIndex: -1,
    selectedComponentIndex: -1,
  };

  function showError(message) {
    messageEl.textContent = message || '';
    messageEl.classList.add('text-danger');
  }

  function showMessage(message) {
    messageEl.classList.remove('text-danger');
    messageEl.textContent = message || '';
  }

  function selectedPage() {
    return state.pages[state.selectedPageIndex] || null;
  }

  function renderPageList() {
    pageListEl.innerHTML = '';
    state.pages.forEach(function (page, index) {
      var li = document.createElement('li');
      li.className = 'list-group-item d-flex align-items-center justify-content-between' + (index === state.selectedPageIndex ? ' active-item' : '');

      var titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'form-control form-control-sm me-2';
      titleInput.value = page.title || '';
      titleInput.placeholder = '(untitled page)';
      titleInput.addEventListener('click', function (ev) { ev.stopPropagation(); });
      titleInput.addEventListener('input', function () {
        page.title = titleInput.value;
      });

      var controls = document.createElement('div');
      controls.className = 'd-flex gap-1';

      var upButton = document.createElement('button');
      upButton.type = 'button';
      upButton.className = 'btn btn-sm btn-outline-secondary';
      upButton.textContent = '↑';
      upButton.disabled = index === 0;
      upButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        movePage(index, -1);
      });

      var downButton = document.createElement('button');
      downButton.type = 'button';
      downButton.className = 'btn btn-sm btn-outline-secondary';
      downButton.textContent = '↓';
      downButton.disabled = index === state.pages.length - 1;
      downButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        movePage(index, 1);
      });

      var removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-sm btn-outline-danger';
      removeButton.textContent = '×';
      removeButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        removePage(index);
      });

      controls.appendChild(upButton);
      controls.appendChild(downButton);
      controls.appendChild(removeButton);

      li.appendChild(titleInput);
      li.appendChild(controls);
      li.addEventListener('click', function () {
        selectPage(index);
      });

      pageListEl.appendChild(li);
    });
  }

  function selectPage(index) {
    state.selectedPageIndex = index;
    state.selectedComponentIndex = -1;
    renderAll();
  }

  function addPage() {
    state.pages.push({ title: '', components: [] });
    state.selectedPageIndex = state.pages.length - 1;
    state.selectedComponentIndex = -1;
    renderAll();
  }

  function removePage(index) {
    state.pages.splice(index, 1);
    if (state.selectedPageIndex === index) {
      state.selectedPageIndex = -1;
      state.selectedComponentIndex = -1;
    } else if (state.selectedPageIndex > index) {
      state.selectedPageIndex -= 1;
    }
    renderAll();
  }

  function movePage(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= state.pages.length) return;
    var tmp = state.pages[index];
    state.pages[index] = state.pages[target];
    state.pages[target] = tmp;
    if (state.selectedPageIndex === index) state.selectedPageIndex = target;
    else if (state.selectedPageIndex === target) state.selectedPageIndex = index;
    renderAll();
  }

  // Tasks 5-9 extend this with component-list, form, preview, save, and
  // raw-JSON rendering - calling renderAll() always re-renders everything
  // currently wired, so each task just adds its own render*() call here.
  function renderAll() {
    renderPageList();
  }

  function loadConfig() {
    fetch(API + '/admin/config')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load config (' + res.status + ')');
        return res.json();
      })
      .then(function (body) {
        state.pages = body.pages;
        state.selectedPageIndex = state.pages.length > 0 ? 0 : -1;
        renderAll();
      })
      .catch(function (err) {
        showError(err.message);
      });
  }

  addPageButton.addEventListener('click', addPage);

  loadConfig();
})();
```

- [ ] **Step 2: Deploy and verify manually**

Redeploy using the same tar/docker cp/restart sequence as Task 3 Step 5, then navigate to `http://localhost:3000/signalk-image-widgets/` with `claude-in-chrome`:
- Confirm the page list starts empty (or shows whatever pages exist in the container's current `components.json` — it already has "Wind Direction" and "Maneuver Score" from earlier this session).
- Click "+ Page", confirm a new untitled row appears and becomes selected (highlighted).
- Type into a page's title field, confirm it updates without losing focus on every keystroke.
- Click ↑/↓ on a page, confirm the list reorders.
- Click × on a page, confirm it's removed and selection clears sanely (no JS error in the console — check with `read_console_messages`).

- [ ] **Step 3: Commit**

```bash
git add public/admin.js
git commit -m "Add admin.js: load config, page list add/remove/reorder/rename"
```

---

## Task 5: `admin.js` — component list CRUD within the selected page

**Files:**
- Modify: `public/admin.js`

**Interfaces:**
- Consumes: `state`, `selectedPage()`, `renderAll()`, `showError()` from Task 4.
- Produces: `selectedComponent()` (returns `selectedPage().components[state.selectedComponentIndex]` or `null`), extends `renderAll()` to also call a new `renderComponentList()`.

- [ ] **Step 1: Add component-list rendering and CRUD to `public/admin.js`**

Add these element lookups near the top (with the existing ones):

```js
  var componentListEl = document.getElementById('componentList');
  var addComponentButton = document.getElementById('addComponent');
```

A sensible default shape per type, used when adding a new component (add this near the top, as a module-scope constant):

```js
  var DEFAULT_COMPONENT_BY_TYPE = {
    numeric: function (id) { return { id: id, type: 'numeric', width: 240, height: 120, format: 'png', path: '', unit: '', decimals: 1, label: '' }; },
    windTrend: function (id) { return { id: id, type: 'windTrend', width: 480, height: 200, format: 'png', windowMinutes: 30 }; },
    windSpeedTrend: function (id) { return { id: id, type: 'windSpeedTrend', width: 480, height: 200, format: 'png', windowMinutes: 30 }; },
    windDirectionTrend: function (id) { return { id: id, type: 'windDirectionTrend', width: 480, height: 200, format: 'png', windowMinutes: 30 }; },
    maneuverScore: function (id) { return { id: id, type: 'maneuverScore', width: 300, height: 200, format: 'png', windowMinutes: 30 }; },
  };
```

Add these functions (anywhere after `movePage`, before `renderAll`):

```js
  function selectedComponent() {
    var page = selectedPage();
    if (!page) return null;
    return page.components[state.selectedComponentIndex] || null;
  }

  function renderComponentList() {
    componentListEl.innerHTML = '';
    var page = selectedPage();
    addComponentButton.disabled = !page;
    if (!page) return;

    page.components.forEach(function (component, index) {
      var li = document.createElement('li');
      li.className = 'list-group-item d-flex align-items-center justify-content-between' + (index === state.selectedComponentIndex ? ' active-item' : '');

      var label = document.createElement('span');
      label.textContent = (component.id || '(no id)') + ' — ' + component.type;

      var controls = document.createElement('div');
      controls.className = 'd-flex gap-1';

      var upButton = document.createElement('button');
      upButton.type = 'button';
      upButton.className = 'btn btn-sm btn-outline-secondary';
      upButton.textContent = '↑';
      upButton.disabled = index === 0;
      upButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        moveComponent(index, -1);
      });

      var downButton = document.createElement('button');
      downButton.type = 'button';
      downButton.className = 'btn btn-sm btn-outline-secondary';
      downButton.textContent = '↓';
      downButton.disabled = index === page.components.length - 1;
      downButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        moveComponent(index, 1);
      });

      var removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-sm btn-outline-danger';
      removeButton.textContent = '×';
      removeButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        removeComponent(index);
      });

      controls.appendChild(upButton);
      controls.appendChild(downButton);
      controls.appendChild(removeButton);

      li.appendChild(label);
      li.appendChild(controls);
      li.addEventListener('click', function () {
        selectComponent(index);
      });

      componentListEl.appendChild(li);
    });
  }

  function selectComponent(index) {
    state.selectedComponentIndex = index;
    renderAll();
  }

  function addComponent() {
    var page = selectedPage();
    if (!page) return;
    var id = 'component-' + Date.now();
    page.components.push(DEFAULT_COMPONENT_BY_TYPE.numeric(id));
    state.selectedComponentIndex = page.components.length - 1;
    renderAll();
  }

  function removeComponent(index) {
    var page = selectedPage();
    if (!page) return;
    page.components.splice(index, 1);
    if (state.selectedComponentIndex === index) {
      state.selectedComponentIndex = -1;
    } else if (state.selectedComponentIndex > index) {
      state.selectedComponentIndex -= 1;
    }
    renderAll();
  }

  function moveComponent(index, delta) {
    var page = selectedPage();
    if (!page) return;
    var target = index + delta;
    if (target < 0 || target >= page.components.length) return;
    var tmp = page.components[index];
    page.components[index] = page.components[target];
    page.components[target] = tmp;
    if (state.selectedComponentIndex === index) state.selectedComponentIndex = target;
    else if (state.selectedComponentIndex === target) state.selectedComponentIndex = index;
    renderAll();
  }
```

Update `renderAll()` to also call the new render function:

```js
  function renderAll() {
    renderPageList();
    renderComponentList();
  }
```

Wire the add-component button (next to the existing `addPageButton.addEventListener(...)` line):

```js
  addComponentButton.addEventListener('click', addComponent);
```

- [ ] **Step 2: Deploy and verify manually**

Redeploy (same sequence as Task 3 Step 5), navigate to the admin page, and:
- Select a page with existing components (e.g. "Wind Direction" already has a `twd` component in the container's current config) — confirm its component(s) list.
- Click "+ Component" on a page, confirm a new `numeric`-type component appears, selected.
- Confirm "+ Component" is disabled when no page is selected (deselect by removing all pages, or check the initial empty state).
- Reorder and remove components, confirm the list updates and selection behaves sanely (mirroring the page-list checks from Task 4).

- [ ] **Step 3: Commit**

```bash
git add public/admin.js
git commit -m "Add admin.js: component list add/remove/reorder within a page"
```

---

## Task 6: `admin.js` — component edit form with type-specific fields

**Files:**
- Modify: `public/admin.js`

**Interfaces:**
- Consumes: `selectedComponent()`, `state`, `renderAll()` from Task 5.
- Produces: extends `renderAll()` to call a new `renderComponentForm()`. Establishes the form-field-change pattern (`<input>`/`<select>` writing straight back into the selected component object, then calling `renderComponentList()` to keep the sidebar label in sync) that Task 7's preview hook attaches to.

- [ ] **Step 1: Add the form renderer to `public/admin.js`**

Add this element lookup near the top:

```js
  var componentFormEl = document.getElementById('componentForm');
```

Field metadata per type — the common fields every type has, plus the fields unique to each (add near `DEFAULT_COMPONENT_BY_TYPE`):

```js
  var COMMON_FIELDS = ['id', 'type', 'width', 'height', 'format'];
  var TYPE_SPECIFIC_FIELDS = {
    numeric: ['path', 'unit', 'decimals', 'conversion', 'label'],
    windTrend: ['windowMinutes'],
    windSpeedTrend: ['windowMinutes'],
    windDirectionTrend: ['windowMinutes'],
    maneuverScore: ['windowMinutes'],
  };
  var FIELD_LABELS = {
    id: 'ID', type: 'Type', width: 'Width (px)', height: 'Height (px)', format: 'Format',
    path: 'SignalK path', unit: 'Unit', decimals: 'Decimals', conversion: 'Conversion', label: 'Label',
    windowMinutes: 'Window (minutes)',
  };
```

Add the form-building function (after the Task 5 functions, before `renderAll`):

```js
  function fieldInput(component, field) {
    var wrap = document.createElement('div');
    wrap.className = 'mb-2';

    var label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = FIELD_LABELS[field] || field;
    wrap.appendChild(label);

    var input;
    if (field === 'type') {
      input = document.createElement('select');
      input.className = 'form-select';
      Object.keys(DEFAULT_COMPONENT_BY_TYPE).forEach(function (typeName) {
        var option = document.createElement('option');
        option.value = typeName;
        option.textContent = typeName;
        if (typeName === component.type) option.selected = true;
        input.appendChild(option);
      });
      input.addEventListener('change', function () {
        var page = selectedPage();
        var defaults = DEFAULT_COMPONENT_BY_TYPE[input.value](component.id);
        page.components[state.selectedComponentIndex] = defaults;
        renderAll();
      });
    } else if (field === 'format') {
      input = document.createElement('select');
      input.className = 'form-select';
      ['png', 'jpeg', 'svg'].forEach(function (formatName) {
        var option = document.createElement('option');
        option.value = formatName;
        option.textContent = formatName;
        if (formatName === component.format) option.selected = true;
        input.appendChild(option);
      });
      input.addEventListener('change', function () {
        component.format = input.value;
      });
    } else if (field === 'conversion') {
      input = document.createElement('select');
      input.className = 'form-select';
      ['', 'mpsToKnots'].forEach(function (conversionName) {
        var option = document.createElement('option');
        option.value = conversionName;
        option.textContent = conversionName || '(none)';
        if (conversionName === (component.conversion || '')) option.selected = true;
        input.appendChild(option);
      });
      input.addEventListener('change', function () {
        component.conversion = input.value || undefined;
      });
    } else if (field === 'width' || field === 'height' || field === 'decimals' || field === 'windowMinutes') {
      // Never the "id" field (that's always text, handled below), so no
      // need to refresh the sidebar label here.
      input = document.createElement('input');
      input.type = 'number';
      input.className = 'form-control';
      input.value = component[field] === undefined ? '' : component[field];
      input.addEventListener('input', function () {
        component[field] = input.value === '' ? undefined : Number(input.value);
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control';
      input.value = component[field] === undefined ? '' : component[field];
      input.addEventListener('input', function () {
        component[field] = input.value;
        if (field === 'id') renderComponentList();
      });
    }

    wrap.appendChild(input);
    return wrap;
  }

  function renderComponentForm() {
    componentFormEl.innerHTML = '';
    var component = selectedComponent();
    if (!component) {
      componentFormEl.textContent = 'Select or add a component to edit it.';
      return;
    }

    var fields = COMMON_FIELDS.concat(TYPE_SPECIFIC_FIELDS[component.type] || []);
    fields.forEach(function (field) {
      componentFormEl.appendChild(fieldInput(component, field));
    });
  }
```

Note the `id` field change handler above calls `renderComponentList()` directly (not `renderAll()`) so typing in the ID field doesn't rebuild the form itself on every keystroke (which would steal focus) — only the sidebar label needs to stay in sync as you type.

Update `renderAll()`:

```js
  function renderAll() {
    renderPageList();
    renderComponentList();
    renderComponentForm();
  }
```

- [ ] **Step 2: Deploy and verify manually**

Redeploy, navigate to the admin page, and:
- Select a numeric component (or add one), confirm the form shows `id`/`type`/`width`/`height`/`format`/`path`/`unit`/`decimals`/`conversion`/`label`.
- Select a `windSpeedTrend`/`windTrend`/`windDirectionTrend`/`maneuverScore` component, confirm the form shows only `windowMinutes` as the type-specific field (no `path`/`unit`/etc.).
- Change the `type` dropdown on an existing component, confirm the form switches to that type's fields with sensible defaults (not leftover fields from the old type).
- Type into the `id` field, confirm the sidebar's label updates live without the form itself losing focus.

- [ ] **Step 3: Commit**

```bash
git add public/admin.js
git commit -m "Add admin.js: per-type component edit form"
```

---

## Task 7: `admin.js` — live preview

**Files:**
- Modify: `public/admin.js`

**Interfaces:**
- Consumes: `POST /admin/preview` (Task 2), `selectedComponent()`, `componentFormEl` field-change points from Task 6.
- Produces: `schedulePreview()` — debounced (500ms), called from every field's change handler added in Task 6 (this task edits those handlers to add the call).

- [ ] **Step 1: Add the preview mechanism to `public/admin.js`**

Add these element lookups near the top:

```js
  var previewWrapEl = document.getElementById('previewWrap');
  var previewImageEl = document.getElementById('previewImage');
```

Add near the top, with other module-scope state:

```js
  var previewDebounceTimer = null;
  var previewObjectUrl = null;
```

Add this function (anywhere after `renderComponentForm`, before `renderAll`):

```js
  // Debounced so a field being typed into doesn't fire a request per
  // keystroke. A 400 (the component is momentarily invalid mid-edit - an
  // empty width, an unrecognized path) is expected and frequent while
  // typing: hide the preview quietly rather than calling showError(), which
  // would otherwise flash on nearly every keystroke.
  function schedulePreview() {
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(updatePreview, 500);
  }

  function updatePreview() {
    var component = selectedComponent();
    if (!component) {
      previewWrapEl.hidden = true;
      return;
    }
    fetch(API + '/admin/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(component),
    })
      .then(function (res) {
        if (!res.ok) {
          previewWrapEl.hidden = true;
          return null;
        }
        return res.blob();
      })
      .then(function (blob) {
        if (!blob) return;
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = URL.createObjectURL(blob);
        previewImageEl.src = previewObjectUrl;
        previewWrapEl.hidden = false;
      })
      .catch(function () {
        previewWrapEl.hidden = true;
      });
  }
```

Now wire it into every field-change point from Task 6's `fieldInput()` function. Each of the four `addEventListener` calls in `fieldInput` needs one more line — `schedulePreview();` — added at the end of its handler body:

```js
      input.addEventListener('change', function () {
        var page = selectedPage();
        var defaults = DEFAULT_COMPONENT_BY_TYPE[input.value](component.id);
        page.components[state.selectedComponentIndex] = defaults;
        renderAll();
        schedulePreview();
      });
```
(the `type` select's handler)

```js
      input.addEventListener('change', function () {
        component.format = input.value;
        schedulePreview();
      });
```
(the `format` select's handler)

```js
      input.addEventListener('change', function () {
        component.conversion = input.value || undefined;
        schedulePreview();
      });
```
(the `conversion` select's handler)

```js
      input.addEventListener('input', function () {
        component[field] = input.value === '' ? undefined : Number(input.value);
        schedulePreview();
      });
```
(the numeric-input branch — never the "id" field, so no sidebar-label refresh needed here)

```js
      input.addEventListener('input', function () {
        component[field] = input.value;
        if (field === 'id') renderComponentList();
        schedulePreview();
      });
```
(the text-input branch)

Also call it once whenever a component is freshly selected or added, so the preview shows immediately rather than only after the first edit — add `schedulePreview();` at the end of both `selectComponent()` and `addComponent()`:

```js
  function selectComponent(index) {
    state.selectedComponentIndex = index;
    renderAll();
    schedulePreview();
  }
```

```js
  function addComponent() {
    var page = selectedPage();
    if (!page) return;
    var id = 'component-' + Date.now();
    page.components.push(DEFAULT_COMPONENT_BY_TYPE.numeric(id));
    state.selectedComponentIndex = page.components.length - 1;
    renderAll();
    schedulePreview();
  }
```

- [ ] **Step 2: Deploy and verify manually**

Redeploy, navigate to the admin page, and:
- Select a component with a valid `path` pointing at live data on the container (e.g. `navigation.speedOverGround`), confirm a preview image appears within ~1s.
- Edit the `width`/`height` fields to something clearly different, confirm the preview updates to match after the debounce.
- Clear the `width` field entirely (empty string → `undefined` → fails `validateComponent`), confirm the preview image is hidden (not a broken-image icon, not an error flashed in `#message`) — this is the Review Focus item for this task. Check the console for no uncaught errors during this.
- Type a `path` that doesn't exist, confirm the preview still renders (a "--" placeholder image), not an error.

- [ ] **Step 3: Commit**

```bash
git add public/admin.js
git commit -m "Add admin.js: debounced live preview via POST /admin/preview"
```

---

## Task 8: `admin.js` — Save

**Files:**
- Modify: `public/admin.js`

**Interfaces:**
- Consumes: `PUT /admin/config` (Task 2, including its `{ errors: [{ page, componentIndex, id, message }] }` 400 shape), `state`.
- Produces: `save()`, wired to `#saveButton`.

- [ ] **Step 1: Add the save function to `public/admin.js`**

Add this function (anywhere after `loadConfig`, before the event-listener wiring at the bottom):

```js
  function save() {
    fetch(API + '/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: state.pages }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          if (result.body.errors) {
            var summary = result.body.errors
              .map(function (e) {
                return 'page ' + (e.page + 1) + ', component "' + (e.id || '?') + '": ' + e.message;
              })
              .join('; ');
            showError('Save failed - ' + summary);
          } else {
            showError('Save failed - ' + (result.body.message || 'unknown error'));
          }
          return;
        }
        showMessage('Saved.');
      })
      .catch(function (err) {
        showError('Save failed - ' + err.message);
      });
  }
```

Wire the save button (with the other event-listener wiring near the bottom of the file):

```js
  document.getElementById('saveButton').addEventListener('click', save);
```

- [ ] **Step 2: Deploy and verify manually**

Redeploy, navigate to the admin page, and:
- Make a small, valid edit (e.g. change a page title), click Save, confirm a "Saved." message appears and reloading the page shows the change persisted.
- Create a duplicate `id` across two different pages (the Review Focus scenario this task owns), click Save, confirm `#message` shows a specific, readable error naming the page and id — not a silent failure, not a generic "error" with no detail.
- Use `docker exec signalk cat /home/node/.signalk/plugin-config-data/signalk-image-widgets/components.json` to confirm a successful save actually wrote to disk, and that a failed (duplicate-id) save did NOT change the file's prior contents.

- [ ] **Step 3: Commit**

```bash
git add public/admin.js
git commit -m "Add admin.js: Save button, wired to PUT /admin/config with
inline validation-error display"
```

---

## Task 9: `admin.js` — raw JSON toggle

**Files:**
- Modify: `public/admin.js`

**Interfaces:**
- Consumes: `state`, `renderAll()`.
- Produces: nothing further tasks depend on — this is the last `admin.js` task.

- [ ] **Step 1: Add the raw-JSON toggle to `public/admin.js`**

Add these element lookups near the top:

```js
  var rawJsonToggleButton = document.getElementById('rawJsonToggle');
  var rawJsonPanelEl = document.getElementById('rawJsonPanel');
  var structuredPanelEl = document.getElementById('structuredPanel');
  var rawJsonTextEl = document.getElementById('rawJsonText');
  var rawJsonApplyButton = document.getElementById('rawJsonApply');
```

Add these functions (anywhere after `save`, before the event-listener wiring):

```js
  function toggleRawJson() {
    var showingRaw = !rawJsonPanelEl.hidden;
    if (showingRaw) {
      rawJsonPanelEl.hidden = true;
      structuredPanelEl.hidden = false;
    } else {
      rawJsonTextEl.value = JSON.stringify({ pages: state.pages }, null, 2);
      rawJsonPanelEl.hidden = false;
      structuredPanelEl.hidden = true;
    }
  }

  function applyRawJson() {
    var parsed;
    try {
      parsed = JSON.parse(rawJsonTextEl.value);
    } catch (err) {
      showError('Raw JSON is not valid JSON: ' + err.message);
      return;
    }
    if (!parsed || !Array.isArray(parsed.pages)) {
      showError('Raw JSON must be an object with a "pages" array');
      return;
    }
    state.pages = parsed.pages;
    state.selectedPageIndex = state.pages.length > 0 ? 0 : -1;
    state.selectedComponentIndex = -1;
    rawJsonPanelEl.hidden = true;
    structuredPanelEl.hidden = false;
    renderAll();
    showMessage('Raw JSON applied - review and Save to persist it.');
  }
```

Wire both buttons (with the other event-listener wiring near the bottom of the file):

```js
  rawJsonToggleButton.addEventListener('click', toggleRawJson);
  rawJsonApplyButton.addEventListener('click', applyRawJson);
```

- [ ] **Step 2: Deploy and verify manually**

Redeploy, navigate to the admin page, and:
- Click "Raw JSON", confirm the structured panel hides and a textarea shows the current config as formatted JSON.
- Edit the JSON (e.g. change a title, or add a component by hand), click "Apply", confirm the structured panel reappears showing the edited state.
- Click Save, confirm it persists (same check as Task 8).
- Type deliberately invalid JSON into the textarea, click "Apply", confirm `#message` shows a parse error and the structured panel does NOT change (state untouched).

- [ ] **Step 3: Commit**

```bash
git add public/admin.js
git commit -m "Add admin.js: raw JSON view/edit toggle"
```

---

## Task 10: Document the admin UI in the README

**Files:**
- Modify: `README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Update `README.md`**

The README's `## Configuration` section currently opens with:

```
Copy `components.sample.json` to `components.json` in this plugin's SignalK
data directory and edit it directly — there is no admin-UI configuration
form. The file is re-read on every request, so changes take effect
immediately.
```

Replace that paragraph with:

```
Edit `components.json` through the admin UI — open this plugin's row on
SignalK's **Plugin Config** screen, or go directly to
`http://<your-server>/signalk-image-widgets/` while logged in as an admin.
It supports adding/removing/reordering pages and components, a live preview
of each component against current SignalK data as you edit it, and a raw
JSON view for bulk edits. Changes take effect on Save; `components.json`
remains a plain file in this plugin's SignalK data directory if you'd
rather edit it by hand instead — copy `components.sample.json` there to
start from scratch, or read it from the admin UI's raw JSON view. The file
is re-read on every dashboard request either way, so changes (from either
path) take effect immediately.
```

Add a new subsection to `## HTTP API`, after the existing `GET /components/:id/image` bullet and before the `All four routes are registered as readonly-accessible` paragraph:

```
- `GET /admin/config` / `PUT /admin/config` — read or replace the full
  page/component configuration as JSON. Backs the admin UI; `PUT` validates
  the entire document (including that every component `id` is unique
  across the whole config, not just within one page) before writing
  anything, and rejects with a structured list of errors otherwise.
- `POST /admin/preview` — renders a single component definition (which
  need not be saved anywhere yet) against live SignalK data, the same way
  `GET /components/:id/image` renders a saved one. Backs the admin UI's
  live preview.
```

Update the paragraph right after (currently reads "All four routes are registered as readonly-accessible...") to clarify the new routes are the exception:

```
The four `GET` routes above are registered as readonly-accessible (via
`router.access('readonly')` on servers that support it), so with SignalK's
`allow_readonly` security setting enabled they work without a login
session — useful for a browser, like a Kindle's, that can't do SignalK's
login flow. `PUT /admin/config` and `POST /admin/preview` are deliberately
**not** readonly-accessible — they require normal SignalK admin
authentication, same as any other configuration change.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document the admin UI and its routes in the README"
```
