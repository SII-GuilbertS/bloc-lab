import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { PAGE, attendre } from './helpers.mjs';

// Fausse caméra fournie par Chrome (aucune vraie webcam nécessaire).
async function ouvrir() {
  const navigateur = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'].concat(process.env.NO_SANDBOX ? ['--no-sandbox'] : [])
  });
  const page = await navigateur.newPage({ viewport: { width: 1400, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.iaArduino);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  await page.evaluate(() => window.iaArduino.activerModele({ getClassLabels: () => ['classe A', 'classe B'], predict: async () => [{ className: 'classe A', probability: 1 }, { className: 'classe B', probability: 0 }] }, 'faux modèle'));
  return { navigateur, page, erreurs };
}
const debrancher = (page) => page.evaluate(() => { const t = window.iaArduino.state.stream.getVideoTracks()[0]; t.stop(); t.dispatchEvent(new Event('ended')); });
const etat = (page) => page.evaluate(() => ({ perdue: window.iaArduino.state.cameraPerdue, analyse: window.iaArduino.state.analyse, actif: !!window.iaArduino.state.stream && window.iaArduino.state.stream.getVideoTracks()[0].readyState === 'live' }));

test("caméra débranchée : message, puis relance toute seule au rebranchement", async () => {
  const { navigateur, page, erreurs } = await ouvrir();
  try {
    assert.deepEqual(await etat(page), { perdue: false, analyse: true, actif: true });
    await debrancher(page);
    assert.equal((await etat(page)).perdue, true);
    assert.equal((await etat(page)).analyse, false);
    assert.match(await page.innerText('#journal'), /webcam a été débranchée/);
    assert.match(await page.innerText('#apercuVide'), /débranchée/);
    assert.match(await page.getAttribute('#btnRelancerCamera', 'class'), /alerte-cam/);
    // Rebranchement : l'événement « devicechange » déclenche la relance.
    await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
    await page.waitForFunction(() => !window.iaArduino.state.cameraPerdue && window.iaArduino.state.analyse, null, { timeout: 5000 });
    assert.deepEqual(await etat(page), { perdue: false, analyse: true, actif: true });
    assert.match(await page.innerText('#journal'), /Webcam relancée/);
    assert.doesNotMatch(await page.getAttribute('#btnRelancerCamera', 'class'), /alerte-cam/);
    assert.deepEqual(erreurs, []);
  } finally { await navigateur.close(); }
});

test("caméra débranchée : relance automatique même sans événement (nouvel essai toutes les 3 s)", async () => {
  const { navigateur, page } = await ouvrir();
  try {
    await debrancher(page);
    await page.waitForFunction(() => !window.iaArduino.state.cameraPerdue, null, { timeout: 8000 });
    assert.equal((await etat(page)).analyse, true);
  } finally { await navigateur.close(); }
});

test("l'icône ↻ relance la webcam à la main (nouvelle boucle d'analyse)", async () => {
  const { navigateur, page } = await ouvrir();
  try {
    assert.equal(await page.isVisible('#btnRelancerCamera'), true);
    const avant = await page.evaluate(() => window.iaArduino.state.idBoucle);
    await page.click('#btnRelancerCamera');
    await page.waitForFunction((n) => window.iaArduino.state.idBoucle > n, avant, { timeout: 5000 });
    assert.deepEqual(await etat(page), { perdue: false, analyse: true, actif: true });
    await attendre(300);
  } finally { await navigateur.close(); }
});

test("mode test : l'icône est cachée et aucune relance n'est tentée", async () => {
  const { navigateur, page } = await ouvrir();
  try {
    await page.evaluate(() => window.iaArduino.activerTest());
    assert.equal(await page.isVisible('#btnRelancerCamera'), false);
    assert.equal((await etat(page)).perdue, false);
  } finally { await navigateur.close(); }
});
