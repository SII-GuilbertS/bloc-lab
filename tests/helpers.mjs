import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

export const PAGE = new URL('../dist/ia-arduino.html', import.meta.url).href;

// CHROME_PATH : chemin vers Chrome/Edge si Playwright n'a pas son propre navigateur.
export async function ouvrirPage() {
  const navigateur = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    args: process.env.NO_SANDBOX ? ['--no-sandbox'] : []
  });
  const page = await navigateur.newPage({ viewport: { width: 1400, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.iaArduino);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  return { navigateur, page, erreurs };
}

export const journal = (page) => page.innerText('#journal');
export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
export const nombre = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
export const charger = (page, programme) =>
  page.evaluate((p) => Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [p] } }, window.iaArduino.ws), programme);

export function lireHex(chemin) {
  const mem = {};
  for (const l of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    if (!l.startsWith(':')) continue;
    const n = parseInt(l.substr(1, 2), 16), adr = parseInt(l.substr(3, 4), 16), type = parseInt(l.substr(7, 2), 16);
    if (type !== 0) continue;
    for (let i = 0; i < n; i++) mem[adr + i] = parseInt(l.substr(9 + 2 * i, 2), 16);
  }
  return mem;
}
