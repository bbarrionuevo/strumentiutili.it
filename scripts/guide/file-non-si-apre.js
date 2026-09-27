// Guida: il file non si apre; estensioni, formati, allegati truffa e dati
// nascosti nei file.
// Il riconoscimento dei file negli esempi e nelle tabelle lo fa js/tipo-file.js,
// lo stesso motore di «Che file è?», su byte di prova scritti qui sotto. I
// consigli contro gli allegati truffa sono quelli della Polizia Postale; i
// formati adatti ai documenti quelli delle linee guida AgID.
'use strict';

module.exports = function (ctx) {
  const { h } = ctx;
  const T = ctx.motori.tipoFile;
  const byte = (x) => new Uint8Array(typeof x === 'string' ? Buffer.from(x, 'latin1') : x);
  const esame = (nome, x) => T.riconosci(byte(x), { nome });
  const esa = (x) => Array.from(byte(x).subarray(0, 4)).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  const avviso = (r) => r.avvisi[0] || '';

  // quattro file veri con il nome sbagliato o senza nome
  const HEIC = [0, 0, 0, 0x18, ...Buffer.from('ftypheic'), 0, 0, 0, 0, ...Buffer.from('mif1heic')];
  const casi = [
    ['scansione.dat', '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'],
    ['IMG_2031', HEIC],
    ['foto_documento', '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01'],
    ['allegato', 'PK\x03\x04\x14\x00\x00\x00\x08\x00']
  ].map(([nome, x]) => ({ nome, primi: esa(x), r: esame(nome, x) }));

  // due allegati truffa
  const MZ = 'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff';
  const doppia = esame('fattura_marzo.pdf.exe', MZ);
  const camuffato = esame('bonifico.pdf', MZ);

  const corpo = [
    h.h2('perche', 'Perch&eacute; un file non si apre'),
    h.p('Il telefono e il computer scelgono il programma guardando solo la fine del nome, l&rsquo;<strong>estensione</strong>: .pdf va al lettore di PDF, .jpg alla galleria, .docx a Word. Il contenuto non lo guardano. Per questo un file non si apre in quattro casi tipici:'),
    h.ol([
      '<strong>L&rsquo;estensione manca o &egrave; sbagliata:</strong> file scaricati da portali e gestionali che escono come &laquo;download&raquo; o &laquo;documento.dat&raquo;, allegati passati per chat e chiavette, nomi tagliati.',
      '<strong>Il formato non &egrave; supportato su quel dispositivo:</strong> le foto HEIC dell&rsquo;iPhone su Windows, i file .p7m firmati digitalmente, i messaggi .eml, i documenti Pages o Numbers del Mac.',
      '<strong>Il file &egrave; incompleto o vuoto:</strong> un download interrotto, un allegato di 0 byte, un file ZIP troncato.',
      '<strong>Il file &egrave; protetto:</strong> un PDF con password di apertura, un archivio cifrato.'
    ]),
    h.p('Nei primi due casi il contenuto &egrave; sano: basta capire che cos&rsquo;&egrave; e dargli il nome o il programma giusto. Nel terzo il file va scaricato o richiesto di nuovo; nel quarto serve la password da chi l&rsquo;ha mandato.'),

    h.h2('firme', 'Il contenuto non mente: le &laquo;firme&raquo; dei formati'),
    h.p('Quasi ogni formato comincia con una sequenza di byte fissa, una specie di firma: un PDF comincia sempre con <code>%PDF-</code>, una foto JPEG con i byte FF D8 FF, un archivio ZIP con le lettere PK, un programma per Windows con MZ. &laquo;Che file &egrave;?&raquo; legge quei primi byte, e per i formati che sono contenitori guarda anche dentro: cos&igrave; distingue un documento Word moderno da uno ZIP qualsiasi, perch&eacute; anche i file .docx, .xlsx e .odt sono archivi ZIP.'),
    h.tabella('Quattro file senza nome giusto, riconosciuti dal contenuto', ['Nome ricevuto', 'Primi byte', 'Che cos&rsquo;&egrave;', 'Nome giusto'],
      casi.map((c) => [c.nome, '<code>' + c.primi + '</code>', c.r.tipo.nome, c.r.nomeSuggerito])),
    h.p('Una volta rinominato con l&rsquo;estensione giusta, il file si apre con un doppio clic. Il riconoscimento avviene nel browser: il file non viene caricato su nessun server, cosa importante quando si tratta di documenti personali.'),

    h.h2('formati', 'I formati che creano pi&ugrave; problemi'),
    h.tabella('Con che cosa si aprono', ['Formato', 'Da dove arriva', 'Come si apre'], [
      ['HEIC (.heic)', 'le foto dell&rsquo;iPhone', T.TIPI.heic.apri],
      ['P7M (.p7m)', 'documenti con firma digitale, spesso via PEC', 'Si estrae il documento dalla busta, per esempio con &laquo;Aprire un file P7M&raquo;.'],
      ['EML (.eml)', 'messaggi di posta salvati, gli allegati delle PEC', T.TIPI.eml.apri],
      ['ZIP (.zip)', 'pi&ugrave; file compressi insieme', T.TIPI.zip.apri],
      ['XML (.xml)', 'fatture elettroniche, ricevute della PEC, esportazioni di gestionali', 'Una fattura elettronica si legge con un visualizzatore di fatture; gli altri XML con il browser.']
    ]),
    h.p('Per conservare un documento che deve restare leggibile negli anni servono formati aperti e stabili. L&rsquo;allegato 2 delle linee guida AgID sui documenti informatici indica, formato per formato, se &egrave; adatto alla conservazione: PNG e CSV s&igrave;, JPEG solo per le immagini nate in JPEG, XML solo insieme al suo schema. Per i documenti impaginati il riferimento &egrave; il <strong>PDF/A</strong>, la versione del PDF pensata per l&rsquo;archiviazione a lungo termine: contiene dentro di s&eacute; tutto quello che serve per mostrarlo uguale anche fra molti anni.'),

    h.h2('truffe', 'Allegati truffa: i trucchi pi&ugrave; usati'),
    h.p('Molte truffe via email e PEC puntano su un allegato che sembra un documento e invece &egrave; un programma. Aperto, pu&ograve; rubare password o installare un ransomware, che cifra i file del computer e chiede un riscatto. I trucchi ricorrenti:'),
    h.ul([
      '<strong>La doppia estensione.</strong> Windows, per impostazione predefinita, nasconde le estensioni dei tipi di file conosciuti: &laquo;fattura_marzo.pdf.exe&raquo; appare come &laquo;fattura_marzo.pdf&raquo;.',
      '<strong>Il programma con il nome di un documento.</strong> Un file chiamato &laquo;bonifico.pdf&raquo; che dentro &egrave; un programma.',
      '<strong>Le macro.</strong> Un documento Word o Excel che, appena aperto, chiede di &laquo;abilitare il contenuto&raquo;: le macro sono piccoli programmi, e abilitarle le esegue.',
      '<strong>L&rsquo;archivio compresso.</strong> Uno ZIP, a volte protetto da una password scritta nel messaggio, che contiene un programma: la password serve a non farlo esaminare dall&rsquo;antivirus della posta.',
      '<strong>La finta fattura di cortesia.</strong> Una PEC da un&rsquo;azienda sconosciuta con oggetto &laquo;Emissione fattura&raquo; e un PDF &laquo;di cortesia&raquo; allegato: la Polizia Postale l&rsquo;ha segnalata come veicolo di ransomware.'
    ]),
    h.esempio('due allegati controllati con &laquo;Che file &egrave;?&raquo;', [
      '&laquo;fattura_marzo.pdf.exe&raquo;: ' + doppia.tipo.nome + '. Avviso: &laquo;' + avviso(doppia) + '&raquo;',
      '&laquo;bonifico.pdf&raquo;: ' + camuffato.tipo.nome + '. Avviso: &laquo;' + avviso(camuffato) + '&raquo;'
    ], 'In tutti e due i casi il nome dice documento e il contenuto dice programma: basta questo per non aprirli.'),
    h.h3('Che cosa fare'),
    h.ul([
      'Se il mittente &egrave; sconosciuto, non aprire gli allegati e non cliccare sui link. Se &egrave; qualcuno che conosci ma il file non te lo aspettavi, chiedi conferma per un&rsquo;altra via.',
      'Diffida dei messaggi che mettono fretta o minacciano: multe, indagini, conti bloccati. Il nome del mittente si falsifica facilmente; conta l&rsquo;indirizzo vero e il sito dove portano i link.',
      'Fai vedere le estensioni dei file nelle impostazioni di Windows (Esplora file, &laquo;Estensioni nomi file&raquo;), cos&igrave; la doppia estensione si vede.',
      'Se hai aperto qualcosa di sospetto, scollega il computer dalla rete, fai una scansione con un antivirus aggiornato e cambia le password da un altro dispositivo.',
      'Segnala i messaggi alla Polizia Postale dal suo sito, il Commissariato di P.S. online.'
    ]),

    h.h2('dati-nascosti', 'Prima di mandare un file: che cosa si porta dietro'),
    h.p('Anche i file innocui possono dire pi&ugrave; di quanto sembra. Le <strong>foto del telefono</strong> contengono una scheda di dati chiamata EXIF, con la posizione GPS dello scatto, precisa a pochi metri, la data e l&rsquo;ora e il modello del telefono: la foto di un oggetto messo in vendita, scattata in casa, pu&ograve; rivelare l&rsquo;indirizzo. Le app di chat di solito tolgono questi dati quando comprimono la foto, ma se la mandi come file, per email o con un link a un archivio online, arriva l&rsquo;originale con tutto quello che contiene.'),
    h.p('Lo strumento &laquo;Togliere i dati nascosti dalle foto&raquo; mostra che cosa c&rsquo;&egrave; in una foto e lo toglie senza ricomprimere l&rsquo;immagine, nel browser. Per i documenti vale lo stesso principio: un file Word pu&ograve; conservare commenti e revisioni, un PDF il nome dell&rsquo;autore; prima di mandarli fuori conviene controllare le propriet&agrave; del file, o esportare un PDF pulito.')
  ].join('\n');

  return {
    slug: 'file-non-si-apre',
    tema: 'documenti',
    titolo: 'Il file non si apre: estensioni, formati e allegati truffa',
    titoloBreve: 'Il file non si apre? Estensioni, formati e allegati truffa',
    descrizione: 'Perché un file non si apre, come capire che cos’è davvero da quello che contiene, con che cosa si aprono HEIC, P7M, EML e ZIP, come riconoscere gli allegati truffa con la doppia estensione e quali dati nascosti ci sono nelle foto.',
    pubblicata: '2026-09-27',
    aggiornata: '2026-09-27',
    introduzione: 'Un allegato che il telefono non sa aprire, un file che si chiama &laquo;download&raquo;, una fattura in PDF che arriva da un mittente sconosciuto. Questa guida spiega come capire che cos&rsquo;&egrave; davvero un file, come aprirlo e quando invece non va aperto, con esempi riconosciuti dal motore dello strumento &laquo;Che file &egrave;?&raquo;.',
    riassunto: [
      'Il sistema sceglie il programma dall&rsquo;estensione; il contenuto dice che cos&rsquo;&egrave; davvero il file, dai suoi primi byte.',
      'Un &laquo;.pdf&raquo; che dentro &egrave; un programma, o un &laquo;.pdf.exe&raquo;, &egrave; un allegato truffa: non si apre.',
      'Le foto portano con s&eacute; posizione, data e telefono: prima di mandarle come file conviene togliere questi dati.'
    ],
    strumenti: [
      { href: '/utilita-web/che-file-e/', testo: 'Che file &egrave;?' },
      { href: '/utilita-web/rimuovi-dati-foto/', testo: 'Togli i dati dalle foto' }
    ],
    corpo,
    errori: [
      'Rinominare un file a caso sperando che si apra: prima bisogna sapere che cos&rsquo;&egrave;.',
      'Fidarsi dell&rsquo;icona: anche un programma pu&ograve; avere l&rsquo;icona di un PDF.',
      'Abilitare le macro di un documento arrivato per email da un mittente che non conosci.',
      'Aprire l&rsquo;allegato di un messaggio urgente o minaccioso senza verificare chi lo manda.',
      'Pubblicare o vendere online foto scattate in casa senza togliere la posizione.'
    ],
    faq: [
      { d: 'Come faccio a sapere che tipo di file &egrave; se non ha estensione?', r: 'Dal contenuto: i primi byte di quasi ogni formato sono fissi. &laquo;Che file &egrave;?&raquo; li legge nel browser, senza caricare il file, e ti dice tipo, estensione giusta e programma per aprirlo.' },
      { d: 'Rinominare un file pu&ograve; danneggiarlo?', r: 'No, il nome non cambia il contenuto. Ma dargli l&rsquo;estensione sbagliata non lo fa aprire: serve quella del formato vero.' },
      { d: 'Un allegato PDF pu&ograve; essere pericoloso?', r: 'Un file che dentro &egrave; davvero un PDF &egrave; di solito innocuo, ma pu&ograve; contenere link a pagine truffa. Il pericolo maggiore &egrave; il file che si chiama .pdf ma &egrave; un programma.' },
      { d: 'Perch&eacute; le foto dell&rsquo;iPhone non si aprono su Windows?', r: 'Perch&eacute; sono in formato HEIC, che Windows non sempre sa leggere. Si possono convertire in JPG, oppure impostare l&rsquo;iPhone perch&eacute; scatti direttamente in JPG.' },
      { d: 'Dove segnalo una email o una PEC truffa?', r: 'Alla Polizia Postale, dal sito del Commissariato di P.S. online. Non rispondere al mittente e non aprire gli allegati.' }
    ],
    fonti: [
      { href: 'https://www.commissariatodips.it/notizie/articolo/nuovo-fenomeno-di-spammingattenzione-agli-allegati-ricevuti-da-false-pec/index.html', testo: 'Polizia Postale, &laquo;Attenzione agli allegati ricevuti da false PEC&raquo;', dopo: ': la finta fattura di cortesia e i consigli contro i ransomware.' },
      { href: 'https://www.commissariatodips.it/notizie/articolo/attenzione-alle-false-email/index.html', testo: 'Polizia Postale, &laquo;Attenzione alle false email&raquo;', dopo: '.' },
      { href: 'https://www.agid.gov.it/sites/agid/files/2024-05/linee_guida_sul_documento_informatico.pdf', testo: 'AgID, Linee guida sulla formazione, gestione e conservazione dei documenti informatici', dopo: '.' },
      { href: 'https://www.agid.gov.it/sites/default/files/repository_files/allegato_2_formati_di_file_e_riversamento.pdf', testo: 'AgID, allegato 2 alle linee guida: formati di file e riversamento', dopo: ': quali formati sono adatti alla conservazione.' },
      'D.Lgs. 7 marzo 2005, n. 82, art. 20: validit&agrave; dei documenti informatici.'
    ]
  };
};
