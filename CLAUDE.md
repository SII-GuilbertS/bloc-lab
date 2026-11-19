# bloc-lab — notes pour Claude Code

## But
Page web unique **en français** pour programmer une Arduino par blocs (Blockly) en utilisant la webcam et un modèle d'images Teachable Machine. Public : élèves de 5ème (technologie). Objectif futur : « atelier de blocs en ligne » intégrable dans ÉLÉA (Moodle). Les livrables doivent être complets et prêts à l'emploi pour l'enseignant (Sylvain), sans adaptation.

## Commandes
- `npm run build` : produit `dist/ia-arduino.html` (page unique, bibliothèques incluses : pas de CDN, le collège peut être hors ligne).
- `npm test` : build + tests Playwright (`CHROME_PATH` et `NO_SANDBOX=1` si besoin).
- `npm run firmware` : recompile le `.hex` (arduino-cli). Toujours recompiler après avoir modifié le `.ino`, puis `npm run build`.

## Architecture
- `src/app.js` (une IIFE) : blocs personnalisés, générateur JS, exécution asynchrone, webcam + `tmImage`, port série, téléversement STK500, exemples, sauvegarde.
- Le programme des blocs est compilé en fonctions **async** : chaque boucle reçoit `await out.tick()` (`INFINITE_LOOP_TRAP`), `attendre` = `await out.wait(s)`, la lecture = `await out.read(pin)`. L'arrêt lève la valeur `STOP`.
- Blocs « au démarrage » = exécutés une fois (en parallèle s'il y en a plusieurs) ; « à chaque image » = boucle toutes les 100 ms. Un programme sans boucle se termine seul et laisse ses sorties telles quelles.
- Protocole série (115200 bauds, une ligne par commande) : `L,pin,0|1`, `S,pin,0..180`, `P,pin,0..255`, `R,pin,0` → réponse `R,pin,0|1`, `?` → `PRET`. Les commandes d'écriture ne sont envoyées que si la valeur change (cache `state.cache`).
- `window.iaArduino` expose l'état et des fonctions pour les tests.

## Pièges déjà rencontrés (ne pas refaire)
- **`MAX_SERVOS`** est une macro de `Servo.h` : ne pas l'utiliser comme nom de constante dans le `.ino` (le croquis ne compile plus).
- **Broches 0 et 1** = USB série : jamais proposées dans les blocs, refusées par le firmware (plage 2–19).
- **Téléversement par la page** : sur la carte de l'utilisateur, seule la méthode de redémarrage « B » (DTR/RTS d'abord activés 250 ms puis relâchés) a fonctionné ; la méthode « A » donne une réponse isolée puis plus rien (faux départ). Une synchronisation n'est valide que si la carte répond **deux fois** ; la page enchaîne ensuite 3 méthodes × 2 vitesses (115200, 57600).
- Le port série ne peut être ouvert que par un seul programme à la fois (onglet Vittascience, Arduino IDE, moniteur série…) : message « port occupé » explicite.
- Les modèles Teachable Machine « image » uniquement (pas pose/son). Image miroir sur le canvas comme dans Teachable Machine.
- Web Serial : Chrome/Edge seulement ; `file://` est un contexte sûr, mais dans ÉLÉA (iframe) il faudra `allow="serial; camera"` et du HTTPS.
- Vittascience/Adacraft n'a pas fonctionné en mode « live » pour cet usage (d'où ce projet).

## Conventions
- Interface, journal, messages d'erreur, README : **français**, ton simple pour des élèves de 11-12 ans.
- Toute nouvelle commande série : ajouter le cas dans le `.ino`, recompiler le `.hex`, ajouter un test (`tests/`), mettre à jour le README et ce fichier. Dire à l'utilisateur de **retéléverser** le programme dans la carte.
- Ne pas affirmer qu'une fonction marche avec le matériel réel sans test : les tests utilisent une fausse carte (STK500 simulé) et un faux port série.

## Pistes
- Entrées analogiques (A0–A5), buzzer/tonalité, moteur ; afficheur.
- Modèles « pose » de Teachable Machine.
- Intégration ÉLÉA : paquet SCORM ou iframe HTTPS ; tester les permissions `serial` et `camera`.
- Éditeur multi-cartes (Nano, Mega) : le `.hex` actuel vise l'Uno (ATmega328P).
