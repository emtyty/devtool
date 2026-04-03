/**
 * Renders public/icon.svg → public/icon-192.png and public/icon-512.png
 * using Playwright's bundled Chromium. Run once whenever icon.svg changes:
 *
 *   npm run icons:generate
 */

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/icon.svg');
const svgContent = readFileSync(svgPath, 'utf-8');

// Wrap SVG in a page that sizes it exactly to the requested dimension
function makeHtml(size) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;width:${size}px;height:${size}px">${svgContent.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
}

const browser = await chromium.launch();

for (const size of [192, 512]) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(makeHtml(size));
  await page.waitForTimeout(100);
  const buffer = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } });
  const outPath = resolve(__dirname, `../public/icon-${size}.png`);
  writeFileSync(outPath, buffer);
  console.log(`✓ public/icon-${size}.png generated (${(buffer.length / 1024).toFixed(1)} KB)`);
  await page.close();
}

await browser.close();
