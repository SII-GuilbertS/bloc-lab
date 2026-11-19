(function () {
  'use strict';

  /* ---------- Utilitaires ---------- */
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const encodeur = new TextEncoder();

  const state = {
    classes: [],        // classes du modèle (ou du mode test)
    connues: [],        // classes connues = modèle + classes déjà utilisées dans les blocs
    preds: {},          // probabilités 0..1 par classe
    top: '',
    model: null,
    testMode: false,
    analyse: false,
    occupe: false,
    derniere: 0,
    stream: null,
    port: null, writer: null, reader: null, lecture: null, deconnexionVoulue: false,
    lectures: {}, alerteLecture: false, running: false, frameFn: null, execution: 0,
    cache: {}
  };

  /* ---------- Journal et puces ---------- */
  function journal(msg, type) {
    const zone = $('journal');
    const ligne = document.createElement('div');
    ligne.className = type || 'info';
    const h = new Date();
    const hh = String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0') + ':' + String(h.getSeconds()).padStart(2, '0');
    ligne.textContent = hh + '  ' + msg;
    zone.appendChild(ligne);
    while (zone.children.length > 120) zone.removeChild(zone.firstChild);
    zone.scrollTop = zone.scrollHeight;
  }
  function puce(id, texte, classe) {
    const e = $(id);
    e.textContent = texte;
    e.className = 'puce' + (classe ? ' ' + classe : '');
  }
  function alerte(texte) {
    const a = $('alerte');
    if (texte) { a.textContent = texte; a.style.display = 'block'; } else { a.style.display = 'none'; }
  }

  /* ---------- Blocs : définitions ---------- */
  const Blockly = window.Blockly;
  const JSNS = window.javascript || { javascriptGenerator: Blockly.JavaScript, Order: Blockly.JavaScript };
  const G = JSNS.javascriptGenerator;
  const O = JSNS.Order;

  function optionsClasses() {
    return state.connues.length ? state.connues.map((c) => [c, c]) : [['(charger un modèle)', '']];
  }
  const BROCHES = [];
  for (let n = 2; n <= 13; n++) BROCHES.push(['D' + n, String(n)]);
  const BROCHES_PWM = [3, 5, 6, 9, 10, 11].map((n) => ['D' + n, String(n)]);

  Blockly.Blocks['ia_hat'] = {
    init: function () {
      this.appendDummyInput().appendField('à chaque image de la webcam');
      this.appendStatementInput('DO').appendField('faire');
      this.setColour(45);
      this.setTooltip("Tout ce qui est dans ce bloc est exécuté à chaque fois que l'IA analyse une image.");
    }
  };
  Blockly.Blocks['ia_start'] = {
    init: function () {
      this.appendDummyInput().appendField('au démarrage');
      this.appendStatementInput('DO').appendField('faire');
      this.setColour(45);
      this.setTooltip("Ce qui est dans ce bloc est exécuté une seule fois quand tu cliques sur Démarrer. Tu peux y mettre un bloc « répéter pour toujours ».");
    }
  };
  Blockly.Blocks['ia_forever'] = {
    init: function () {
      this.appendStatementInput('DO').appendField('répéter pour toujours');
      this.setPreviousStatement(true);
      this.setColour(120);
      this.setTooltip("Répète les blocs à l'intérieur sans jamais s'arrêter (jusqu'à ce que tu cliques sur Arrêter).");
    }
  };
  Blockly.Blocks['ia_wait'] = {
    init: function () {
      this.appendValueInput('SEC').setCheck('Number').appendField('attendre');
      this.appendDummyInput().appendField('secondes');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(120);
      this.setTooltip('Fait une pause avant de passer au bloc suivant.');
    }
  };
  Blockly.Blocks['ia_reconnait'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("l'IA reconnaît")
        .appendField(new Blockly.FieldDropdown(optionsClasses), 'CLASSE')
        .appendField('à plus de')
        .appendField(new Blockly.FieldNumber(80, 1, 100, 1), 'SEUIL')
        .appendField('%');
      this.setOutput(true, 'Boolean');
      this.setColour(260);
      this.setTooltip("Vrai si la confiance de l'IA pour cette classe dépasse le seuil.");
    }
  };
  Blockly.Blocks['ia_confiance'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('confiance de')
        .appendField(new Blockly.FieldDropdown(optionsClasses), 'CLASSE')
        .appendField('(en %)');
      this.setOutput(true, 'Number');
      this.setColour(260);
      this.setTooltip("Nombre entre 0 et 100 : la confiance de l'IA pour cette classe.");
    }
  };
  Blockly.Blocks['ia_top'] = {
    init: function () {
      this.appendDummyInput().appendField('classe la plus probable');
      this.setOutput(true, 'String');
      this.setColour(260);
      this.setTooltip("Le nom de la classe que l'IA juge la plus probable.");
    }
  };
  Blockly.Blocks['ard_led'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('écrire')
        .appendField(new Blockly.FieldDropdown([['état haut (1)', '1'], ['état bas (0)', '0']]), 'ETAT')
        .appendField('sur')
        .appendField(new Blockly.FieldDropdown(BROCHES), 'PIN');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(160);
      this.setTooltip("Met la broche à l'état haut (1 = 5 V, LED allumée) ou à l'état bas (0 = 0 V, LED éteinte).");
    }
  };
  Blockly.Blocks['ard_lire'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("lire l'état de la broche")
        .appendField(new Blockly.FieldDropdown(BROCHES), 'PIN');
      this.setOutput(true, null);
      this.setColour(160);
      this.setTooltip("Lit la broche : 1 si elle est à l'état haut (5 V), 0 si elle est à l'état bas (0 V). Utile pour un bouton ou un capteur.");
    }
  };
  Blockly.Blocks['ard_servo'] = {
    init: function () {
      this.appendValueInput('ANGLE').setCheck('Number')
        .appendField('servomoteur broche')
        .appendField(new Blockly.FieldDropdown(BROCHES), 'PIN')
        .appendField(': angle');
      this.appendDummyInput().appendField('°');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(160);
      this.setTooltip("Place le servomoteur à l'angle voulu (de 0 à 180 degrés).");
    }
  };
  Blockly.Blocks['ard_pwm'] = {
    init: function () {
      this.appendValueInput('VAL').setCheck('Number')
        .appendField('sortie PWM broche')
        .appendField(new Blockly.FieldDropdown(BROCHES_PWM), 'PIN')
        .appendField(': valeur');
      this.appendDummyInput().appendField('(0 à 255)');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(160);
      this.setTooltip("Règle une luminosité ou une vitesse de moteur : 0 = arrêt, 255 = maximum. Broches PWM : 3, 5, 6, 9, 10, 11.");
    }
  };
  Blockly.Blocks['ia_journal'] = {
    init: function () {
      this.appendValueInput('TEXT').appendField('écrire dans le journal');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(160);
      this.setTooltip('Affiche un message dans le journal, utile pour comprendre ce que fait le programme.');
    }
  };

  /* ---------- Blocs : génération du code ---------- */
  G.INFINITE_LOOP_TRAP = 'await out.tick();\n';
  G.forBlock['ia_hat'] = function () { return ''; };
  G.forBlock['ia_start'] = function () { return ''; };
  G.forBlock['ia_forever'] = function (b, g) {
    return 'while (true) {\n' + g.addLoopTrap(g.statementToCode(b, 'DO'), b) + '}\n';
  };
  G.forBlock['ia_wait'] = function (b, g) {
    return 'await out.wait(' + (g.valueToCode(b, 'SEC', O.NONE) || '1') + ');\n';
  };
  G.forBlock['ia_reconnait'] = function (b) {
    return ['ai.is(' + JSON.stringify(b.getFieldValue('CLASSE')) + ', ' + Number(b.getFieldValue('SEUIL')) + ')', O.FUNCTION_CALL];
  };
  G.forBlock['ia_confiance'] = function (b) {
    return ['ai.conf(' + JSON.stringify(b.getFieldValue('CLASSE')) + ')', O.FUNCTION_CALL];
  };
  G.forBlock['ia_top'] = function () { return ['ai.top()', O.FUNCTION_CALL]; };
  G.forBlock['ard_led'] = function (b) {
    return 'out.led(' + Number(b.getFieldValue('PIN')) + ', ' + Number(b.getFieldValue('ETAT')) + ');\n';
  };
  G.forBlock['ard_lire'] = function (b) {
    return ['await out.read(' + Number(b.getFieldValue('PIN')) + ')', O.AWAIT !== undefined ? O.AWAIT : O.FUNCTION_CALL];
  };
  G.forBlock['ard_servo'] = function (b, g) {
    return 'out.servo(' + Number(b.getFieldValue('PIN')) + ', ' + (g.valueToCode(b, 'ANGLE', O.NONE) || '90') + ');\n';
  };
  G.forBlock['ard_pwm'] = function (b, g) {
    return 'out.pwm(' + Number(b.getFieldValue('PIN')) + ', ' + (g.valueToCode(b, 'VAL', O.NONE) || '0') + ');\n';
  };
  G.forBlock['ia_journal'] = function (b, g) {
    return 'out.log(String(' + (g.valueToCode(b, 'TEXT', O.NONE) || "''") + '));\n';
  };

  /* ---------- Blocs : espace de travail ---------- */
  const nombreAvecDefaut = (type, valeur) => ({ shadow: { type: 'math_number', fields: { NUM: valeur } } });
  const boite = {
    kind: 'categoryToolbox',
    contents: [
      { kind: 'category', name: 'Démarrage', colour: '45', contents: [{ kind: 'block', type: 'ia_start' }, { kind: 'block', type: 'ia_hat' }] },
      { kind: 'category', name: 'Boucles', colour: '120', contents: [
        { kind: 'block', type: 'ia_forever' },
        { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: nombreAvecDefaut('math_number', 10) } },
        { kind: 'block', type: 'controls_whileUntil' },
        { kind: 'block', type: 'controls_flow_statements' },
        { kind: 'block', type: 'ia_wait', inputs: { SEC: nombreAvecDefaut('math_number', 1) } }] },
      { kind: 'category', name: 'IA', colour: '260', contents: [
        { kind: 'block', type: 'ia_reconnait' }, { kind: 'block', type: 'ia_confiance' }, { kind: 'block', type: 'ia_top' }] },
      { kind: 'category', name: 'Arduino', colour: '160', contents: [
        { kind: 'block', type: 'ard_led' },
        { kind: 'block', type: 'ard_lire' },
        { kind: 'block', type: 'ard_servo', inputs: { ANGLE: nombreAvecDefaut('math_number', 90) } },
        { kind: 'block', type: 'ard_pwm', inputs: { VAL: nombreAvecDefaut('math_number', 128) } },
        { kind: 'block', type: 'ia_journal', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'bonjour' } } } } }] },
      { kind: 'category', name: 'Logique', colour: '210', contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
        { kind: 'block', type: 'logic_compare' }, { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' }, { kind: 'block', type: 'logic_boolean' }] },
      { kind: 'category', name: 'Maths', colour: '230', contents: [
        { kind: 'block', type: 'math_number' }, { kind: 'block', type: 'math_arithmetic' }] },
      { kind: 'category', name: 'Texte', colour: '160', contents: [{ kind: 'block', type: 'text' }] }
    ]
  };

  const ws = Blockly.inject('blocklyDiv', {
    toolbox: boite,
    renderer: 'zelos',
    media: 'media/',
    trashcan: false,
    zoom: { controls: false, wheel: true, startScale: 0.95, maxScale: 1.8, minScale: 0.5, scaleSpeed: 1.1 },
    grid: { spacing: 24, length: 2, colour: '#e2e8f0', snap: true },
    move: { scrollbars: true, drag: true, wheel: false }
  });
  ws.addChangeListener(Blockly.Events.disableOrphans);
  window.addEventListener('resize', () => Blockly.svgResize(ws));

  /* ---------- Classes connues ---------- */
  function ajouterConnues(liste) {
    liste.forEach((c) => { if (c && !state.connues.includes(c)) state.connues.push(c); });
  }
  function classesDansJson(obj, acc) {
    if (obj && typeof obj === 'object') {
      if (obj.fields && typeof obj.fields.CLASSE === 'string') acc.push(obj.fields.CLASSE);
      Object.keys(obj).forEach((k) => classesDansJson(obj[k], acc));
    }
    return acc;
  }
  function classesUtilisees() {
    return classesDansJson(Blockly.serialization.workspaces.save(ws), []);
  }
  function actualiserListes() {
    // Redessine les listes déroulantes des blocs IA.
    ws.getAllBlocks(false).forEach((b) => {
      const champ = b.getField('CLASSE');
      if (champ && champ.forceRerender) champ.forceRerender();
    });
  }

  /* ---------- Sorties vers la carte ---------- */
  async function envoyer(cmd) {
    if (state.writer) {
      journal('→ ' + cmd, 'tx');
      try {
        await state.writer.write(encodeur.encode(cmd + '\n'));
      } catch (e) {
        journal("Erreur d'envoi : " + e.message, 'err');
        perdreLaCarte();
      }
    } else {
      journal(cmd + '   (simulation, carte non connectée)', 'sim');
    }
  }
  function sortie(cle, cmd) {
    if (!state.running) return;
    if (state.cache[cle] === cmd) return;   // n'envoie que les changements
    state.cache[cle] = cmd;
    envoyer(cmd);
  }
  const STOP = { arret: true };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const out = {
    led: (pin, on) => sortie('L' + pin, 'L,' + pin + ',' + (on ? 1 : 0)),
    servo: (pin, a) => sortie('S' + pin, 'S,' + pin + ',' + clamp(Math.round(Number(a) || 0), 0, 180)),
    pwm: (pin, v) => sortie('P' + pin, 'P,' + pin + ',' + clamp(Math.round(Number(v) || 0), 0, 255)),
    read: async (pin) => {
      if (!state.running) throw STOP;
      if (!state.writer) { return 0; }   // simulation : aucune carte, la broche est lue à 0
      const valeur = await new Promise((resolve) => {
        (state.lectures[pin] = state.lectures[pin] || []).push(resolve);
        state.writer.write(encodeur.encode('R,' + pin + ',0\n')).catch(() => resolve(null));
        setTimeout(() => resolve(null), 700);
      });
      if (!state.running) throw STOP;
      if (valeur === null) {
        if (!state.alerteLecture) {
          state.alerteLecture = true;
          journal("La carte ne répond pas à la lecture de la broche " + pin + ". Si tu as téléversé le programme avant l'ajout de ce bloc, clique de nouveau sur « Téléverser le programme dans la carte ».", 'err');
        }
        return 0;
      }
      return valeur;
    },
    tick: async () => { await sleep(50); if (!state.running) throw STOP; },
    wait: async (s) => {
      const fin = Date.now() + Math.max(0, Number(s) || 0) * 1000;
      while (Date.now() < fin) { await sleep(Math.min(50, Math.max(1, fin - Date.now()))); if (!state.running) throw STOP; }
      if (!state.running) throw STOP;
    },
    log: (t) => { if (state.cache['T'] !== t) { state.cache['T'] = t; journal('Programme : ' + t, 'prog'); } }
  };
  const ai = {
    is: (c, seuil) => (state.preds[c] || 0) * 100 >= seuil,
    conf: (c) => Math.round((state.preds[c] || 0) * 100),
    top: () => state.top
  };

  /* ---------- Port série ---------- */
  function majPuceCarte() {
    if (state.writer) puce('puceCarte', 'Carte : connectée', 'ok');
    else puce('puceCarte', 'Carte : non connectée (simulation)', '');
    $('btnConnecter').disabled = !!state.port;
    $('btnDeconnecter').disabled = !state.port;
  }
  async function boucleLecture(lecteur) {
    const dec = new TextDecoder();
    let tampon = '';
    try {
      while (true) {
        const { value, done } = await lecteur.read();
        if (done) break;
        tampon += dec.decode(value, { stream: true });
        let i;
        while ((i = tampon.indexOf('\n')) >= 0) {
          const l = tampon.slice(0, i).trim();
          tampon = tampon.slice(i + 1);
          const m = /^R,(\d+),([01])$/.exec(l);
          if (m) { const att = state.lectures[m[1]] || []; state.lectures[m[1]] = []; att.forEach((f) => f(Number(m[2]))); }
          else if (l) journal('Carte : ' + l, 'rx');
        }
      }
    } catch (e) { /* port fermé ou débranché */ }
    try { lecteur.releaseLock(); } catch (e) { /* déjà libéré */ }
    if (state.port && !state.deconnexionVoulue) perdreLaCarte();
  }
  async function attacherPort(port) {
    state.deconnexionVoulue = false;
    state.port = port;
    state.writer = port.writable.getWriter();
    state.reader = port.readable.getReader();
    state.lecture = boucleLecture(state.reader);
    state.cache = {};
    majPuceCarte();
    puce('puceCarte', 'Carte : démarrage…', 'attente');
    await sleep(2000);
    if (state.writer) {
      majPuceCarte();
      journal('Carte prête. Elle doit répondre « PRET » ; sinon, clique sur « Téléverser le programme dans la carte ».', 'info');
      try { await state.writer.write(encodeur.encode('?\n')); } catch (e) { /* ignoré */ }
    }
  }
  /* Page intégrée dans un autre site (iframe) : le site doit autoriser la carte et la caméra. */
  const dansIframe = () => { try { return window.self !== window.top; } catch (e) { return true; } };
  const CONSEIL_IFRAME = " Cette page est intégrée dans un autre site qui ne l'autorise pas : le professeur doit ajouter allow=\"serial; camera\" à l'iframe (et utiliser une adresse https).";
  function conseilIframe(e) {
    return (dansIframe() && e && (e.name === 'SecurityError' || e.name === 'NotAllowedError')) ? CONSEIL_IFRAME : '';
  }
  async function connecter() {
    if (!('serial' in navigator)) {
      alerte("Le port série n'est pas disponible dans ce navigateur : utilise Chrome ou Edge sur ordinateur. Le programme reste utilisable en simulation.");
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      journal('Port ouvert. La carte redémarre, patiente 2 secondes…', 'info');
      await attacherPort(port);
    } catch (e) {
      journal('Connexion impossible : ' + e.message + conseilIframe(e), 'err');
      state.port = null; state.writer = null; state.reader = null;
      majPuceCarte();
    }
  }

  /* ---------- Téléversement du programme (protocole STK500, bootloader Optiboot) ---------- */
  const HEX_RECEPTEUR = `__HEX__`;
  function lireHex(texte) {
    const mem = [];
    texte.split(/\r?\n/).forEach((l) => {
      l = l.trim();
      if (l[0] !== ':') return;
      const n = parseInt(l.substr(1, 2), 16), adr = parseInt(l.substr(3, 4), 16), type = parseInt(l.substr(7, 2), 16);
      if (type !== 0) return;
      for (let i = 0; i < n; i++) mem[adr + i] = parseInt(l.substr(9 + 2 * i, 2), 16);
    });
    for (let i = 0; i < mem.length; i++) if (mem[i] === undefined) mem[i] = 0xFF;
    return Uint8Array.from(mem);
  }
  function majProgression(p, texte) {
    $('progTeleversement').style.display = 'block';
    $('progTeleversement').value = p;
    $('texteTeleversement').textContent = texte || '';
  }
  function creerLiaison(port) {
    const L = { buf: [], pend: null, err: null, writer: port.writable.getWriter(), reader: port.readable.getReader() };
    L.lire = async (n, ms) => {
      const fin = Date.now() + ms;
      while (L.buf.length < n) {
        const reste = fin - Date.now();
        if (reste <= 0) throw new Error('la carte ne répond pas');
        if (!L.pend) L.pend = L.reader.read().then((r) => { L.pend = null; if (r.done) L.err = new Error('port fermé'); else L.buf.push(...r.value); }, (e) => { L.pend = null; L.err = e; });
        await Promise.race([L.pend, sleep(reste)]);
        if (L.err) throw L.err;
      }
      return L.buf.splice(0, n);
    };
    L.ecrire = (octets) => L.writer.write(Uint8Array.from(octets));
    L.attendreOk = async (ms, etape) => {
      let r;
      try { r = await L.lire(2, ms || 1500); }
      catch (e) {
        if (e.message === 'la carte ne répond pas') throw new Error("pas de réponse à l'étape « " + (etape || 'synchronisation') + ' »');
        throw e;
      }
      if (r[0] !== 0x14 || r[1] !== 0x10) throw new Error("réponse inattendue à l'étape « " + (etape || 'synchronisation') + ' » : ' + r.map((x) => x.toString(16)).join(' '));
    };
    L.fermer = async () => {
      try { await L.reader.cancel(); } catch (e) { /* ignoré */ }
      try { L.reader.releaseLock(); } catch (e) { /* ignoré */ }
      try { L.writer.releaseLock(); } catch (e) { /* ignoré */ }
    };
    return L;
  }
  async function synchroniser(L, port, strategie) {
    const sig = (d) => port.setSignals({ dataTerminalReady: d, requestToSend: d }).catch(() => {});
    if (strategie === 'A') { await sig(false); await sleep(250); await sig(true); await sleep(80); }
    else if (strategie === 'B') { await sig(true); await sleep(250); await sig(false); await sleep(80); }
    for (let essai = 0; essai < 12; essai++) {
      L.buf.length = 0;
      await L.ecrire([0x30, 0x20]);
      try {
        await L.attendreOk(150);
        // La carte doit répondre une seconde fois : sinon c'était un faux départ (redémarrage mal synchronisé).
        await sleep(100);
        L.buf.length = 0;
        await L.ecrire([0x30, 0x20]);
        await L.attendreOk(600, 'seconde synchronisation');
        return true;
      } catch (e) { if (L.err) throw e; if (/seconde/.test(e.message)) { journal('La carte a répondu une fois puis plus rien : on essaie une autre méthode de redémarrage.', 'info'); return false; } }
    }
    return false;
  }
  async function televerser() {
    if (!('serial' in navigator)) {
      alerte("Le port série n'est pas disponible dans ce navigateur : utilise Chrome ou Edge sur ordinateur.");
      return;
    }
    if (state.running) arreter();
    $('btnTeleverser').disabled = true; $('btnConnecter').disabled = true;
    let port = null, L = null;
    try {
      const baud = Number($('vitesseCarte').value) || 115200;
      const prog = lireHex(HEX_RECEPTEUR);
      if (state.port) await deconnecter();
      port = await navigator.serial.requestPort();
      const essais = [];
      [baud, baud === 115200 ? 57600 : 115200].forEach((b) => ['B', 'A', 'N'].forEach((s) => essais.push([b, s])));
      let trouve = false;
      for (let i = 0; i < essais.length && !trouve; i++) {
        const [b, s] = essais[i];
        majProgression(0, 'Recherche de la carte (essai ' + (i + 1) + '/' + essais.length + ', ' + b + ' bauds)…');
        journal('Téléversement : essai ' + (i + 1) + '/' + essais.length + ' (' + b + ' bauds, méthode ' + s + ')', 'info');
        try { await port.open({ baudRate: b }); }
        catch (e) { throw new Error("le port est occupé ou inaccessible. Ferme les autres onglets et logiciels qui utilisent la carte (Vittascience, Arduino IDE, moniteur série), débranche puis rebranche l'USB, recharge cette page et réessaie"); }
        L = creerLiaison(port);
        trouve = await synchroniser(L, port, s);
        if (!trouve) { await L.fermer(); L = null; await port.close(); }
      }
      if (!trouve) throw new Error("la carte ne répond pas. Vérifie le câble USB (il doit transmettre les données), le choix du port, et que la carte est bien une Uno ou une Nano");
      const { ecrire, attendreOk, lire } = L;
      journal('Carte trouvée (synchronisation réussie), envoi du programme…', 'info');
      majProgression(0.05, 'Carte trouvée, envoi du programme…');
      L.buf.length = 0;
      try { await ecrire([0x50, 0x20]); await attendreOk(600, 'entrée en mode programmation'); journal('Mode programmation : OK.', 'info'); }
      catch (e) { journal('Mode programmation : ' + e.message + ' (on continue quand même)', 'err'); L.buf.length = 0; }

      const PAGE = 128;
      for (let adr = 0; adr < prog.length; adr += PAGE) {
        const bloc = Array.from(prog.subarray(adr, Math.min(adr + PAGE, prog.length)));
        while (bloc.length < PAGE) bloc.push(0xFF);
        const mot = adr >> 1;
        await ecrire([0x55, mot & 0xFF, (mot >> 8) & 0xFF, 0x20]); await attendreOk(1500, 'adresse ' + adr);
        await ecrire([0x64, 0x00, PAGE, 0x46].concat(bloc, [0x20])); await attendreOk(1500, 'écriture à l\'adresse ' + adr);
        majProgression(0.05 + 0.5 * Math.min(1, (adr + PAGE) / prog.length), 'Écriture…');
      }
      for (let adr = 0; adr < prog.length; adr += PAGE) {
        const mot = adr >> 1;
        await ecrire([0x55, mot & 0xFF, (mot >> 8) & 0xFF, 0x20]); await attendreOk(1500, 'adresse ' + adr);
        await ecrire([0x74, 0x00, PAGE, 0x46, 0x20]);
        let rep;
        try { rep = await lire(PAGE + 2, 1500); } catch (e) { throw new Error("pas de réponse à l'étape « relecture à l'adresse " + adr + ' »'); }
        if (rep[0] !== 0x14 || rep[PAGE + 1] !== 0x10) throw new Error('vérification impossible');
        for (let i = 0; i < Math.min(PAGE, prog.length - adr); i++) {
          if (rep[1 + i] !== prog[adr + i]) throw new Error('la vérification a échoué (octet ' + (adr + i) + ')');
        }
        majProgression(0.55 + 0.45 * Math.min(1, (adr + PAGE) / prog.length), 'Vérification…');
      }
      await ecrire([0x51, 0x20]); await attendreOk(1500, 'fin de programmation');
      majProgression(1, 'Programme téléversé et vérifié ✔');
      journal('Programme téléversé et vérifié (' + prog.length + ' octets).', 'info');

      await L.fermer(); L = null;
      await port.close();
      await port.open({ baudRate: 115200 });
      journal('Connexion à la carte…', 'info');
      const p = port; port = null;
      await attacherPort(p);
    } catch (e) {
      majProgression(0, 'Échec : ' + e.message);
      journal('Échec du téléversement : ' + e.message + conseilIframe(e), 'err');
      try { if (L) await L.fermer(); } catch (x) { /* ignoré */ }
      try { if (port) await port.close(); } catch (x) { /* ignoré */ }
    }
    $('btnTeleverser').disabled = false;
    majPuceCarte();
  }

  function perdreLaCarte() {
    if (!state.port) return;
    journal('La carte a été déconnectée.', 'err');
    state.port = null; state.writer = null; state.reader = null; state.lecture = null;
    majPuceCarte();
  }
  async function deconnecter() {
    if (!state.port) return;
    state.deconnexionVoulue = true;
    try { if (state.reader) await state.reader.cancel(); } catch (e) { /* ignoré */ }
    try { if (state.lecture) await state.lecture; } catch (e) { /* ignoré */ }
    try { if (state.writer) state.writer.releaseLock(); } catch (e) { /* ignoré */ }
    try { await state.port.close(); } catch (e) { /* ignoré */ }
    state.port = null; state.writer = null; state.reader = null; state.lecture = null;
    majPuceCarte();
    journal('Carte déconnectée.', 'info');
  }
  if ('serial' in navigator && navigator.serial.addEventListener) {
    navigator.serial.addEventListener('disconnect', () => { if (state.port) perdreLaCarte(); });
  } else {
    alerte("Le port série n'est pas disponible dans ce navigateur : utilise Chrome ou Edge sur ordinateur. Tu peux tout de même tester ton programme en simulation.");
  }

  /* ---------- Classes, barres et reconnaissance ---------- */
  function afficherClasses() {
    const boiteBarres = $('barres');
    boiteBarres.innerHTML = '';
    state.classes.forEach((c) => {
      const ligne = document.createElement('div');
      ligne.className = 'barre';
      ligne.dataset.classe = c;
      const nom = document.createElement('span'); nom.className = 'nom'; nom.textContent = c; nom.title = c;
      const piste = document.createElement('span'); piste.className = 'piste';
      const rempli = document.createElement('span'); rempli.className = 'rempli';
      piste.appendChild(rempli);
      const pct = document.createElement('span'); pct.className = 'pct'; pct.textContent = '0 %';
      ligne.append(nom, piste, pct);
      if (state.testMode) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'mini'; b.textContent = 'Simuler';
        b.addEventListener('click', () => simuler(c));
        ligne.appendChild(b);
      } else {
        ligne.style.gridTemplateColumns = '110px 1fr 48px';
      }
      boiteBarres.appendChild(ligne);
    });
  }
  function majBarres() {
    document.querySelectorAll('.barre').forEach((ligne) => {
      const c = ligne.dataset.classe;
      const p = Math.round((state.preds[c] || 0) * 100);
      ligne.querySelector('.rempli').style.width = p + '%';
      ligne.querySelector('.pct').textContent = p + ' %';
      ligne.classList.toggle('top', c === state.top && p > 0);
    });
    const r = $('reconnu');
    r.textContent = '';
    if (state.top) {
      const b = document.createElement('b'); b.textContent = state.top;
      r.append('Classe la plus probable : ', b);
    }
  }
  function simuler(c) {
    state.classes.forEach((k) => { state.preds[k] = k === c ? 1 : 0; });
    state.top = c;
    majBarres();
  }
  function nouvellesClasses(liste) {
    state.classes = liste.slice();
    ajouterConnues(liste);
    state.preds = {}; state.top = '';
    liste.forEach((c) => { state.preds[c] = 0; });
    afficherClasses();
    majBarres();
    actualiserListes();
    majBoutons();
  }

  /* ---------- Webcam et modèle ---------- */
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true;
  const canvas = $('canvasCam');
  const ctx = canvas.getContext('2d');

  function dessinerImage() {
    if (!video.videoWidth) return;
    const cw = canvas.width, ch = canvas.height;
    const rc = cw / ch, rv = video.videoWidth / video.videoHeight;
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
    if (rv > rc) { sw = video.videoHeight * rc; sx = (video.videoWidth - sw) / 2; }
    else { sh = video.videoWidth / rc; sy = (video.videoHeight - sh) / 2; }
    ctx.save();
    ctx.translate(cw, 0); ctx.scale(-1, 1);          // miroir, comme dans Teachable Machine
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
    ctx.restore();
  }
  async function demarrerCamera(deviceId) {
    arreterCamera();
    const contraintes = { audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : { width: { ideal: 640 }, height: { ideal: 480 } } };
    state.stream = await navigator.mediaDevices.getUserMedia(contraintes);
    video.srcObject = state.stream;
    await video.play();
    try {
      const periph = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const sel = $('choixCamera');
      const courant = state.stream.getVideoTracks()[0].getSettings().deviceId;
      sel.innerHTML = '';
      periph.forEach((d, i) => {
        const o = document.createElement('option');
        o.value = d.deviceId; o.textContent = d.label || ('Caméra ' + (i + 1));
        if (d.deviceId === courant) o.selected = true;
        sel.appendChild(o);
      });
      $('ligneCamera').style.display = periph.length > 1 ? 'flex' : 'none';
    } catch (e) { /* la liste des caméras est facultative */ }
  }
  function arreterCamera() {
    state.analyse = false;
    if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
    video.srcObject = null;
  }
  async function boucleAnalyse() {
    if (!state.analyse) return;
    dessinerImage();
    const t = performance.now();
    if (state.model && !state.occupe && t - state.derniere >= 100) {
      state.occupe = true; state.derniere = t;
      try {
        const res = await state.model.predict(canvas);
        let meilleure = '', pm = -1;
        res.forEach((r) => {
          state.preds[r.className] = r.probability;
          if (r.probability > pm) { pm = r.probability; meilleure = r.className; }
        });
        state.top = meilleure;
        majBarres();
      } catch (e) { journal('Erreur de reconnaissance : ' + e.message, 'err'); }
      state.occupe = false;
    }
    requestAnimationFrame(boucleAnalyse);
  }
  async function activerModele(modele, nom) {
    state.model = modele;
    state.testMode = false;
    const labels = modele.getClassLabels();
    nouvellesClasses(labels);
    puce('puceModele', 'Modèle : ' + labels.length + ' classes', 'ok');
    journal('Modèle chargé (' + nom + ') : ' + labels.join(', '), 'info');
    try {
      await demarrerCamera();
      $('apercu').classList.add('actif');
      $('aideGuide').style.display = 'block';
      state.analyse = true;
      boucleAnalyse();
    } catch (e) {
      journal("Webcam inaccessible : " + e.message + ". Autorise la caméra dans le navigateur." + conseilIframe(e), 'err');
      alerte("La webcam n'a pas pu être activée. Autorise l'accès à la caméra, puis recharge le modèle.");
    }
    majBoutons();
  }
  async function chargerUrl() {
    let u = $('modelUrl').value.trim();
    if (!u) { journal('Colle d\'abord le lien du modèle.', 'err'); return; }
    if (!u.endsWith('/')) u += '/';
    journal('Chargement du modèle…', 'info');
    puce('puceModele', 'Modèle : chargement…', 'attente');
    try {
      const m = await window.tmImage.load(u + 'model.json', u + 'metadata.json');
      await activerModele(m, u);
    } catch (e) {
      puce('puceModele', 'Modèle : erreur', 'erreur');
      journal('Impossible de charger le modèle : ' + e.message + '. Vérifie le lien (il doit finir par /) et la connexion Internet, ou utilise les fichiers exportés.', 'err');
    }
  }
  async function chargerFichiers(liste) {
    let f = Array.from(liste);
    const z = f.find((x) => /\.zip$/i.test(x.name));
    if (z) {
      try {
        const arch = await window.JSZip.loadAsync(await z.arrayBuffer());
        f = [];
        for (const nom of Object.keys(arch.files)) {
          if (arch.files[nom].dir) continue;
          const court = nom.split('/').pop();
          if (/^(model\.json|metadata\.json)$/i.test(court) || /\.bin$/i.test(court)) {
            f.push(new File([await arch.files[nom].async('blob')], court));
          }
        }
      } catch (e) { journal('Impossible de lire le fichier zip : ' + e.message, 'err'); return; }
    }
    const m = f.find((x) => /model\.json$/i.test(x.name));
    const md = f.find((x) => /metadata\.json$/i.test(x.name));
    const w = f.find((x) => /\.bin$/i.test(x.name));
    if (!m || !md || !w) {
      journal('Choisis le fichier .zip exporté, ou les 3 fichiers à la fois : model.json, metadata.json et weights.bin.', 'err');
      return;
    }
    puce('puceModele', 'Modèle : chargement…', 'attente');
    try {
      const modele = await window.tmImage.loadFromFiles(m, w, md);
      await activerModele(modele, 'fichiers');
    } catch (e) {
      puce('puceModele', 'Modèle : erreur', 'erreur');
      journal('Impossible de lire les fichiers : ' + e.message, 'err');
    }
  }
  function activerTest() {
    const liste = $('classesTest').value.split(',').map((s) => s.trim()).filter(Boolean);
    if (liste.length < 2) { journal('Saisis au moins deux classes séparées par des virgules.', 'err'); return; }
    arreterCamera();
    state.model = null;
    state.testMode = true;
    $('apercu').classList.remove('actif');
    $('apercuVide').textContent = 'Mode test : utilise les boutons « Simuler ».';
    $('aideGuide').style.display = 'none';
    nouvellesClasses(liste);
    puce('puceModele', 'Mode test : ' + liste.length + ' classes', 'ok');
    journal('Mode test activé : ' + liste.join(', '), 'info');
    majBoutons();
  }

  /* ---------- Exécution du programme ---------- */
  function compiler() {
    G.init(ws);
    const starts = []; let frame = '';
    ws.getTopBlocks(true).forEach((b) => {
      const actif = b.isEnabled ? b.isEnabled() : !b.disabled;
      if (!actif) return;
      if (b.type === 'ia_start') starts.push(G.statementToCode(b, 'DO'));
      if (b.type === 'ia_hat') frame += G.statementToCode(b, 'DO');
    });
    return { starts, frame };
  }
  function texteCode(c) {
    let s = '';
    c.starts.forEach((x) => { s += '// au démarrage\n' + x + '\n'; });
    if (c.frame.trim()) s += '// à chaque image de la webcam\n' + c.frame;
    return s.trim() ? s : "(aucun bloc « au démarrage » ni « à chaque image de la webcam » n'est utilisé)";
  }
  function recompiler() {
    const c = compiler();
    $('codeAffiche').textContent = texteCode(c);
    return c;
  }
  function erreurProgramme(e) {
    if (e === STOP) return;
    arreter();
    journal('Erreur dans le programme : ' + (e && e.message ? e.message : e), 'err');
  }
  async function boucleImage() {
    while (state.running && state.frameFn) {
      try { await state.frameFn(ai, out); } catch (e) { erreurProgramme(e); return; }
      await sleep(100);
    }
  }
  function terminer() {
    if (!state.running) return;
    state.running = false;
    puce('puceProgramme', 'Programme : terminé', '');
    journal('Programme terminé (les sorties restent dans leur état).', 'info');
    majBoutons();
  }
  function demarrer() {
    const c = recompiler();
    if (!c.starts.some((x) => x.trim()) && !c.frame.trim()) {
      journal("Rien à exécuter : place des blocs dans « au démarrage » ou « à chaque image de la webcam ».", 'err');
      return;
    }
    let fonctions;
    try {
      fonctions = c.starts.map((x) => new AsyncFunction('ai', 'out', x));
      state.frameFn = c.frame.trim() ? new AsyncFunction('ai', 'out', c.frame) : null;
    } catch (e) { journal('Le programme est invalide : ' + e.message, 'err'); return; }
    state.cache = {};
    state.alerteLecture = false;
    state.running = true;
    state.execution += 1;
    const id = state.execution;
    puce('puceProgramme', 'Programme : en cours', 'ok');
    journal('Programme démarré' + (state.writer ? '.' : ' (simulation : aucune carte connectée).'), 'info');
    majBoutons();
    let restants = fonctions.length;
    fonctions.forEach((f) => {
      f(ai, out).then(() => {
        restants -= 1;
        if (restants === 0 && !state.frameFn && state.execution === id) terminer();
      }, erreurProgramme);
    });
    if (state.frameFn) boucleImage();
  }
  function arreter() {
    if (!state.running) return;
    state.running = false;
    // Éteint les LED et coupe les sorties PWM utilisées.
    Object.keys(state.cache).forEach((cle) => {
      const dernier = state.cache[cle];
      if ((cle[0] === 'L' || cle[0] === 'P') && /,[1-9]\d*$/.test(dernier)) envoyer(cle[0] + ',' + cle.slice(1) + ',0');
    });
    state.cache = {};
    puce('puceProgramme', 'Programme : arrêté', '');
    journal('Programme arrêté.', 'info');
    majBoutons();
  }
  function majBoutons() {
    const pret = !!state.model || state.testMode;
    $('btnDemarrer').disabled = !pret || state.running;
    $('btnArreter').disabled = !state.running;
  }

  /* ---------- Exemples, enregistrement ---------- */
  function insererExemple() {
    const c0 = state.classes[0] || 'classe A';
    ajouterConnues([c0]);
    const etat = {
      blocks: { languageVersion: 0, blocks: [{
        type: 'ia_hat', x: 40, y: 30,
        inputs: { DO: { block: {
          type: 'controls_if', extraState: { hasElse: true },
          inputs: {
            IF0: { block: { type: 'ia_reconnait', fields: { CLASSE: c0, SEUIL: 80 } } },
            DO0: { block: { type: 'ard_led', fields: { PIN: '13', ETAT: '1' } } },
            ELSE: { block: { type: 'ard_led', fields: { PIN: '13', ETAT: '0' } } }
          }
        } } }
      }] }
    };
    Blockly.serialization.workspaces.load(etat, ws);
    journal('Exemple inséré : la LED de la broche 13 s\'allume quand « ' + c0 + ' » est reconnue.', 'info');
  }
  function insererExemple2() {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: 'ia_start', x: 40, y: 30,
      inputs: { DO: { block: { type: 'ia_forever', inputs: { DO: { block: {
        type: 'ard_led', fields: { PIN: '13', ETAT: '1' },
        next: { block: { type: 'ia_wait', inputs: { SEC: { shadow: { type: 'math_number', fields: { NUM: 0.5 } } } },
          next: { block: { type: 'ard_led', fields: { PIN: '13', ETAT: '0' },
            next: { block: { type: 'ia_wait', inputs: { SEC: { shadow: { type: 'math_number', fields: { NUM: 0.5 } } } } } } } } } }
      } } } } } }
    }] } }, ws);
    journal('Exemple inséré : la LED de la broche 13 clignote pour toujours.', 'info');
  }
  function enregistrer() {
    const donnees = { version: 1, classes: state.connues, blocs: Blockly.serialization.workspaces.save(ws) };
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([JSON.stringify(donnees)], { type: 'application/json' }));
    lien.download = 'programme-ia-arduino.json';
    document.body.appendChild(lien); lien.click(); lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 2000);
  }
  function chargerDonnees(donnees) {
    ajouterConnues(donnees.classes || []);
    ajouterConnues(classesDansJson(donnees.blocs, []));
    Blockly.serialization.workspaces.load(donnees.blocs, ws);
  }
  function sauvegardeAuto() {
    try { localStorage.setItem('ia-arduino-programme', JSON.stringify({ version: 1, classes: state.connues, blocs: Blockly.serialization.workspaces.save(ws) })); }
    catch (e) { /* stockage indisponible : sans importance */ }
  }
  let minuterieSauvegarde = null;
  ws.addChangeListener((e) => {
    if (e.isUiEvent) return;
    clearTimeout(minuterieSauvegarde);
    minuterieSauvegarde = setTimeout(sauvegardeAuto, 400);
    const c = recompiler();
    if (state.running && state.frameFn) {
      try { state.frameFn = new AsyncFunction('ai', 'out', c.frame); } catch (err) { /* sera signalé au prochain démarrage */ }
    }
  });

  /* ---------- Liaison des boutons ---------- */
  $('btnConnecter').addEventListener('click', connecter);
  $('btnTeleverser').addEventListener('click', televerser);
  $('btnDeconnecter').addEventListener('click', deconnecter);
  $('btnChargerUrl').addEventListener('click', chargerUrl);
  $('modelUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') chargerUrl(); });
  $('fichiersModele').addEventListener('change', (e) => { if (e.target.files.length) chargerFichiers(e.target.files); e.target.value = ''; });
  $('btnTest').addEventListener('click', activerTest);
  $('choixCamera').addEventListener('change', async (e) => {
    try { await demarrerCamera(e.target.value); state.analyse = true; boucleAnalyse(); }
    catch (err) { journal('Changement de caméra impossible : ' + err.message, 'err'); }
  });
  $('btnDemarrer').addEventListener('click', demarrer);
  $('btnArreter').addEventListener('click', arreter);
  $('btnEnregistrer').addEventListener('click', enregistrer);
  $('btnOuvrir').addEventListener('click', () => $('fichierProgramme').click());
  $('fichierProgramme').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { chargerDonnees(JSON.parse(await f.text())); journal('Programme ouvert : ' + f.name, 'info'); }
    catch (err) { journal("Ce fichier n'est pas un programme valide : " + err.message, 'err'); }
  });
  $('btnTout').addEventListener('click', () => {
    if (ws.getAllBlocks(false).length && !confirm('Effacer tous les blocs ?')) return;
    ws.clear();
  });
  $('btnEffacerJournal').addEventListener('click', () => { $('journal').innerHTML = ''; });
  $('btnCopierIno').addEventListener('click', async () => {
    const texte = $('inoCode').textContent;
    try { await navigator.clipboard.writeText(texte); journal('Programme Arduino copié dans le presse-papiers.', 'info'); }
    catch (e) {
      const sel = window.getSelection(); const r = document.createRange();
      r.selectNodeContents($('inoCode')); sel.removeAllRanges(); sel.addRange(r);
      journal('Sélection faite : fais Ctrl+C pour copier.', 'info');
    }
  });
  window.addEventListener('beforeunload', () => { if (state.running) arreter(); });

  /* ---------- Démarrage : restauration du dernier programme ---------- */
  try {
    const sauve = JSON.parse(localStorage.getItem('ia-arduino-programme') || 'null');
    if (sauve && sauve.blocs) chargerDonnees(sauve);
  } catch (e) { /* rien à restaurer */ }
  recompiler();
  majPuceCarte();
  journal('Bienvenue ! Étape 1 : connecte la carte. Étape 2 : charge le modèle. Étape 3 : assemble les blocs, puis clique sur Démarrer.', 'info');

  // Accès pour les tests automatiques
  window.iaArduino = {
    conseilIframe, dansIframe, state, ws, compiler, texteCode, ai, out, demarrer, arreter, simuler, activerTest, insererExemple, insererExemple2 };
})();
