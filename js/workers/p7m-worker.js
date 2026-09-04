// js/workers/p7m-worker.js — Estrazione del contenuto XML incorporato in un file .p7m (CMS/PKCS#7)
// Esegue il parsing ASN.1 (asn1js) e la navigazione della struttura SignedData/EncapsulatedContentInfo
// (pkijs) in un Web Worker dedicato, per non bloccare il thread principale su file di grandi dimensioni.
// Nessun dato lascia mai il dispositivo: le librerie vengono scaricate da CDN pubbliche (solo codice,
// non i documenti dell'utente) ed eseguite interamente in locale.
self.addEventListener('message', async (event) => {
  const { buffer } = event.data || {};

  try {
    if (!buffer || !(buffer instanceof ArrayBuffer)) {
      throw new Error('Buffer del file .p7m mancante o non valido.');
    }

    const asn1js = await import('https://cdn.jsdelivr.net/npm/asn1js@3.0.5/+esm');
    const pkijs = await import('https://cdn.jsdelivr.net/npm/pkijs@3.0.15/+esm');

    if (pkijs.setEngine && pkijs.CryptoEngine && self.crypto && self.crypto.subtle) {
      pkijs.setEngine(
        'newEngine',
        new pkijs.CryptoEngine({ name: 'newEngine', crypto: self.crypto, subtle: self.crypto.subtle })
      );
    }

    const asn1 = asn1js.fromBER(buffer);
    if (asn1.offset === -1) {
      throw new Error('Impossibile analizzare la struttura ASN.1 del file .p7m.');
    }

    const contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
    const signedData = new pkijs.SignedData({ schema: contentInfo.content });
    const encapContentInfo = signedData.encapContentInfo;

    if (!encapContentInfo || !encapContentInfo.eContent) {
      throw new Error('Il file .p7m non contiene un documento incorporato leggibile (encapContentInfo assente).');
    }

    const eContent = encapContentInfo.eContent;
    let contentBytes = null;

    if (eContent.valueBlock && eContent.valueBlock.valueHex) {
      contentBytes = new Uint8Array(eContent.valueBlock.valueHex);
    } else if (Array.isArray(eContent.valueBlock && eContent.valueBlock.value)) {
      // OCTET STRING costruita da più chunk: concatena i valori grezzi di ciascun blocco.
      const chunks = eContent.valueBlock.value
        .map((chunk) => (chunk.valueBlock && chunk.valueBlock.valueHex) ? new Uint8Array(chunk.valueBlock.valueHex) : null)
        .filter(Boolean);
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      contentBytes = new Uint8Array(totalLength);
      let offset = 0;
      chunks.forEach((chunk) => {
        contentBytes.set(chunk, offset);
        offset += chunk.length;
      });
    }

    if (!contentBytes || !contentBytes.length) {
      throw new Error('Contenuto del file .p7m vuoto o in un formato non supportato.');
    }

    const decoder = new TextDecoder('utf-8');
    const xml = decoder.decode(contentBytes);

    self.postMessage({ type: 'success', xml });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: (error && error.message) || 'Errore sconosciuto durante l\'estrazione del file .p7m.'
    });
  }
});
