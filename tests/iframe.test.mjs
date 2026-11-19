import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const HOTE = new URL('../exemples/integration-iframe.html', import.meta.url).href;

test("la page fonctionne dans une iframe avec allow=\"serial; camera\" et explique le blocage", async () => {
  const navigateur = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    args: process.env.NO_SANDBOX ? ['--no-sandbox'] : []
  });
  try {
    const page = await navigateur.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(HOTE);
    assert.equal(await page.getAttribute('#atelier', 'allow'), 'serial; camera; fullscreen');
    const cadre = page.frame({ url: /ia-arduino\.html/ });
    await cadre.waitForFunction(() => window.iaArduino);
    assert.equal(await cadre.evaluate(() => window.iaArduino.dansIframe()), true);
    assert.equal(await cadre.evaluate(() => 'serial' in navigator), true, 'Web Serial disponible dans l\'iframe');
    const conseil = await cadre.evaluate(() => window.iaArduino.conseilIframe(new DOMException('refusé', 'SecurityError')));
    assert.match(conseil, /allow="serial; camera"/);
    assert.equal(await cadre.evaluate(() => window.iaArduino.conseilIframe(new Error('autre'))), '');
    assert.deepEqual(erreurs, []);
  } finally { await navigateur.close(); }
});

test("hors iframe, aucun conseil d'intégration n'est ajouté", async () => {
  const { ouvrirPage } = await import('./helpers.mjs');
  const { navigateur, page } = await ouvrirPage();
  try {
    assert.equal(await page.evaluate(() => window.iaArduino.dansIframe()), false);
    assert.equal(await page.evaluate(() => window.iaArduino.conseilIframe(new DOMException('x', 'SecurityError'))), '');
  } finally { await navigateur.close(); }
});
