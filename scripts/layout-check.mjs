#!/usr/bin/env node
/**
 * Layout and target-size check against a real browser.
 *
 * Builds are served by `vite preview`; this script walks every route at four
 * viewports (iPad portrait and landscape, phone, desktop) and fails if any page
 * scrolls horizontally or exposes an interactive target under 24x24 CSS pixels
 * (WCAG 2.2 SC 2.5.8). Pass --demo to load the demo dataset first, and
 * --shots=<dir> to write screenshots.
 *
 *   npm run build && npm run preview &
 *   npm run check:layout
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PREVIEW_URL || 'http://localhost:4173/';
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;
const withDemo = process.argv.includes('--demo');
const shotsArg = process.argv.find((arg) => arg.startsWith('--shots='));
const shotsDir = shotsArg ? shotsArg.split('=')[1] : null;

const VIEWPORTS = [
  { name: 'ipad-portrait', width: 810, height: 1080 },
  { name: 'ipad-landscape', width: 1080, height: 810 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
const ROUTES = ['today', 'tasks', 'nutrition', 'fitness', 'study', 'calendar', 'analytics', 'settings'];

if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const problems = [];
const pageErrors = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(`${viewport.name}: ${String(error)}`));

  if (withDemo) {
    await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Backup' }).click();
    const loadButton = page.getByRole('button', { name: 'Load demo data' });
    if (await loadButton.isEnabled()) await loadButton.click();
    await page.waitForTimeout(1200);
  }

  for (const route of ROUTES) {
    await page.goto(`${BASE}#/${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      smallTargets: [...document.querySelectorAll('button, a[href], input, select, textarea')]
        .filter((el) => {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || el.closest('.visually-hidden')) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.height < 24 || rect.width < 24);
        })
        .slice(0, 5)
        .map((el) => `${el.tagName}.${el.className}`.slice(0, 60)),
    }));
    if (result.overflow > 0) problems.push(`${viewport.name}/${route}: horizontal overflow of ${result.overflow}px`);
    for (const target of result.smallTargets) problems.push(`${viewport.name}/${route}: target smaller than 24px - ${target}`);
    if (shotsDir && viewport.name === 'ipad-portrait') {
      await page.screenshot({ path: `${shotsDir}/${route}.png` });
    }
  }
  await context.close();
}
await browser.close();

for (const error of pageErrors) console.error('page error:', error);
if (problems.length > 0) {
  for (const problem of problems) console.error('FAIL', problem);
  process.exit(1);
}
console.log(`OK - ${VIEWPORTS.length * ROUTES.length} page/viewport combinations, no overflow and no undersized targets.`);
