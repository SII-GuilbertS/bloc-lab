// Crée site/config.php (mot de passe enseignant haché) pour api.php.
// Le mot de passe est tapé ici, masqué, et transmis à PHP par l'entrée standard (pas par la ligne de commande).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../', import.meta.url));
const phpLocal = racine + 'outils/php/php.exe';
const php = process.env.PHP_PATH || (existsSync(phpLocal) ? phpLocal : 'php');

function saisir(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let texte = '';
    const entree = process.stdin;
    if (!entree.isTTY) {   // redirection (tests) : lecture simple
      let tampon = '';
      entree.setEncoding('utf8');
      entree.on('data', (d) => { tampon += d; });
      entree.on('end', () => resolve(tampon.split(/\r?\n/)[0]));
      return;
    }
    entree.setRawMode(true); entree.resume(); entree.setEncoding('utf8');
    const lire = (c) => {
      for (const ch of c) {
        if (ch === '\r' || ch === '\n') { entree.setRawMode(false); entree.pause(); entree.off('data', lire); process.stdout.write('\n'); return resolve(texte); }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(1); }
        if (ch === '\u007f' || ch === '\b') texte = texte.slice(0, -1); else texte += ch;
      }
    };
    entree.on('data', lire);
  });
}

const mdp = await saisir('Mot de passe enseignant (10 caractères minimum) : ');
if (process.stdin.isTTY) {
  const confirmation = await saisir('Retape-le pour confirmer : ');
  if (confirmation !== mdp) { console.error('Les deux mots de passe sont différents. Rien n\'a été créé.'); process.exit(1); }
}
mkdirSync(racine + 'site', { recursive: true });
const sortie = process.env.CONFIG_SORTIE || racine + 'site/config.php';
const r = spawnSync(php, [racine + 'serveur/creer-config.php', sortie], { input: mdp, encoding: 'utf8' });
if (r.error) { console.error('PHP est introuvable : ' + r.error.message); process.exit(1); }
if (r.status !== 0) { console.error(r.stderr.trim() || 'Échec.'); process.exit(r.status || 1); }
console.log('Fichier créé : ' + sortie);
console.log('Envoie-le UNE FOIS par FTP à côté de api.php (même dossier que index.html). Ne le partage jamais.');
