# bloc-lab — notes pour Claude Code

## But
Page web unique **en français** pour programmer une Arduino par blocs (Blockly) en utilisant la webcam et un modèle d'images Teachable Machine. Public : élèves de 5ème (technologie). Objectif futur : « atelier de blocs en ligne » intégrable dans ÉLÉA (Moodle). Les livrables doivent être complets et prêts à l'emploi pour l'enseignant (Sylvain), sans adaptation.

## Commandes
- `npm run build` : produit `dist/ia-arduino.html` (page unique, bibliothèques incluses : pas de CDN, le collège peut être hors ligne).
- `site/index.html` : copie de la page écrite par `npm run build` (dossier ignoré par git), à déposer tel quel sur l'hébergement.
- `npm test` : build + tests Playwright (`CHROME_PATH` et `NO_SANDBOX=1` si besoin).
- `npm run firmware` : recompile le `.hex` (arduino-cli). Toujours recompiler après avoir modifié le `.ino`, puis `npm run build`.

## Architecture
- `src/app.js` (une IIFE) : blocs personnalisés, générateur JS, exécution asynchrone, webcam + `tmImage`, port série, téléversement STK500, exemples, sauvegarde.
- Le programme des blocs est compilé en fonctions **async** : chaque boucle reçoit `await out.tick()` (`INFINITE_LOOP_TRAP`), `attendre` = `await out.wait(s)`, la lecture = `await out.read(pin)`. L'arrêt lève la valeur `STOP`.
- **Apparence mBlock** : renderer `mblock` (zelos, retrait `RETRAIT` = 14 px) + thème `mblock` (styles `ev_/ct_/ia_/ar_/op_blocks`). Le retrait dépend de la largeur des étiquettes *dans* un trou de « C » : toujours mettre l'étiquette dans une entrée `Dummy`/valeur AVANT `appendStatementInput`, jamais dessus. Blocs de contrôle à nous : `ctrl_si`, `ctrl_si_sinon`, `ctrl_repeter`, `ctrl_tant_que`, `ia_forever`. `migrer()` convertit les anciens JSON (`ia_start`, `controls_if`, `controls_repeat_ext`, `controls_whileUntil`). `ia_hat` (« à chaque image ») n'est plus dans la boîte à outils mais reste exécuté.
- Bloc « quand le programme démarre » (`evt_start`, pas de trou : les blocs sont dessous) = exécuté une fois (en parallèle s'il y en a plusieurs) ; « à chaque image » = boucle toutes les 100 ms. Un programme sans boucle se termine seul et laisse ses sorties telles quelles.
- **Modification en direct** : si les blocs changent pendant l'exécution (300 ms après), `appliquerModification()` relance la nouvelle version sans arrêter. Chaque lancement a son `out` (`creerOut(id)`) : l'ancienne version se coupe seule (`STOP`) et n'envoie plus de commandes. Les sorties déjà allumées gardent leur état (pas de coupure). Seule une boucle « à chaque image » modifiée est échangée à chaud, sans relance.
- **Webcam débranchée** : l'événement `ended` de la piste appelle `cameraPerdue()` (message, prédictions vidées, bouton ↻ en rouge) puis `relancerCamera()` réessaie toute seule (événement `devicechange`, sinon toutes les 3 s). Chaque boucle d'analyse a un numéro (`idBoucle`) pour ne jamais en avoir deux. Test : `tests/camera.test.mjs` avec la fausse caméra de Chrome ; le vrai débranchement USB n'est pas testé.
- **Exercices** : fichier `{format:'bloc-lab-exercice', version:1, id, titre, consigne, modele:{url}|{dossier:true}|null, classes, blocs, modifie}`. `?exercice=id` (id `[a-z0-9-]{1,60}`) → `demarrerModeExercice()` lit `exercices/id.json` à côté de la page ; classe `mode-exercice` sur `body` (cache enregistrer/ouvrir/export) ; sauvegarde élève sous `ia-arduino-exercice-<id>` (ignorée si `modifie` a changé). Enseignant : « Exporter comme exercice » (`creerFichierExercice`) et « Ouvrir… » (`ouvrirExerciceFichier`). `window.__tests.chargerModele` = crochet de test (faux modèle).
- **Enregistrement sur OVH** : `serveur/api.php` (+ `.htaccess`, `creer-config.php`), copiés dans `site/` par le build. Actions `etat`, `connexion`, `deconnexion`, `liste`, `enregistrer`, `supprimer` ; écritures en POST avec l'en-tête `X-Requested-With: bloc-lab` ; session PHP (cookie HttpOnly, SameSite=Strict) ; mot de passe haché dans `config.php` (`npm run mot-de-passe`, jamais versionné) ; la date `modifie` est fixée par le serveur et sert à détecter un conflit (`modifieAttendu`). Pas de `mb_strlen` ni autre extension rare (PHP portable sans mbstring). PHP portable dans `outils/php/` (ignoré par git, ou `PHP_PATH`) ; `tests/php.mjs` lance `php -S` ; tests : `api.test.mjs` (API) et `enregistrement.test.mjs` (page + API). Le https n'est exigé qu'hors localhost.
- Protocole série (115200 bauds, une ligne par commande) : `L,pin,0|1`, `S,pin,0..180`, `P,pin,0..255`, `R,pin,0` → réponse `R,pin,0|1`, `?` → `PRET`. Les commandes d'écriture ne sont envoyées que si la valeur change (cache `state.cache`).
- `window.iaArduino` expose l'état et des fonctions pour les tests.

## Pièges déjà rencontrés (ne pas refaire)
- **`MAX_SERVOS`** est une macro de `Servo.h` : ne pas l'utiliser comme nom de constante dans le `.ino` (le croquis ne compile plus).
- **Broches 0 et 1** = USB série : jamais proposées dans les blocs, refusées par le firmware (plage 2–19).
- **Téléversement par la page** : sur la carte de l'utilisateur, seule la méthode de redémarrage « B » (DTR/RTS d'abord activés 250 ms puis relâchés) a fonctionné ; la méthode « A » donne une réponse isolée puis plus rien (faux départ). Une synchronisation n'est valide que si la carte répond **deux fois** ; la page enchaîne ensuite 3 méthodes × 2 vitesses (115200, 57600).
- Le port série ne peut être ouvert que par un seul programme à la fois (onglet Vittascience, Arduino IDE, moniteur série…) : message « port occupé » explicite.
- Les modèles Teachable Machine « image » uniquement (pas pose/son). Image miroir sur le canvas comme dans Teachable Machine.
- Web Serial : Chrome/Edge seulement ; `file://` est un contexte sûr, mais dans ÉLÉA (iframe) il faudra `allow="serial; camera"` et du HTTPS.
- **Iframe** : `allow="serial; camera"` + https obligatoires ; `conseilIframe()` ajoute l'explication aux erreurs `SecurityError`/`NotAllowedError`. Exemple : `exemples/integration-iframe.html`, test : `tests/iframe.test.mjs` (jamais testé sur un vrai site https avec la vraie carte).
- Vittascience/Adacraft n'a pas fonctionné en mode « live » pour cet usage (d'où ce projet).

## Conventions
- Interface, journal, messages d'erreur, README : **français**, ton simple pour des élèves de 11-12 ans.
- Toute nouvelle commande série : ajouter le cas dans le `.ino`, recompiler le `.hex`, ajouter un test (`tests/`), mettre à jour le README et ce fichier. Dire à l'utilisateur de **retéléverser** le programme dans la carte.
- Ne pas affirmer qu'une fonction marche avec le matériel réel sans test : les tests utilisent une fausse carte (STK500 simulé) et un faux port série.

## Pistes
- Entrées analogiques (A0–A5), buzzer/tonalité, moteur ; afficheur.
- Modèles « pose » de Teachable Machine.
- Intégration ÉLÉA : iframe HTTPS faite (voir README) mais à tester sur ÉLÉA avec la vraie carte ; paquet SCORM possible.
- Éditeur multi-cartes (Nano, Mega) : le `.hex` actuel vise l'Uno (ATmega328P).
