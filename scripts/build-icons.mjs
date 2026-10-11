// Rendert die SVG-Icons mit Playwright/Chromium zu PNG-Dateien.
// Aufruf: npm run icons  (benötigt eine lokale Playwright-Installation)
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const dir = new URL('../public/icons/', import.meta.url);
const jobs = [
  { src: 'icon.svg', out: 'icon-192.png', size: 192 },
  { src: 'icon.svg', out: 'icon-512.png', size: 512 },
  { src: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
  { src: 'icon-maskable.svg', out: 'apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const job of jobs) {
  const svg = await readFile(new URL(job.src, dir), 'utf8');
  await page.setViewportSize({ width: job.size, height: job.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${job.size}" height="${job.size}" `)}</body></html>`,
  );
  await page.locator('svg').screenshot({ path: new URL(job.out, dir).pathname, omitBackground: true });
  console.log('✓', job.out);
}
await browser.close();
