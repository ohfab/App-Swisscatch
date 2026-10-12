// Rendert die SVG-Icons mit Playwright/Chromium zu PNG-Dateien (Web-App und Android).
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
// Android bis Version 7 nutzt noch PNG-Symbole
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, size] of Object.entries(densities)) {
  jobs.push({ src: 'icon.svg', out: `../../native/android/res/mipmap-${d}/ic_launcher.png`, size });
  jobs.push({ src: 'icon-round.svg', out: `../../native/android/res/mipmap-${d}/ic_launcher_round.png`, size });
}

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
