// Outils de test : un petit site PHP local (serveur intégré de PHP) avec api.php et un mot de passe connu.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../', import.meta.url));
const locale = racine + 'outils/php/php.exe';
export const PHP = process.env.PHP_PATH || (existsSync(locale) ? locale
  : (spawnSync('php', ['--version']).status === 0 ? 'php' : null));
export const SANS_PHP = PHP ? false : 'PHP absent (voir README : outils/php ou variable PHP_PATH)';
export const MOT_DE_PASSE = 'un-mot-de-passe-de-test';

const portLibre = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

export async function demarrerSite({ configurer = true, indexHtml = false } = {}) {
  const dir = mkdtempSync(tmpdir() + '/blocl-');
  copyFileSync(racine + 'serveur/api.php', dir + '/api.php');
  copyFileSync(racine + 'serveur/.htaccess', dir + '/.htaccess');
  if (indexHtml) copyFileSync(racine + 'dist/ia-arduino.html', dir + '/index.html');
  if (configurer) {
    const r = spawnSync(PHP, [racine + 'serveur/creer-config.php', dir + '/config.php'], { input: MOT_DE_PASSE, encoding: 'utf8' });
    if (r.status !== 0) throw new Error('config.php non créé : ' + r.stderr);
  }
  const port = await portLibre();
  const proc = spawn(PHP, ['-S', '127.0.0.1:' + port, '-t', dir], { stdio: 'ignore' });
  const url = 'http://127.0.0.1:' + port + '/';
  for (let i = 0; i < 60; i++) {
    try { await fetch(url + 'api.php?action=etat'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  return {
    url, dir,
    arreter() { proc.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* Windows : fichier encore ouvert */ } },
    lire: (chemin) => readFileSync(dir + '/' + chemin, 'utf8')
  };
}

// Appel de l'API avec un « pot à cookies ».
export function client(site) {
  const cookies = {};
  const entete = () => Object.entries(cookies).map(([k, v]) => k + '=' + v).join('; ');
  async function appel(action, corps, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.sansEntete ? {} : { 'X-Requested-With': 'bloc-lab' }, options.headers || {});
    if (entete()) headers.Cookie = entete();
    const r = await fetch(site.url + 'api.php?action=' + action, { method: options.methode || (corps === undefined ? 'GET' : 'POST'), headers, body: corps === undefined ? undefined : (typeof corps === 'string' ? corps : JSON.stringify(corps)) });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); cookies[k] = v; }
    let json = null;
    const texte = await r.text();
    try { json = JSON.parse(texte); } catch (e) { /* pas du JSON */ }
    return { statut: r.status, json, texte, entetes: r.headers };
  }
  return { appel, connexion: (mdp = MOT_DE_PASSE) => appel('connexion', { motdepasse: mdp }), cookies };
}

export const exerciceTest = (extra = {}) => Object.assign({
  format: 'bloc-lab-exercice', version: 1, id: 'demo', titre: 'Test', consigne: 'Fais ceci.', modele: { url: 'https://tm.exemple/models/abc/' },
  classes: ['classe A'], blocs: { blocks: { languageVersion: 0, blocks: [{ type: 'evt_start', x: 1, y: 1 }] } }
}, extra);
