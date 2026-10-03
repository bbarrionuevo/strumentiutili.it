#!/usr/bin/env node
// scripts/qualita/misura.js — Misura le pagine del sito con un browser vero.
//
// Telefono a 390 px, CPU rallentata 4 volte, rete mobile: le condizioni di chi
// apre il sito dal telefono in giro. Per ogni pagina: LCP, CLS (anche quello
// dovuto agli annunci, sul sito vero), blocco del thread principale (long
// task oltre 50 ms), byte e richieste, errori JavaScript e risorse dello
// stesso sito che rispondono con un errore. Lo usa ogni domenica
// .github/workflows/metriche.yml sul sito pubblicato; in locale serve a
// misurare prima e dopo una modifica (laboratorio settimanale).
//
//   node scripts/qualita/misura.js --sito https://strumentiutili.it --uscita misure.json
//   node scripts/qualita/misura.js --sito http://127.0.0.1:8765 --pagine /,/pdf/unisci-pdf/
//
// Le pagine, se non si indicano, sono quelle del sitemap.xml del repository.
// Con PSI_KEY nell'ambiente si aggiungono i dati di utenti reali del Chrome UX
// Report (API di Google, chiave gratuita): la chiave non viene mai stampata.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { daCrux } = require('./valuta.js');

function argomento(nome, predefinito) {
  const i = process.argv.indexOf('--' + nome);
  return i >= 0 ? process.argv[i + 1] : predefinito;
}

function pagineDalSitemap() {
  const xml = fs.readFileSync(path.join(__dirname, '..', '..', 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>https:\/\/strumentiutili\.it([^<]*)<\/loc>/g)].map((m) => m[1] || '/');
}

async function misuraPagina(browser, sito, pagina) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'it-IT' });
  await ctx.addInitScript(() => {
    window.__su = { lcp: 0, cls: 0, tbt: 0 };
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__su.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__su.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__su.tbt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
    } catch (e) { /* browser senza queste misure */ }
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let byte = 0, richieste = 0;
  cdp.on('Network.loadingFinished', (e) => { byte += e.encodedDataLength; richieste++; });
  const erroriJs = [];
  p.on('pageerror', (e) => erroriJs.push(String(e.message).slice(0, 160)));
  const origine = new URL(sito).origin;
  const rotti = [];
  p.on('response', (r) => {
    const u = r.url();
    if (u.startsWith(origine) && r.status() >= 400 && !/\/_vercel\//.test(u)) rotti.push(u.slice(origine.length) + ' ' + r.status());
  });
  const fuori = { pagina };
  try {
    const risposta = await p.goto(origine + pagina, { waitUntil: 'load', timeout: 90000 });
    fuori.stato = risposta ? risposta.status() : null;
    await p.waitForTimeout(4000); // il tempo per annunci e caricamenti tardivi: i loro salti contano
    const m = await p.evaluate(() => window.__su);
    Object.assign(fuori, { lcp: Math.round(m.lcp), cls: Math.round(m.cls * 1000) / 1000, tbt: Math.round(m.tbt), kb: Math.round(byte / 1024), richieste, erroriJs, rotti });
  } catch (e) {
    fuori.errore = String(e.message).split('\n')[0].slice(0, 160);
  }
  await ctx.close();
  return fuori;
}

async function datiReali(sito, pagine) {
  const chiave = process.env.PSI_KEY;
  if (!chiave) return { attivo: false, dati: {} };
  const dati = {};
  const chiedi = async (corpo) => {
    const r = await fetch('https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=' + encodeURIComponent(chiave), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
    });
    return r.status === 200 ? r.json() : null;
  };
  dati['(tutto il sito)'] = daCrux(await chiedi({ origin: sito, formFactor: 'PHONE' }));
  for (const pagina of pagine) {
    dati[pagina] = daCrux(await chiedi({ url: sito + pagina, formFactor: 'PHONE' }));
    await new Promise((ok) => setTimeout(ok, 200));
  }
  return { attivo: true, dati };
}

async function main() {
  const sito = argomento('sito', 'https://strumentiutili.it').replace(/\/$/, '');
  const elenco = argomento('pagine');
  const pagine = elenco ? elenco.split(',') : pagineDalSitemap();
  const uscita = argomento('uscita', 'misure.json');
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const misure = [];
  for (const pagina of pagine) {
    const m = await misuraPagina(browser, sito, pagina);
    misure.push(m);
    console.log(`${pagina}  ${m.errore || `LCP ${m.lcp} ms, CLS ${m.cls}, blocco ${m.tbt} ms, ${m.kb} KB`}`);
  }
  await browser.close();
  const reali = await datiReali(sito, pagine);
  const data = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(uscita, JSON.stringify({ data, sito, misure, crux: reali.dati, cruxAttivo: reali.attivo }, null, 1));
  console.log(`Scritto ${uscita}: ${misure.length} pagine` + (reali.attivo ? ', con i dati di utenti reali.' : '.'));
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { pagineDalSitemap };
