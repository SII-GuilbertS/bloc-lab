import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test("le fichier .hex est un Intel HEX valide (sommes de contrôle)", () => {
  const lignes = readFileSync(new URL('../firmware/ia_arduino_recepteur.hex', import.meta.url), 'utf8').split(/\r?\n/).filter(Boolean);
  assert.ok(lignes.length > 10);
  for (const l of lignes) {
    assert.ok(l.startsWith(':'), l);
    const octets = l.slice(1).match(/../g).map((h) => parseInt(h, 16));
    assert.equal(octets.reduce((a, b) => a + b, 0) & 0xFF, 0, 'somme de contrôle : ' + l);
  }
  assert.match(lignes.at(-1), /^:00000001FF$/);
});

test("le programme Arduino gère les commandes L, S, P, R et refuse les broches 0 et 1", () => {
  const ino = readFileSync(new URL('../firmware/ia_arduino_recepteur/ia_arduino_recepteur.ino', import.meta.url), 'utf8');
  for (const cas of ["case 'L'", "case 'S'", "case 'P'", "case 'R'"]) assert.ok(ino.includes(cas), cas);
  assert.match(ino, /a\s*<\s*2/);
  assert.ok(!/MAX_SERVOS/.test(ino), 'MAX_SERVOS est déjà défini par Servo.h : conflit de compilation');
});
