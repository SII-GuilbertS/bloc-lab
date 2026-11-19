// Assemble la page unique dist/ia-arduino.html :
//   src/index.html + src/style.css + src/app.js + bibliothèques (node_modules) + firmware (.hex).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');
const echapperScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const remplacer = (texte, marque, contenu) => {
  if (!texte.includes(marque)) throw new Error('Marque absente : ' + marque);
  return texte.split(marque).join(contenu); // split/join : pas d'interprétation des « $ »
};

const nm = './node_modules/';
const bibliotheques = {
  '/*__TF__*/': nm + '@tensorflow/tfjs/dist/tf.min.js',
  '/*__ZIP__*/': nm + 'jszip/dist/jszip.min.js',
  '/*__TM__*/': nm + '@teachablemachine/image/dist/teachablemachine-image.min.js',
  '/*__BLOCKLY__*/': nm + 'blockly/blockly_compressed.js',
  '/*__BLOCKS__*/': nm + 'blockly/blocks_compressed.js',
  '/*__JSGEN__*/': nm + 'blockly/javascript_compressed.js',
  '/*__FR__*/': nm + 'blockly/msg/fr.js'
};

const hex = lire('./firmware/ia_arduino_recepteur.hex').replace(/`/g, '');

let page = lire('./src/index.html');
page = remplacer(page, '/*__STYLE__*/', lire('./src/style.css'));
for (const [marque, fichier] of Object.entries(bibliotheques)) {
  page = remplacer(page, marque, echapperScript(lire(fichier)));
}
page = remplacer(page, '/*__APP__*/', echapperScript(remplacer(lire('./src/app.js'), '__HEX__', hex)));

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/ia-arduino.html', import.meta.url), page);
console.log('dist/ia-arduino.html écrit (' + Math.round(page.length / 1024) + ' Ko)');

// Dossier « site » : copie prête à déposer sur l'hébergement (OVH…), nommée index.html.
mkdirSync(new URL('./site/', import.meta.url), { recursive: true });
writeFileSync(new URL('./site/index.html', import.meta.url), page);
console.log('site/index.html écrit (copie à envoyer sur l\'hébergement)');
