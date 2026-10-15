'use strict';

function renderDashboardHtml(pages, pageIndex, { now = Date.now } = {}) {
  const timestamp = now();
  const clampedIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
  const page = pages[clampedIndex];

  const body = page.components.length
    ? page.components
        .map(
          ({ id, width, height }) =>
            `<img src="components/${id}/image?t=${timestamp}" width="${width}" height="${height}">`,
        )
        .join('\n')
    : '<p>No components configured.</p>';

  const nextIndex = (clampedIndex + 1) % pages.length;
  const pager =
    pages.length > 1
      ? `<p><a href="dashboard?page=${nextIndex}">Next page (${nextIndex + 1} / ${pages.length}) →</a></p>\n`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="refresh" content="30;url=dashboard?page=${clampedIndex}">
<title>SignalK Image Widgets</title>
<style>
body { background: #fff; margin: 0; padding: 8px; font-family: sans-serif; image-rendering: pixelated; }
img { display: block; margin-bottom: 8px; max-width: 100%; max-height: 100vh; width: auto; height: auto; }
p { color: #000; }
a { display: inline-block; padding: 10px 16px; border: 2px solid #000; border-radius: 6px; color: #000; text-decoration: none; }
</style>
</head>
<body>
${body}
${pager}</body>
</html>
`;
}

module.exports = { renderDashboardHtml };
