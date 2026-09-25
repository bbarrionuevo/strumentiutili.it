// tests/scadenze.test.js — Lo scadenziario: le regole che propongono le date
// (revisione, patente, carta d'identita', passaporto, ISEE), le ripetizioni e
// gli eventi per il calendario del telefono.
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/scadenze.js');
const Ics = require('../js/calendario-ics.js');

test('revisione: 4 anni dalla prima immatricolazione, poi ogni 2, a fine mese', () => {
  assert.strictEqual(S.revisione('2022-03-15'), '2026-03-31');
  assert.strictEqual(S.revisione('2022-03-15', '2026-03-10'), '2028-03-31');
  // revisione fatta in ritardo a maggio: la prossima e' a maggio
  assert.strictEqual(S.revisione('2022-03-15', '2026-05-20'), '2028-05-31');
  assert.strictEqual(S.revisione('2020-02-29'), '2024-02-29');
});

test('patente: durata secondo l eta e scadenza al compleanno successivo', () => {
  // esempio della circolare: visita il 10 ottobre 2013, compleanno il 15 dicembre, 10 anni
  assert.deepStrictEqual(S.patente('1980-12-15', '2013-10-10'), { anni: 10, scadenza: '2023-12-15' });
  // compleanno prima della data: si passa all'anno dopo
  assert.deepStrictEqual(S.patente('1980-01-05', '2026-10-10'), { anni: 10, scadenza: '2037-01-05' });
  assert.strictEqual(S.patente('1976-06-01', '2026-06-01').anni, 5); // 50 anni compiuti
  assert.strictEqual(S.patente('1976-06-02', '2026-06-01').anni, 10); // ne ha ancora 49
  assert.strictEqual(S.patente('1955-03-01', '2026-06-01').anni, 3);
  assert.strictEqual(S.patente('1940-03-01', '2026-06-01').anni, 2);
  // nato il 29 febbraio: in un anno non bisestile scade il 28
  assert.strictEqual(S.patente('1980-02-29', '2026-03-10').scadenza, '2037-02-28');
});

test('carta d identita: 3, 5 o 10 anni e compleanno successivo', () => {
  assert.deepStrictEqual(S.cartaIdentita('1990-07-20', '2026-03-01'), { anni: 10, scadenza: '2036-07-20' });
  assert.deepStrictEqual(S.cartaIdentita('2015-07-20', '2026-03-01'), { anni: 5, scadenza: '2031-07-20' });
  assert.deepStrictEqual(S.cartaIdentita('2024-07-20', '2026-03-01'), { anni: 3, scadenza: '2029-07-20' });
});

test('passaporto e ISEE', () => {
  assert.deepStrictEqual(S.passaporto('1990-07-20', '2026-03-01'), { anni: 10, scadenza: '2036-02-29' });
  assert.strictEqual(S.passaporto('2012-01-01', '2026-03-01').anni, 5);
  assert.strictEqual(S.isee('2026-02-14'), '2026-12-31');
});

test('ripetizioni: la prossima scadenza da oggi', () => {
  const bollo = { tipo: 'bollo', titolo: 'Bollo Panda', data: '2024-04-30', ripeti: 'anno' };
  assert.strictEqual(S.prossima(bollo, '2026-09-25'), '2027-04-30');
  assert.strictEqual(S.prossima(bollo, '2027-04-30'), '2027-04-30');
  const rev = { tipo: 'revisione', titolo: 'Panda', data: '2025-03-31', ripeti: '2anni' };
  assert.strictEqual(S.prossima(rev, '2026-09-25'), '2027-03-31');
  const mese = { tipo: 'altro', titolo: 'Affitto', data: '2026-01-31', ripeti: 'mese' };
  assert.strictEqual(S.prossima(mese, '2026-02-15'), '2026-02-28');
  assert.strictEqual(S.prossima(mese, '2026-03-01'), '2026-03-31');
  const una = { tipo: 'patente', titolo: 'Patente', data: '2026-01-10', ripeti: 'no' };
  assert.strictEqual(S.prossima(una, '2026-09-25'), '2026-01-10');
});

test('stato: scaduta, tolleranza dell assicurazione, vicina, presto, ok', () => {
  const oggi = '2026-09-25';
  const st = (tipo, data) => S.stato({ tipo, titolo: 'x', data, ripeti: 'no' }, oggi);
  assert.strictEqual(st('patente', '2026-09-20').stato, 'scaduta');
  assert.strictEqual(st('assicurazione', '2026-09-20').stato, 'tolleranza');
  assert.strictEqual(st('assicurazione', '2026-09-09').stato, 'scaduta');
  assert.strictEqual(st('patente', '2026-10-10').stato, 'vicina');
  assert.strictEqual(st('patente', '2026-12-01').stato, 'presto');
  assert.strictEqual(st('patente', '2027-06-01').stato, 'ok');
  assert.strictEqual(st('patente', '2026-10-10').giorni, 15);
});

test('ordine: prima le piu vicine', () => {
  const elenco = [
    { tipo: 'patente', titolo: 'B', data: '2030-01-01', ripeti: 'no' },
    { tipo: 'bollo', titolo: 'A', data: '2025-10-31', ripeti: 'anno' },
    { tipo: 'isee', titolo: 'C', data: '2026-12-31', ripeti: 'anno' }
  ];
  assert.deepStrictEqual(S.ordina(elenco, '2026-09-25').map((x) => x.titolo), ['A', 'C', 'B']);
});

test('controlli sui dati salvati', () => {
  assert.strictEqual(S.problema({ tipo: 'bollo', titolo: 'Bollo', data: '2026-04-30', ripeti: 'anno' }), null);
  assert.match(S.problema({ tipo: 'boh', titolo: 'x', data: '2026-04-30', ripeti: 'no' }), /Tipo/);
  assert.match(S.problema({ tipo: 'bollo', titolo: '', data: '2026-04-30', ripeti: 'no' }), /nome/);
  assert.match(S.problema({ tipo: 'bollo', titolo: 'x', data: '2026-02-30', ripeti: 'no' }), /Data/);
  assert.match(S.problema({ tipo: 'bollo', titolo: 'x', data: '2026-02-20', ripeti: 'settimana' }), /Ripetizione/);
});

test('calendario: tre promemoria e le prossime ricorrenze', () => {
  const elenco = [
    { id: 'a', tipo: 'revisione', titolo: 'Revisione Panda', data: '2027-03-31', ripeti: '2anni' },
    { id: 'b', tipo: 'patente', titolo: 'Patente', data: '2029-07-20', ripeti: 'no', nota: 'visita medica' }
  ];
  const ev = S.eventi(elenco, '2026-09-25', { url: 'https://strumentiutili.it/identita-burocrazia/scadenziario/' });
  assert.deepStrictEqual(ev.map((e) => e.data), ['2027-03-31', '2029-03-31', '2031-03-31', '2029-07-20']);
  const ics = Ics.crea(ev, { ora: new Date(0), nome: 'Scadenze' });
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
  assert.strictEqual((ics.match(/TRIGGER;RELATED=START:-P29DT15H/g) || []).length, 4);
  assert.match(ics, /DTSTART;VALUE=DATE:20290720/);
  assert.match(ics, /visita medica/);
  assert.doesNotMatch(ics, /VTIMEZONE/);
});

test('una scadenza che si ripete resta scaduta finche non si segna fatta', () => {
  const oggi = '2026-09-25';
  const rc = { tipo: 'assicurazione', titolo: 'RC', data: '2026-09-20', ripeti: 'anno' };
  assert.strictEqual(S.stato(rc, oggi).stato, 'tolleranza');
  assert.strictEqual(S.rinnova(rc, oggi), '2027-09-20');
  // segnata in ritardo di anni: un clic porta alla prossima dopo oggi
  const bollo = { tipo: 'bollo', titolo: 'Bollo', data: '2023-04-30', ripeti: 'anno' };
  assert.strictEqual(S.stato(bollo, oggi).stato, 'scaduta');
  assert.strictEqual(S.rinnova(bollo, oggi), '2027-04-30');
  // non ancora scaduta: passa al giro successivo
  const rev = { tipo: 'revisione', titolo: 'Rev', data: '2026-10-31', ripeti: '2anni' };
  assert.strictEqual(S.rinnova(rev, oggi), '2028-10-31');
  assert.strictEqual(S.rinnova({ tipo: 'patente', titolo: 'P', data: '2026-10-31', ripeti: 'no' }, oggi), '2026-10-31');
});

test('nel calendario non finiscono le scadenze gia passate', () => {
  const ev = S.eventi([{ id: 'x', tipo: 'identita', titolo: 'CIE', data: '2026-07-20', ripeti: 'no' }], '2026-09-25');
  assert.deepStrictEqual(ev, []);
});
