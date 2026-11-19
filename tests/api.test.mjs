import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SANS_PHP, demarrerSite, client, exerciceTest, MOT_DE_PASSE } from './php.mjs';

const opt = { skip: SANS_PHP };
const racine = fileURLToPath(new URL('../', import.meta.url));

test("api.php : état, protections de base et cookie de session", opt, async () => {
  const site = await demarrerSite();
  try {
    const c = client(site);
    let r = await c.appel('etat');
    assert.deepEqual(r.json, { ok: true, configure: true, connecte: false });
    assert.equal(r.entetes.get('cache-control'), 'no-store');
    r = await c.appel('enregistrer', { exercice: exerciceTest() });
    assert.equal(r.statut, 401, 'écriture sans connexion refusée');
    r = await c.appel('liste');
    assert.equal(r.statut, 401);
    r = await c.appel('connexion', { motdepasse: MOT_DE_PASSE }, { sansEntete: true });
    assert.equal(r.statut, 403, "requête sans l'en-tête X-Requested-With refusée");
    r = await c.appel('enregistrer', undefined, { methode: 'GET' });
    assert.equal(r.statut, 405, 'écriture en GET refusée');
    r = await c.appel('inconnue');
    assert.equal(r.statut, 404);
    r = await c.connexion();
    assert.equal(r.statut, 200);
    const cookie = r.entetes.getSetCookie().join(';');
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i);
    assert.equal((await c.appel('etat')).json.connecte, true);
    await c.appel('deconnexion', {});
    assert.equal((await c.appel('etat')).json.connecte, false);
  } finally { site.arreter(); }
});

test("api.php : sans config.php, l'enregistrement est refusé avec un message clair", opt, async () => {
  const site = await demarrerSite({ configurer: false });
  try {
    const c = client(site);
    assert.equal((await c.appel('etat')).json.configure, false);
    const r = await c.connexion();
    assert.equal(r.statut, 503);
    assert.match(r.json.erreur, /pas encore installé/);
  } finally { site.arreter(); }
});

test("api.php : mauvais mot de passe, puis blocage après 5 échecs", opt, async () => {
  const site = await demarrerSite();
  try {
    const c = client(site);
    for (let i = 0; i < 5; i++) assert.equal((await c.connexion('mauvais-mot-de-passe')).statut, 401);
    const r = await c.connexion();   // même le bon mot de passe est refusé pendant le blocage
    assert.equal(r.statut, 429);
    assert.equal((await c.appel('etat')).json.connecte, false);
  } finally { site.arreter(); }
});

test("api.php : https obligatoire hors localhost", opt, async () => {
  const site = await demarrerSite();
  try {
    const port = new URL(site.url).port;
    const statut = await new Promise((res, rej) => {
      http.get({ host: '127.0.0.1', port, path: '/api.php?action=etat', headers: { Host: 'mon-site.exemple' } }, (r) => { r.resume(); res(r.statusCode); }).on('error', rej);
    });
    assert.equal(statut, 403);
    const ok = await new Promise((res, rej) => {
      http.get({ host: '127.0.0.1', port, path: '/api.php?action=etat', headers: { Host: 'mon-site.exemple', 'X-Forwarded-Proto': 'https' } }, (r) => { r.resume(); res(r.statusCode); }).on('error', rej);
    });
    assert.equal(ok, 200, 'derrière un relais https');
  } finally { site.arreter(); }
});

test("api.php : enregistrer, lister, lire en public, protections créées", opt, async () => {
  const site = await demarrerSite();
  try {
    const c = client(site);
    await c.connexion();
    let r = await c.appel('enregistrer', { exercice: exerciceTest({ modifie: '1999-01-01T00:00:00Z' }), modifieAttendu: null });
    assert.equal(r.statut, 200);
    assert.notEqual(r.json.modifie, '1999-01-01T00:00:00Z', "la date est fixée par le serveur");
    const fichier = JSON.parse(site.lire('exercices/demo.json'));
    assert.equal(fichier.titre, 'Test'); assert.equal(fichier.id, 'demo'); assert.equal(fichier.modifie, r.json.modifie);
    r = await c.appel('liste');
    assert.deepEqual(r.json.exercices.map((e) => [e.id, e.titre]), [['demo', 'Test']]);
    // Les élèves lisent le fichier directement, sans connexion.
    const pub = await fetch(site.url + 'exercices/demo.json');
    assert.equal(pub.status, 200);
    assert.equal((await pub.json()).consigne, 'Fais ceci.');
    assert.match(site.lire('exercices/.htaccess'), /Require all denied/);
    assert.match(site.lire('exercices/.htaccess'), /php/);
    assert.match(site.lire('donnees/.htaccess'), /Require all denied/);
    assert.match(site.lire('.htaccess'), /config\\\.php/);
  } finally { site.arreter(); }
});

test("api.php : données invalides refusées (noms, tailles, formats, liens)", opt, async () => {
  const site = await demarrerSite();
  try {
    const c = client(site);
    await c.connexion();
    const essai = (extra, attendu, nom) => c.appel('enregistrer', { exercice: exerciceTest(extra) }).then((r) => assert.equal(r.statut, attendu, nom + ' : ' + r.texte));
    for (const id of ['../secret', 'Majuscule', 'a/b', 'a.b', '', 'con', 'x'.repeat(61), 'espace ici', '..']) await essai({ id }, 400, 'id ' + id);
    await essai({ titre: '   ' }, 400, 'titre vide');
    await essai({ titre: 'x'.repeat(121) }, 400, 'titre long');
    await essai({ consigne: 'x'.repeat(3001) }, 400, 'consigne longue');
    await essai({ format: 'autre' }, 400, 'format');
    await essai({ version: 2 }, 400, 'version');
    await essai({ blocs: 'texte' }, 400, 'blocs');
    await essai({ modele: { url: 'http://pas-securise.exemple/' } }, 400, 'modèle http');
    await essai({ modele: { url: 'javascript:alert(1)' } }, 400, 'modèle javascript');
    let profond = {}; let cur = profond; for (let i = 0; i < 90; i++) { cur.a = {}; cur = cur.a; }
    await essai({ blocs: profond }, 400, 'trop imbriqué');
    await essai({ blocs: { gros: 'x'.repeat(650000) } }, 413, 'trop gros');
    assert.equal((await c.appel('enregistrer', 'pas du json')).statut, 400);
    assert.equal(existsSync(site.dir + '/exercices') ? readdirSync(site.dir + '/exercices').filter((f) => f.endsWith('.json')).length : 0, 0, 'rien n\'a été écrit');
  } finally { site.arreter(); }
});

test("api.php : conflit si l'exercice a été modifié ailleurs, 5 versions gardées", opt, async () => {
  const site = await demarrerSite();
  try {
    const c = client(site);
    await c.connexion();
    let r = await c.appel('enregistrer', { exercice: exerciceTest(), modifieAttendu: null });
    assert.equal(r.statut, 200);
    const m1 = r.json.modifie;
    r = await c.appel('enregistrer', { exercice: exerciceTest({ titre: 'Autre' }), modifieAttendu: null });
    assert.equal(r.statut, 409, 'même nom, créé comme nouveau : refusé');
    assert.equal(r.json.conflit, true);
    r = await c.appel('enregistrer', { exercice: exerciceTest({ titre: 'Autre' }), modifieAttendu: '2000-01-01T00:00:00Z' });
    assert.equal(r.statut, 409, 'date attendue périmée');
    r = await c.appel('enregistrer', { exercice: exerciceTest({ titre: 'Version 2' }), modifieAttendu: m1 });
    assert.equal(r.statut, 200);
    assert.equal(JSON.parse(site.lire('exercices/demo.json')).titre, 'Version 2');
    for (let i = 3; i <= 9; i++) {
      r = await c.appel('enregistrer', { exercice: exerciceTest({ titre: 'Version ' + i }), ecraser: true });
      assert.equal(r.statut, 200);
    }
    const versions = readdirSync(site.dir + '/donnees/versions/demo');
    assert.equal(versions.length, 5, 'les 5 dernières versions seulement');
    const titres = versions.sort().map((f) => JSON.parse(readFileSync(site.dir + '/donnees/versions/demo/' + f, 'utf8')).titre);
    assert.equal(titres.at(-1), 'Version 8', 'la plus récente ancienne version est celle d\'avant la dernière');
  } finally { site.arreter(); }
});

test("api.php : supprimer = corbeille, noms dangereux refusés", opt, async () => {
  const site = await demarrerSite();
  try {
    const c = client(site);
    await c.connexion();
    await c.appel('enregistrer', { exercice: exerciceTest(), modifieAttendu: null });
    assert.equal((await c.appel('supprimer', { id: '../config' })).statut, 400);
    assert.equal((await c.appel('supprimer', { id: 'inexistant' })).statut, 404);
    assert.equal((await c.appel('supprimer', { id: 'demo' })).statut, 200);
    assert.equal(existsSync(site.dir + '/exercices/demo.json'), false);
    assert.equal(readdirSync(site.dir + '/donnees/corbeille').length, 1);
    assert.deepEqual((await c.appel('liste')).json.exercices, []);
    assert.equal((await fetch(site.url + 'exercices/demo.json')).status, 404);
  } finally { site.arreter(); }
});

test("npm run mot-de-passe : crée config.php sans y écrire le mot de passe", opt, () => {
  const dossier = mkdtempSync(tmpdir() + '/blocl-mdp-');
  const sortie = dossier + '/config.php';
  const lancer = (mdp) => spawnSync(process.execPath, [racine + 'scripts/mot-de-passe.mjs'], { input: mdp + '\n', encoding: 'utf8', env: Object.assign({}, process.env, { CONFIG_SORTIE: sortie }) });
  let r = lancer('court');
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(sortie), false);
  r = lancer('un-mot-de-passe-assez-long');
  assert.equal(r.status, 0, r.stderr);
  const contenu = readFileSync(sortie, 'utf8');
  assert.match(contenu, /'hash' => '\$2y\$/);
  assert.doesNotMatch(contenu, /un-mot-de-passe-assez-long/);
  assert.doesNotMatch(r.stdout + r.stderr, /un-mot-de-passe-assez-long/);
});
