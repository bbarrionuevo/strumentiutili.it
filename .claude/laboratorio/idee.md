# Registro de ideas del laboratorio

Lo usa la skill `laboratorio`: cada idea con su puntaje (Demanda, Originalidad, Fuente, Factibilidad, Mantenimiento, de 0 a 3) y el motivo. Se construye solo si suma ≥ 12 sin ningún 0. Más reciente arriba.

## En curso
- (nada)

## En espera (con la condición para retomarlas)
- **Impuesto de sucesión en autoliquidación** (burocrática) — D3 · O3 · F1 · Fa3 · M2 = 12, pero **descartada por ahora**:
  - **Motivo:** los arts. 7 (tasas y franquicias) y 38 (pago a plazos) del D.Lgs. 346/1990 (`;346:1~art7`, `~art38`) **quedan derogados desde el 1/1/2027** por el D.Lgs. 1 agosto 2025, n. 123 (texto único de registro y otros tributos indirectos), modificado por el D.L. 200/2025.
  - **Retomar cuando:** se hayan leído los artículos del nuevo texto único que los reemplazan (anexo `;123:1`) y las instrucciones del modelo actualizadas para 2027.
  - **Ya leído** el 03/10/2026, en las instrucciones Fascicolo 1 actualizadas el 15/07/2025:
    - tasas y franquicias por grado de parentesco: 4 % sobre lo que excede 1.000.000 €; 6 % sobre lo que excede 100.000 € para hermanos; 6 % y 8 %; 1.500.000 € con discapacidad;
    - hipotecaria 2 % (mínimo 200 €) y catastral 1 % (mínimo 200 €); 200 + 200 € para la primera vivienda;
    - tasas de servicios: 120 € por conservatoria; sellos: 85 € más 32 € si se pide la constancia;
    - pago a 90 días; anticipo del 20 %; hasta 8 o 12 cuotas trimestrales.
  - **Ejemplos oficiales** para los tests: nuda propiedad 200.000 € × 50 % − 200.000 € × 50 % × 2,5 % × 20 = 50.000 €; usufructos 47.500 € y 45.000 €, nuda propiedad 7.500 €.
- **Rateización de cartelle** (burocrática): el art. 19 del D.P.R. 602/1973 cambia con el D.Lgs. 33/2025 desde el 1/1/2027. Esperar el texto vigente en 2027 y el modelo nuevo de AdER.
- **Oposición a los gastos sanitarios de la precompilada, año 2026** (burocrática, tarea PR H): ventana desde octubre. Primero comprobar con `leggi-fonti` si la Agenzia ya publicó el modelo del año de impuesto 2026.
- **Compresor de video en el navegador (WebCodecs)** (tecnológica) — D3 · O3 · F3 · Fa1 · M3 = 13.
  - **Riesgo:** el Chromium de pruebas no tiene H.264 ni AAC, así que no se puede probar en CI.
  - **Retomar** con una salida VP9/AV1 en WebM, que sí se puede probar, y H.264 solo donde el navegador lo ofrezca.

## Por evaluar
- **Más años en los umbrales de usura** (mejora): el modo `storico` de `usura.yml` (03/10/2026) solo encontró por nombre habitual 2025-04 y 2025-10.
  - Faltan 2025-07 y los años anteriores, que tienen otros nombres de archivo o maquetaciones distintas.
  - Leer con `leggi-fonti` la página del MEF de cada año (el filtro por año no va por URL: buscar el enlace al archivo) y probar el parser con un decreto viejo antes de ampliarlo.
- **Contribuciones INPS de colf y badanti 2026** (burocrática):
  - plazos trimestrales (10 de enero, abril, julio y octubre);
  - falta encontrar la circular INPS del año con la tabla de aportes por hora;
  - registrar en `scadenze` la circular anual.
- **Rescate de la carrera (riscatto laurea agevolato)** (burocrática): el importe anual sale de la circular INPS de cada año. Buscarla.
- **Pensión de reversibilidad** (burocrática): porcentajes y reducciones por ingreso (L. 335/1995, Tabla F) más el trattamento minimo del año (INPS).
- **Quitar el fondo de fotos** (tecnológica): solo con un modelo de licencia comercial compatible; descartar los modelos «non-commercial».

## Hechas
- **Convertir HEIC a JPG** (`utilita-web/convertire-heic-jpg/`, 03/10/2026) — D3 · O3 · F3 · Fa3 · M2 = 14.
  - `libheif-js` 1.23.2 en `vendor/` (LGPL-3.0, wasm), un Web Worker por procesador libre (hasta 4), OffscreenCanvas, ZIP con fflate.
  - Probado en Playwright: 3 fotos de 12 MP más archivos de prueba en 1,1 s (computadora) y 2,3 s (móvil emulado).
  - Detecta los archivos que no son HEIC por la cabecera; JPG, PNG o WebP; reducción del lado largo.
  - Tests con HEIC reales generados con `pillow-heif` (colores decodificados verificados).
- **Tassi soglia usura** (PR #39, 03/10/2026): datos que se actualizan solos cada trimestre.
- **Vistas interactivas del sueldo neto** (PR #39).
