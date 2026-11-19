import test from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirPage, journal, attendre, nombre, charger } from './helpers.mjs';

let ctx;
test.before(async () => { ctx = await ouvrirPage(); });
test.after(async () => { await ctx.navigateur.close(); });

const compiler = (page) => page.evaluate(() => window.iaArduino.texteCode(window.iaArduino.compiler()));
const effacerEtTest = async (page) => {
  await page.evaluate(() => { window.iaArduino.ws.clear(); window.iaArduino.arreter(); });
  await page.click('#btnEffacerJournal');
  await page.evaluate(() => window.iaArduino.activerTest());
};

test("la page se charge sans erreur JavaScript", () => {
  assert.deepEqual(ctx.erreurs, []);
});

test("exemple « reconnaissance » : code généré et commandes simulées", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  await page.evaluate(() => window.iaArduino.insererExemple());
  const code = await compiler(page);
  assert.match(code, /ai\.is\("classe A", 80\)/);
  assert.match(code, /out\.led\(13, 1\)/);
  await page.click('#btnDemarrer');
  await page.evaluate(() => window.iaArduino.simuler('classe A'));
  await attendre(300);
  await page.evaluate(() => window.iaArduino.simuler('classe B'));
  await attendre(300);
  await page.click('#btnArreter');
  const j = await journal(page);
  assert.ok(j.indexOf('L,13,1') > -1, 'la LED doit s\'allumer');
  assert.ok(j.lastIndexOf('L,13,0') > j.indexOf('L,13,1'), 'puis s\'éteindre');
});

test("exemple « clignoter » : boucle infinie, arrêt propre", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  await page.evaluate(() => window.iaArduino.insererExemple2());
  assert.match(await compiler(page), /while \(true\)/);
  await page.click('#btnDemarrer');
  await attendre(1200);
  await page.click('#btnArreter');
  await attendre(300);
  const lignes = (await journal(page)).split('\n').filter((l) => /L,13,/.test(l));
  assert.ok(lignes.length >= 3, 'plusieurs changements attendus : ' + lignes.length);
  assert.match(lignes.at(-1), /L,13,0/, 'la LED est éteinte à l\'arrêt');
  const avant = lignes.length;
  await attendre(800);
  assert.equal((await journal(page)).split('\n').filter((l) => /L,13,/.test(l)).length, avant, 'plus aucune commande après l\'arrêt');
});

test("un programme sans boucle se termine seul et garde ses sorties", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  const servo = { type: 'ard_servo', fields: { PIN: '9' }, inputs: { ANGLE: nombre(45) } };
  const repeter = { type: 'ctrl_repeter', inputs: { TIMES: nombre(3), DO: { block: servo } } };
  const pause = { type: 'ia_wait', inputs: { SEC: nombre(0.2) }, next: { block: repeter } };
  const led = { type: 'ard_led', fields: { PIN: '4', ETAT: '1' }, next: { block: pause } };
  await charger(page, { type: 'evt_start', next: { block: led } });
  await page.click('#btnDemarrer');
  await attendre(900);
  assert.equal(await page.innerText('#puceProgramme'), 'Programme : terminé');
  const j = await journal(page);
  assert.match(j, /L,4,1/);
  assert.match(j, /S,9,45/);
  assert.doesNotMatch(j, /L,4,0/);
});

test("bloc « lire l'état de la broche » : lecture envoyée à la carte et valeur utilisée", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  const condition = { type: 'logic_compare', fields: { OP: 'EQ' }, inputs: {
    A: { block: { type: 'ard_lire', fields: { PIN: '5' } } },
    B: { block: { type: 'math_number', fields: { NUM: 1 } } } } };
  const si = { type: 'ctrl_si_sinon', inputs: {
    COND: { block: condition },
    DO: { block: { type: 'ard_led', fields: { PIN: '13', ETAT: '1' } } },
    ELSE: { block: { type: 'ard_led', fields: { PIN: '13', ETAT: '0' } } } } };
  const boucle = { type: 'ia_forever', inputs: { DO: { block: si } } };
  await charger(page, { type: 'evt_start', next: { block: boucle } });
  assert.match(await compiler(page), /await out\.read\(5\) == 1/);
  // Fausse liaison : répond à « R,broche,0 » avec la valeur window.__v.
  await page.evaluate(() => {
    window.__v = 0; window.__tx = [];
    const s = window.iaArduino.state;
    s.writer = { write: async (b) => {
      const c = new TextDecoder().decode(b).trim(); window.__tx.push(c);
      const m = /^R,(\d+),0$/.exec(c);
      if (m) setTimeout(() => { const a = s.lectures[m[1]] || []; s.lectures[m[1]] = []; a.forEach((f) => f(window.__v)); }, 10);
    } };
  });
  await page.click('#btnDemarrer');
  await attendre(300);
  await page.evaluate(() => { window.__v = 1; });
  await attendre(300);
  await page.evaluate(() => { window.__v = 0; });
  await attendre(300);
  await page.click('#btnArreter');
  const sorties = await page.evaluate(() => window.__tx.filter((c) => c[0] === 'L'));
  assert.deepEqual(sorties.slice(0, 3), ['L,13,0', 'L,13,1', 'L,13,0']);
  await page.evaluate(() => { window.iaArduino.state.writer = null; });
});

test("le bloc LED génère « état haut / état bas »", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  await charger(page, { type: 'evt_start', next: { block: { type: 'ard_led', fields: { PIN: '3', ETAT: '0' } } } });
  assert.match(await compiler(page), /out\.led\(3, 0\)/);
});

test("les noms de classe sont conservés dans les listes déroulantes", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  const classes = await page.evaluate(() => window.iaArduino.state.connues);
  assert.ok(classes.includes('classe A') && classes.includes('classe B'));
});

test("modifier le programme pendant qu'il tourne : la nouvelle version prend le relais sans arrêter", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  await page.evaluate(() => window.iaArduino.insererExemple2());
  await page.click('#btnDemarrer');
  await attendre(900);
  assert.match(await journal(page), /L,13,1/);
  // On change la broche 13 en 12 sur tous les blocs LED, sans arrêter le programme.
  await page.evaluate(() => window.iaArduino.ws.getAllBlocks(false).filter((b) => b.type === 'ard_led').forEach((b) => b.setFieldValue('12', 'PIN')));
  await attendre(1500);
  const avant = (await journal(page)).split('\n').length;
  assert.equal(await page.innerText('#puceProgramme'), 'Programme : en cours');
  const j = await journal(page);
  assert.match(j, /Programme modifié/);
  assert.match(j, /L,12,1/, 'la nouvelle broche clignote');
  const apres = j.slice(j.indexOf('Programme modifié'));
  assert.doesNotMatch(apres, /L,13,/, "l'ancienne version ne commande plus la broche 13");
  await page.click('#btnArreter');
  assert.ok(avant > 0);
});

test("anciens programmes : « au démarrage », si/sinon et répéter sont convertis", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  const ancien = { type: 'ia_start', x: 10, y: 10, inputs: { DO: { block: {
    type: 'controls_repeat_ext', inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
      DO: { block: { type: 'controls_if', extraState: { hasElse: true }, inputs: {
        IF0: { block: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } },
        DO0: { block: { type: 'ard_led', fields: { PIN: '13', ETAT: '1' } } },
        ELSE: { block: { type: 'ard_led', fields: { PIN: '13', ETAT: '0' } } } } } } } } } } };
  await page.evaluate((a) => Blockly.serialization.workspaces.load(window.iaArduino.migrer({ blocks: { languageVersion: 0, blocks: [a] } }), window.iaArduino.ws), ancien);
  const types = await page.evaluate(() => window.iaArduino.ws.getAllBlocks(false).map((b) => b.type));
  for (const t of ['evt_start', 'ctrl_repeter', 'ctrl_si_sinon']) assert.ok(types.includes(t), t);
  for (const t of ['ia_start', 'controls_repeat_ext', 'controls_if']) assert.ok(!types.includes(t), t);
  const code = await compiler(page);
  assert.match(code, /for \(let _i/);
  assert.match(code, /if \(true\)/);
  assert.match(code, /out\.led\(13, 0\)/);
});

test("les blocs dans une boucle sont peu décalés (retrait léger mais visible)", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  await page.evaluate(() => window.iaArduino.insererExemple());
  await attendre(300);
  const d = await page.evaluate(() => {
    const t = window.iaArduino.ws.getTopBlocks()[0];
    const boucle = t.getNextBlock(); const si = boucle.getInputTargetBlock('DO'); const led = si.getInputTargetBlock('DO');
    return { boucle: si.getRelativeToSurfaceXY().x - boucle.getRelativeToSurfaceXY().x, si: led.getRelativeToSurfaceXY().x - si.getRelativeToSurfaceXY().x };
  });
  for (const v of [d.boucle, d.si]) assert.ok(v >= 8 && v <= 24, 'retrait attendu entre 8 et 24 px : ' + v);
});

test("la catégorie « Démarrage » n'existe plus et « Événements » contient un seul bloc", async () => {
  const { page } = ctx;
  const cats = await page.evaluate(() => [...document.querySelectorAll('.blocklyToolboxCategory')].map((e) => e.textContent.trim()));
  assert.deepEqual(cats, ['Événements', 'Contrôle', 'IA', 'Arduino', 'Opérateurs']);
  await page.click('.blocklyToolboxCategory >> nth=0');
  await attendre(500);
  const blocs = await page.evaluate(() => window.iaArduino.ws.getFlyout().getWorkspace().getTopBlocks().map((b) => b.type));
  assert.deepEqual(blocs, ['evt_start']);
});

test("colonne de gauche simplifiée : 4 étapes, option A reformulée, plus de journal ni de programme Arduino", async () => {
  const { page } = ctx;
  const etapes = await page.$$eval('aside .etapes li', (l) => l.map((e) => e.textContent));
  assert.equal(etapes.length, 4);
  etapes.forEach((e) => assert.ok(e.split(/\s+/).length <= 9, 'étape trop longue : ' + e));
  const aside = await page.innerText('aside');
  assert.match(aside, /Télécharge ton modèle/);
  assert.match(aside, /Vittascience ou de Teachable Machine/);
  assert.match(aside, /Option B/);
  assert.doesNotMatch(aside, /Journal|Programme Arduino|\.zip/);
  assert.equal(await page.$('aside #journal'), null);
  assert.equal(await page.$('aside #inoCode'), null);
  assert.equal(await page.$('#journalDetails #journal') !== null, true);
});

test("une erreur ouvre automatiquement le journal replié", async () => {
  const { page } = ctx;
  await effacerEtTest(page);
  await page.evaluate(() => { document.getElementById('journalDetails').open = false; });
  await page.evaluate(() => window.iaArduino.demarrer());   // rien à exécuter : message d'erreur
  assert.equal(await page.evaluate(() => document.getElementById('journalDetails').open), true);
});
