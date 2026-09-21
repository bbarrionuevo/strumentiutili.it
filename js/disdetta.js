// js/disdetta.js — Generatore di comunicazioni di recesso e disdetta
//
// Il testo viene composto nel browser mentre l'utente scrive; il PDF è generato con pdf-lib,
// caricata solo quando serve davvero. Nessun dato personale viene trasmesso o salvato.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PDF_LIB_URL = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';

  const SERVIZI = {
    energia: {
      nome: 'fornitura di energia elettrica',
      campi: ['campi-energia'],
      identificativo: () => ({ etichetta: 'Codice POD', valore: $('pod').value.trim() }),
      indirizzo: () => $('indirizzo-fornitura').value.trim(),
      nota: 'Per luce e gas, quando il recesso serve a cambiare venditore è di norma il nuovo venditore a esercitarlo insieme alla richiesta di switch. Questo modello è utile soprattutto per la cessazione della fornitura o quando il fornitore chiede una comunicazione diretta.'
    },
    gas: {
      nome: 'fornitura di gas naturale',
      campi: ['campi-gas'],
      identificativo: () => ({ etichetta: 'Codice PDR', valore: $('pdr').value.trim() }),
      indirizzo: () => $('indirizzo-fornitura-gas').value.trim(),
      nota: 'Per luce e gas, quando il recesso serve a cambiare venditore è di norma il nuovo venditore a esercitarlo insieme alla richiesta di switch. Questo modello è utile soprattutto per la cessazione della fornitura o quando il fornitore chiede una comunicazione diretta.'
    },
    internet: {
      nome: 'servizio di connessione a internet',
      campi: ['campi-telco'],
      identificativo: () => ({ etichetta: 'Numero della linea', valore: $('numero-linea').value.trim() }),
      indirizzo: () => '',
      nota: 'Per i contratti di comunicazione elettronica la legge 40/2007 prevede che il preavviso richiesto non possa superare i trenta giorni e che non siano addebitate spese non giustificate da costi dell\'operatore.'
    },
    telefonia: {
      nome: 'servizio di telefonia',
      campi: ['campi-telco'],
      identificativo: () => ({ etichetta: 'Numero della linea', valore: $('numero-linea').value.trim() }),
      indirizzo: () => '',
      nota: 'Per i contratti di comunicazione elettronica la legge 40/2007 prevede che il preavviso richiesto non possa superare i trenta giorni e che non siano addebitate spese non giustificate da costi dell\'operatore.'
    },
    generico: {
      nome: 'contratto',
      campi: [],
      identificativo: () => ({ etichetta: '', valore: '' }),
      indirizzo: () => '',
      nota: 'Per i contratti diversi da energia e comunicazioni elettroniche i termini di recesso sono quelli previsti dal contratto stesso: controlla la clausola dedicata prima di inviare la comunicazione.'
    }
  };

  const MOTIVI = {
    cessazione: {
      oggetto: 'Comunicazione di recesso e richiesta di cessazione',
      corpo: (d) => `con la presente comunico il recesso dal contratto sopra indicato, relativo alla ${d.servizioNome}, chiedendo la conseguente cessazione del servizio${d.decorrenza ? ` a decorrere dal ${d.decorrenza}` : ''}.`,
      chiusura: 'Chiedo conferma scritta dell\'avvenuta cessazione e l\'invio della fattura di chiusura, con l\'indicazione delle eventuali somme a conguaglio.'
    },
    cambio: {
      oggetto: 'Comunicazione di recesso per passaggio ad altro fornitore',
      corpo: (d) => `con la presente comunico il recesso dal contratto sopra indicato, relativo alla ${d.servizioNome}, in quanto ho sottoscritto un contratto con un altro fornitore${d.decorrenza ? `, con decorrenza richiesta dal ${d.decorrenza}` : ''}.`,
      chiusura: 'Chiedo che non siano addebitate penali o spese non previste dal contratto e che mi sia inviata la fattura di chiusura.'
    },
    ripensamento: {
      oggetto: 'Esercizio del diritto di ripensamento',
      corpo: (d) => `con la presente esercito il diritto di ripensamento previsto per i contratti conclusi a distanza o fuori dai locali commerciali, con riferimento al contratto sopra indicato relativo alla ${d.servizioNome}, sottoscritto${d.dataContratto ? ` in data ${d.dataContratto}` : ' di recente'}.`,
      chiusura: 'Chiedo pertanto che il contratto sia considerato privo di effetti, che non sia dato corso ad alcuna attivazione e che mi sia restituita ogni somma eventualmente già corrisposta.'
    },
    modifiche: {
      oggetto: 'Comunicazione di recesso per modifica unilaterale delle condizioni',
      corpo: (d) => `con la presente comunico il recesso dal contratto sopra indicato, relativo alla ${d.servizioNome}, a seguito della modifica unilaterale delle condizioni contrattuali che mi è stata comunicata${d.decorrenza ? `, con decorrenza dal ${d.decorrenza}` : ''}.`,
      chiusura: 'Trattandosi di recesso esercitato a seguito di modifica delle condizioni, chiedo che non siano applicati costi di recesso e che mi sia inviata conferma scritta.'
    }
  };

  // Controlli di forma non bloccanti: segnalano una possibile distrazione, senza impedire la generazione
  const FORMATI = {
    pod: { regola: /^IT\d{3}E[A-Z0-9]{8}$/i, messaggio: 'Il formato del POD di norma è IT seguito da tre cifre, la lettera E e otto caratteri. Verifica il dato in bolletta.' },
    pdr: { regola: /^\d{14}$/, messaggio: 'Il PDR è di norma composto da quattordici cifre. Verifica il dato in bolletta.' },
    'codice-fiscale': { regola: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i, messaggio: 'Il formato non corrisponde a quello abituale del codice fiscale. Controlla il dato sul documento.' },
    cap: { regola: /^\d{5}$/, messaggio: 'Il CAP italiano è composto da cinque cifre.' }
  };

  function dataItaliana(valoreIso) {
    if (!valoreIso) return '';
    const parti = valoreIso.split('-');
    if (parti.length !== 3) return valoreIso;
    return `${parti[2]}/${parti[1]}/${parti[0]}`;
  }

  function oggi() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selServizio = $('servizio');
    if (!selServizio) return;

    const selMotivo = $('motivo');
    const anteprima = $('anteprima');
    const errore = $('errore');
    const stato = $('stato');
    const notaMotivo = $('nota-motivo');

    const CAMPI_TESTO = ['nome', 'cognome', 'nato-a', 'nato-il', 'codice-fiscale', 'telefono-contatto', 'indirizzo', 'cap', 'citta',
      'fornitore', 'fornitore-indirizzo', 'numero-contratto', 'data-contratto', 'pod', 'indirizzo-fornitura', 'pdr',
      'indirizzo-fornitura-gas', 'numero-linea', 'codice-migrazione', 'decorrenza', 'luogo', 'note'];

    function mostraCampiServizio() {
      const servizio = SERVIZI[selServizio.value];
      ['campi-energia', 'campi-gas', 'campi-telco'].forEach((id) => {
        const box = $(id);
        if (box) box.classList.toggle('hidden', !servizio.campi.includes(id));
      });
      notaMotivo.textContent = servizio.nota;
      componi();
    }

    function verificaFormato(id) {
      const campo = $(id);
      const avviso = $(`avviso-${id}`);
      if (!campo || !avviso) return;
      const valore = campo.value.trim().replace(/\s/g, '');
      const formato = FORMATI[id];
      avviso.textContent = (valore && formato && !formato.regola.test(valore)) ? formato.messaggio : '';
    }

    function raccogliDati() {
      const servizio = SERVIZI[selServizio.value];
      const identificativo = servizio.identificativo();
      return {
        nome: $('nome').value.trim(),
        cognome: $('cognome').value.trim(),
        natoA: $('nato-a').value.trim(),
        natoIl: dataItaliana($('nato-il').value),
        codiceFiscale: $('codice-fiscale').value.trim().toUpperCase(),
        contatto: $('telefono-contatto').value.trim(),
        indirizzo: $('indirizzo').value.trim(),
        cap: $('cap').value.trim(),
        citta: $('citta').value.trim(),
        fornitore: $('fornitore').value.trim(),
        fornitoreIndirizzo: $('fornitore-indirizzo').value.trim(),
        numeroContratto: $('numero-contratto').value.trim(),
        dataContratto: dataItaliana($('data-contratto').value),
        decorrenza: dataItaliana($('decorrenza').value),
        luogo: $('luogo').value.trim(),
        note: $('note').value.trim(),
        codiceMigrazione: $('codice-migrazione') ? $('codice-migrazione').value.trim() : '',
        identificativo,
        indirizzoFornitura: servizio.indirizzo(),
        servizioNome: servizio.nome
      };
    }

    // Il testo si costruisce sempre, usando segnaposto per i dati mancanti: l'anteprima
    // mostra subito che cosa resta da compilare invece di restare vuota.
    function componi() {
      const d = raccogliDati();
      const motivo = MOTIVI[selMotivo.value];
      const vuoto = (valore, segnaposto) => valore || `[${segnaposto}]`;

      const mittente = [
        `${vuoto(d.nome, 'Nome')} ${vuoto(d.cognome, 'Cognome')}`.trim(),
        d.natoA || d.natoIl ? `Nato/a a ${vuoto(d.natoA, 'luogo')} il ${vuoto(d.natoIl, 'data')}` : '',
        d.codiceFiscale ? `Codice fiscale: ${d.codiceFiscale}` : '',
        vuoto(d.indirizzo, 'Indirizzo'),
        `${vuoto(d.cap, 'CAP')} ${vuoto(d.citta, 'Città')}`.trim(),
        d.contatto ? `Contatto: ${d.contatto}` : ''
      ].filter(Boolean);

      const destinatario = ['Spett.le', vuoto(d.fornitore, 'Nome del fornitore'), d.fornitoreIndirizzo].filter(Boolean);

      const riferimenti = [
        `Contratto n. ${vuoto(d.numeroContratto, 'numero di contratto o codice cliente')}`,
        d.dataContratto ? `Data di sottoscrizione: ${d.dataContratto}` : '',
        d.identificativo.etichetta ? `${d.identificativo.etichetta}: ${vuoto(d.identificativo.valore, 'codice')}` : '',
        d.indirizzoFornitura ? `Indirizzo di fornitura: ${d.indirizzoFornitura}` : '',
        d.codiceMigrazione ? `Codice di migrazione: ${d.codiceMigrazione}` : ''
      ].filter(Boolean);

      const testo = [
        mittente.join('\n'),
        '',
        destinatario.join('\n'),
        '',
        `${vuoto(d.luogo, 'Luogo')}, ${oggi()}`,
        '',
        `Oggetto: ${motivo.oggetto} — ${riferimenti[0]}`,
        '',
        riferimenti.join('\n'),
        '',
        'Egregi Signori,',
        motivo.corpo(d),
        '',
        motivo.chiusura,
        d.note ? `\n${d.note}` : '',
        '',
        'Resto a disposizione per ogni comunicazione e porgo distinti saluti.',
        '',
        '',
        'Firma ________________________'
      ].filter((riga) => riga !== null).join('\n');

      anteprima.textContent = testo;
      return testo;
    }

    // ---- Eventi -------------------------------------------------------------
    selServizio.addEventListener('change', mostraCampiServizio);
    selMotivo.addEventListener('change', componi);
    CAMPI_TESTO.forEach((id) => {
      const campo = $(id);
      if (!campo) return;
      campo.addEventListener('input', () => { verificaFormato(id); componi(); });
      campo.addEventListener('change', () => { verificaFormato(id); componi(); });
    });

    // ---- Copia, stampa, PDF -------------------------------------------------
    $('copia').addEventListener('click', async () => {
      errore.textContent = '';
      try {
        await navigator.clipboard.writeText(componi());
        stato.textContent = 'Testo copiato negli appunti.';
        setTimeout(() => { stato.textContent = ''; }, 2500);
      } catch (e) {
        errore.textContent = 'Il browser non ha consentito la copia automatica: seleziona il testo dell\'anteprima e copialo a mano.';
      }
    });

    $('stampa').addEventListener('click', () => {
      const testo = componi();
      const finestra = window.open('', '_blank');
      if (!finestra) {
        errore.textContent = 'Il browser ha bloccato la finestra di stampa: consenti le finestre pop-up oppure usa il PDF.';
        return;
      }
      const titolo = 'Comunicazione di recesso';
      finestra.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${titolo}</title>` +
        '<style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.6;margin:2.5cm;white-space:pre-wrap;}</style>' +
        `</head><body>${testo.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</body></html>`);
      finestra.document.close();
      finestra.focus();
      finestra.print();
    });

    // pdf-lib pesa circa un megabyte: si carica solo quando l'utente chiede il PDF
    function caricaPdfLib() {
      if (window.PDFLib) return Promise.resolve(window.PDFLib);
      return new Promise((risolvi, rifiuta) => {
        const script = document.createElement('script');
        script.src = PDF_LIB_URL;
        script.crossOrigin = 'anonymous';
        script.onload = () => window.PDFLib ? risolvi(window.PDFLib) : rifiuta(new Error('Libreria PDF non disponibile.'));
        script.onerror = () => rifiuta(new Error('Impossibile scaricare il generatore di PDF: controlla la connessione.'));
        document.head.appendChild(script);
      });
    }

    // Helvetica usa la codifica WinAnsi: le lettere fuori da quel set diventano la lettera base
    function testoSicuro(valore) {
      const ammesso = (ch) => {
        const c = ch.charCodeAt(0);
        return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.indexOf(ch) !== -1;
      };
      return Array.from(String(valore || '')).map((ch) => {
        if (ammesso(ch)) return ch;
        const base = ch.normalize('NFD').charAt(0);
        return ammesso(base) ? base : '?';
      }).join('');
    }

    $('scarica-pdf').addEventListener('click', async () => {
      const bottone = $('scarica-pdf');
      errore.textContent = '';
      stato.textContent = 'Preparazione del PDF...';
      bottone.disabled = true;

      try {
        const PDFLib = await caricaPdfLib();
        const { PDFDocument, StandardFonts, rgb } = PDFLib;
        const documento = await PDFDocument.create();
        const font = await documento.embedFont(StandardFonts.Helvetica);
        const grassetto = await documento.embedFont(StandardFonts.HelveticaBold);

        const LARGHEZZA = 595.28;
        const ALTEZZA = 841.89;
        const MARGINE = 56;
        const CORPO = 11;
        const INTERLINEA = 16;
        const utile = LARGHEZZA - MARGINE * 2;

        let pagina = documento.addPage([LARGHEZZA, ALTEZZA]);
        let y = ALTEZZA - MARGINE;

        const scrivi = (riga, opzioni = {}) => {
          const tipo = opzioni.grassetto ? grassetto : font;
          const dimensione = opzioni.dimensione || CORPO;
          // Va a capo sulla larghezza utile della pagina, parola per parola
          const parole = testoSicuro(riga).split(' ');
          let corrente = '';
          const righe = [];
          for (const parola of parole) {
            const prova = corrente ? `${corrente} ${parola}` : parola;
            if (tipo.widthOfTextAtSize(prova, dimensione) > utile && corrente) {
              righe.push(corrente);
              corrente = parola;
            } else {
              corrente = prova;
            }
          }
          righe.push(corrente);

          for (const testoRiga of righe) {
            if (y < MARGINE + INTERLINEA) {
              pagina = documento.addPage([LARGHEZZA, ALTEZZA]);
              y = ALTEZZA - MARGINE;
            }
            pagina.drawText(testoRiga, { x: MARGINE, y, size: dimensione, font: tipo, color: rgb(0.1, 0.1, 0.1) });
            y -= INTERLINEA;
          }
        };

        componi().split('\n').forEach((riga) => {
          if (!riga.trim()) { y -= INTERLINEA * 0.6; return; }
          scrivi(riga, { grassetto: riga.startsWith('Oggetto:') });
        });

        const byte = await documento.save();
        const blob = new Blob([byte], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const cognome = $('cognome').value.trim()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^A-Za-z0-9-]/g, '') || 'disdetta';
        link.href = url;
        link.download = `Disdetta_${cognome}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // revoca differita: una revoca immediata può interrompere il download in alcuni browser
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        stato.textContent = 'PDF scaricato: controlla il documento e firmalo.';
      } catch (err) {
        stato.textContent = '';
        errore.textContent = window.StrumentiErrors
          ? window.StrumentiErrors.friendlyErrorMessage(err, 'Non è stato possibile generare il PDF. Puoi copiare il testo o stamparlo.')
          : (err.message || 'Non è stato possibile generare il PDF.');
      } finally {
        bottone.disabled = false;
      }
    });

    mostraCampiServizio();
  });
})();
