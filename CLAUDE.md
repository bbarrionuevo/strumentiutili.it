# strumentiutili.it — instrucciones para las sesiones de Claude

Sitio estático italiano de herramientas (Vanilla JS, Tailwind v4, PWA), publicado en Vercel desde `main`. El responsable es Brian Barrionuevo.

## Reglas fijas
- **100 % client-side.** Nada de servidores, bases de datos ni API de pago: todo el cálculo ocurre en el navegador. GitHub Actions solo sirve para mantener el repositorio (leer fuentes, controles), nunca para el sitio.
- **Ninguna cifra, plazo, dirección o código sin haberlo leído en el documento oficial.** Si no se puede leer, no se escribe: la página dice que falta o el cambio espera.
- **Consentimiento de cookies:** Google AdSense exige el cartel de aceptar o rechazar, y ya lo configuró Brian en Google. No tocar la carga de los anuncios ni el consentimiento sin necesidad.
- **Privacidad:** no publicar el email de Brian. Los campos con código fiscal o IBAN no se guardan en el navegador (regex `SENSIBILE` en `js/storage-helper.js`).
- **Nada llega a `main` sin una pull request con CI y Vercel en verde.**

## Idiomas
- Textos del sitio: italiano llano. Comentarios del código: italiano.
- Commits: en español, con las líneas de atribución que indique la sesión.
- Cuerpo de las PR: en italiano.
- Con Brian: español rioplatense (voseo).

## Dónde están los datos
- `data/regole-fiscali-2026.json`: todas las cifras fiscales, con su `fonte`.
- `js/*.js`: los motores de cálculo son UMD puros, con tests en `tests/`. Las páginas `*-ui.js` solo leen campos y escriben resultados.
- Modelos oficiales rellenables:
  - `scripts/scarica-modelli-ufficiali.py` (dict `MODELLI`) descarga el original;
  - `scripts/prepara-*.py` crea los campos → `assets/pdf/*-compilabile.pdf`;
  - `data/modello*-schema.json` describe los campos;
  - `js/compilatore-moduli.js` los rellena en el navegador.
- `data/fonti-monitorate.json`: fuentes y plazos que vigila la sentinella. Las copias de referencia están en `fonti/archivio/`.

## Leer fuentes oficiales
El sandbox no llega a agenziaentrate.gov.it, normattiva.it, aci.gov.it, inps.it, istat.it ni a la mayoría de los sitios públicos. Se leen con workflows de GitHub, lanzados con `actions_run_trigger` del MCP de GitHub sobre `ref: main`; los registros se leen con `get_job_logs`.
- **`leggi-fonti.yml`:**
  - entradas: `indirizzi` (URL https separadas por espacios) y `modo` (`testo`, o `stato` para el código HTTP y el título);
  - imprime el texto en el registro del job y no escribe nada;
  - usar pocas URL por ejecución: los registros de más de ~5000 líneas se cortan.
  - Normattiva acepta `!vig=AAAA-MM-GG` para el texto vigente en una fecha.
- **`scarica-modelli.yml`:**
  - entradas: `ramo` (nunca `main`) y `nomi` (claves de `MODELLI`);
  - descarga los PDF y los commitea en la rama; después, `git pull`.
- **`sentinella.yml` con `modo=aggiorna`:** entradas `ramo` y `solo` (partes del id, separadas por comas). Reescribe `fonti/archivio/` en la rama.

## Antes de cada commit
```
TZ=UTC npm test && TZ=America/Los_Angeles npm test && TZ=Pacific/Kiritimati npm test
python3 scripts/genera-indice-strumenti.py
for s in applica-layout genera-sitemap genera-calendario copia-vendor genera-santi genera-mappa collega-fonti genera-guide; do node scripts/$s.js --check || echo "DA RIGENERARE: $s"; done
npm run build:css && git diff --exit-code css/styles.css
```
- Si un `--check` falla, se regenera sin `--check` (o con `npm run build`) y se revisa el diff.
- Una página nueva o cambiada sube la versión de `CACHE_NAME` en `sw.js`.
- Las páginas deben tener todos los campos con etiqueta (`tests/etichette.test.js`) y más de 600 palabras propias si son herramientas (`tests/contenuti.test.js`).

## Pull request
- El título y el cuerpo van en italiano: qué cambia, por qué y con qué fuente oficial (enlace).
- **Merge:** con `merge_pull_request` (método `merge`) y `expectedHeadSha` igual a `git rev-parse HEAD`.
  - Solo cuando Brian lo pidió en la sesión.
  - **Nunca en la rutina de mantenimiento.**
