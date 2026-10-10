// js/canone-tv.js — Le date del canone TV, senza interfaccia.
//
// Due domande che chi arriva sulle pagine del canone si fa sempre:
//   - se presento oggi la dichiarazione di non detenzione (quadro A), per
//     quale periodo vale?
//   - da quando spetta l'esenzione a chi compie 75 anni?
// Le regole sono quelle delle istruzioni ufficiali dell'Agenzia delle Entrate
// (dichiarazione sostitutiva relativa al canone TV; esenzione e rimborso per
// gli ultrasettantacinquenni). Le date si trattano come testo AAAA-MM-GG, cosi'
// il risultato non dipende dal fuso orario del dispositivo.
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.CanoneTv = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function leggiData(testo) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(testo || ''));
    if (!m) return null;
    const [a, me, g] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const prova = new Date(Date.UTC(a, me - 1, g));
    if (prova.getUTCFullYear() !== a || prova.getUTCMonth() !== me - 1 || prova.getUTCDate() !== g) return null;
    return { a, me, g };
  }

  const confronta = (x, y) => (x.a - y.a) || (x.me - y.me) || (x.g - y.g);
  const iso = (d) => `${d.a}-${String(d.me).padStart(2, '0')}-${String(d.g).padStart(2, '0')}`;

  /**
   * Il 31 gennaio dell'anno, spostato al lunedi' se cade di sabato o di
   * domenica: gli adempimenti fiscali che scadono il sabato o in un giorno
   * festivo passano al primo giorno lavorativo successivo (D.L. 70/2011,
   * art. 7, comma 2, lettera h). Per il 2026 la scheda dell'Agenzia indicava
   * proprio cosi' il termine: "dal 1 luglio 2025 al 2 febbraio 2026" (il 31
   * gennaio era un sabato).
   */
  function termineGennaio(anno) {
    const giorno = new Date(Date.UTC(anno, 0, 31)).getUTCDay();
    const slittamento = giorno === 6 ? 2 : giorno === 0 ? 1 : 0;
    const d = new Date(Date.UTC(anno, 0, 31 + slittamento));
    return { a: d.getUTCFullYear(), me: d.getUTCMonth() + 1, g: d.getUTCDate() };
  }

  /**
   * Per quale periodo vale la dichiarazione di non detenzione presentata il
   * giorno indicato.
   *   dal 1 luglio al 31 dicembre -> tutto l'anno successivo
   *   dal 1 gennaio al termine di gennaio -> tutto l'anno in corso
   *   da li' al 30 giugno -> solo il secondo semestre dell'anno in corso
   * Restituisce { anno, periodo: 'intero' | 'secondo', termine } dove termine
   * e' l'ultimo giorno utile per coprire l'intero anno indicato.
   */
  function effettoNonDetenzione(dataPresentazione) {
    const d = leggiData(dataPresentazione);
    if (!d) return null;
    if (d.me >= 7) return { anno: d.a + 1, periodo: 'intero', termine: iso(termineGennaio(d.a + 1)) };
    const termine = termineGennaio(d.a);
    if (confronta(d, termine) <= 0) return { anno: d.a, periodo: 'intero', termine: iso(termine) };
    return { anno: d.a, periodo: 'secondo', termine: iso(termine) };
  }

  /**
   * Da quando spetta l'esenzione over 75, per l'anno indicato.
   *   75 anni compiuti entro il 31 gennaio -> tutto l'anno
   *   compiuti dal 1 febbraio al 31 luglio -> secondo semestre
   *   compiuti dopo il 31 luglio -> niente per quell'anno: si parte dall'anno dopo
   * Restituisce { periodo: 'intero' | 'secondo' | 'nessuno', compleanno75 }.
   * Chi nasce il 29 febbraio compie gli anni, negli anni non bisestili, il
   * 1 marzo: per questa regola non cambia nulla, marzo e' nello stesso semestre.
   */
  function esenzioneOver75(dataNascita, anno) {
    const n = leggiData(dataNascita);
    const a = Number(anno);
    if (!n || !Number.isInteger(a)) return null;
    const c = new Date(Date.UTC(n.a + 75, n.me - 1, n.g));
    const compleanno = { a: c.getUTCFullYear(), me: c.getUTCMonth() + 1, g: c.getUTCDate() };
    const esito = (periodo) => ({ periodo, compleanno75: iso(compleanno) });
    if (confronta(compleanno, { a, me: 1, g: 31 }) <= 0) return esito('intero');
    if (confronta(compleanno, { a, me: 7, g: 31 }) <= 0) return esito('secondo');
    return esito('nessuno');
  }

  /**
   * La soglia di reddito (proprio e del coniuge, anno precedente) da barrare
   * nel modello: 6.713,98 euro fino al 2017, 8.000 euro dal 2018 (resa
   * stabile dall'art. 1, comma 355, della legge 160/2019).
   */
  function sogliaReddito(anno) {
    const a = Number(anno);
    if (!Number.isInteger(a)) return null;
    return a <= 2017 ? 6713.98 : 8000;
  }

  return { effettoNonDetenzione, esenzioneOver75, sogliaReddito, termineGennaio: (a) => iso(termineGennaio(a)) };
});
