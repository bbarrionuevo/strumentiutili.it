// tests/helpers/carica-script.js — Carica gli script del sito dentro un
// contesto Node con un DOM finto, così si possono collaudare i motori di
// calcolo senza aprire un browser. Il codice sta in scripts/carica-motori.js,
// perche' lo usano anche i generatori delle pagine.
module.exports = require('../../scripts/carica-motori.js');
