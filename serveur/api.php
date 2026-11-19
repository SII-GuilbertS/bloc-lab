<?php
// bloc-lab : enregistrement des exercices sur le site (PHP 8).
// Dossiers créés à côté de ce fichier :
//   exercices/  les exercices (.json), lisibles par les élèves
//   donnees/    versions précédentes, corbeille, compteur d'échecs (fermé au public)
// Réglages : config.php (créé par « npm run mot-de-passe »), jamais dans GitHub.
declare(strict_types=1);

const TAILLE_MAX = 600000;           // octets, pour un exercice
const ESSAIS_MAX = 5;                // échecs de connexion autorisés...
const ESSAIS_DUREE = 900;            // ...pendant 15 minutes, par adresse IP
const VERSIONS_GARDEES = 5;
const NOMS_RESERVES = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'lpt1', 'lpt2', 'lpt3'];

$racine = __DIR__;
$dossierExercices = $racine . '/exercices';
$dossierDonnees = $racine . '/donnees';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function repondre(int $code, array $donnees): never {
    http_response_code($code);
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function erreur(int $code, string $message, array $plus = []): never {
    repondre($code, ['ok' => false, 'erreur' => $message] + $plus);
}

$config = is_file($racine . '/config.php') ? include $racine . '/config.php' : null;
$configure = is_array($config) && !empty($config['hash']);

$hote = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]);
$local = in_array($hote, ['localhost', '127.0.0.1', '[::1]'], true);
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
$exigerHttps = !is_array($config) || ($config['exiger_https'] ?? true);
if ($exigerHttps && !$https && !$local) {
    erreur(403, "Le https est obligatoire. Ouvre l'outil avec une adresse en https://");
}

$action = $_GET['action'] ?? '';
$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$ecriture = in_array($action, ['connexion', 'deconnexion', 'enregistrer', 'supprimer'], true);
if ($ecriture) {
    if ($methode !== 'POST') erreur(405, 'Méthode non autorisée.');
    // Protection contre les requêtes venues d'un autre site : cet en-tête ne peut pas être envoyé sans autorisation.
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'bloc-lab') erreur(403, 'Requête refusée.');
}

session_cache_limiter('');   // garde notre en-tête Cache-Control: no-store
session_name('bloclab');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
session_start();
$connecte = !empty($_SESSION['ok']);

function corps(): array {
    $brut = file_get_contents('php://input', false, null, 0, TAILLE_MAX + 1);
    if ($brut === false || strlen($brut) > TAILLE_MAX) erreur(413, 'Exercice trop gros.');
    $d = json_decode($brut, true);
    if (!is_array($d)) erreur(400, 'Données invalides.');
    return $d;
}
function idValide($id): bool {
    return is_string($id) && preg_match('/^[a-z0-9-]{1,60}$/', $id) === 1 && !in_array($id, NOMS_RESERVES, true);
}
function dossier(string $chemin): void {
    if (!is_dir($chemin) && !mkdir($chemin, 0755, true) && !is_dir($chemin)) erreur(500, "Impossible de créer le dossier sur le serveur.");
}
function protegerDossiers(string $exercices, string $donnees): void {
    dossier($exercices); dossier($donnees);
    // Aucun programme PHP ne doit jamais s'exécuter dans exercices/ ; donnees/ est fermé au public.
    $e = $exercices . '/.htaccess';
    if (!is_file($e)) file_put_contents($e, "Options -ExecCGI -Indexes\n<FilesMatch \"\\.(php|phtml|phar|php[0-9])$\">\n  Require all denied\n</FilesMatch>\n");
    $d = $donnees . '/.htaccess';
    if (!is_file($d)) file_put_contents($d, "Require all denied\n");
    if (!is_file($donnees . '/index.html')) file_put_contents($donnees . '/index.html', '');
}
function ecritureSure(string $chemin, string $contenu): void {
    $tmp = $chemin . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $contenu, LOCK_EX) === false) erreur(500, "Écriture impossible sur le serveur.");
    if (!rename($tmp, $chemin)) {
        @unlink($tmp);
        erreur(500, "Écriture impossible sur le serveur.");
    }
}
function verrou(string $donnees) {
    $f = fopen($donnees . '/verrou.lock', 'c');
    if ($f) flock($f, LOCK_EX);
    return $f;
}
function horodatage(string $precedent): string {
    $t = (new DateTime('now', new DateTimeZone('UTC')));
    $h = $t->format('Y-m-d\TH:i:s.v\Z');
    while ($h === $precedent) {
        $t->modify('+1 millisecond');
        $h = $t->format('Y-m-d\TH:i:s.v\Z');
    }
    return $h;
}
// Nombre de caractères (mbstring n'est pas toujours installé).
function longueur(string $t): int {
    return function_exists('mb_strlen') ? mb_strlen($t) : strlen($t);
}
function profondeur($v, int $n = 0): int {
    if ($n > 80) return $n;
    if (!is_array($v)) return $n;
    $m = $n;
    foreach ($v as $x) { $m = max($m, profondeur($x, $n + 1)); if ($m > 80) break; }
    return $m;
}
function lireExercice(string $chemin): ?array {
    if (!is_file($chemin) || filesize($chemin) > TAILLE_MAX) return null;
    $d = json_decode((string) file_get_contents($chemin), true);
    return is_array($d) ? $d : null;
}

// ---------- actions ----------
if ($action === 'etat') {
    repondre(200, ['ok' => true, 'configure' => $configure, 'connecte' => $connecte]);
}

if ($action === 'connexion') {
    if (!$configure) erreur(503, "L'enregistrement n'est pas encore installé sur ce site (fichier config.php absent).");
    protegerDossiers($dossierExercices, $dossierDonnees);
    $cle = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'inconnu');
    $fichier = $dossierDonnees . '/echecs.json';
    $v = verrou($dossierDonnees);
    $echecs = is_file($fichier) ? (json_decode((string) file_get_contents($fichier), true) ?: []) : [];
    $maintenant = time();
    $recents = array_values(array_filter($echecs[$cle] ?? [], fn($t) => is_int($t) && $t > $maintenant - ESSAIS_DUREE));
    if (count($recents) >= ESSAIS_MAX) {
        if ($v) fclose($v);
        erreur(429, 'Trop d\'essais. Attends 15 minutes avant de réessayer.');
    }
    $d = corps();
    $ok = isset($d['motdepasse']) && is_string($d['motdepasse']) && password_verify($d['motdepasse'], (string) $config['hash']);
    if (!$ok) {
        usleep(700000);   // ralentit les essais
        $recents[] = $maintenant;
        $echecs[$cle] = $recents;
        foreach ($echecs as $k => $liste) { if (!array_filter($liste, fn($t) => is_int($t) && $t > $maintenant - ESSAIS_DUREE)) unset($echecs[$k]); }
        ecritureSure($fichier, json_encode($echecs));
        if ($v) fclose($v);
        erreur(401, 'Mot de passe incorrect.');
    }
    unset($echecs[$cle]);
    ecritureSure($fichier, json_encode($echecs ?: new stdClass()));
    if ($v) fclose($v);
    session_regenerate_id(true);
    $_SESSION['ok'] = true;
    repondre(200, ['ok' => true]);
}

if ($action === 'deconnexion') {
    $_SESSION = [];
    session_destroy();
    repondre(200, ['ok' => true]);
}

if (in_array($action, ['liste', 'enregistrer', 'supprimer'], true)) {
    if (!$configure) erreur(503, "L'enregistrement n'est pas encore installé sur ce site (fichier config.php absent).");
    if (!$connecte) erreur(401, 'Connecte-toi d\'abord avec ton mot de passe.');
}

if ($action === 'liste') {
    $liste = [];
    foreach (glob($dossierExercices . '/*.json') ?: [] as $chemin) {
        $id = basename($chemin, '.json');
        if (!idValide($id)) continue;
        $ex = lireExercice($chemin);
        if (!$ex) continue;
        $liste[] = ['id' => $id, 'titre' => (string) ($ex['titre'] ?? $id), 'modifie' => (string) ($ex['modifie'] ?? ''), 'taille' => filesize($chemin)];
    }
    usort($liste, fn($a, $b) => strcmp($b['modifie'], $a['modifie']));
    repondre(200, ['ok' => true, 'exercices' => $liste]);
}

if ($action === 'enregistrer') {
    $d = corps();
    $ex = $d['exercice'] ?? null;
    if (!is_array($ex) || ($ex['format'] ?? '') !== 'bloc-lab-exercice' || ($ex['version'] ?? 0) !== 1) erreur(400, "Ce n'est pas un exercice valide.");
    $id = $ex['id'] ?? null;
    if (!idValide($id)) erreur(400, "Nom de fichier invalide : lettres minuscules, chiffres et tirets seulement.");
    if (!is_string($ex['titre'] ?? null) || trim($ex['titre']) === '' || longueur($ex['titre']) > 120) erreur(400, 'Titre manquant ou trop long.');
    if (isset($ex['consigne']) && (!is_string($ex['consigne']) || longueur($ex['consigne']) > 3000)) erreur(400, 'Consigne trop longue.');
    if (!isset($ex['blocs']) || !is_array($ex['blocs']) || profondeur($ex['blocs']) > 80) erreur(400, 'Programme invalide.');
    $modele = $ex['modele'] ?? null;
    if ($modele !== null) {
        if (!is_array($modele)) erreur(400, 'Modèle invalide.');
        if (isset($modele['url']) && (!is_string($modele['url']) || !preg_match('#^https://[^\s"<>]{3,300}$#', $modele['url']))) erreur(400, 'Le lien du modèle doit commencer par https://');
        $modele = array_intersect_key($modele, ['url' => 1, 'dossier' => 1]);
        if (isset($modele['dossier'])) $modele['dossier'] = (bool) $modele['dossier'];
    }
    $propre = [
        'format' => 'bloc-lab-exercice', 'version' => 1, 'id' => $id,
        'titre' => trim($ex['titre']), 'consigne' => (string) ($ex['consigne'] ?? ''),
        'modele' => $modele ?: null,
        'classes' => array_values(array_filter((array) ($ex['classes'] ?? []), 'is_string')),
        'blocs' => $ex['blocs'],
        'modifie' => '',
    ];
    if (strlen((string) json_encode($propre)) > TAILLE_MAX) erreur(413, 'Exercice trop gros.');

    protegerDossiers($dossierExercices, $dossierDonnees);
    $v = verrou($dossierDonnees);
    $chemin = $dossierExercices . '/' . $id . '.json';
    $actuel = lireExercice($chemin);
    // Date de modification fixée par le serveur (au millième de seconde, toujours différente de la précédente).
    $propre['modifie'] = horodatage((string) ($actuel['modifie'] ?? ''));
    $json = json_encode($propre, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false || strlen($json) > TAILLE_MAX) {
        if ($v) fclose($v);
        erreur(413, 'Exercice trop gros.');
    }
    if ($actuel !== null || is_file($chemin)) {
        $attendu = $d['modifieAttendu'] ?? null;
        $courant = (string) ($actuel['modifie'] ?? '');
        if (empty($d['ecraser']) && $attendu !== $courant) {
            if ($v) fclose($v);
            erreur(409, 'Cet exercice a été modifié ailleurs depuis ton ouverture.', ['conflit' => true, 'modifie' => $courant]);
        }
        // Garde l'ancienne version (les 5 dernières).
        $dv = $dossierDonnees . '/versions/' . $id;
        dossier($dv);
        copy($chemin, $dv . '/' . gmdate('Ymd-His') . sprintf('-%06d', (int) (fmod(microtime(true), 1) * 1000000)) . '.json');
        $anciennes = glob($dv . '/*.json') ?: [];
        sort($anciennes);
        foreach (array_slice($anciennes, 0, max(0, count($anciennes) - VERSIONS_GARDEES)) as $vieille) @unlink($vieille);
    }
    ecritureSure($chemin, $json);
    if ($v) fclose($v);
    repondre(200, ['ok' => true, 'id' => $id, 'modifie' => $propre['modifie']]);
}

if ($action === 'supprimer') {
    $d = corps();
    $id = $d['id'] ?? null;
    if (!idValide($id)) erreur(400, 'Nom invalide.');
    $chemin = $dossierExercices . '/' . $id . '.json';
    if (!is_file($chemin)) erreur(404, 'Exercice introuvable.');
    protegerDossiers($dossierExercices, $dossierDonnees);
    $v = verrou($dossierDonnees);
    dossier($dossierDonnees . '/corbeille');
    if (!rename($chemin, $dossierDonnees . '/corbeille/' . $id . '-' . gmdate('Ymd-His') . '.json')) {
        if ($v) fclose($v);
        erreur(500, 'Suppression impossible.');
    }
    if ($v) fclose($v);
    repondre(200, ['ok' => true]);
}

erreur(404, 'Action inconnue.');
