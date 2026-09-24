// tests/festivita.test.js — Festivita', ponti, settimane e fasi lunari.
// La CI esegue questi test in tre fusi orari: nessun risultato deve cambiare.
const test = require('node:test');
const assert = require('node:assert');

const F = require('../js/festivita.js');

test('Pasqua: date note', () => {
  const note = { 2019: '2019-04-21', 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16', 2038: '2038-04-25' };
  for (const [anno, data] of Object.entries(note)) assert.strictEqual(F.pasqua(Number(anno)), data, anno);
});

test('il 4 ottobre e festivo dal 2026 (L. 151/2025), non prima', () => {
  assert.strictEqual(F.eFestivo('2025-10-04'), false);
  assert.strictEqual(F.eFestivo('2026-10-04'), true);
  assert.strictEqual(F.eFestivo('2027-10-04'), true);
  const f = F.festivita(2027).find((x) => x.data === '2027-10-04');
  assert.strictEqual(f.riferimento, 'L. 151/2025');
});

test('le festivita nazionali del 2027: 13, in ordine', () => {
  const f = F.festivita(2027);
  assert.deepStrictEqual(f.map((x) => x.data), [
    '2027-01-01', '2027-01-06', '2027-03-28', '2027-03-29', '2027-04-25', '2027-05-01', '2027-06-02',
    '2027-08-15', '2027-10-04', '2027-11-01', '2027-12-08', '2027-12-25', '2027-12-26']);
  assert.ok(f.every((x) => x.riferimento), 'ogni festivita nazionale ha il suo riferimento normativo');
});

test('il santo patrono si aggiunge, e una data impossibile no', () => {
  assert.ok(F.festivita(2027, { md: '06-29', nome: 'Santi Pietro e Paolo' }).some((x) => x.data === '2027-06-29' && x.tipo === 'patrono'));
  assert.strictEqual(F.festivita(2027, { md: '02-30', nome: 'x' }).length, 13);
  assert.strictEqual(F.eFestivo('2027-12-07', { md: '12-07', nome: 'Sant’Ambrogio' }), true);
});

test('ponti 2027: tre festivita di mercoledi, nessuna Pasqua in elenco', () => {
  const p = F.ponti(2027);
  assert.ok(!p.some((x) => x.festa.nome === 'Pasqua'));
  assert.deepStrictEqual(p.filter((x) => x.tipo === 'meta-settimana').map((x) => x.festa.data), ['2027-01-06', '2027-06-02', '2027-12-08']);
  const epifania = p.find((x) => x.festa.data === '2027-01-06');
  assert.deepStrictEqual([epifania.giorniLiberi, epifania.ferie, epifania.ponte], [5, 2, ['2027-01-04', '2027-01-05']]);
  assert.strictEqual(p.find((x) => x.festa.data === '2027-10-04').tipo, 'weekend-lungo');
  assert.strictEqual(p.find((x) => x.festa.data === '2027-12-25').tipo, 'nel-weekend');
});

test('ponti 2026: martedi e giovedi, e Santo Stefano attaccato a Natale non si conta due volte', () => {
  const p = F.ponti(2026);
  const repubblica = p.find((x) => x.festa.data === '2026-06-02');
  assert.deepStrictEqual([repubblica.tipo, repubblica.ponte], ['ponte', ['2026-06-01']]);
  assert.deepStrictEqual(p.find((x) => x.festa.data === '2026-01-01').ponte, ['2026-01-02']);
  assert.ok(!p.some((x) => x.festa.data === '2026-12-26'), 'Santo Stefano (sabato) segue Natale (venerdi)');
});

test('settimane ISO 8601 ai bordi dell anno', () => {
  assert.strictEqual(F.settimanaIso('2026-01-01'), 1);   // giovedi
  assert.strictEqual(F.settimanaIso('2026-12-31'), 53);
  assert.strictEqual(F.settimanaIso('2027-01-01'), 53);  // venerdi: ultima settimana del 2026
  assert.strictEqual(F.settimanaIso('2027-01-04'), 1);
  assert.strictEqual(F.settimanaIso('2024-12-30'), 1);   // lunedi: prima settimana del 2025
});

test('fasi lunari: l esempio 49.a di Meeus', () => {
  // Luna nuova del 18 febbraio 1977, JDE 2443192.65118 (tempo dinamico).
  assert.ok(Math.abs(F.jdeFase(-283, 0) - 2443192.65118) < 0.00001);
});

test('fasi lunari 2026: lune piene note, ora italiana', () => {
  const piene = F.fasiLunari(2026).filter((x) => x.fase === 'piena');
  assert.strictEqual(piene.length, 13, 'il 2026 ha 13 pleniluni (Luna blu il 31 maggio)');
  // 3 gennaio 11:02, 31 maggio 10:45, 24 dicembre 02:28 (ora italiana)
  const attese = [['2026-01-03', '2026-01-03T10:02'], ['2026-05-31', '2026-05-31T08:45'], ['2026-12-24', '2026-12-24T01:28']];
  for (const [data, utc] of attese) {
    const f = piene.find((x) => x.data === data);
    assert.ok(f, 'manca la luna piena del ' + data);
    assert.ok(Math.abs(new Date(f.utc) - new Date(utc + ':00Z')) < 2 * 60000, data + ': ' + f.utc);
  }
  // 29 giugno 23:56 UTC e' gia' il 30 giugno in Italia (ora legale).
  assert.ok(piene.some((x) => x.data === '2026-06-30'));
});

test('fasi lunari: le quattro fasi si alternano e cadono nell anno', () => {
  const f = F.fasiLunari(2027);
  assert.ok(f.length >= 48 && f.length <= 52);
  assert.ok(f.every((x) => x.data.startsWith('2027-')));
  const ordine = ['nuova', 'primo-quarto', 'piena', 'ultimo-quarto'];
  for (let i = 1; i < f.length; i++) {
    assert.strictEqual(ordine.indexOf(f[i].fase), (ordine.indexOf(f[i - 1].fase) + 1) % 4, 'sequenza rotta a ' + f[i].data);
  }
});

test('date impossibili e aritmetica in calendario puro', () => {
  assert.strictEqual(F.valida('2027-02-29'), false);
  assert.strictEqual(F.valida('2028-02-29'), true);
  assert.strictEqual(F.aggiungi('2027-03-27', 2), '2027-03-29', 'attraverso il cambio dell ora');
  assert.strictEqual(F.aggiungi('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(F.giornoSettimana('2027-01-01'), 4, 'venerdi');
  assert.strictEqual(F.giorniNelMese(2028, 2), 29);
});

test('giorni lavorativi: ottobre 2026 con il 4 ottobre di domenica, e ottobre 2027 di lunedi', () => {
  // Ottobre 2027: 31 giorni, 10 di fine settimana, il 4 (lunedi) festivo -> 20 lavorativi.
  assert.deepStrictEqual(F.contaGiorni('2027-10-01', '2027-10-31'), { totali: 31, lavorativi: 20, weekend: 10, festivi: 1 });
  // Ottobre 2026: il 4 e' domenica, quindi non toglie un altro giorno.
  assert.deepStrictEqual(F.contaGiorni('2026-10-01', '2026-10-31'), { totali: 31, lavorativi: 22, weekend: 9, festivi: 0 });
});

test('giorni lavorativi: opzioni, patrono e intervalli rovesciati', () => {
  // Settimana di Pasqua 2027 (29 marzo-4 aprile): Pasquetta festiva.
  assert.strictEqual(F.contaGiorni('2027-03-29', '2027-04-04').lavorativi, 4);
  // Senza escludere i festivi: Pasquetta lavorativa.
  assert.strictEqual(F.contaGiorni('2027-03-29', '2027-04-04', { escludiFestivi: false }).lavorativi, 5);
  // Senza escludere il fine settimana, Pasqua (domenica) resta festiva.
  assert.strictEqual(F.contaGiorni('2027-03-28', '2027-03-28', { escludiWeekend: false }).lavorativi, 0);
  // Patrono di Milano (7 dicembre, martedi nel 2027).
  assert.strictEqual(F.contaGiorni('2027-12-06', '2027-12-10', { patrono: { md: '12-07' } }).lavorativi, 3);
  assert.deepStrictEqual(F.contaGiorni('2027-02-10', '2027-02-01'), { totali: 0, lavorativi: 0, weekend: 0, festivi: 0 });
  assert.strictEqual(F.contaGiorni('2027-02-30', '2027-03-01'), null);
  // Un anno intero: 2027 ha 365 giorni, 104 di fine settimana.
  const anno = F.contaGiorni('2027-01-01', '2027-12-31');
  assert.strictEqual(anno.totali, 365);
  assert.strictEqual(anno.weekend, 104);
});
