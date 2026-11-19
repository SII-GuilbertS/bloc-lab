# À faire

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
