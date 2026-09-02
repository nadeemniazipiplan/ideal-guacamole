#!/usr/bin/env node
/**
 * Builds the whole dashboard into ONE self-contained HTML file.
 *
 * Everything - JavaScript, CSS, the mascot artwork - ends up inline, so the
 * page needs no other file to run. That makes it possible to host the app by
 * handing a single file to somewhere that serves one page, which is how the
 * shareable preview link is produced.
 *
 *   npm run build:single
 *
 * Output: dist-single/life-dashboard.html
 *
 * Two deliberate differences from the normal build:
 *   - no service worker (there is no separate file to register), so the
 *     single-file version does not work offline
 *   - no web app manifest, so "Add to Home Screen" gives a plain shortcut
 *     rather than a full standalone app
 * Use the normal `npm run build` plus a static host for the full PWA.
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'dist-single');

await build({
  root,
  base: './',
  plugins: [react()],
  define: { 'import.meta.env.VITE_SINGLE_FILE': 'true' },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    // Inline every asset, however large, and keep the app in one chunk so the
    // lazily-loaded routes do not become separate files.
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  logLevel: 'warn',
});

const html = readFileSync(resolve(outDir, 'index.html'), 'utf8');

function assetContents(match, label) {
  if (!match) throw new Error(`The build produced no ${label} to inline.`);
  return readFileSync(resolve(outDir, match.replace(/^\.?\//, '')), 'utf8');
}

// Match the emitted bundles only - the document also links a remote font
// stylesheet, which must stay a link rather than be inlined.
const scriptSrc = html.match(/<script[^>]+src="([^"]*assets\/[^"]+\.js)"/)?.[1];
const styleHref = html.match(/<link[^>]+href="([^"]*assets\/[^"]+\.css)"/)?.[1];
const js = assetContents(scriptSrc, 'JavaScript bundle');
const css = assetContents(styleHref, 'stylesheet');
const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Personal Life Dashboard';
// The font stylesheet, not the preconnect hint that precedes it.
const fontLink = html.match(/<link[^>]+rel="stylesheet"[^>]+fonts\.googleapis\.com[^>]*>/)?.[0] ?? '';

// A body fragment: no doctype, <html>, <head> or <body> of its own, so it can be
// dropped into a host page as-is.
const single = `<title>${title}</title>
${fontLink.replace(/\s+media="print"\s+onload="[^"]*"/, '')}
<style>
${css}
</style>
<div id="root"></div>
<noscript>
  <p style="font-family: system-ui, sans-serif; padding: 24px">
    This dashboard needs JavaScript to read and write your local records.
  </p>
</noscript>
<script type="module">
${js}
</script>
`;

mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'life-dashboard.html');
writeFileSync(outFile, single);

const kb = (single.length / 1024).toFixed(0);
process.stdout.write(`wrote dist-single/life-dashboard.html (${kb} kB, fully self-contained)\n`);
