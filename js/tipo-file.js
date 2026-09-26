// js/tipo-file.js — "Che file è?": riconosce un file dai suoi byte.
//
// Il nome e l'estensione possono mancare o mentire (fattura.pdf.exe); i
// primi byte di quasi ogni formato invece sono fissi: %PDF, PK per gli ZIP,
// FF D8 FF per le foto JPEG... Qui si leggono quelli, e per i contenitori si
// guarda dentro: un .docx e' uno ZIP con la cartella word/, un vecchio .doc
// e' un file OLE con lo stream "WordDocument", un .p7m e' una busta di firma
// con dentro un altro documento.
//
// Si passano l'inizio del file (bastano 64 KB) e, per ZIP e simili, la fine:
//   riconosci(inizio, { fine, dimensione, nome, P7m })
// Niente DOM e niente rete: funziona nel browser (window.TipoFile) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TipoFile = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var INIZIO = 64 * 1024;
  var FINE = 256 * 1024;

  // ------------------------------------------------------------ catalogo

  // Per ogni tipo: estensione, MIME, nome in italiano, categoria e con che
  // cosa si apre. Le categorie servono all'interfaccia (icona, anteprima).
  var T = {};
  function tipo(id, estensione, mime, nome, categoria, apri) {
    T[id] = { id: id, estensione: estensione, mime: mime, nome: nome, categoria: categoria, apri: apri || '' };
  }
  var BROWSER = 'Si apre con il browser (Chrome, Edge, Safari, Firefox).';
  var OFFICE_W = 'Microsoft Word, LibreOffice Writer, Google Documenti o Pages (Mac e iPhone).';
  var OFFICE_X = 'Microsoft Excel, LibreOffice Calc, Google Fogli o Numbers (Mac e iPhone).';
  var OFFICE_P = 'Microsoft PowerPoint, LibreOffice Impress, Google Presentazioni o Keynote (Mac e iPhone).';
  var FOTO = 'Si apre con il visualizzatore di foto del telefono o del computer, o con il browser.';
  var LETTORE = 'Si apre con il lettore multimediale: VLC funziona su tutti i sistemi.';
  var ARCHIVIO = 'Su Windows e Mac si apre con doppio clic; per RAR e 7z serve 7-Zip (Windows), Keka (Mac) o un gestore di file che li supporti (Android, iPhone).';
  var TESTO = 'Si apre con un editor di testo: Blocco note (Windows), TextEdit (Mac) o qualsiasi app di note.';

  // documenti
  tipo('pdf', 'pdf', 'application/pdf', 'Documento PDF', 'documento', 'Si apre con il browser o con Adobe Acrobat Reader, su qualsiasi dispositivo.');
  tipo('docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Documento Word', 'documento', OFFICE_W);
  tipo('docm', 'docm', 'application/vnd.ms-word.document.macroEnabled.12', 'Documento Word con macro', 'documento', OFFICE_W);
  tipo('xlsx', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Foglio Excel', 'documento', OFFICE_X);
  tipo('xlsm', 'xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12', 'Foglio Excel con macro', 'documento', OFFICE_X);
  tipo('pptx', 'pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Presentazione PowerPoint', 'documento', OFFICE_P);
  tipo('odt', 'odt', 'application/vnd.oasis.opendocument.text', 'Documento OpenDocument (Writer)', 'documento', 'LibreOffice Writer, Microsoft Word o Google Documenti.');
  tipo('ods', 'ods', 'application/vnd.oasis.opendocument.spreadsheet', 'Foglio OpenDocument (Calc)', 'documento', 'LibreOffice Calc, Microsoft Excel o Google Fogli.');
  tipo('odp', 'odp', 'application/vnd.oasis.opendocument.presentation', 'Presentazione OpenDocument (Impress)', 'documento', 'LibreOffice Impress, Microsoft PowerPoint o Google Presentazioni.');
  tipo('odg', 'odg', 'application/vnd.oasis.opendocument.graphics', 'Disegno OpenDocument (Draw)', 'documento', 'LibreOffice Draw.');
  tipo('epub', 'epub', 'application/epub+zip', 'Libro elettronico EPUB', 'documento', 'Libri di Google Play, Apple Libri, Calibre o la maggior parte degli e-reader (non il Kindle, che vuole la conversione).');
  tipo('xps', 'xps', 'application/vnd.ms-xpsdocument', 'Documento XPS', 'documento', 'Visualizzatore XPS di Windows; negli altri sistemi conviene convertirlo in PDF.');
  tipo('doc', 'doc', 'application/msword', 'Documento Word (vecchio formato)', 'documento', OFFICE_W);
  tipo('xls', 'xls', 'application/vnd.ms-excel', 'Foglio Excel (vecchio formato)', 'documento', OFFICE_X);
  tipo('ppt', 'ppt', 'application/vnd.ms-powerpoint', 'Presentazione PowerPoint (vecchio formato)', 'documento', OFFICE_P);
  tipo('msg', 'msg', 'application/vnd.ms-outlook', 'Email di Outlook', 'posta', 'Microsoft Outlook; senza Outlook, visualizzatori gratuiti di file .msg.');
  tipo('ole', 'doc', 'application/x-ole-storage', 'Documento Office (vecchio formato)', 'documento', 'Microsoft Office o LibreOffice.');
  tipo('rtf', 'rtf', 'application/rtf', 'Documento RTF', 'documento', 'Word, LibreOffice, WordPad (Windows) o TextEdit (Mac).');
  tipo('ps', 'ps', 'application/postscript', 'File PostScript', 'documento', 'Programmi di grafica o di stampa; conviene convertirlo in PDF.');
  tipo('djvu', 'djvu', 'image/vnd.djvu', 'Documento DjVu', 'documento', 'Lettori DjVu gratuiti (per esempio Sumatra PDF su Windows).');
  // firme, PEC, posta
  tipo('p7m', 'p7m', 'application/pkcs7-mime', 'Documento con firma digitale (.p7m, CAdES)', 'firma', 'Si apre con un programma di firma (Dike, ArubaSign) o con lo strumento qui sotto, che estrae il documento.');
  tipo('p7s', 'p7s', 'application/pkcs7-signature', 'Firma digitale separata (.p7s)', 'firma', 'Contiene solo la firma: il documento firmato è un altro file, spedito insieme a questo.');
  tipo('der', 'der', 'application/x-x509-ca-cert', 'Certificato o chiave in formato DER', 'firma', 'Doppio clic su Windows o Mac per vedere il certificato.');
  tipo('pem_cert', 'pem', 'application/x-pem-file', 'Certificato digitale (PEM)', 'firma', 'Doppio clic su Windows o Mac, dopo averlo rinominato in .crt.');
  tipo('pem_chiave', 'pem', 'application/x-pem-file', 'Chiave privata (PEM)', 'firma', 'È una chiave segreta: non si apre, si usa in un programma di firma o di cifratura.');
  tipo('pgp', 'asc', 'application/pgp-encrypted', 'Messaggio o chiave PGP', 'firma', 'Programmi PGP come Kleopatra (Windows) o GPG Suite (Mac).');
  tipo('eml', 'eml', 'message/rfc822', 'Email (.eml)', 'posta', 'Si apre con Outlook, Thunderbird, Posta di Windows o Mail (Mac e iPhone).');
  tipo('pec', 'eml', 'message/rfc822', 'Messaggio di posta certificata (PEC)', 'posta', 'Si apre con il programma di posta. Il messaggio originale è dentro, come allegato postacert.eml.');
  tipo('daticert', 'xml', 'application/xml', 'Ricevuta della PEC (daticert.xml)', 'posta', 'Sono i dati tecnici della ricevuta PEC: mittente, destinatario, data e ora. Si legge con il browser.');
  tipo('tnef', 'dat', 'application/vnd.ms-tnef', 'Allegato di Outlook (winmail.dat)', 'posta', 'Contiene gli allegati veri di un’email mandata da Outlook: si aprono con programmi come Winmail Opener o app «TNEF viewer».');
  tipo('fatturapa', 'xml', 'application/xml', 'Fattura elettronica (FatturaPA, XML)', 'fattura', 'Si legge con il visualizzatore di fatture qui sotto o nel cassetto fiscale dell’Agenzia delle Entrate.');
  // immagini
  tipo('jpg', 'jpg', 'image/jpeg', 'Foto JPEG', 'immagine', FOTO);
  tipo('png', 'png', 'image/png', 'Immagine PNG', 'immagine', FOTO);
  tipo('gif', 'gif', 'image/gif', 'Immagine GIF', 'immagine', FOTO);
  tipo('webp', 'webp', 'image/webp', 'Immagine WebP', 'immagine', FOTO);
  tipo('heic', 'heic', 'image/heic', 'Foto HEIC (iPhone)', 'immagine', 'Si apre su iPhone e Mac. Su Windows e Android spesso serve convertirla in JPG.');
  tipo('avif', 'avif', 'image/avif', 'Immagine AVIF', 'immagine', 'Si apre con i browser recenti; per altri programmi conviene convertirla in JPG.');
  tipo('bmp', 'bmp', 'image/bmp', 'Immagine BMP', 'immagine', FOTO);
  tipo('ico', 'ico', 'image/x-icon', 'Icona (ICO)', 'immagine', FOTO);
  tipo('cur', 'cur', 'image/x-icon', 'Cursore di Windows (CUR)', 'immagine', FOTO);
  tipo('tif', 'tif', 'image/tiff', 'Immagine TIFF', 'immagine', 'Visualizzatore di foto di Windows o Anteprima (Mac). Anche molti file RAW delle fotocamere sono fatti così.');
  tipo('psd', 'psd', 'image/vnd.adobe.photoshop', 'Immagine Photoshop (PSD)', 'immagine', 'Adobe Photoshop, GIMP o Photopea (nel browser).');
  tipo('jxl', 'jxl', 'image/jxl', 'Immagine JPEG XL', 'immagine', 'Programmi di grafica recenti; per gli altri conviene convertirla.');
  tipo('jp2', 'jp2', 'image/jp2', 'Immagine JPEG 2000', 'immagine', 'Programmi di grafica come GIMP o IrfanView.');
  tipo('svg', 'svg', 'image/svg+xml', 'Disegno vettoriale SVG', 'immagine', 'Si apre con il browser, Inkscape o Illustrator.');
  tipo('dicom', 'dcm', 'application/dicom', 'Immagine medica DICOM', 'immagine', 'Visualizzatori DICOM gratuiti (per esempio quello del CD delle lastre, o Weasis).');
  tipo('raw_cr', 'cr2', 'image/x-canon-cr2', 'Foto RAW di fotocamera Canon', 'immagine', 'Programmi di fotografia (Lightroom, darktable) o il visualizzatore di foto recente.');
  // audio e video
  tipo('mp3', 'mp3', 'audio/mpeg', 'Audio MP3', 'audio', LETTORE);
  tipo('aac', 'aac', 'audio/aac', 'Audio AAC', 'audio', LETTORE);
  tipo('m4a', 'm4a', 'audio/mp4', 'Audio M4A (anche i vocali dell’iPhone)', 'audio', LETTORE);
  tipo('opus', 'opus', 'audio/ogg', 'Audio Opus (spesso un vocale di WhatsApp)', 'audio', 'Si ascolta con il browser o con VLC.');
  tipo('ogg', 'ogg', 'audio/ogg', 'Audio OGG Vorbis', 'audio', LETTORE);
  tipo('flac', 'flac', 'audio/flac', 'Audio FLAC (senza perdita)', 'audio', LETTORE);
  tipo('wav', 'wav', 'audio/wav', 'Audio WAV', 'audio', LETTORE);
  tipo('amr', 'amr', 'audio/amr', 'Audio AMR (registrazioni dei vecchi telefoni)', 'audio', 'VLC o convertitori audio.');
  tipo('midi', 'mid', 'audio/midi', 'Musica MIDI', 'audio', LETTORE);
  tipo('wma', 'wma', 'audio/x-ms-wma', 'Audio o video Windows Media', 'audio', 'Lettore Windows Media o VLC.');
  tipo('mp4', 'mp4', 'video/mp4', 'Video MP4', 'video', LETTORE);
  tipo('mov', 'mov', 'video/quicktime', 'Video QuickTime (MOV, anche dall’iPhone)', 'video', LETTORE);
  tipo('3gp', '3gp', 'video/3gpp', 'Video 3GP (telefono)', 'video', LETTORE);
  tipo('webm', 'webm', 'video/webm', 'Video WebM', 'video', LETTORE);
  tipo('mkv', 'mkv', 'video/x-matroska', 'Video MKV', 'video', LETTORE);
  tipo('avi', 'avi', 'video/x-msvideo', 'Video AVI', 'video', LETTORE);
  tipo('flv', 'flv', 'video/x-flv', 'Video Flash (FLV)', 'video', LETTORE);
  tipo('mpg', 'mpg', 'video/mpeg', 'Video MPEG', 'video', LETTORE);
  tipo('ts', 'ts', 'video/mp2t', 'Video MPEG-TS (registrazioni TV)', 'video', LETTORE);
  tipo('ogv', 'ogv', 'video/ogg', 'Video OGG Theora', 'video', LETTORE);
  // archivi
  tipo('zip', 'zip', 'application/zip', 'Archivio ZIP', 'archivio', 'Doppio clic su Windows, Mac, Android e iPhone (app File).');
  tipo('rar', 'rar', 'application/vnd.rar', 'Archivio RAR', 'archivio', ARCHIVIO);
  tipo('7z', '7z', 'application/x-7z-compressed', 'Archivio 7z', 'archivio', ARCHIVIO);
  tipo('gz', 'gz', 'application/gzip', 'File compresso GZIP', 'archivio', ARCHIVIO);
  tipo('bz2', 'bz2', 'application/x-bzip2', 'File compresso BZIP2', 'archivio', ARCHIVIO);
  tipo('xz', 'xz', 'application/x-xz', 'File compresso XZ', 'archivio', ARCHIVIO);
  tipo('zst', 'zst', 'application/zstd', 'File compresso Zstandard', 'archivio', ARCHIVIO);
  tipo('tar', 'tar', 'application/x-tar', 'Archivio TAR', 'archivio', ARCHIVIO);
  tipo('cab', 'cab', 'application/vnd.ms-cab-compressed', 'Archivio CAB di Windows', 'archivio', ARCHIVIO);
  tipo('iso', 'iso', 'application/x-iso9660-image', 'Immagine di disco (ISO)', 'archivio', 'Su Windows e Mac si apre con doppio clic, come un CD.');
  tipo('dmg', 'dmg', 'application/x-apple-diskimage', 'Immagine disco del Mac (DMG)', 'archivio', 'Si apre solo su Mac, con doppio clic.');
  tipo('deb', 'deb', 'application/vnd.debian.binary-package', 'Pacchetto di installazione Linux (DEB)', 'programma', 'Si installa su Linux (Debian, Ubuntu).');
  tipo('rpm', 'rpm', 'application/x-rpm', 'Pacchetto di installazione Linux (RPM)', 'programma', 'Si installa su Linux (Fedora, openSUSE).');
  // programmi
  tipo('exe', 'exe', 'application/vnd.microsoft.portable-executable', 'Programma per Windows (EXE)', 'programma', 'Si avvia su Windows. Non aprirlo se non sai da dove viene.');
  tipo('dll', 'dll', 'application/vnd.microsoft.portable-executable', 'Libreria di Windows (DLL)', 'programma', 'Non si apre: è un pezzo di un programma per Windows.');
  tipo('msi', 'msi', 'application/x-msi', 'Pacchetto di installazione Windows (MSI)', 'programma', 'Si installa su Windows. Non aprirlo se non sai da dove viene.');
  tipo('elf', 'elf', 'application/x-executable', 'Programma per Linux o Android (ELF)', 'programma', 'Si avvia su Linux; non è un documento.');
  tipo('macho', 'macho', 'application/x-mach-binary', 'Programma per Mac (Mach-O)', 'programma', 'Si avvia su Mac; non è un documento.');
  tipo('class', 'class', 'application/java-vm', 'Programma Java compilato (.class)', 'programma', 'Serve Java; non è un documento.');
  tipo('jar', 'jar', 'application/java-archive', 'Programma Java (JAR)', 'programma', 'Serve Java installato. Non aprirlo se non sai da dove viene.');
  tipo('apk', 'apk', 'application/vnd.android.package-archive', 'App per Android (APK)', 'programma', 'Si installa su Android. Installa solo app di cui ti fidi: gli APK sono un modo comune per diffondere virus.');
  tipo('ipa', 'ipa', 'application/octet-stream', 'App per iPhone (IPA)', 'programma', 'Si installa su iPhone solo tramite App Store o strumenti per sviluppatori.');
  tipo('dex', 'dex', 'application/octet-stream', 'Codice di un’app Android (DEX)', 'programma', 'Non si apre: è un pezzo di un’app Android.');
  tipo('wasm', 'wasm', 'application/wasm', 'Modulo WebAssembly', 'programma', 'Codice per i browser; non è un documento.');
  tipo('lnk', 'lnk', 'application/x-ms-shortcut', 'Collegamento di Windows (.lnk)', 'programma', 'È un collegamento a un altro file. Attenzione: via email è un trucco usato per avviare virus.');
  tipo('script', 'sh', 'text/x-shellscript', 'Script (comandi da eseguire)', 'programma', 'Contiene comandi: non eseguirlo se non sai cosa fa.');
  // dati e altro
  tipo('sqlite', 'sqlite', 'application/vnd.sqlite3', 'Database SQLite', 'dati', 'DB Browser for SQLite (gratuito).');
  tipo('apkg', 'apkg', 'application/zip', 'Mazzo di flashcard di Anki', 'dati', 'Anki, oppure lo strumento Flashcard di questo sito.');
  tipo('kmz', 'kmz', 'application/vnd.google-earth.kmz', 'Mappa di Google Earth (KMZ)', 'dati', 'Google Earth o Google My Maps.');
  tipo('kml', 'kml', 'application/vnd.google-earth.kml+xml', 'Mappa di Google Earth (KML)', 'dati', 'Google Earth o Google My Maps.');
  tipo('gpx', 'gpx', 'application/gpx+xml', 'Traccia GPS (GPX)', 'dati', 'App di sport e mappe (Strava, Komoot, Google Earth).');
  tipo('ics', 'ics', 'text/calendar', 'Evento di calendario (ICS)', 'dati', 'Si apre con il calendario del telefono, Outlook o Google Calendar.');
  tipo('vcf', 'vcf', 'text/vcard', 'Contatto (vCard)', 'dati', 'Si apre con la rubrica del telefono, Outlook o Google Contatti.');
  tipo('json', 'json', 'application/json', 'Dati JSON', 'testo', TESTO);
  tipo('csv', 'csv', 'text/csv', 'Tabella CSV', 'testo', 'Excel, LibreOffice Calc, Google Fogli o un editor di testo.');
  tipo('xml', 'xml', 'application/xml', 'File XML', 'testo', BROWSER);
  tipo('html', 'html', 'text/html', 'Pagina web (HTML)', 'testo', BROWSER);
  tipo('txt', 'txt', 'text/plain', 'File di testo', 'testo', TESTO);
  tipo('torrent', 'torrent', 'application/x-bittorrent', 'File torrent', 'dati', 'Programmi BitTorrent.');
  tipo('pst', 'pst', 'application/vnd.ms-outlook', 'Archivio di Outlook (PST)', 'posta', 'Microsoft Outlook.');
  tipo('dwg', 'dwg', 'image/vnd.dwg', 'Disegno AutoCAD (DWG)', 'documento', 'AutoCAD o visualizzatori DWG gratuiti.');
  tipo('ttf', 'ttf', 'font/ttf', 'Carattere TrueType', 'font', 'Doppio clic su Windows o Mac per vederlo e installarlo.');
  tipo('otf', 'otf', 'font/otf', 'Carattere OpenType', 'font', 'Doppio clic su Windows o Mac per vederlo e installarlo.');
  tipo('ttc', 'ttc', 'font/collection', 'Raccolta di caratteri (TTC)', 'font', 'Doppio clic su Windows o Mac.');
  tipo('woff', 'woff', 'font/woff', 'Carattere per il web (WOFF)', 'font', 'È un carattere per i siti web; si usa nei programmi di grafica.');
  tipo('woff2', 'woff2', 'font/woff2', 'Carattere per il web (WOFF2)', 'font', 'È un carattere per i siti web; si usa nei programmi di grafica.');
  tipo('vuoto', '', 'application/octet-stream', 'File vuoto', 'altro', 'Non contiene niente: 0 byte. Probabilmente il download o l’invio non è andato a buon fine.');
  tipo('bin', 'bin', 'application/octet-stream', 'Tipo non riconosciuto', 'altro', 'Non è un formato comune. Guarda i primi byte qui sotto, o chiedi a chi te l’ha mandato con che programma l’ha creato.');

  var ESEGUIBILI = { exe: 1, dll: 1, msi: 1, elf: 1, macho: 1, jar: 1, apk: 1, ipa: 1, lnk: 1, script: 1, class: 1, dex: 1, deb: 1, rpm: 1 };

  // ------------------------------------------------------------ byte

  function inizia(b, firma, da) {
    var o = da || 0;
    if (b.length < o + firma.length) return false;
    for (var i = 0; i < firma.length; i++) {
      var f = firma[i];
      var c = typeof f === 'string' ? f.charCodeAt(0) : f;
      if (f !== null && b[o + i] !== c) return false;
    }
    return true;
  }
  function ascii(s) { return s.split(''); }
  function testoAscii(b, da, n) {
    var s = '';
    for (var i = da; i < Math.min(b.length, da + n); i++) s += String.fromCharCode(b[i]);
    return s;
  }
  function cerca(b, s, da, a) {
    var fine = Math.min(b.length, a == null ? b.length : a);
    fuori: for (var i = da || 0; i + s.length <= fine; i++) {
      for (var j = 0; j < s.length; j++) if (b[i + j] !== s.charCodeAt(j)) continue fuori;
      return i;
    }
    return -1;
  }
  // una stringa in UTF-16LE, come i nomi degli stream nei file OLE
  function cercaUtf16(b, s) {
    var byte = [];
    for (var i = 0; i < s.length; i++) { byte.push(s.charCodeAt(i) & 0xff, s.charCodeAt(i) >> 8); }
    fuori: for (var k = 0; k + byte.length <= b.length; k++) {
      for (var j = 0; j < byte.length; j++) if (b[k + j] !== byte[j]) continue fuori;
      return true;
    }
    return false;
  }
  function u16le(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32le(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function u16be(b, o) { return (b[o] << 8) | b[o + 1]; }
  function u32be(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }

  // ------------------------------------------------------------ ZIP

  // I nomi dei file dentro uno ZIP: dalla directory centrale in fondo al
  // file, se c'e' nella parte letta; altrimenti dalle intestazioni locali
  // all'inizio.
  function vociZip(inizio, fine, dimensione) {
    var voci = [];
    var coda = fine || inizio;
    var base = fine ? dimensione - fine.length : 0;
    for (var i = coda.length - 22; i >= Math.max(0, coda.length - 22 - 65535); i--) {
      if (coda[i] === 0x50 && coda[i + 1] === 0x4b && coda[i + 2] === 0x05 && coda[i + 3] === 0x06) {
        var totale = u16le(coda, i + 10);
        var inizioDir = u32le(coda, i + 16) - base;
        if (inizioDir >= 0 && inizioDir < coda.length) {
          var p = inizioDir;
          for (var n = 0; n < totale && p + 46 <= coda.length; n++) {
            if (u32le(coda, p) !== 0x02014b50) break;
            var lunghezzaNome = u16le(coda, p + 28), extra = u16le(coda, p + 30), commento = u16le(coda, p + 32);
            voci.push({ nome: utf8(coda.subarray(p + 46, p + 46 + lunghezzaNome)), compresso: u32le(coda, p + 20), dimensione: u32le(coda, p + 24) });
            p += 46 + lunghezzaNome + extra + commento;
          }
          return { voci: voci, totale: totale, completo: voci.length === totale };
        }
        break;
      }
    }
    // intestazioni locali
    var q = 0;
    while (q + 30 <= inizio.length && u32le(inizio, q) === 0x04034b50) {
      var ln = u16le(inizio, q + 26), le = u16le(inizio, q + 28);
      var comp = u32le(inizio, q + 18);
      voci.push({ nome: utf8(inizio.subarray(q + 30, q + 30 + ln)), compresso: comp, dimensione: u32le(inizio, q + 22) });
      if (inizio[q + 6] & 0x08 && comp === 0) break;   // lunghezza nota solo alla fine
      q += 30 + ln + le + comp;
    }
    return { voci: voci, totale: null, completo: false };
  }

  function utf8(b) {
    try { return new TextDecoder('utf-8', { fatal: false }).decode(b); } catch (e) { return testoAscii(b, 0, b.length); }
  }

  function classificaZip(inizio, fine, dimensione) {
    var z = vociZip(inizio, fine, dimensione);
    var nomi = z.voci.map(function (v) { return v.nome; });
    var ha = function (re) { return nomi.some(function (n) { return re.test(n); }); };
    var id = 'zip';
    // "mimetype" come prima voce, non compressa: ODF ed EPUB
    var mimetype = inizio.length > 38 && testoAscii(inizio, 30, 8) === 'mimetype' ? testoAscii(inizio, 38 + u16le(inizio, 28), 80) : '';
    if (/^application\/epub\+zip/.test(mimetype) || ha(/^META-INF\/container\.xml$/) && ha(/\.opf$/)) id = 'epub';
    else if (/opendocument\.text/.test(mimetype)) id = 'odt';
    else if (/opendocument\.spreadsheet/.test(mimetype)) id = 'ods';
    else if (/opendocument\.presentation/.test(mimetype)) id = 'odp';
    else if (/opendocument\.graphics/.test(mimetype)) id = 'odg';
    else if (ha(/^word\//)) id = ha(/^word\/vbaProject\.bin$/) ? 'docm' : 'docx';
    else if (ha(/^xl\//)) id = ha(/^xl\/vbaProject\.bin$/) ? 'xlsm' : 'xlsx';
    else if (ha(/^ppt\//)) id = 'pptx';
    else if (ha(/^AndroidManifest\.xml$/) && ha(/\.dex$/)) id = 'apk';
    else if (ha(/^Payload\/[^/]+\.app\//)) id = 'ipa';
    else if (ha(/^META-INF\/MANIFEST\.MF$/) || ha(/\.class$/) && !ha(/\.(html|txt|pdf)$/)) id = 'jar';
    else if (ha(/^collection\.anki2(1b?)?$/)) id = 'apkg';
    else if (ha(/^FixedDocSeq\.fdseq$/) || ha(/^Documents\/.*\.fdoc$/)) id = 'xps';
    else if (ha(/^doc\.kml$/) || ha(/\.kml$/) && nomi.length <= 5) id = 'kmz';
    return { id: id, zip: z };
  }

  // ------------------------------------------------------------ OLE (vecchi Office)

  function classificaOle(b, fine) {
    var tutto = [b, fine].filter(Boolean);
    var ha = function (s) { return tutto.some(function (x) { return cercaUtf16(x, s); }); };
    if (ha('__substg1.0_') || ha('__properties_version1.0')) return 'msg';
    if (ha('WordDocument')) return 'doc';
    if (ha('Workbook') || ha('Book')) return 'xls';
    if (ha('PowerPoint Document')) return 'ppt';
    // Gli MSI hanno nomi di stream codificati: si riconoscono dalla classe
    // del documento radice {000C1084-0000-0000-C000-000000000046}.
    if (cerca(b, '\x84\x10\x0c\x00\x00\x00\x00\x00\xc0\x00\x00\x00\x00\x00\x00\x46') >= 0) return 'msi';
    return 'ole';
  }

  // ------------------------------------------------------------ immagini

  function misureJpeg(b) {
    var i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      var m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      var len = u16be(b, i + 2);
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { larghezza: u16be(b, i + 7), altezza: u16be(b, i + 5) };
      }
      if (m === 0xda) break;
      i += 2 + len;
    }
    return null;
  }

  function misureWebp(b) {
    var c = testoAscii(b, 12, 4);
    if (c === 'VP8 ' && b.length > 30) return { larghezza: u16le(b, 26) & 0x3fff, altezza: u16le(b, 28) & 0x3fff };
    if (c === 'VP8L' && b.length > 25) {
      var v = u32le(b, 21);
      return { larghezza: (v & 0x3fff) + 1, altezza: ((v >> 14) & 0x3fff) + 1 };
    }
    if (c === 'VP8X' && b.length > 30) {
      return { larghezza: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), altezza: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    return null;
  }

  // ------------------------------------------------------------ ISO base media (MP4, MOV, HEIC)

  function marchiFtyp(b) {
    if (!inizia(b, ascii('ftyp'), 4)) return null;
    var lunghezza = Math.min(u32be(b, 0), b.length);
    var marchi = [testoAscii(b, 8, 4)];
    for (var o = 16; o + 4 <= lunghezza; o += 4) marchi.push(testoAscii(b, o, 4));
    return marchi.map(function (m) { return m.trim(); });
  }

  function classificaFtyp(marchi, b) {
    var principale = marchi[0];
    var ha = function (x) { return marchi.indexOf(x) >= 0; };
    if (/^(heic|heix|heim|heis|hevc|hevx)$/.test(principale) || (principale === 'mif1' || principale === 'msf1') && (ha('heic') || ha('heix'))) return 'heic';
    if (principale === 'avif' || principale === 'avis' || ha('avif')) return 'avif';
    if (principale === 'mif1' || principale === 'msf1') return 'heic';
    if (principale === 'crx') return 'raw_cr';
    if (principale === 'qt') return 'mov';
    if (/^(M4A|M4B|M4P|F4A)$/.test(principale)) return 'm4a';
    if (/^3g/.test(principale)) return '3gp';
    // un MP4 solo audio (tipico dei vocali): niente traccia video nell'inizio letto
    if (cerca(b, 'vide') < 0 && cerca(b, 'soun') >= 0) return 'm4a';
    return 'mp4';
  }

  // ------------------------------------------------------------ testo

  function eUtf8Valido(b, limite) {
    var fine = Math.min(b.length, limite);
    for (var i = 0; i < fine; i++) {
      var c = b[i];
      if (c < 0x80) continue;
      var n = c >= 0xf0 && c <= 0xf4 ? 3 : c >= 0xe0 ? 2 : c >= 0xc2 && c < 0xe0 ? 1 : -1;
      if (n < 0) return false;
      if (i + n >= fine) return true;   // carattere tagliato alla fine del pezzo letto
      for (var k = 1; k <= n; k++) if ((b[i + k] & 0xc0) !== 0x80) return false;
      i += n;
    }
    return true;
  }

  function codifica(b) {
    if (inizia(b, [0xef, 0xbb, 0xbf])) return { nome: 'UTF-8 (con BOM)', decoder: 'utf-8', salta: 3 };
    if (inizia(b, [0xff, 0xfe])) return { nome: 'UTF-16 (Windows)', decoder: 'utf-16le', salta: 2 };
    if (inizia(b, [0xfe, 0xff])) return { nome: 'UTF-16 BE', decoder: 'utf-16be', salta: 2 };
    var alti = false;
    for (var i = 0; i < Math.min(b.length, 8192); i++) if (b[i] >= 0x80) { alti = true; break; }
    if (!alti) return { nome: 'ASCII', decoder: 'utf-8', salta: 0 };
    return eUtf8Valido(b, 65536) ? { nome: 'UTF-8', decoder: 'utf-8', salta: 0 } : { nome: 'Windows-1252 / Latin-1', decoder: 'windows-1252', salta: 0 };
  }

  // Sembra testo? Niente byte di controllo strani nei primi 8 KB.
  function eTesto(b) {
    if (inizia(b, [0xff, 0xfe]) || inizia(b, [0xfe, 0xff])) return true;
    var n = Math.min(b.length, 8192), strani = 0;
    for (var i = 0; i < n; i++) {
      var c = b[i];
      if (c === 0) return false;
      if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x0c && c !== 0x1b) strani++;
    }
    return n > 0 && strani / n < 0.01;
  }

  function decodifica(b, cod) {
    try { return new TextDecoder(cod.decoder).decode(b.subarray(cod.salta, Math.min(b.length, 65536))); } catch (e) { return testoAscii(b, cod.salta, 65536); }
  }

  function classificaTesto(testo, completo) {
    var t = testo.replace(/^\s+/, '');
    var inizio = t.slice(0, 4096);
    if (/^-----BEGIN CERTIFICATE-----/.test(t)) return 'pem_cert';
    if (/^-----BEGIN (RSA |EC |ENCRYPTED |OPENSSH )?PRIVATE KEY-----/.test(t)) return 'pem_chiave';
    if (/^-----BEGIN PGP /.test(t)) return 'pgp';
    if (/^BEGIN:VCALENDAR/i.test(t)) return 'ics';
    if (/^BEGIN:VCARD/i.test(t)) return 'vcf';
    if (/^#!/.test(t)) return 'script';
    if (/^\{\\rtf/.test(t)) return 'rtf';
    // email: intestazioni "Nome: valore" all'inizio
    var intestazioni = inizio.split(/\r?\n/).slice(0, 30).filter(function (r) { return /^(Received|From|To|Subject|Date|Return-Path|Message-ID|MIME-Version|Delivered-To|X-[\w-]+|Content-Type):/i.test(r); });
    if (intestazioni.length >= 3) {
      return /^X-(Trasporto|Ricevuta|TipoRicevuta|VerificaSicurezza):/im.test(inizio) || /posta-certificata/i.test(inizio) ? 'pec' : 'eml';
    }
    if (/^</.test(t)) {
      var corpo = t.replace(/^<\?xml[^>]*>\s*/i, '').replace(/^(<!--[\s\S]*?-->\s*)+/, '');
      if (/FatturaElettronica[\s>]/.test(inizio) || /^<([\w-]+:)?FatturaElettronica\b/.test(corpo)) return 'fatturapa';
      if (/^<postacert\b/i.test(corpo)) return 'daticert';
      if (/^<!DOCTYPE html|^<html[\s>]/i.test(corpo)) return 'html';
      if (/^<svg[\s>]/i.test(corpo) || /^<!DOCTYPE svg/i.test(corpo)) return 'svg';
      if (/^<gpx[\s>]/i.test(corpo)) return 'gpx';
      if (/^<kml[\s>]/i.test(corpo)) return 'kml';
      if (/^<\?xml/i.test(t) || /^<[\w:-]+[\s>]/.test(corpo)) return /<(head|body|div|p)[\s>]/i.test(inizio) && !/^<\?xml/i.test(t) ? 'html' : 'xml';
    }
    if (/^[{[]/.test(t)) {
      if (completo) { try { JSON.parse(testo); return 'json'; } catch (e) { /* non e' JSON valido */ } }
      else if (/^[{[]\s*("|\[|\{|\]|\}|\d|true|false|null)/.test(t)) return 'json';
    }
    // CSV: almeno 3 righe con lo stesso numero (>1) di separatori
    var righe = inizio.split(/\r?\n/).filter(function (r) { return r.trim(); }).slice(0, 20);
    if (righe.length >= 3) {
      var seps = [';', ',', '\t', '|'];
      for (var s = 0; s < seps.length; s++) {
        var conta = righe.slice(0, -1).map(function (r) { return r.split(seps[s]).length - 1; });
        if (conta[0] >= 1 && conta.every(function (c) { return c === conta[0]; })) return 'csv';
      }
    }
    return 'txt';
  }

  // ------------------------------------------------------------ riconoscimento

  function risultato(id, extra) {
    var r = { tipo: T[id], dettagli: [], avvisi: [] };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  /**
   * Riconosce il tipo di un file.
   * @param {Uint8Array} inizio  i primi byte (64 KB bastano)
   * @param {object} o  { fine: ultimi byte, dimensione, nome, P7m: modulo p7m-lettura }
   * @returns {{tipo, dettagli: Array<[string,string]>, avvisi: string[], zip?, testo?, interno?, misure?}}
   */
  function riconosci(inizio, o) {
    o = o || {};
    var b = inizio instanceof Uint8Array ? inizio : new Uint8Array(inizio || []);
    var dimensione = o.dimensione != null ? o.dimensione : b.length;
    var fine = o.fine && dimensione > b.length ? o.fine : null;
    var r = trova(b, fine, dimensione, o);
    r.dettagli.unshift(['Dimensione', formatoDimensione(dimensione)]);
    if (ESEGUIBILI[r.tipo.id]) r.avvisi.unshift('È un programma, non un documento: aprilo solo se sei sicuro di chi te l’ha mandato e perché.');
    avvisiNome(r, o.nome);
    if (r.tipo.id === 'docm' || r.tipo.id === 'xlsm') r.avvisi.unshift('Contiene macro, cioè piccoli programmi: se ti chiede di «abilitare il contenuto», fallo solo se ti fidi del mittente.');
    r.nomeSuggerito = nomeCorretto(o.nome, r.tipo);
    return r;
  }

  function trova(b, fine, dimensione, o) {
    if (!dimensione || !b.length) return risultato('vuoto');

    // --- documenti
    if (inizia(b, ascii('%PDF-'))) {
      var r = risultato('pdf');
      r.dettagli.push(['Versione PDF', testoAscii(b, 5, 3)]);
      var coda = fine || b;
      if (cerca(coda, '/Encrypt') >= 0 || cerca(b, '/Encrypt') >= 0) r.avvisi.push('Il PDF è protetto: può chiedere una password o impedire stampa e modifica.');
      if (cerca(b, 'pdfaid:part') >= 0) r.dettagli.push(['Formato', 'PDF/A (per l’archiviazione)']);
      if (cerca(b, '/ByteRange') >= 0 || cerca(coda, '/ByteRange') >= 0) r.dettagli.push(['Firma', 'contiene una firma digitale (PAdES)']);
      return r;
    }
    if (inizia(b, [0x50, 0x4b, 0x03, 0x04]) || inizia(b, [0x50, 0x4b, 0x05, 0x06])) {
      var z = classificaZip(b, fine, dimensione);
      var rz = risultato(z.id, { zip: z.zip });
      var n = z.zip.totale != null ? z.zip.totale : z.zip.voci.length;
      if (z.id === 'zip' || z.id === 'apkg') rz.dettagli.push(['Contenuto', n + (n === 1 ? ' file' : ' file e cartelle') + (z.zip.completo || z.zip.totale != null ? '' : ' (elenco parziale)')]);
      return rz;
    }
    if (inizia(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return risultato(classificaOle(b, fine));
    if (inizia(b, ascii('{\\rtf'))) return risultato('rtf');
    if (inizia(b, ascii('%!PS'))) return risultato('ps');
    if (inizia(b, ascii('AT&TFORM')) && testoAscii(b, 12, 4).indexOf('DJV') === 0) return risultato('djvu');
    if (inizia(b, ascii('AC10'))) return risultato('dwg', { dettagli: [['Versione AutoCAD', testoAscii(b, 0, 6)]] });

    // --- firma digitale (binaria o in base64/PEM)
    var P = o.P7m;
    if (b[0] === 0x30 && P && P.eBusta && P.eBusta(b)) return firma(b, o);
    if (P && P.daBase64 && eTesto(b) && /^(-----BEGIN (PKCS7|CMS)-----|MI[A-Za-z0-9+/])/.test(testoAscii(b, 0, 40).trim())) {
      var dec = P.daBase64(b);
      if (dec && P.eBusta && P.eBusta(dec)) {
        var rf = firma(dec, o);
        rf.dettagli.push(['Codifica', 'base64 (testo)']);
        return rf;
      }
    }
    if (b[0] === 0x30 && b[1] >= 0x80 && b[1] <= 0x84) return risultato('der');

    // --- immagini
    if (inizia(b, [0xff, 0xd8, 0xff])) return conMisure(risultato('jpg'), misureJpeg(b));
    if (inizia(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return conMisure(risultato('png'), b.length > 24 ? { larghezza: u32be(b, 16), altezza: u32be(b, 20) } : null);
    if (inizia(b, ascii('GIF87a')) || inizia(b, ascii('GIF89a'))) return conMisure(risultato('gif'), { larghezza: u16le(b, 6), altezza: u16le(b, 8) });
    if (inizia(b, ascii('RIFF'))) {
      var sotto = testoAscii(b, 8, 4);
      if (sotto === 'WEBP') return conMisure(risultato('webp'), misureWebp(b));
      if (sotto === 'WAVE') return risultato('wav');
      if (sotto === 'AVI ') return risultato('avi');
    }
    if (inizia(b, ascii('BM')) && b.length > 26 && u32le(b, 2) === dimensione) return conMisure(risultato('bmp'), { larghezza: u32le(b, 18), altezza: Math.abs(u32le(b, 22) | 0) });
    if ((inizia(b, [0, 0, 1, 0]) || inizia(b, [0, 0, 2, 0])) && u16le(b, 4) >= 1 && u16le(b, 4) <= 64 && b.length > 22 && b[9] === 0) {
      return risultato(b[2] === 1 ? 'ico' : 'cur', { dettagli: [['Immagini contenute', String(u16le(b, 4))]] });
    }
    if (inizia(b, ascii('II*\0')) || inizia(b, ascii('MM\0*'))) {
      return risultato(inizia(b, ascii('CR'), 8) ? 'raw_cr' : 'tif');
    }
    if (inizia(b, ascii('8BPS'))) return conMisure(risultato('psd'), { larghezza: u32be(b, 18), altezza: u32be(b, 14) });
    if (inizia(b, [0xff, 0x0a]) || inizia(b, [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20])) return risultato('jxl');
    if (inizia(b, [0, 0, 0, 0x0c, 0x6a, 0x50, 0x20, 0x20])) return risultato('jp2');
    if (inizia(b, ascii('DICM'), 128)) return risultato('dicom');

    // --- ISO base media: MP4, MOV, M4A, HEIC, AVIF
    var marchi = marchiFtyp(b);
    if (marchi) {
      var rm = risultato(classificaFtyp(marchi, b));
      rm.dettagli.push(['Marchio del formato', marchi[0]]);
      return rm;
    }
    if (inizia(b, ascii('moov'), 4) || inizia(b, ascii('mdat'), 4) || inizia(b, ascii('wide'), 4)) return risultato('mov');

    // --- audio e video
    if (inizia(b, ascii('OggS'))) {
      if (cerca(b, 'OpusHead', 0, 512) >= 0) return risultato('opus');
      if (cerca(b, '\x80theora', 0, 512) >= 0) return risultato('ogv');
      if (cerca(b, 'FLAC', 0, 512) >= 0) return risultato('flac');
      return risultato('ogg');
    }
    if (inizia(b, ascii('fLaC'))) return risultato('flac');
    if (inizia(b, ascii('ID3'))) return risultato('mp3', { dettagli: [['Etichette', 'ID3 v2.' + b[3]]] });
    if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return risultato('aac');
    if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 1) & 3) === 1 && ((b[2] >> 4) & 15) !== 15) return risultato('mp3');
    if (inizia(b, ascii('MThd'))) return risultato('midi');
    if (inizia(b, ascii('#!AMR'))) return risultato('amr');
    if (inizia(b, [0x1a, 0x45, 0xdf, 0xa3])) return risultato(cerca(b, 'webm', 0, 64) >= 0 ? 'webm' : 'mkv');
    if (inizia(b, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return risultato('wma');
    if (inizia(b, ascii('FLV'))) return risultato('flv');
    if (inizia(b, [0, 0, 1, 0xba]) || inizia(b, [0, 0, 1, 0xb3])) return risultato('mpg');
    if (b[0] === 0x47 && b.length > 376 && b[188] === 0x47 && b[376] === 0x47) return risultato('ts');

    // --- archivi
    if (inizia(b, ascii('Rar!\x1a\x07'))) return risultato('rar', { dettagli: [['Versione', b[6] === 1 ? 'RAR 5' : 'RAR 4']] });
    if (inizia(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return risultato('7z');
    if (inizia(b, [0x1f, 0x8b])) return gzip(b);
    if (inizia(b, ascii('BZh'))) return risultato('bz2');
    if (inizia(b, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return risultato('xz');
    if (inizia(b, [0x28, 0xb5, 0x2f, 0xfd])) return risultato('zst');
    if (inizia(b, ascii('ustar'), 257)) return risultato('tar');
    if (inizia(b, ascii('MSCF'))) return risultato('cab');
    if (inizia(b, ascii('CD001'), 32769)) return risultato('iso');
    if (inizia(b, ascii('!<arch>\n'))) return risultato(cerca(b, 'debian-binary', 0, 200) >= 0 ? 'deb' : 'bin');
    if (inizia(b, [0xed, 0xab, 0xee, 0xdb])) return risultato('rpm');
    if (fine && fine.length >= 512 && inizia(fine, ascii('koly'), fine.length - 512)) return risultato('dmg');
    if (inizia(b, [0x78, 0x9f, 0x3e, 0x22])) return risultato('tnef');

    // --- programmi
    if (inizia(b, ascii('MZ'))) return pe(b);
    if (inizia(b, [0x7f, 0x45, 0x4c, 0x46])) return risultato('elf');
    if (inizia(b, [0xfe, 0xed, 0xfa, 0xce]) || inizia(b, [0xfe, 0xed, 0xfa, 0xcf]) || inizia(b, [0xce, 0xfa, 0xed, 0xfe]) || inizia(b, [0xcf, 0xfa, 0xed, 0xfe])) return risultato('macho');
    if (inizia(b, [0xca, 0xfe, 0xba, 0xbe])) {
      // stessa firma per le classi Java e i programmi Mac "fat": nelle classi
      // qui c'e' la versione (45 o piu'), nei Mac il numero di architetture.
      return risultato(u32be(b, 4) >= 30 ? 'class' : 'macho');
    }
    if (inizia(b, [0x00, 0x61, 0x73, 0x6d])) return risultato('wasm');
    if (inizia(b, ascii('dex\n'))) return risultato('dex');
    if (inizia(b, [0x4c, 0, 0, 0, 0x01, 0x14, 0x02, 0])) return risultato('lnk');

    // --- dati
    if (inizia(b, ascii('SQLite format 3\0'))) return risultato('sqlite');
    if (inizia(b, [0, 1, 0, 0]) && b.length > 12 && u16be(b, 4) > 0 && u16be(b, 4) < 64) return risultato('ttf');
    if (inizia(b, ascii('OTTO'))) return risultato('otf');
    if (inizia(b, ascii('true')) && u16be(b, 4) < 64) return risultato('ttf');
    if (inizia(b, ascii('ttcf'))) return risultato('ttc');
    if (inizia(b, ascii('wOFF'))) return risultato('woff');
    if (inizia(b, ascii('wOF2'))) return risultato('woff2');
    if (inizia(b, ascii('!BDN'))) return risultato('pst');
    if (inizia(b, ascii('d8:announce')) || inizia(b, ascii('d10:created')) || inizia(b, ascii('d4:info'))) return risultato('torrent');

    // --- testo
    if (eTesto(b)) {
      var cod = codifica(b);
      var testo = decodifica(b, cod);
      var id = classificaTesto(testo, dimensione <= b.length);
      var rt = risultato(id, { testo: { codifica: cod.nome, decoder: cod.decoder, salta: cod.salta } });
      rt.dettagli.push(['Codifica dei caratteri', cod.nome]);
      if (id === 'txt' || id === 'csv') {
        var righe = testo.split(/\r\n|\n|\r/).length;
        rt.dettagli.push(['Righe', (dimensione > b.length ? 'oltre ' : '') + righe]);
      }
      if (id === 'fatturapa') {
        var m = testo.match(/versione="(FP[AR]\d\d)"/);
        if (m) rt.dettagli.push(['Formato', m[1] === 'FPA12' ? 'fattura verso la Pubblica amministrazione' : 'fattura tra privati (' + m[1] + ')']);
      }
      if (id === 'pem_chiave') rt.avvisi.push('È una chiave privata: non mandarla a nessuno e non caricarla su siti che non conosci.');
      return rt;
    }
    return risultato('bin');
  }

  function conMisure(r, m) {
    if (m && m.larghezza > 0 && m.altezza > 0) {
      r.misure = m;
      r.dettagli.push(['Misure', m.larghezza + ' × ' + m.altezza + ' pixel' + (m.larghezza * m.altezza >= 1e6 ? ' (' + (Math.round(m.larghezza * m.altezza / 1e5) / 10).toString().replace('.', ',') + ' megapixel)' : '')]);
    }
    return r;
  }

  function gzip(b) {
    var r = risultato('gz');
    // se il file compresso aveva un nome, e' scritto nell'intestazione
    if (b[3] & 0x08) {
      var p = 10;
      if (b[3] & 0x04) p += 2 + u16le(b, 10);
      var nome = '';
      while (p < b.length && b[p] !== 0 && nome.length < 200) nome += String.fromCharCode(b[p++]);
      if (nome) r.dettagli.push(['File compresso dentro', nome]);
    }
    return r;
  }

  function pe(b) {
    var off = b.length > 0x40 ? u32le(b, 0x3c) : 0;
    if (off > 0 && off + 24 < b.length && inizia(b, ascii('PE\0\0'), off)) {
      var macchina = u16le(b, off + 4);
      var caratteristiche = u16le(b, off + 22);
      var r = risultato(caratteristiche & 0x2000 ? 'dll' : 'exe');
      var nomi = { 0x14c: 'Windows a 32 bit (x86)', 0x8664: 'Windows a 64 bit (x64)', 0xaa64: 'Windows su ARM64', 0x1c0: 'Windows su ARM' };
      if (nomi[macchina]) r.dettagli.push(['Per', nomi[macchina]]);
      return r;
    }
    var rd = risultato('exe');
    rd.dettagli.push(['Per', 'MS-DOS (programma molto vecchio)']);
    return rd;
  }

  function firma(b, o) {
    var P = o.P7m;
    var r;
    try {
      var aperto = P.leggi(b, o.nome || 'documento.p7m');
      if (!aperto.contenuto || !aperto.contenuto.length) throw new Error('vuoto');
      var dentro = riconosci(aperto.contenuto.subarray(0, INIZIO), { dimensione: aperto.contenuto.length, nome: aperto.nome });
      r = risultato('p7m', { interno: { tipo: dentro.tipo, nome: aperto.nome, dimensione: aperto.contenuto.length, fattura: aperto.fatturaElettronica } });
      r.dettagli.push(['Documento firmato', dentro.tipo.nome]);
      if (aperto.firme && aperto.firme.length) {
        r.dettagli.push(['Firme', String(aperto.firme.length)]);
        var chi = aperto.firme.map(function (f) { return f.nome; }).filter(Boolean);
        if (chi.length) r.dettagli.push(['Firmato da', chi.join(', ')]);
      }
      if (aperto.buste > 1) r.dettagli.push(['Buste di firma', String(aperto.buste) + ' (firme una dentro l’altra)']);
    } catch (e) {
      r = risultato('p7s');
    }
    return r;
  }

  // ------------------------------------------------------------ nome

  function estensioneDi(nome) {
    var m = String(nome || '').match(/\.([A-Za-z0-9]{1,5})$/);
    return m ? m[1].toLowerCase() : '';
  }

  var SINONIMI = { jpg: ['jpg', 'jpeg', 'jpe', 'jfif'], tif: ['tif', 'tiff', 'nef', 'arw', 'dng', 'orf', 'rw2'], txt: ['txt', 'text', 'log', 'md', 'ini', 'cfg', 'conf'],
    xml: ['xml', 'xsl', 'xslt', 'rss', 'atom', 'plist', 'config'], mp4: ['mp4', 'm4v'], m4a: ['m4a', 'm4b', 'aac'], html: ['html', 'htm', 'xhtml'],
    mpg: ['mpg', 'mpeg'], ogg: ['ogg', 'oga'], opus: ['opus', 'ogg', 'oga'], mid: ['mid', 'midi'], zip: ['zip', 'zipx'], apkg: ['apkg', 'colpkg'],
    p7m: ['p7m', 'p7c'], pem: ['pem', 'crt', 'cer', 'key', 'pub'], der: ['der', 'cer', 'crt', 'p7b'], script: ['sh', 'bash', 'py', 'pl', 'rb'],
    eml: ['eml', 'mht', 'mhtml'], ttf: ['ttf'], dat: ['dat'], heic: ['heic', 'heif'], csv: ['csv', 'tsv', 'txt'], json: ['json', 'geojson', 'map'],
    doc: ['doc', 'dot'], xls: ['xls', 'xlt'], ppt: ['ppt', 'pps', 'pot'], ole: ['doc', 'xls', 'ppt', 'msg', 'vsd', 'pub'], mov: ['mov', 'qt'],
    exe: ['exe', 'scr', 'com'], docx: ['docx', 'dotx'], xlsx: ['xlsx', 'xltx'], pptx: ['pptx', 'ppsx', 'potx'] };

  function compatibile(estensione, tipo) {
    if (!estensione || !tipo.estensione) return !estensione;
    var lista = SINONIMI[tipo.estensione] || SINONIMI[tipo.id] || [tipo.estensione];
    return lista.indexOf(estensione) >= 0 || estensione === tipo.estensione;
  }

  var DOCUMENTI_FINTI = /^(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|txt|odt|rtf|mp3|mp4|zip)$/;

  function avvisiNome(r, nome) {
    if (!nome) return;
    var est = estensioneDi(nome);
    // "fattura.pdf.exe": due estensioni, la seconda nascosta da Windows
    var doppia = String(nome).match(/\.([a-z0-9]{2,4})\.([a-z0-9]{2,4})$/i);
    if (doppia && ESEGUIBILI[r.tipo.id] && DOCUMENTI_FINTI.test(doppia[1].toLowerCase())) {
      r.avvisi.unshift('Doppia estensione (.' + doppia[1] + '.' + doppia[2] + '): Windows spesso nasconde la seconda, così un programma sembra un documento. Non aprirlo.');
    }
    if (!est) {
      if (r.tipo.estensione && r.tipo.id !== 'bin') r.dettagli.push(['Estensione giusta', '.' + r.tipo.estensione]);
      return;
    }
    if (compatibile(est, r.tipo)) return;
    if (r.tipo.id === 'bin' || r.tipo.id === 'vuoto') return;
    if (ESEGUIBILI[r.tipo.id] && DOCUMENTI_FINTI.test(est)) {
      r.avvisi.unshift('Il nome dice .' + est + ' ma dentro c’è un programma: è un trucco usato nelle truffe per far aprire un virus. Non aprirlo.');
    } else {
      r.avvisi.push('Il nome finisce in .' + est + ', ma il file è di tipo «' + r.tipo.nome + '»: l’estensione giusta è .' + r.tipo.estensione + '.');
    }
  }

  /** Il nome con l'estensione giusta: "scansione" -> "scansione.pdf". */
  function nomeCorretto(nome, tipo) {
    var base = String(nome || '').split(/[\\/]/).pop() || 'file';
    if (!tipo.estensione) return base;
    var est = estensioneDi(base);
    if (est && compatibile(est, tipo)) return base;
    // si toglie un'estensione sbagliata solo se e' davvero un'estensione nota
    if (est && /^(bin|dat|tmp|file|download|octet-stream|unknown|null|p7m|p7s)$/.test(est)) base = base.slice(0, -(est.length + 1)) || 'file';
    return base + '.' + tipo.estensione;
  }

  function formatoDimensione(n) {
    if (n < 1024) return n + (n === 1 ? ' byte' : ' byte');
    var unita = ['KB', 'MB', 'GB', 'TB'], v = n, i = -1;
    do { v /= 1024; i++; } while (v >= 1024 && i < unita.length - 1);
    return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString().replace('.', ',') + ' ' + unita[i];
  }

  /** Le righe dell'esadecimale: offset, byte, caratteri. */
  function esadecimale(b, quanti) {
    var righe = [];
    var n = Math.min(b.length, quanti || 256);
    for (var o = 0; o < n; o += 16) {
      var hex = [], car = '';
      for (var i = o; i < o + 16; i++) {
        if (i < n) {
          hex.push((b[i] < 16 ? '0' : '') + b[i].toString(16).toUpperCase());
          car += b[i] >= 0x20 && b[i] < 0x7f ? String.fromCharCode(b[i]) : '·';
        } else hex.push('  ');
      }
      righe.push(('0000000' + o.toString(16).toUpperCase()).slice(-8) + '  ' + hex.slice(0, 8).join(' ') + '  ' + hex.slice(8).join(' ') + '  ' + car);
    }
    return righe.join('\n');
  }

  return {
    INIZIO: INIZIO, FINE: FINE, TIPI: T,
    riconosci: riconosci, nomeCorretto: nomeCorretto, estensioneDi: estensioneDi,
    formatoDimensione: formatoDimensione, esadecimale: esadecimale, vociZip: vociZip, codifica: codifica
  };
});
