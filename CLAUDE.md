# strumentiutili.it — instrucciones para las sesiones de Claude

Sitio estático italiano de herramientas (Vanilla JS, Tailwind v4, PWA), publicado en Vercel desde `main`. El responsable es Brian Barrionuevo.

## Reglas fijas
- **100 % client-side.** Nada de servidores, bases de datos ni API de pago: todo el cálculo ocurre en el navegador. GitHub Actions solo sirve para mantener el repositorio (leer fuentes, controles), nunca para el sitio.
- **Ninguna cifra, plazo, dirección o código sin haberlo leído en el documento oficial.** Si no se puede leer, no se escribe: la página dice que falta o el cambio espera.
- **Consentimiento de cookies:** Google AdSense exige el cartel de aceptar o rechazar, y ya lo configuró Brian en Google. No tocar la carga de los anuncios ni el consentimiento sin necesidad.
- **Direcciones:** una página publicada no cambia de dirección ni se borra sin una redirección 301 en `vercel.json`, en la misma PR.
  - Con `cleanUrls`, la redirección va desde la forma con barra (`/vieja/`), no desde `/vieja.html`.
  - `data/indirizzi-noti-google.json` lista las direcciones que Google conoce y solo se le agregan. `tests/sitemap.test.js` comprueba que todas lleguen a una página real.
  - Entre el 21 y el 25/9 una mudanza de carpetas, con direcciones en 404 durante días, se llevó casi todas las visitas de Google.
- **Páginas fuera de tema** (juegos, música, salud, santo del día): `noindex, follow`, fuera de la sitemap y sin espacios publicitarios, pero siguen en línea y en el buscador del sitio. La lista está en `tests/indicizzazione.test.js`; una herramienta nueva fuera del tema fiscal, laboral o de documentos entra ahí.
- **Privacidad:** no publicar el email de Brian. Los campos con código fiscal o IBAN no se guardan en el navegador (regex `SENSIBILE` en `js/storage-helper.js`).
- **Nada llega a `main` sin una pull request con CI y Vercel en verde.**
  - Única excepción: los datos vivos (`data/vivi/<nombre>/`) que un workflow actualiza solo, como los precios de los carburantes.
  - Ese workflow valida los datos, corre los tests y solo puede escribir en su carpeta: lo comprueba un test.
  - El código y las páginas siguen pasando por PR.

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

## Toda herramienta nueva entra en el mantenimiento automático
Si una herramienta depende de algo que puede cambiar (una cifra, una norma, un modelo, un plazo, datos que se descargan), en la misma PR se registra en `data/fonti-monitorate.json`:
- **datos en `regole-fiscali`**: una entrada en `copertura` para el bloque nuevo, con cómo se vigila:
  - `schede`: páginas oficiales con `deve_contenere`;
  - `scadenze`: recordatorios;
  - `norme`: artículos de Normattiva que la sentinella relee;
  - `modelli`;
  - `serie`;
  - `dati_vivi`.
- **artículos de ley que la página no enlaza**: en `norme`.
- **formularios oficiales**: en `MODELLI` de `scripts/scarica-modelli-ufficiali.py`.
- **datos que un workflow actualiza solo** (precios, tasas del día): en `dati_vivi`, con el archivo, el campo con la fecha y los días máximos. Si el workflow se detiene, la sentinella avisa.

`tests/fonti-monitorate.test.js` falla si un bloque de datos o un PDF oficial no tiene vigilancia.

## El sitio se mantiene y mejora solo, semana a semana
- **Domingo:** `metriche.yml` mide todas las páginas del sitio publicado con Playwright (telefono, CPU 4×, red móvil, anuncios reales).
  - Actualiza la issue fijada «Qualità del sito (misure settimanali)».
  - Abre una issue `qualita` por cada problema grave: página rota, CLS, errores JS, empeoramientos.
  - Con el secreto `PSI_KEY` (clave gratuita de Google, Chrome UX Report API) suma datos de usuarios reales.
  - `scripts/qualita/google.js` mira cada página como Googlebot (noindex, canonical, respuestas). Con el secreto `GSC_CREDENZIALI` (clave JSON de una cuenta de servicio agregada como usuario en Search Console) suma:
    - el estado de cada página en el índice de Google y el motivo si está afuera;
    - clics e impresiones;
    - las búsquedas reales que el buscador del sitio (`js/assistente.js`) no entiende.
  - Control rápido: `metriche.yml` con `modo=google`.
  - Solo escribe issues, nunca en el repositorio.
- **Lunes:** la sentinella y la rutina «Correttore» (skill `aggiorna-fonti`) mantienen correcto lo que ya existe.
- **Miércoles:** la rutina «Laboratorio» (skill `laboratorio`) hace tres cosas:
  - corrige lo que midió el domingo y le enseña al buscador las búsquedas que no entendió (`data/sinonimi.json`);
  - construye **como máximo una** herramienta nueva, solo si pasa los filtros de demanda, originalidad, ley vigente hoy y el próximo 1/1, ejemplo oficial con test escrito antes que el código, y mantenimiento automático;
  - una vez por mes, propone podar las herramientas sin uso.
- Las ideas, con su puntaje y los motivos de descarte, están en `.claude/laboratorio/idee.md`.

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
