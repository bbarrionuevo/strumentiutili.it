/*
 * Generate pSEO landing pages from the live static tool templates.
 *
 * Usage: node scripts/generate-pseo.js
 * The source templates are only read; every generated page is written to a
 * sibling directory named by the relevant pSEO slug.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const rulesPath = path.join(projectRoot, 'data', 'regole-fiscali-2026.json');
const siteOrigin = 'https://strumentiutili.it';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Unable to read JSON data at ${filePath}: ${error.message}`);
    return null;
  }
}

const regole = readJson(rulesPath);

if (!regole) {
  process.exitCode = 1;
} else {
  const pSEOTargets = [
    {
      name: 'Partita IVA forfettaria',
      templatePath: './fisco-professioni/partita-iva/index.html',
      outputDirBase: './fisco-professioni/partita-iva-',
      dataArray: regole.partitaIvaForfettario?.profesioniSEO,
      titleReplacer: (item) => `<title>Calcolo Partita IVA Forfettaria 2026: ${escapeHtml(item.nome)} - StrumentiUtili.it</title>`,
      h1Replacer: (item) => `<h1>Calcolo Partita IVA Forfettaria: ${escapeHtml(item.nome)}</h1>`,
      metaDescriptionReplacer: (item) => `Calcola tasse, contributi INPS e netto della Partita IVA forfettaria 2026 per ${item.nome}. Coefficiente di redditività ${formatPercent(item.coeff)} e ATECO ${item.ateco}.`,
      prefill: (html, item, warnings) => {
        const formValue = 'professionisti';
        let result = setSelectedOption(html, 'ateco', formValue, warnings);
        result = replaceOptionText(
          result,
          'ateco',
          formValue,
          `${escapeHtml(item.nome)} — ATECO ${escapeHtml(item.ateco)} (coefficiente ${formatPercent(item.coeff)})`,
          warnings
        );
        return addAttributesToElement(result, 'select', 'ateco', {
          'data-pseo-professione': item.slug,
          'data-pseo-ateco': item.ateco,
          'data-pseo-coeff': String(item.coeff)
        }, warnings);
      }
    },
    {
      name: 'Bollo auto regionale',
      templatePath: './cittadino-tasse/calcolo-bollo-auto/index.html',
      outputDirBase: './cittadino-tasse/calcolo-bollo-auto-',
      dataArray: regole.bollo_auto_2026?.regioniSEO,
      titleReplacer: (item) => `<title>Calcolo Bollo Auto 2026: Regione ${escapeHtml(item.nome)} - StrumentiUtili.it</title>`,
      h1Replacer: (item) => `<h1>Calcolo Bollo Auto 2026: ${escapeHtml(item.nome)}</h1>`,
      metaDescriptionReplacer: (item) => `Calcola il bollo auto e il superbollo 2026 per la Regione ${item.nome}. Inserisci potenza in kW, classe Euro e anno del veicolo.`,
      prefill: (html, item, warnings) => setSelectedOption(html, 'calc-regione', item.slug, warnings)
    },
    {
      name: 'Dimissioni e preavviso CCNL',
      templatePath: './lavoro-contratti/lettera-dimissioni-preavviso/index.html',
      outputDirBase: './lavoro-contratti/lettera-dimissioni-',
      dataArray: regole.ccnl_dimissioni?.ccnlSEO,
      titleReplacer: (item) => `<title>Lettera di Dimissioni e Preavviso: CCNL ${escapeHtml(item.nome)} - StrumentiUtili.it</title>`,
      h1Replacer: (item) => `<h1>Lettera di Dimissioni e Calcolo Preavviso: CCNL ${escapeHtml(item.nome)}</h1>`,
      metaDescriptionReplacer: (item) => `Calcola il preavviso per dimissioni con CCNL ${item.nome} e genera una lettera di dimissioni pronta da scaricare in PDF.`,
      prefill: (html, item, warnings) => {
        const ccnlValue = item.codice || item.slug;
        const result = setSelectedOption(html, 'input-ccnl', ccnlValue, warnings);
        return injectCcnlDefault(result, ccnlValue);
      }
    }
  ];

  const summaries = pSEOTargets.map(generateTarget);
  console.table(summaries);

  if (summaries.some((summary) => summary.errors > 0)) {
    process.exitCode = 1;
  }
}

function generateTarget(target) {
  const summary = { tool: target.name, generated: 0, skipped: 0, errors: 0 };
  const templateFile = resolveProjectPath(target.templatePath);

  if (!Array.isArray(target.dataArray) || target.dataArray.length === 0) {
    console.error(`[${target.name}] Missing or empty data array.`);
    summary.errors += 1;
    return summary;
  }

  let template;
  try {
    template = fs.readFileSync(templateFile, 'utf8');
  } catch (error) {
    console.error(`[${target.name}] Template not found (${templateFile}): ${error.message}`);
    summary.errors += 1;
    return summary;
  }

  for (const item of target.dataArray) {
    if (!isValidItem(item)) {
      console.warn(`[${target.name}] Skipping malformed item: ${JSON.stringify(item)}`);
      summary.skipped += 1;
      continue;
    }

    const warnings = [];
    const outputDirectory = resolveProjectPath(`${target.outputDirBase}${item.slug}`);
    const outputFile = path.join(outputDirectory, 'index.html');

    try {
      let html = template;
      const sourceCanonical = getCanonicalUrl(html);
      const outputUrl = `${siteOrigin}${toSitePath(outputFile)}`;

      html = replaceTitle(html, target.titleReplacer(item), warnings);
      html = replaceH1Content(html, target.h1Replacer(item), warnings);
      html = replaceMetaDescriptions(html, target.metaDescriptionReplacer(item), warnings);
      html = target.prefill ? target.prefill(html, item, warnings) : html;
      html = addNoindex(html, warnings);

      // Generated directories are siblings of their templates and the three
      // templates use root-absolute asset paths. Preserve those paths exactly.
      if (sourceCanonical) {
        html = html.split(sourceCanonical).join(outputUrl);
      } else {
        warnings.push('canonical URL not found');
      }

      fs.mkdirSync(outputDirectory, { recursive: true });
      fs.writeFileSync(outputFile, html, 'utf8');
      summary.generated += 1;

      if (warnings.length > 0) {
        console.warn(`[${target.name}/${item.slug}] ${warnings.join('; ')}`);
      }
    } catch (error) {
      console.error(`[${target.name}/${item.slug}] Failed to generate page: ${error.message}`);
      summary.errors += 1;
    }
  }

  return summary;
}

// Le varianti sono la stessa pagina con un'altra etichetta: indicizzate
// sarebbero contenuto duplicato, il motivo tipico per cui AdSense rifiuta un
// sito. Restano raggiungibili (e trovabili dalla ricerca interna), ma fuori
// dall'indice di Google e dal sitemap finche' non hanno un contenuto proprio.
function addNoindex(html, warnings) {
  if (/<meta\b[^>]*\bname=(['"])robots\1/i.test(html)) return html;
  const viewport = /(<meta\b[^>]*\bname=(['"])viewport\2[^>]*>\n)/i;
  if (!viewport.test(html)) {
    warnings.push('viewport meta not found: noindex not added');
    return html;
  }
  return html.replace(viewport, '$1  <meta name="robots" content="noindex, follow" />\n');
}

function resolveProjectPath(relativePath) {
  return path.resolve(projectRoot, relativePath);
}

function toSitePath(absoluteFilePath) {
  const relative = path.relative(projectRoot, absoluteFilePath).split(path.sep).join('/');
  return `/${relative.replace(/index\.html$/, '')}`;
}

function isValidItem(item) {
  return item && typeof item.slug === 'string' && /^[a-z0-9_-]+$/.test(item.slug) && typeof item.nome === 'string';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function replaceTitle(html, replacement, warnings) {
  const pattern = /<title\b[^>]*>[\s\S]*?<\/title>/i;
  if (!pattern.test(html)) warnings.push('title not found');
  return html.replace(pattern, replacement);
}

function replaceH1Content(html, replacement, warnings) {
  const replacementMatch = replacement.match(/^<h1\b[^>]*>([\s\S]*)<\/h1>$/i);
  if (!replacementMatch) {
    warnings.push('invalid h1 replacement');
    return html;
  }

  const pattern = /(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i;
  if (!pattern.test(html)) warnings.push('h1 not found');
  return html.replace(pattern, `$1${replacementMatch[1]}$2`);
}

function replaceMetaDescriptions(html, description, warnings) {
  const escapedDescription = escapeHtml(description);
  let replacements = 0;
  const result = html.replace(/<meta\b[^>]*\b(?:name|property)=(['"])(?:description|og:description|twitter:description)\1[^>]*>/gi, (tag) => {
    replacements += 1;
    if (/\bcontent=(['"])[\s\S]*?\1/i.test(tag)) {
      return tag.replace(/\bcontent=(['"])[\s\S]*?\1/i, `content="${escapedDescription}"`);
    }
    return tag.replace(/>$/, ` content="${escapedDescription}">`);
  });

  if (replacements === 0) warnings.push('meta description not found');
  return result;
}

function findSelect(html, selectId) {
  return new RegExp(`(<select\\b[^>]*\\bid=(['"])${escapeRegExp(selectId)}\\2[^>]*>[\\s\\S]*?<\\/select>)`, 'i');
}

function setSelectedOption(html, selectId, value, warnings) {
  const selectPattern = findSelect(html, selectId);
  let selectFound = false;
  let optionFound = false;

  const result = html.replace(selectPattern, (select) => {
    selectFound = true;
    const withoutSelected = select.replace(/(<option\b[^>]*?)\sselected(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '$1');
    const optionPattern = new RegExp(`(<option\\b(?=[^>]*\\bvalue=(['"])${escapeRegExp(value)}\\2)[^>]*)(>)`, 'i');
    return withoutSelected.replace(optionPattern, (option, open, quote, close) => {
      optionFound = true;
      return `${open} selected${close}`;
    });
  });

  if (!selectFound) warnings.push(`select #${selectId} not found`);
  else if (!optionFound) warnings.push(`option "${value}" not found in #${selectId}`);
  return result;
}

function replaceOptionText(html, selectId, value, text, warnings) {
  const selectPattern = findSelect(html, selectId);
  let optionFound = false;
  const result = html.replace(selectPattern, (select) => {
    const optionPattern = new RegExp(`(<option\\b(?=[^>]*\\bvalue=(['"])${escapeRegExp(value)}\\2)[^>]*>)[\\s\\S]*?(<\\/option>)`, 'i');
    return select.replace(optionPattern, (match, open, quote, close) => {
      optionFound = true;
      return `${open}${text}${close}`;
    });
  });

  if (!optionFound) warnings.push(`could not personalise option "${value}" in #${selectId}`);
  return result;
}

function addAttributesToElement(html, tagName, elementId, attributes, warnings) {
  const pattern = new RegExp(`(<${tagName}\\b[^>]*\\bid=(['"])${escapeRegExp(elementId)}\\2[^>]*)(>)`, 'i');
  if (!pattern.test(html)) {
    warnings.push(`${tagName}#${elementId} not found for pSEO data attributes`);
    return html;
  }

  const attributesText = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  return html.replace(pattern, `$1${attributesText}$3`);
}

function getCanonicalUrl(html) {
  const match = html.match(/<link\b(?=[^>]*\brel=(['"])canonical\1)[^>]*\bhref=(['"])([^'"]+)\2[^>]*>/i);
  return match ? match[3] : null;
}

function injectCcnlDefault(html, ccnlValue) {
  const value = JSON.stringify(ccnlValue);
  const snippet = `\n  <script id="pseo-default-ccnl">\n    window.addEventListener('load', function () {\n      var select = document.getElementById('input-ccnl');\n      if (!select || !select.querySelector('option[value="' + ${value} + '"]')) return;\n      select.value = ${value};\n      select.dispatchEvent(new Event('change', { bubbles: true }));\n    }, { once: true });\n  </script>`;
  return html.includes('</body>') ? html.replace('</body>', `${snippet}\n</body>`) : `${html}${snippet}`;
}
