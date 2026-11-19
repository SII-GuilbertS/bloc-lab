# À faire

## Exercices enregistrés sur OVH (en cours)
- [x] Étape 1 : format d'exercice, mode élève `?exercice=`, export `.json` (fichier envoyé à la main).
- [ ] Étape 2 : `api.php` (PHP 8) + connexion enseignant + « Mes exercices » (liste, ouvrir, enregistrer, dupliquer, supprimer) + balise iframe copiable. Sécurité : mot de passe haché, https, noms de fichiers limités, PHP interdit dans `exercices/`, 5 versions gardées, corbeille.
- [ ] Étape 3 : fichiers du modèle envoyés avec l'exercice (hors ligne). Le mode élève sait déjà lire `modele: { dossier: true }`.
- [ ] Étape 4 : envoi FTP (`index.html`, `api.php`, `.htaccess`, jamais `config.php` ni `exercices/`) et script de création du mot de passe.
- [ ] Étape 5 (plus tard) : plusieurs enseignants.
- [ ] Brouillons non visibles des élèves ? (question posée à Sylvain)

## Déploiement par FTP (`npm run deploy`)
Idée : envoyer `site/index.html` sur OVH (`www/atelier-blocs/`) en une commande, après les tests.

- [ ] Ajouter `basic-ftp` (devDependency) et le script `scripts/deploy.mjs`, commande `npm run deploy`.
- [ ] Avant l'envoi : `npm test` doit passer, être sur `main`, aucun changement non commité.
- [ ] Afficher ce qui sera envoyé (fichier, taille, dossier distant) et demander « Envoyer ? ».
- [ ] Option `--simulation` : tout faire sauf l'envoi.
- [ ] Identifiants dans `.env` (ignoré par git) + `.env.exemple` sans mot de passe. Ne jamais les mettre dans le dépôt ni dans une conversation.
- [ ] Utiliser FTPS (FTP chiffré) ; SFTP si l'offre OVH le permet.
- [ ] Test avec un faux serveur FTP local ; le vrai envoi reste à vérifier sur OVH.
- [ ] Documenter dans le README (section « Mettre en ligne »).

Infos à fournir avant de commencer : adresse du serveur FTP, dossier distant, adresse https finale, SFTP possible ou non.

## À vérifier sur la vraie carte (jamais testé avec le matériel)
- [ ] Modification du programme en direct pendant l'exécution (clignotement).
- [ ] Rendu des blocs style mBlock (lisibilité du texte blanc sur le jaune).
- [ ] Carte et webcam dans l'iframe sur le vrai site en https.

## Évolutions envisagées
- [ ] Entrées analogiques (A0–A5) : capteur de lumière, potentiomètre (nécessite de retéléverser le programme).
- [ ] Buzzer / tonalité (nécessite de retéléverser le programme).
- [ ] Sauvegarde et partage de projets (export / import de fichier).
- [ ] Bouton « Exporter pour mon site » (zip avec modèle et programme de départ).
- [ ] Événement « à chaque image de la webcam » dans la catégorie Événements, si besoin.
