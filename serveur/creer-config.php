<?php
// Fabrique config.php à partir d'un mot de passe lu sur l'entrée standard.
// Utilisation : npm run mot-de-passe   (le mot de passe ne passe jamais par la ligne de commande)
// php creer-config.php <fichier à écrire>
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$sortie = $argv[1] ?? '';
if ($sortie === '') { fwrite(STDERR, "Fichier de sortie manquant.\n"); exit(2); }
$mdp = rtrim((string) stream_get_contents(STDIN), "\r\n");
if (strlen($mdp) < 10) { fwrite(STDERR, "Le mot de passe doit faire au moins 10 caractères.\n"); exit(3); }
$hash = password_hash($mdp, PASSWORD_DEFAULT);
$code = "<?php\n// Créé par npm run mot-de-passe. Ne jamais mettre ce fichier sur GitHub ni le partager.\nreturn [\n    'hash' => " . var_export($hash, true) . ",\n    'exiger_https' => true,\n];\n";
if (file_put_contents($sortie, $code) === false) { fwrite(STDERR, "Écriture impossible.\n"); exit(4); }
echo "ok\n";
