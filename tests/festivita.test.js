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

test('ponti 2027: tre feste di mercoledi, e Capodanno si lega all Epifania', () => {
  const p = F.ponti(2027);
  assert.ok(!p.some((x) => x.festa.nome === 'Pasqua'));
  const epifania = p.find((x) => x.festa.data === '2027-01-06');
  // venerdi 1 (Capodanno) - mercoledi 6 (Epifania): 6 giorni con lunedi e martedi di ferie
  assert.deepStrictEqual([epifania.tipo, epifania.giorniLiberi, epifania.ferie, epifania.ponte, epifania.dal, epifania.al],
    ['ponte-lungo', 6, 2, ['2027-01-04', '2027-01-05'], '2027-01-01', '2027-01-06']);
  const capodanno = p.find((x) => x.festa.data === '2027-01-01');
  assert.strictEqual(capodanno.senzaFerie, 3, 'da solo e un weekend lungo');
  const repubblica = p.find((x) => x.festa.data === '2027-06-02');
  assert.deepStrictEqual([repubblica.tipo, repubblica.giorniLiberi, repubblica.ponte], ['ponte-lungo', 5, ['2027-05-31', '2027-06-01']]);
  assert.deepStrictEqual(repubblica.altro, { ponte: ['2027-06-03', '2027-06-04'], dal: '2027-06-02', al: '2027-06-06' });
  assert.strictEqual(p.find((x) => x.festa.data === '2027-10-04').tipo, 'weekend-lungo');
  assert.strictEqual(p.find((x) => x.festa.data === '2027-12-25').tipo, 'nel-weekend');
  assert.strictEqual(p.find((x) => x.festa.data === '2027-12-26').tipo, 'nel-weekend');
});

test('ponti 2026: martedi e giovedi, e Santo Stefano attaccato a Natale non si conta due volte', () => {
  const p = F.ponti(2026);
  const repubblica = p.find((x) => x.festa.data === '2026-06-02');
  assert.deepStrictEqual([repubblica.tipo, repubblica.ponte, repubblica.dal, repubblica.al], ['ponte', ['2026-06-01'], '2026-05-30', '2026-06-02']);
  assert.deepStrictEqual(p.find((x) => x.festa.data === '2026-01-01').ponte, ['2026-01-02']);
  assert.ok(!p.some((x) => x.festa.data === '2026-12-26'), 'Santo Stefano (sabato) segue Natale (venerdi)');
});

test('ponti: feste attaccate fra loro (Natale e Santo Stefano, Sant Ambrogio e Immacolata)', () => {
  // 2025: Natale giovedi, Santo Stefano venerdi -> 4 giorni senza ferie, nessun ponte da pagare
  const n2025 = F.ponti(2025).find((x) => x.festa.data === '2025-12-25');
  assert.deepStrictEqual([n2025.tipo, n2025.giorniLiberi, n2025.ferie, n2025.al], ['weekend-lungo', 4, 0, '2025-12-28']);
  // 2029: Natale martedi -> il 24 di ferie e si sta a casa da sabato 22 a mercoledi 26
  const n2029 = F.ponti(2029).find((x) => x.festa.data === '2029-12-25');
  assert.deepStrictEqual([n2029.tipo, n2029.giorniLiberi, n2029.ponte, n2029.dal, n2029.al], ['ponte', 5, ['2029-12-24'], '2029-12-22', '2029-12-26']);
  // Milano 2027: Sant'Ambrogio martedi 7, Immacolata mercoledi 8 -> una voce sola
  const milano = F.ponti(2027, { md: '12-07', nome: 'Sant’Ambrogio' }).filter((x) => x.festa.data.startsWith('2027-12-0'));
  assert.strictEqual(milano.length, 1);
  assert.deepStrictEqual([milano[0].tipo, milano[0].giorniLiberi, milano[0].ponte], ['ponte', 5, ['2027-12-06']]);
});

test('ponti: regole generali su vent anni', () => {
  for (let anno = 2026; anno <= 2045; anno++) {
    for (const p of F.ponti(anno)) {
      const gs = F.giornoSettimana(p.festa.data);
      if (gs >= 5) { assert.strictEqual(p.tipo, 'nel-weekend'); continue; }
      assert.ok(p.dal <= p.festa.data && p.festa.data <= p.al, anno + ' ' + p.festa.nome);
      assert.strictEqual(p.ponte.length, p.ferie);
      for (const d of p.ponte) assert.ok(F.giornoSettimana(d) < 5 && !F.eFestivo(d), 'ferie in un giorno lavorativo');
      if (gs === 0 || gs === 4) assert.ok(p.senzaFerie >= 3, 'lunedi o venerdi: weekend lungo');
      assert.notStrictEqual(p.tipo, 'festa', anno + ' ' + p.festa.nome + ': ogni festa feriale ha almeno un ponte o un weekend lungo');
    }
  }
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

test('ricorrenze: carnevale, ora legale e festa della mamma per il 2026 e il 2027', () => {
  const trova = (anno, inizio) => F.ricorrenze(anno).find((r) => r.nome.startsWith(inizio)).data;
  assert.strictEqual(trova(2026, 'Martedì grasso'), '2026-02-17');
  assert.strictEqual(trova(2026, 'Ora legale'), '2026-03-29');
  assert.strictEqual(trova(2026, 'Ora solare'), '2026-10-25');
  assert.strictEqual(trova(2026, 'Festa della mamma'), '2026-05-10');
  assert.strictEqual(trova(2027, 'Giovedì grasso'), '2027-02-04');
  assert.strictEqual(trova(2027, 'Martedì grasso'), '2027-02-09');
  assert.strictEqual(trova(2027, 'Mercoledì delle Ceneri'), '2027-02-10');
  assert.strictEqual(trova(2027, 'Ora legale'), '2027-03-28');
  assert.strictEqual(trova(2027, 'Ora solare'), '2027-10-31');
  assert.strictEqual(trova(2027, 'Festa della mamma'), '2027-05-09');
  assert.strictEqual(trova(2027, 'Corpus Domini'), '2027-05-30');
  for (let anno = 2026; anno <= 2040; anno++) {
    const r = F.ricorrenze(anno);
    assert.deepStrictEqual(r.map((x) => x.data), r.map((x) => x.data).slice().sort(), 'in ordine ' + anno);
    for (const x of r) {
      assert.ok(F.valida(x.data) && x.data.startsWith(anno + '-'), x.nome + ' ' + anno);
      if (/^(Ora |Festa della mamma|Domenica|Ascensione|Pentecoste|Corpus)/.test(x.nome)) {
        assert.strictEqual(F.giornoSettimana(x.data), 6, x.nome + ' di domenica nel ' + anno);
      }
    }
    // l'ora legale cade nell'ultima settimana di marzo, la solare nell'ultima di ottobre
    assert.ok(r.find((x) => x.nome.startsWith('Ora legale')).data >= anno + '-03-25');
    assert.ok(r.find((x) => x.nome.startsWith('Ora solare')).data >= anno + '-10-25');
  }
});

test('la luna di un istante: piena, nuova, quarti e in mezzo', () => {
  // Le lune piene del 2026 gia' verificate (ora UTC)
  for (const iso of ['2026-01-03T10:02:00Z', '2026-05-31T08:45:00Z', '2026-12-24T01:28:00Z']) {
    const l = F.faseLunare(Date.parse(iso));
    assert.ok(l.illuminata > 0.999, iso + ' ' + l.illuminata);
    assert.strictEqual(l.nome, 'Luna piena');
    assert.ok(l.eta > 13.5 && l.eta < 16, 'eta ' + l.eta);
  }
  // Una luna nuova calcolata dal motore: illuminata zero, eta zero
  const nuova = Date.parse(F.fasiLunari(2027).find((x) => x.fase === 'nuova').utc);
  const n = F.faseLunare(nuova + 1000);
  assert.ok(n.illuminata < 0.0001 && n.eta < 0.001 && n.nome === 'Luna nuova');
  // A meta' fra luna nuova e primo quarto: 45 gradi, 14,6% illuminata, crescente
  const primo = Date.parse(F.fasiLunari(2027).find((x) => x.fase === 'primo-quarto').utc);
  const meta = F.faseLunare((nuova + primo) / 2);
  assert.ok(Math.abs(meta.angolo - 45) < 1e-6 && Math.abs(meta.illuminata - 0.1464) < 0.001 && meta.crescente);
  assert.ok(['Luna crescente', 'Primo quarto'].includes(meta.nome));
  assert.strictEqual(F.faseLunare(primo + 3600000).nome, 'Primo quarto');
  // Ogni 6 ore per due mesi: l'angolo cresce sempre (tranne quando riparte da 0)
  let prima = F.faseLunare(Date.parse('2026-09-01T00:00:00Z'));
  for (let t = Date.parse('2026-09-01T06:00:00Z'); t < Date.parse('2026-11-01T00:00:00Z'); t += 6 * 3600000) {
    const ora = F.faseLunare(t);
    assert.ok(ora.angolo > prima.angolo || (prima.angolo > 350 && ora.angolo < 10), new Date(t).toISOString());
    assert.ok(ora.prossimaNuova > t && ora.prossimaPiena > t);
    prima = ora;
  }
});
