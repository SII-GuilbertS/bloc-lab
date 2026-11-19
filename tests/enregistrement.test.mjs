import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { SANS_PHP, demarrerSite, client, MOT_DE_PASSE, exerciceTest } from './php.mjs';

// Bout en bout : la vraie page, le vrai api.php (serveur PHP local), un vrai navigateur.
const opt = { skip: SANS_PHP };
let navigateur;
test.before(async () => {
  if (SANS_PHP) return;
  navigateur = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    args: process.env.NO_SANDBOX ? ['--no-sandbox'] : []
  });
});
test.after(async () => { if (navigateur) await navigateur.close(); });

async function ouvrir(site, requete = '', contexte) {
  const ctx = contexte || await navigateur.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.reponse = 'accept';
  page.on('dialog', (d) => (page.reponse === 'accept' ? d.accept() : d.dismiss()));
  await page.goto(site.url + requete);
  await page.waitForFunction(() => window.iaArduino);
  return { ctx, page, erreurs };
}
const message = (page, id) => page.innerText(id);

async function seConnecter(page, mdp = MOT_DE_PASSE) {
  await page.click('#btnMesExercices');
  await page.fill('#mxMdp', mdp);
  await page.click('#mxConnexion button[type=submit]');
}

test("sans config.php : « Mes exercices » explique ce qu'il manque", opt, async () => {
  const site = await demarrerSite({ configurer: false, indexHtml: true });
  const { ctx, page } = await ouvrir(site);
  try {
    await page.click('#btnMesExercices');
    await page.waitForFunction(() => /config\.php/.test(document.getElementById('mxMessage').textContent));
    assert.equal(await page.isVisible('#mxConnexion'), false);
  } finally { await ctx.close(); site.arreter(); }
});

test("hors site (pas d'api.php) : message clair, le bouton d'enregistrement reste caché", opt, async () => {
  const site = await demarrerSite({ configurer: false, indexHtml: true });
  try {
    const { rmSync } = await import('node:fs');
    rmSync(site.dir + '/api.php');
    const { ctx, page } = await ouvrir(site);
    await page.click('#btnMesExercices');
    await page.waitForFunction(() => /seulement sur ton site/.test(document.getElementById('mxMessage').textContent));
    await page.click('#mxFermer');
    await page.click('#btnExporterExercice');
    assert.equal(await page.isVisible('#btnEnregistrerSite'), false);
    assert.equal(await page.isVisible('#formExercice button[type=submit]'), true, 'le téléchargement du fichier reste possible');
    await ctx.close();
  } finally { site.arreter(); }
});

test("enseignant : connexion, enregistrer, rouvrir, modifier, dupliquer, supprimer", opt, async () => {
  const site = await demarrerSite({ indexHtml: true });
  const { ctx, page, erreurs } = await ouvrir(site);
  try {
    await seConnecter(page, 'mauvais-mot-de-passe');
    await page.waitForFunction(() => /incorrect/.test(document.getElementById('mxMessage').textContent));
    await page.fill('#mxMdp', MOT_DE_PASSE);
    await page.click('#mxConnexion button[type=submit]');
    await page.waitForFunction(() => /Aucun exercice/.test(document.getElementById('mxMessage').textContent));

    // Enregistrer un exercice.
    await page.evaluate(() => { window.iaArduino.ws.clear(); window.iaArduino.insererExemple2(); });
    await page.click('#mxNouveau');
    await page.fill('#exTitre', 'Le clignotant');
    assert.equal(await page.inputValue('#exId'), 'le-clignotant');
    await page.fill('#exConsigne', 'Fais clignoter la LED.');
    await page.click('#btnEnregistrerSite');
    await page.waitForFunction(() => /Enregistré sur ton site/.test(document.getElementById('exMessageSite').textContent));
    assert.equal(await page.inputValue('#exBaliseSite'), '<iframe src="' + site.url + '?exercice=le-clignotant" title="Le clignotant" allow="serial; camera" style="width:100%; height:90vh; border:0"></iframe>');
    const fichier = JSON.parse(site.lire('exercices/le-clignotant.json'));
    assert.equal(fichier.titre, 'Le clignotant'); assert.equal(fichier.consigne, 'Fais clignoter la LED.');
    assert.ok(fichier.blocs.blocks.blocks.length >= 1);
    await page.click('#btnFermerExercice');

    // Après rechargement la session est gardée : la liste s'affiche, on rouvre l'exercice.
    await page.reload(); await page.waitForFunction(() => window.iaArduino);
    await page.waitForFunction(() => window.iaArduino.state.api.connecte);
    await page.evaluate(() => window.iaArduino.ws.clear());
    await page.click('#btnMesExercices');
    await page.waitForSelector('#mxListe li');
    assert.match(await message(page, '#mxListe'), /Le clignotant/);
    await page.click('#mxListe li >> text=Ouvrir');
    await page.waitForFunction(() => window.iaArduino.ws.getAllBlocks(false).length > 0);

    // Modifier puis enregistrer de nouveau (même nom : pas de conflit, une version est gardée).
    await page.evaluate(() => window.iaArduino.ws.getAllBlocks(false).find((b) => b.type === 'ard_led').setFieldValue('9', 'PIN'));
    await page.click('#btnExporterExercice');
    assert.equal(await page.inputValue('#exTitre'), 'Le clignotant');
    await page.click('#btnEnregistrerSite');
    await page.waitForFunction(() => /Enregistré sur ton site/.test(document.getElementById('exMessageSite').textContent));
    assert.equal(readdirSync(site.dir + '/donnees/versions/le-clignotant').length, 1);
    assert.match(site.lire('exercices/le-clignotant.json'), /"9"/);

    // Conflit : l'exercice change ailleurs, on refuse d'écraser puis on accepte.
    const autre = client(site); await autre.connexion();
    const actuel = JSON.parse(site.lire('exercices/le-clignotant.json'));
    await autre.appel('enregistrer', { exercice: Object.assign(actuel, { titre: 'Modifié ailleurs' }), ecraser: true });
    page.reponse = 'refuse';
    await page.click('#btnEnregistrerSite');
    await page.waitForFunction(() => /annulé/.test(document.getElementById('exMessageSite').textContent));
    assert.equal(JSON.parse(site.lire('exercices/le-clignotant.json')).titre, 'Modifié ailleurs');
    page.reponse = 'accept';
    await page.click('#btnEnregistrerSite');
    await page.waitForFunction(() => /Enregistré sur ton site/.test(document.getElementById('exMessageSite').textContent));
    assert.equal(JSON.parse(site.lire('exercices/le-clignotant.json')).titre, 'Le clignotant');
    await page.click('#btnFermerExercice');

    // Dupliquer, puis supprimer la copie.
    await page.click('#btnMesExercices');
    await page.waitForSelector('#mxListe li');
    await page.click('#mxListe li >> text=Dupliquer');
    await page.waitForFunction(() => document.querySelectorAll('#mxListe li').length === 2);
    assert.ok(existsSync(site.dir + '/exercices/le-clignotant-copie.json'));
    assert.match(JSON.parse(site.lire('exercices/le-clignotant-copie.json')).titre, /^Copie de /);
    await page.click('#mxListe li:has-text("le-clignotant-copie") >> text=Supprimer');
    await page.waitForFunction(() => document.querySelectorAll('#mxListe li').length === 1);
    assert.equal(existsSync(site.dir + '/exercices/le-clignotant-copie.json'), false);
    assert.equal(readdirSync(site.dir + '/donnees/corbeille').length, 1);

    // Déconnexion : la liste n'est plus accessible, le bouton d'enregistrement disparaît.
    await page.click('#mxDeconnexion');
    assert.equal(await page.isVisible('#mxConnexion'), true);
    await page.click('#mxFermer');
    await page.click('#btnExporterExercice');
    assert.equal(await page.isVisible('#btnEnregistrerSite'), false);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); site.arreter(); }
});

test("élève : ouvre l'exercice enregistré sans jamais appeler api.php", opt, async () => {
  const site = await demarrerSite({ indexHtml: true });
  try {
    const c = client(site); await c.connexion();
    await c.appel('enregistrer', { exercice: exerciceTest({ id: 'eleve', titre: 'Pour les élèves', modele: null }), modifieAttendu: null });
    const ctx = await navigateur.newContext();
    const page = await ctx.newPage();
    const appels = [];
    page.on('request', (r) => { if (/api\.php/.test(r.url())) appels.push(r.url()); });
    await page.goto(site.url + '?exercice=eleve');
    await page.waitForFunction(() => document.getElementById('bandeauExercice').style.display === 'block');
    assert.match(await page.innerText('#exTitreAff'), /Pour les élèves/);
    assert.equal(await page.isVisible('#btnMesExercices'), false);
    assert.deepEqual(appels, []);
    await ctx.close();
  } finally { site.arreter(); }
});
