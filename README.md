# bloc-lab

Programmer une carte **Arduino** par **blocs**, en français, avec la **webcam** et l'IA **Teachable Machine** — dans une seule page web (Chrome ou Edge).

Projet de technologie, cycle 4 (5ème), Collège Bétance. Objectif à terme : un « atelier de blocs en ligne » intégrable dans ÉLÉA.

## Utilisation (élèves et professeur)

1. Ouvrir `dist/ia-arduino.html` dans Chrome ou Edge (double-clic, aucune installation).
2. **Étape 1 :** brancher la carte, cliquer sur « ⬆ Téléverser le programme dans la carte » (une seule fois par carte), puis « Connecter la carte ».
3. **Étape 2 :** charger un modèle Teachable Machine (fichier `.zip` exporté en TensorFlow.js, ou lien du modèle).
4. **Étape 3 :** assembler les blocs, puis « ▶ Démarrer ».

Sans carte ni webcam, le « mode test » simule la reconnaissance et affiche les commandes dans le journal.

## Blocs disponibles

| Catégorie | Blocs |
|---|---|
| Événements (jaune) | « quand le programme démarre » (les blocs dessous s'exécutent une fois) |
| Contrôle (orange) | répéter indéfiniment, répéter n fois, répéter tant que, sortir de la boucle, attendre n secondes, si / alors, si / alors / sinon |
| IA (violet) | « l'IA reconnaît … à plus de … % », « confiance de … », « classe la plus probable » |
| Arduino (bleu) | mettre la broche D2–D13 à haut / bas, lire l'état de la broche, servomoteur (0–180°), sortie PWM, écrire dans le journal |
| Opérateurs (vert) | comparaisons, et / ou / non, vrai / faux, nombres, calculs, texte |

Les blocs ont l'allure de ceux de mBlock. Les anciens programmes enregistrés sont convertis automatiquement (« au démarrage » devient « quand le programme démarre »). L'ancien bloc « à chaque image de la webcam » n'est plus proposé, mais il fonctionne encore dans un ancien programme.

Les broches D0 et D1 sont volontairement absentes : elles servent à la liaison USB.

## Intégrer l'atelier dans un site (iframe)

1. Lancer `npm run build`, puis mettre en ligne le **contenu du dossier `site/`** (un seul fichier, `index.html`, copie de `dist/ia-arduino.html`) dans un sous-dossier de l'hébergement (OVH : `www/atelier-blocs/`), sur une adresse **https** (hébergement du collège, GitHub Pages, serveur ÉLÉA…). Le fichier est autonome : une seule page, rien d'autre à héberger.
2. Dans la page du site, ajouter la balise suivante (exemple complet : `exemples/integration-iframe.html`) :

```html
<iframe src="https://mon-site.fr/atelier-blocs/" title="Atelier de blocs Arduino"
        allow="serial; camera" style="width:100%; height:90vh; border:0"></iframe>
```

- `allow="serial; camera"` est **indispensable** : sans lui, Chrome interdit la carte et la webcam dans l'iframe.
- Le site qui contient l'iframe doit lui aussi être en **https** (sauf essai en local).
- Si ça ne marche pas, la page l'écrit dans son journal : « Cette page est intégrée dans un autre site qui ne l'autorise pas… ».
- Le serveur ne doit pas envoyer d'en-tête `X-Frame-Options` ni `Content-Security-Policy: frame-ancestors` qui interdit votre site, ni de `Permissions-Policy` qui bloque `serial` ou `camera`.
- Chrome ou Edge sur ordinateur uniquement. Le programme des élèves est mémorisé dans le navigateur (localStorage) ; certains réglages de confidentialité peuvent l'empêcher dans une iframe, ce qui n'empêche pas de programmer.

**Vérifié :** les tests ouvrent la page dans une iframe `allow="serial; camera"` (adresse locale) : elle se charge sans erreur et Web Serial y est disponible. **À vérifier chez vous :** la connexion à la vraie carte et la webcam depuis votre site réel en https.

## Exercices pour les élèves (`?exercice=nom`)

Un **exercice** est un petit fichier `.json` : titre, consigne, modèle, programme de départ.

**Créer un exercice (enseignant)**
1. Prépare le programme de départ avec les blocs, et charge le modèle par son lien si tu veux qu'il soit fourni aux élèves.
2. Clique sur **« Exporter comme exercice »** : titre, nom du fichier, consigne, lien du modèle (facultatif).
3. Un fichier `nom.json` est téléchargé. La fenêtre donne aussi la **balise iframe** à copier.
4. Sur ton site, à côté de `index.html` (même dossier), crée un dossier `exercices` et mets-y `nom.json` (par exemple `www/atelier-blocs/exercices/nom.json`).
5. Pour le modifier plus tard : **« Ouvrir… »** avec ce fichier, modifie, puis exporte de nouveau avec le même nom.

**Ce que voit l'élève** en ouvrant `https://ton-site/atelier-blocs/?exercice=nom` (ou la balise iframe) :
- la consigne, le modèle déjà chargé, le programme de départ prêt ;
- pas de bouton d'enregistrement ni d'export, mais un bouton « ↺ Recommencer » ;
- sa progression est gardée dans son navigateur, **séparément pour chaque exercice** ; si tu mets l'exercice à jour, le programme de départ est rechargé.

Le nom d'un exercice ne contient que des lettres minuscules, des chiffres et des tirets. Un exercice ne s'ouvre pas depuis un simple fichier sur l'ordinateur : il faut un site (https).

**Vérifié :** les tests utilisent un faux site local et un faux modèle. **À vérifier chez toi :** le chargement d'un exercice sur ton OVH en https, avec ton vrai modèle Teachable Machine et la vraie carte.

## Développement

Prérequis : Node.js 20+.

```bash
npm install          # bibliothèques (Blockly, TensorFlow.js, Teachable Machine, JSZip) et Playwright
npm run build        # écrit dist/ia-arduino.html (page unique, bibliothèques incluses)
npm test             # construit puis lance les tests automatisés
npm run firmware     # recompile le programme Arduino (nécessite arduino-cli, voir scripts/compile-firmware.mjs)
```

Les tests pilotent un vrai navigateur. Si Playwright n'a pas de navigateur, indiquer Chrome/Edge :

```bash
CHROME_PATH="/chemin/vers/chrome" npm test          # Linux / macOS
```

Sous Windows : si Chrome est installé normalement, `npm test` suffit (vérifié sur le PC de Sylvain, 12 tests réussis). Sinon, indiquer le chemin de Chrome ou d'Edge :

```powershell
# PowerShell
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"; npm test
# ou avec Edge
$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"; npm test
```

```bat
:: Invite de commandes (cmd)
set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe && npm test
```

Les fins de ligne sont gérées par `.gitattributes` (le fichier `.hex` reste en LF).

### Organisation

```
src/index.html, style.css, app.js   la page (HTML, styles, logique : blocs, webcam, port série, téléversement)
firmware/ia_arduino_recepteur/      programme Arduino (.ino) : récepteur de commandes série
firmware/ia_arduino_recepteur.hex   version compilée (Uno), embarquée dans la page pour le bouton « Téléverser »
build.mjs                           assemble tout dans dist/ia-arduino.html
tests/                              tests automatisés (blocs, simulation, téléversement avec fausse carte, firmware)
CLAUDE.md                           notes pour les futures sessions de développement avec Claude Code
```

## Licences des bibliothèques intégrées

Blockly, TensorFlow.js et Teachable Machine (Apache 2.0), JSZip (MIT ou GPLv3). Choisir une licence pour ce dépôt avant tout partage public.
