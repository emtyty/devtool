/**
 * Renders public/og.svg → public/og.png at 1200×630 using Playwright's
 * bundled Chromium. Run once whenever og.svg changes:
 *
 *   npm run og:generate
 */

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/og.svg');
const pngPath = resolve(__dirname, '../public/og.png');

const svgContent = readFileSync(svgPath, 'utf-8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(
  `<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden">${svgContent}</body></html>`,
);
// Wait for any fonts/gradients to settle
await page.waitForTimeout(200);
const buffer = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();

writeFileSync(pngPath, buffer);
console.log(`✓ public/og.png generated (${(buffer.length / 1024).toFixed(1)} KB)`);
