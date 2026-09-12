// js/workers/p7m-worker.js — Estrazione del contenuto XML da .p7m (Comlink)
import * as Comlink from 'https://unpkg.com/comlink/dist/esm/comlink.mjs';

const p7mService = {
  async extractXml(buffer) {
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
    return decoder.decode(contentBytes);
  }
};

Comlink.expose(p7mService);