// Recompile le programme récepteur et met à jour firmware/ia_arduino_recepteur.hex.
// Nécessite arduino-cli (https://arduino.github.io/arduino-cli/) avec le cœur arduino:avr et la bibliothèque Servo :
//   arduino-cli core install arduino:avr
//   arduino-cli lib install Servo
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const croquis = new URL('../firmware/ia_arduino_recepteur', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sortie = mkdtempSync(join(tmpdir(), 'bloc-lab-'));
execFileSync('arduino-cli', ['compile', '-b', 'arduino:avr:uno', '--output-dir', sortie, croquis], { stdio: 'inherit' });
copyFileSync(join(sortie, 'ia_arduino_recepteur.ino.hex'), new URL('../firmware/ia_arduino_recepteur.hex', import.meta.url));
console.log('firmware/ia_arduino_recepteur.hex mis à jour. Relance « npm run build ».');
