'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderDashboardHtml } = require('../lib/render-dashboard');

test('renders an img tag per component sized to its dimensions, with a cache-busting timestamp', () => {
  const pages = [{ title: '', components: [{ id: 'depth', type: 'numeric', width: 240, height: 120 }] }];
  const html = renderDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /<img[^>]*src="components\/depth\/image\?t=1700000000000"[^>]*width="240"[^>]*height="120"/);
});

test('includes a 30 second meta refresh so the page works without JavaScript', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /<meta http-equiv="refresh" content="30;url=dashboard\?page=0">/);
});

test('uses a white background, suited to a Kindle e-ink screen', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /body\s*\{[^}]*background:\s*#fff[^}]*\}/);
});

test('renders one img per component, in order', () => {
  const pages = [
    {
      title: '',
      components: [
        { id: 'depth', type: 'numeric', width: 240, height: 120 },
        { id: 'windtrend', type: 'windTrend', width: 480, height: 200 },
      ],
    },
  ];
  const html = renderDashboardHtml(pages, 0, { now: () => 1700000000000 });
  const srcs = [...html.matchAll(/src="components\/([^"]+)\/image/g)].map((m) => m[1]);
  assert.deepEqual(srcs, ['depth', 'windtrend']);
});

test('renders a friendly message when no components are configured', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /No components configured/);
});

test('renders only the current page\'s components, not other pages\'', () => {
  const pages = [
    { title: '', components: [{ id: 'depth', type: 'numeric', width: 100, height: 50 }] },
    { title: '', components: [{ id: 'windtrend', type: 'windTrend', width: 100, height: 50 }] },
  ];
  const html = renderDashboardHtml(pages, 1, { now: () => 1700000000000 });
  assert.doesNotMatch(html, /components\/depth\/image/);
  assert.match(html, /components\/windtrend\/image/);
});

test('does not render the page title, to keep the full screen for widgets', () => {
  const pages = [{ title: 'Navigation', components: [] }];
  const html = renderDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.doesNotMatch(html, /Navigation/);
  assert.doesNotMatch(html, /<h1/);
});

test('does not show a pagination link when there is only one page', () => {
  const pages = [{ title: '', components: [] }];
  const html = renderDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.doesNotMatch(html, /<a href=/);
});

test('shows a next-page link to the following page, with the page count', () => {
  const pages = [{ title: '', components: [] }, { title: '', components: [] }, { title: '', components: [] }];
  const html = renderDashboardHtml(pages, 0, { now: () => 1700000000000 });
  assert.match(html, /<a href="dashboard\?page=1"[^>]*>[^<]*2 \/ 3[^<]*<\/a>/);
});

test('wraps the next-page link from the last page back to the first', () => {
  const pages = [{ title: '', components: [] }, { title: '', components: [] }];
  const html = renderDashboardHtml(pages, 1, { now: () => 1700000000000 });
  assert.match(html, /<a href="dashboard\?page=0"/);
});

test('keeps the meta refresh pointed at the current page', () => {
  const pages = [{ title: '', components: [] }, { title: '', components: [] }, { title: '', components: [] }];
  const html = renderDashboardHtml(pages, 2, { now: () => 1700000000000 });
  assert.match(html, /<meta http-equiv="refresh" content="30;url=dashboard\?page=2">/);
});

test('clamps an out-of-range page index to the last page', () => {
  const pages = [{ title: 'Only', components: [{ id: 'depth', width: 100, height: 50 }] }];
  const html = renderDashboardHtml(pages, 5, { now: () => 1700000000000 });
  assert.match(html, /components\/depth\/image/);
});

