import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { PAGE } from './helpers.mjs';

const HTML = readFileSync(new URL('../dist/ia-arduino.html', import.meta.url));
const blocs = (pin) => ({ blocks: { languageVersion: 0, blocks: [{ type: 'evt_start', x: 20, y: 20,
  next: { block: { type: 'ard_led', fields: { PIN: pin, ETAT: '1' } } } }] } });
const exercice = (extra) => Object.assign({ format: 'bloc-lab-exercice', version: 1, id: 'demo', titre: 'Allumer la LED',
  consigne: 'Allume la LED 13\nquand tu fais un geste.', modele: { url: 'https://tm.exemple/models/abc/' }, classes: ['classe A'],
  blocs: blocs('13'), modifie: '2026-11-20T10:00:00Z' }, extra);

const fichiers = {};   // exercices servis par le faux site
const serveur = http.createServer((req, rep) => {
  const u = new URL(req.url, 'http://x');
  const m = /^\/atelier-blocs\/exercices\/([^/]+)\.json$/.exec(u.pathname);
  if (u.pathname === '/atelier-blocs/' || u.pathname === '/atelier-blocs/index.html') { rep.setHeader('Content-Type', 'text/html; charset=utf-8'); rep.end(HTML); }
  else if (m && fichiers[m[1]]) { rep.setHeader('Content-Type', 'application/json'); rep.end(JSON.stringify(fichiers[m[1]])); }
  else { rep.statusCode = 404; rep.end('introuvable'); }
});
let port, navigateur;
test.before(async () => {
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  port = serveur.address().port;
  navigateur = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'].concat(process.env.NO_SANDBOX ? ['--no-sandbox'] : [])
  });
});
test.after(async () => { await navigateur.close(); serveur.close(); });

async function ouvrir(requete) {
  const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    window.__tests = { chargerModele: async (u) => { window.__urlModele = u; return { getClassLabels: () => ['classe A', 'classe B'],
      predict: async () => [{ className: 'classe A', probability: 1 }, { className: 'classe B', probability: 0 }] }; } };
  });
  await page.goto('http://127.0.0.1:' + port + '/atelier-blocs/' + requete);
  await page.waitForFunction(() => window.iaArduino);
  return { ctx, page, erreurs };
}
const types = (page) => page.evaluate(() => window.iaArduino.ws.getAllBlocks(false).map((b) => b.type));
const broche = (page) => page.evaluate(() => window.iaArduino.ws.getAllBlocks(false).find((b) => b.type === 'ard_led').getFieldValue('PIN'));
const changerBroche = (page, v) => page.evaluate((x) => window.iaArduino.ws.getAllBlocks(false).find((b) => b.type === 'ard_led').setFieldValue(x, 'PIN'), v);

test("mode élève : consigne, modèle et programme de départ chargés", async () => {
  fichiers.demo = exercice();
  const { ctx, page, erreurs } = await ouvrir('?exercice=demo');
  try {
    await page.waitForFunction(() => window.iaArduino.state.model);
    assert.match(await page.innerText('#exTitreAff'), /Allumer la LED/);
    assert.match(await page.innerText('#exConsigneAff'), /Allume la LED 13\s+quand/);
    assert.equal(await page.evaluate(() => window.__urlModele), 'https://tm.exemple/models/abc/');
    assert.deepEqual((await types(page)).sort(), ['ard_led', 'evt_start']);
    assert.equal(await page.isVisible('#carteModele'), false);
    for (const b of ['#btnEnregistrer', '#btnExporterExercice', '#btnTout']) assert.equal(await page.isVisible(b), false, b);
    assert.equal(await page.isVisible('#btnRecommencer'), true);
    assert.equal(await page.evaluate(() => document.title), 'Allumer la LED');
    await page.waitForFunction(() => window.iaArduino.state.analyse, null, { timeout: 5000 });
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test("mode élève : progression gardée par exercice, « Recommencer » remet le départ", async () => {
  fichiers.demo = exercice();
  fichiers.autre = exercice({ id: 'autre', titre: 'Autre', blocs: blocs('7') });
  const { ctx, page } = await ouvrir('?exercice=demo');
  try {
    await page.waitForFunction(() => window.iaArduino.state.model);
    await changerBroche(page, '9');
    await page.waitForTimeout(700);
    await page.reload(); await page.waitForFunction(() => window.iaArduino.state.model);
    assert.equal(await broche(page), '9', 'la progression est gardée');
    const autre = await ctx.newPage();
    await autre.goto('http://127.0.0.1:' + port + '/atelier-blocs/?exercice=autre');
    await autre.waitForFunction(() => window.iaArduino && window.iaArduino.ws.getAllBlocks(false).length === 2);
    assert.equal(await broche(autre), '7', "l'autre exercice a sa propre sauvegarde");
    await autre.close();
    await page.click('#btnRecommencer');
    assert.equal(await broche(page), '13');
  } finally { await ctx.close(); }
});

test("mode élève : si l'exercice est mis à jour, le départ est rechargé", async () => {
  fichiers.demo = exercice();
  const { ctx, page } = await ouvrir('?exercice=demo');
  try {
    await page.waitForFunction(() => window.iaArduino.state.model);
    await changerBroche(page, '9');
    await page.waitForTimeout(700);
    fichiers.demo = exercice({ modifie: '2026-12-01T10:00:00Z', blocs: blocs('5') });
    await page.reload(); await page.waitForFunction(() => window.iaArduino.state.model);
    assert.equal(await broche(page), '5');
    assert.match(await page.textContent('#journal'), /mis à jour/);
  } finally { await ctx.close(); }
});

test("modèle fourni dans le dossier de l'exercice", async () => {
  fichiers.demo = exercice({ modele: { dossier: true } });
  const { ctx, page } = await ouvrir('?exercice=demo');
  try {
    await page.waitForFunction(() => window.iaArduino.state.model);
    assert.equal(await page.evaluate(() => window.__urlModele), 'http://127.0.0.1:' + port + '/atelier-blocs/exercices/demo/');
  } finally { await ctx.close(); }
});

test("exercice introuvable, nom invalide ou fichier invalide : message clair, pas d'erreur", async () => {
  fichiers.casse = { format: 'autre' };
  for (const [nom, attendu] of [['inconnu', /introuvable/], ['..%2Fsecret', /pas valide/], ['casse', /pas un exercice valide/]]) {
    const { ctx, page, erreurs } = await ouvrir('?exercice=' + nom);
    try {
      await page.waitForFunction(() => document.getElementById('alerte').style.display === 'block');
      assert.match(await page.innerText('#alerte'), attendu, nom);
      assert.deepEqual(erreurs, [], nom);
    } finally { await ctx.close(); }
  }
});

test("ouvert comme simple fichier : explication au lieu d'un échec", async () => {
  const ctx = await navigateur.newContext();
  const page = await ctx.newPage();
  await page.goto(PAGE + '?exercice=demo');
  await page.waitForFunction(() => document.getElementById('alerte').style.display === 'block');
  assert.match(await page.innerText('#alerte'), /depuis un site/);
  await ctx.close();
});

test("enseignant : exporter un exercice puis le rouvrir pour le modifier", async () => {
  const { ctx, page } = await ouvrir('');
  try {
    await page.evaluate(() => { window.iaArduino.ws.clear(); window.iaArduino.insererExemple2(); });
    await page.click('#btnExporterExercice');
    await page.fill('#exTitre', 'Le clignotant d’Émilie');
    assert.equal(await page.inputValue('#exId'), 'le-clignotant-d-emilie');
    await page.fill('#exConsigne', 'Fais clignoter la LED.');
    await page.fill('#exModele', 'https://teachablemachine.withgoogle.com/models/XYZ');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#formExercice button[type=submit]')]);
    assert.equal(dl.suggestedFilename(), 'le-clignotant-d-emilie.json');
    const ex = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    assert.equal(ex.format, 'bloc-lab-exercice'); assert.equal(ex.version, 1);
    assert.equal(ex.titre, 'Le clignotant d’Émilie'); assert.equal(ex.consigne, 'Fais clignoter la LED.');
    assert.equal(ex.modele.url, 'https://teachablemachine.withgoogle.com/models/XYZ/');
    assert.ok(ex.blocs.blocks.blocks.length >= 1);
    assert.match(await page.inputValue('#exBalise'), /\?exercice=le-clignotant-d-emilie" .*allow="serial; camera"/);
    assert.match(await page.innerText('#exFichier'), /exercices\/le-clignotant-d-emilie\.json/);
    await page.click('#btnFermerExercice');
    await page.evaluate(() => window.iaArduino.ws.clear());
    await page.setInputFiles('#fichierProgramme', { name: dl.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(ex)) });
    await page.waitForFunction(() => window.iaArduino.ws.getAllBlocks(false).length > 0);
    await page.click('#btnExporterExercice');
    assert.equal(await page.inputValue('#exTitre'), 'Le clignotant d’Émilie');
    assert.equal(await page.inputValue('#exId'), 'le-clignotant-d-emilie');
    assert.equal(await page.inputValue('#exConsigne'), 'Fais clignoter la LED.');
  } finally { await ctx.close(); }
});

test("enseignant : un nom de fichier invalide est refusé", async () => {
  const { ctx, page } = await ouvrir('');
  try {
    await page.click('#btnExporterExercice');
    await page.fill('#exTitre', 'Test');
    await page.fill('#exId', '../evil');
    let telecharge = false;
    page.on('download', () => { telecharge = true; });
    await page.click('#formExercice button[type=submit]');
    await page.waitForTimeout(400);
    assert.equal(telecharge, false);
  } finally { await ctx.close(); }
});
