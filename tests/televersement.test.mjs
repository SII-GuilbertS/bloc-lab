import test from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirPage, journal, attendre, lireHex } from './helpers.mjs';

// Fausse carte Arduino avec bootloader STK500 (Optiboot). Ne répond que si la vitesse est celle demandée.
function installerFausseCarte({ vitesseOk }) {
  window.__flash = new Uint8Array(32768).fill(255);
  let adr = 0, ctrl = null, lecteur = null, baud = 0, buf = [];
  const repondre = (a) => { if (baud === vitesseOk) ctrl.enqueue(Uint8Array.from(a)); };
  const traiter = () => {
    while (buf.length) {
      const c = buf[0];
      if (c === 0x30 || c === 0x50 || c === 0x51) { if (buf.length < 2) return; buf.splice(0, 2); repondre([0x14, 0x10]); }
      else if (c === 0x55) { if (buf.length < 4) return; adr = (buf[1] | (buf[2] << 8)) * 2; buf.splice(0, 4); repondre([0x14, 0x10]); }
      else if (c === 0x64) {
        if (buf.length < 4) return; const n = (buf[1] << 8) | buf[2]; if (buf.length < 5 + n) return;
        if (baud === vitesseOk) for (let i = 0; i < n; i++) window.__flash[adr + i] = buf[4 + i];
        buf.splice(0, 5 + n); repondre([0x14, 0x10]);
      } else if (c === 0x74) {
        if (buf.length < 5) return; const n = (buf[1] << 8) | buf[2]; buf.splice(0, 5);
        repondre([0x14, ...window.__flash.subarray(adr, adr + n), 0x10]);
      } else buf.shift();
    }
  };
  const port = {
    get readable() { return lecteur; },
    writable: new WritableStream({ write(morceau) { buf.push(...morceau); traiter(); } }),
    open: async (o) => { baud = o.baudRate; buf = []; lecteur = new ReadableStream({ start(c) { ctrl = c; } }); },
    close: async () => {},
    setSignals: async () => {}
  };
  navigator.serial.requestPort = async () => port;
}

for (const vitesseOk of [115200, 57600]) {
  test(`téléversement vers une carte qui répond à ${vitesseOk} bauds : contenu identique au .hex`, async () => {
    const { navigateur, page, erreurs } = await ouvrirPage();
    try {
      await page.evaluate(installerFausseCarte, { vitesseOk });
      await page.click('#btnTeleverser');
      await page.waitForFunction(() => /téléversé et vérifié|Échec/.test(document.getElementById('journal').innerText), null, { timeout: 60000 });
      const j = await journal(page);
      assert.match(j, /Programme téléversé et vérifié/);
      const attendu = lireHex(new URL('../firmware/ia_arduino_recepteur.hex', import.meta.url));
      const flash = await page.evaluate(() => Array.from(window.__flash.subarray(0, 8192)));
      for (const [a, v] of Object.entries(attendu)) assert.equal(flash[a], v, 'octet ' + a);
      assert.deepEqual(erreurs, []);
    } finally { await navigateur.close(); }
  });
}

test("carte muette : échec explicite après tous les essais", async () => {
  const { navigateur, page } = await ouvrirPage();
  try {
    await page.evaluate(installerFausseCarte, { vitesseOk: -1 });
    await page.click('#btnTeleverser');
    await page.waitForFunction(() => /Échec/.test(document.getElementById('journal').innerText), null, { timeout: 90000 });
    assert.match(await journal(page), /la carte ne répond pas/);
  } finally { await navigateur.close(); }
});
