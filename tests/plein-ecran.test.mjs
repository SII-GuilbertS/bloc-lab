import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUTIL = readFileSync(new URL('../dist/ia-arduino.html', import.meta.url));
// Le site hôte (localhost) et l'outil (127.0.0.1) sont d'origines différentes, comme sur un vrai site.
const hote = (allow) => '<!doctype html><meta charset="utf-8"><iframe id="atelier" src="http://127.0.0.1:' + port + '/outil.html" ' + (allow ? 'allow="' + allow + '"' : '') + ' style="width:100%;height:600px;border:0"></iframe>';
const serveur = http.createServer((req, rep) => {
  rep.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url === '/outil.html') rep.end(OUTIL);
  else if (req.url === '/avec') rep.end(hote('serial; camera; fullscreen'));
  else if (req.url === '/sans') rep.end(hote('serial; camera'));
  else { rep.statusCode = 404; rep.end(''); }
});
let port, navigateur;
test.before(async () => {
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  port = serveur.address().port;
  navigateur = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    args: process.env.NO_SANDBOX ? ['--no-sandbox'] : []
  });
});
test.after(async () => { await navigateur.close(); serveur.close(); });

async function ouvrir(chemin, origine = '127.0.0.1') {
  const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto('http://' + origine + ':' + port + chemin);
  return { ctx, page, erreurs };
}
const largeurBlocs = (cible) => cible.evaluate(() => document.getElementById('blocklyDiv').getBoundingClientRect().width);

test("panneau de gauche : replié, blocs plus larges, choix mémorisé", async () => {
  const { ctx, page, erreurs } = await ouvrir('/outil.html');
  try {
    await page.waitForFunction(() => window.iaArduino);
    const avant = await largeurBlocs(page);
    assert.equal(await page.isVisible('aside'), true);
    assert.equal(await page.innerText('#btnPanneau'), '◀ Masquer le panneau');
    await page.click('#btnPanneau');
    assert.equal(await page.isVisible('aside'), false);
    assert.equal(await page.innerText('#btnPanneau'), '▶ Afficher le panneau');
    assert.ok(await largeurBlocs(page) > avant + 300, 'la zone de blocs prend toute la largeur');
    await page.reload(); await page.waitForFunction(() => window.iaArduino);
    assert.equal(await page.isVisible('aside'), false, 'le choix est gardé après rechargement');
    await page.click('#btnPanneau');
    assert.equal(await page.isVisible('aside'), true);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test("plein écran : le bouton entre et sort du plein écran", async () => {
  const { ctx, page } = await ouvrir('/outil.html');
  try {
    await page.waitForFunction(() => window.iaArduino);
    await page.click('#btnPleinEcran');
    await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 });
    assert.equal(await page.innerText('#btnPleinEcran'), '⛶ Quitter le plein écran');
    await page.click('#btnPleinEcran');
    await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 });
    assert.equal(await page.innerText('#btnPleinEcran'), '⛶ Plein écran');
  } finally { await ctx.close(); }
});

test("iframe avec « fullscreen » : l'outil passe en plein écran dans le site", async () => {
  const { ctx, page } = await ouvrir('/avec', 'localhost');
  try {
    const cadre = page.frame({ url: /outil\.html/ });
    await cadre.waitForFunction(() => window.iaArduino);
    assert.equal(await cadre.evaluate(() => document.fullscreenEnabled), true);
    await cadre.click('#btnPleinEcran');
    await page.waitForFunction(() => document.fullscreenElement && document.fullscreenElement.id === 'atelier', null, { timeout: 5000 });
    await cadre.click('#btnPleinEcran');
    await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 });
  } finally { await ctx.close(); }
});

test("iframe sans « fullscreen » : message clair au lieu d'un bouton muet", async () => {
  const { ctx, page } = await ouvrir('/sans', 'localhost');
  try {
    const cadre = page.frame({ url: /outil\.html/ });
    await cadre.waitForFunction(() => window.iaArduino);
    assert.equal(await cadre.evaluate(() => document.fullscreenEnabled), false);
    await cadre.click('#btnPleinEcran');
    await cadre.waitForFunction(() => document.getElementById('alerte').style.display === 'block');
    assert.match(await cadre.innerText('#alerte'), /fullscreen.*allow/);
  } finally { await ctx.close(); }
});
