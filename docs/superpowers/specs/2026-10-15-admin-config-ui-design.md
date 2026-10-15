# Admin configuration UI — design

Status: approved for planning
Date: 2026-10-15

## Context

`signalk-image-widgets` currently has no configuration UI at all. Setting up
or changing the dashboard means hand-editing `components.json` in the
plugin's SignalK data directory (directly on disk, or via `docker cp`/`docker
exec` into a container) and restarting or waiting for the file to be
re-read. This has been the only workflow since the plugin's first commit and
is explicitly documented as a limitation in the README ("there is no
admin-UI configuration form").

This spec adds a real admin UI for creating and editing pages and
components, embedded in SignalK server's own Plugin Config screen.

## Goals

- Add, remove, reorder, and rename **pages**.
- Add, remove, reorder, and edit **components** within a page, with a form
  whose fields match the selected component `type` (numeric vs. the three
  wind-trend variants vs. maneuverScore have different field sets today).
- Show a **live preview** of a component (rendered against real current
  SignalK data) while editing it, before it's saved.
- Validate on save and reject the write (with specific, per-component
  errors) rather than ever writing an invalid `components.json`.
- Offer a **raw JSON** view/edit mode alongside the structured form, for
  bulk edits or copying a config between setups.
- Keep `components.json` as the on-disk source of truth, in the same
  `plugin-config-data/<pluginId>/` location it already lives in — this is
  additive to the existing file-based config, not a replacement storage
  mechanism.

## Non-goals

- No change to any existing route (`/dashboard`, `/dashboard-live`,
  `/components`, `/components/:id/image`) or to how those routes load
  config (`loadPages`/`loadComponents` in `lib/config.js` are unchanged).
- No multi-user permissions model beyond what SignalK's own admin
  authentication already provides.
- No drag-and-drop reordering — simple up/down move controls, consistent
  with this project's preference for the simplest UI that does the job.
- No migration tooling for existing `components.json` files — the shape
  doesn't change, so nothing to migrate.

## Why `signalk-plugin-configurator`, not a generic webapp

SignalK plugins can ship a `/public` folder as a UI in three ways,
distinguished by a `package.json` keyword:

- `signalk-webapp` — a standalone app, takes over the whole browser window,
  listed in SignalK's general app list.
- `signalk-embeddable-webapp` — embedded in the admin UI's content area but
  still a separate menu entry.
- `signalk-plugin-configurator` — embeds the plugin's own HTML/JS **directly
  in that plugin's row on the Plugin Config screen**, replacing the
  generic `schema()`-driven auto-form.

The third one is a direct match for "an admin UI for setting up dashboards
and pages for *this* plugin" — same `/public` folder and own backend routes
as the other two options, just better-placed (found where a SignalK admin
already looks to configure a plugin, not a separate app-list entry).

`package.json` changes:
```json
{
  "keywords": ["signalk-node-server-plugin", "signalk-plugin-configurator"],
  "signalk": { "displayName": "SignalK Image Widgets" }
}
```

## Backend: two new routes

Both are registered as plain `router.get`/`router.put`/`router.post` (NOT
via the `getReadonly` helper `index.js` uses for the existing routes). Per
SignalK's plugin router docs, routes default to requiring admin
authentication unless explicitly downgraded with `router.access(...)` — so
simply not opting these into `readonly` access is sufficient; no new
security code is needed. This is a deliberate asymmetry from the existing
routes, which are readonly-accessible specifically so a Kindle can read the
dashboard without logging in; writing config must not have that exemption.

### `GET /admin/config`

Returns the full current config as JSON: `{ pages: [...] }`, in the same
shape `loadPages` produces (reads directly via `loadPages`, not a new code
path). 500 with `{ message }` on a read/parse failure, matching the error
shape `/dashboard` already uses for this case.

### `PUT /admin/config`

Body: `{ pages: [...] }`. Validates the whole document before writing
anything:

1. Parse as JSON (malformed body → 400).
2. Run the new `validatePages(pages)` (see below) over the whole document.
3. If there are any errors, respond 400 with
   `{ state: 'FAILED', statusCode: 400, errors: [{ page, componentIndex, id, message }, ...] }`
   and do not touch the file.
4. Otherwise, `fs.writeFileSync` the config to
   `<dataDir>/components.json`, pretty-printed (2-space indent, matching
   `components.sample.json`'s existing style), and respond 200 with the
   written config.

No locking/atomic-rename — this is a single-admin-user, low-frequency
write; matching the project's existing preference for the simplest
approach that's actually correct for the real usage pattern.

### `POST /admin/preview`

Body: a single draft component object (same shape as one entry in a page's
`components` array; `id` may be a placeholder since this component isn't
saved). Renders it against live SignalK data exactly like
`/components/:id/image` does for a saved component, and returns the image
bytes with the matching `Content-Type`.

To avoid duplicating the numeric/wind-trend/maneuverScore dispatch logic
that already lives inline in the `/components/:id/image` handler, that
dispatch is extracted into a shared function,
`renderComponentNow(component, server, req)`, used by both routes. This is
the one existing-code change outside the two new routes.

Errors: invalid/unknown `type` → 400; a render or history-fetch failure →
500, matching `/components/:id/image`'s existing error handling (it already
catches and reports render errors there).

## Validation: `validatePages()`

New export from `lib/config.js`, alongside the existing `validateComponent`
and `normalizeComponent`:

```js
function validatePages(pages) // -> array of { page, componentIndex, id, message }, empty if valid
```

Runs `validateComponent` on every component on every page (reusing the
exact rules already enforced on load: valid `type`, width/height bounds,
numeric's required `path`, conversion name, etc.) and additionally checks
that every component `id` is unique **across the whole config**, not just
within a page — this rule is currently only documented (in the README), not
enforced anywhere; this spec adds the first actual enforcement of it.

## Frontend: `/public`

New files: `public/index.html`, `public/admin.js`, `public/admin.css`.
Plain HTML/CSS/JS (no build step, no framework) — consistent with every
other page this plugin renders.

All `fetch()` calls from `admin.js` to the new routes must pass
`credentials: 'include'` — SignalK's embedded-webapp auth is cookie-based
shared sessions, and a fetch without that option silently drops the auth
cookie, which would otherwise surface as a confusing 401 only once this
runs inside the real admin UI (not when hitting the routes directly with
curl while developing, which doesn't go through the same cookie flow).

Layout:
- **Left sidebar**: list of pages (title + component count), with
  add/remove/move-up/move-down controls and an inline-editable title field.
  Selecting a page shows it in the main panel.
- **Main panel**: the selected page's components as a list (type + id),
  with add/remove/move-up/move-down controls. Selecting a component opens
  its edit form.
- **Edit form**: common fields (`id`, `type` dropdown, `width`, `height`,
  `format`) plus type-specific fields that appear/disappear as the `type`
  dropdown changes — numeric's `path`/`unit`/`decimals`/`conversion`/`label`,
  the three history-window types' `windowMinutes`. A debounced (~500ms)
  call to `POST /admin/preview` on every field change updates a live
  `<img>` preview next to the form.
- **Save**: a single persistent button, `PUT`s the entire in-memory config.
  On success, shows a brief confirmation. On validation failure, shows the
  returned per-component errors inline (next to the offending page/component
  in the sidebar/list, not just a generic toast).
- **Raw JSON toggle**: swaps the structured sidebar+form view for a
  textarea bound to the same in-memory state (`JSON.stringify` to enter,
  `JSON.parse` + replace state to leave) — editing in either view updates
  the same underlying object, so Save behaves identically either way.

## Testing

- `test/config.test.js`: new tests for `validatePages` — valid multi-page
  config passes with no errors; an invalid component surfaces at the right
  `page`/`componentIndex`; a duplicate `id` across two different pages is
  caught (the one case `validateComponent` alone cannot catch).
- `test/routes.test.js`: new tests for all three routes —
  - `GET /admin/config` returns the current pages.
  - `PUT /admin/config` with a valid document writes it and a subsequent
    `GET /components` reflects the change.
  - `PUT /admin/config` with an invalid document (bad type, duplicate id)
    returns 400 with errors and does **not** modify the existing file.
  - `POST /admin/preview` renders a draft numeric component and a draft
    wind-trend component (reusing the existing fake History API route
    pattern already in `routes.test.js`'s `startApp` helper).
  - The readonly-accessibility test (`registers the dashboard, ... routes
    as readonly-accessible`) gets a companion assertion that `/admin/config`
    and `/admin/preview` are **not** in that readonly list.
- No automated test for `public/*` — this repo has no headless-browser
  test infrastructure, and nothing else in it is tested that way either.
  Verified manually (Chrome, then the real `signalk` container) before
  calling the feature done, same as the live-dashboard and e-ink work this
  session.

## Open risk

`signalk-plugin-configurator`'s exact embedding behavior (how the admin UI
loads and sizes the iframe/content, whether it passes any context) isn't
fully documented in SignalK's docs — this was confirmed by web search, not
by reading SignalK server's own source. The implementation plan should
budget time to verify this against a real signalk-server instance (the
`signalk` container already set up this session) early, rather than
discovering a mismatch late.
