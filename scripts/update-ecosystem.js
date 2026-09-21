const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const ignoreDirs = ['node_modules', '.git', 'scripts', 'src', 'assets', 'css', 'data', 'js'];

// 1. Escanear todos los HTML del disco duro
function getHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!ignoreDirs.includes(file)) getHtmlFiles(filePath, fileList);
    } else if (file.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const htmlFiles = getHtmlFiles(rootDir);
const discoveredUrls = new Set(['/']);

// 2. Limpiar URLs (Estilo Vercel)
htmlFiles.forEach(file => {
  let relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
  if (relativePath === 'index.html') return;
  if (relativePath.endsWith('/index.html')) {
    discoveredUrls.add(`/${relativePath.replace('index.html', '')}`);
  } else {
    discoveredUrls.add(`/${relativePath.replace('.html', '')}/`);
  }
});

const urlArray = Array.from(discoveredUrls);
const today = new Date().toISOString().split('T')[0];

// ==========================================
// A. ACTUALIZAR SITEMAP.XML (Solo Inyección de Faltantes)
// ==========================================
const sitemapPath = path.join(rootDir, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  
  // Extraer las URLs que YA están en el sitemap
  const existingLocs = new Set([...sitemap.matchAll(/<loc>https:\/\/strumentiutili\.it([^<]+)<\/loc>/g)].map(m => m[1]));
  
  // Filtrar las que encontramos en el disco pero no están en el XML
  const missingSitemap = urlArray.filter(url => !existingLocs.has(url));

  if (missingSitemap.length > 0) {
    let newXml = '\n  <!-- Aggiunte automaticamente -->\n';
    missingSitemap.forEach(url => {
      // Prioridad 0.7 para las inyecciones automáticas (pSEO de long-tail)
      let priority = url.split('/').length > 4 ? '0.7' : '0.8';
      newXml += `  <url><loc>https://strumentiutili.it${url}</loc><priority>${priority}</priority></url>\n`;
    });
    // Inyectar justo antes de cerrar el sitemap
    sitemap = sitemap.replace('</urlset>', newXml + '</urlset>');
    fs.writeFileSync(sitemapPath, sitemap);
    console.log(`✅ sitemap.xml: Se inyectaron ${missingSitemap.length} URLs nuevas (tus prioridades originales siguen intactas).`);
  } else {
    console.log(`✅ sitemap.xml: Ya estaba al día. No faltaba nada.`);
  }
}

// ==========================================
// B. ACTUALIZAR SW.JS (No Destructivo + Sube Versión)
// ==========================================
const swPath = path.join(rootDir, 'sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');

  // 1. Subir la versión de la caché (Ej: v18 -> v19)
  let oldVersion = '';
  swContent = swContent.replace(/strumentiutili-v(\d+)/, (match, p1) => {
    oldVersion = match;
    return `strumentiutili-v${parseInt(p1) + 1}`;
  });

  // 2. Buscar el bloque del APP_SHELL sin alterar tus comentarios
  const shellMatch = swContent.match(/(const APP_SHELL = \[[\s\S]*?)(\n\];)/);
  if (shellMatch) {
    // Extraer las rutas que YA están cacheadas
    const existingSwUrls = new Set([...shellMatch[1].matchAll(/'(\/[^']+)'/g)].map(m => m[1]));
    
    // Filtrar las que faltan
    const missingSw = urlArray.filter(url => !existingSwUrls.has(url));

    if (missingSw.length > 0) {
      const newEntries = missingSw.map(u => `  '${u}'`).join(',\n');
      
      // Asegurar que el bloque anterior termine con coma
      let prevBlock = shellMatch[1].trimEnd();
      if (!prevBlock.endsWith(',')) prevBlock += ',';
      
      // Inyectar al final del array
      swContent = swContent.replace(shellMatch[0], `${prevBlock}\n  // --- Aggiunte automaticamente ---\n${newEntries}${shellMatch[2]}`);
      fs.writeFileSync(swPath, swContent);
      console.log(`✅ sw.js: Se subió a la nueva versión y se agregaron ${missingSw.length} rutas nuevas al final.`);
    } else {
      fs.writeFileSync(swPath, swContent);
      console.log(`✅ sw.js: Se subió de versión. No faltaban rutas nuevas.`);
    }
  }
}