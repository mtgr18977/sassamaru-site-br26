'use strict';
/**
 * PWA compliance tests
 * Validates that all HTML files and supporting PWA files are correctly configured.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// ── 1. Required files exist ───────────────────────────────────────────────────
section('Required PWA files exist');
const requiredFiles = [
  'manifest.json',
  'service-worker.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(ROOT, f)), `${f} exists`);
}

// ── 2. Manifest is valid JSON and has required fields ─────────────────────────
section('manifest.json validity');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert(true, 'manifest.json is valid JSON');
} catch (e) {
  assert(false, `manifest.json is valid JSON — ${e.message}`);
}

if (manifest) {
  assert(typeof manifest.name === 'string' && manifest.name.length > 0, 'has "name"');
  assert(typeof manifest.short_name === 'string', 'has "short_name"');
  assert(typeof manifest.start_url === 'string', 'has "start_url"');
  assert(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display), 'display is standalone/fullscreen/minimal-ui');
  assert(typeof manifest.background_color === 'string', 'has "background_color"');
  assert(typeof manifest.theme_color === 'string', 'has "theme_color"');
  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'has at least 2 icons');

  const has192 = manifest.icons.some(i => i.sizes && i.sizes.includes('192'));
  const has512 = manifest.icons.some(i => i.sizes && i.sizes.includes('512'));
  assert(has192, 'has 192x192 icon');
  assert(has512, 'has 512x512 icon');

  // Verify icon files referenced in manifest exist
  for (const icon of manifest.icons) {
    const iconPath = path.join(ROOT, icon.src.replace(/^\.\//, ''));
    assert(fs.existsSync(iconPath), `icon file exists: ${icon.src}`);
  }
}

// ── 3. Service worker is valid JS ─────────────────────────────────────────────
section('service-worker.js validity');
const swContent = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
assert(swContent.includes("'install'"), 'SW handles install event');
assert(swContent.includes("'activate'"), 'SW handles activate event');
assert(swContent.includes("'fetch'"), 'SW handles fetch event');
assert(swContent.includes('caches.open'), 'SW uses Cache API');
assert(swContent.includes('skipWaiting'), 'SW calls skipWaiting');
assert(swContent.includes('clients.claim'), 'SW calls clients.claim');

// ── 4. All HTML files have PWA meta tags ──────────────────────────────────────
section('HTML files have PWA meta tags');
const htmlFiles = [
  'apps/index.html',
  'apps/bench-selecoes.html',
  'simulacoes/bench-copa2026.html',
  'simulacoes/bench-brasileirao2026.html',
];

for (const htmlFile of htmlFiles) {
  const content = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
  const name = path.basename(htmlFile);
  assert(content.includes('rel="manifest"') || content.includes("rel='manifest'"), `${name}: links manifest`);
  assert(content.includes('theme-color'), `${name}: has theme-color meta`);
  assert(content.includes('apple-mobile-web-app-capable'), `${name}: has apple-mobile-web-app-capable`);
  assert(content.includes('apple-touch-icon'), `${name}: has apple-touch-icon`);
  assert(content.includes('serviceWorker'), `${name}: registers service worker`);
  assert(content.includes('service-worker.js'), `${name}: references service-worker.js`);
}

// ── 5. Icon file sizes are reasonable ────────────────────────────────────────
section('Icon file sizes');
const icon192 = fs.statSync(path.join(ROOT, 'icons/icon-192.png'));
const icon512 = fs.statSync(path.join(ROOT, 'icons/icon-512.png'));
assert(icon192.size > 500, `icon-192.png is non-trivial (${icon192.size} bytes)`);
assert(icon512.size > 500, `icon-512.png is non-trivial (${icon512.size} bytes)`);

// ── Service worker caching strategy ───────────────────────────────────────────
//
// Regressão real: o SW era cache-first para TODO recurso same-origin. Quando
// modelos/model.js mudou sem bump do CACHE_VERSION, o navegador manteve o JS
// antigo em cache enquanto o HTML vinha novo da rede, e a página quebrou com
// "computeSeasonState is not a function". Código da aplicação tem que ser
// network-first para que HTML e JS nunca fiquem em versões diferentes.
section('Service worker caching strategy');

const swSrc = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

// Carrega o SW num sandbox e recupera a função de decisão de rota.
let swApi = null;
try {
  const listeners = {};
  const fakeSelf = {
    addEventListener: (evt, fn) => { listeners[evt] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    location: { origin: 'https://example.test' },
  };
  const factory = new Function(
    'self', 'caches', 'fetch', 'Response', 'URL',
    swSrc + '\n;return { isAppCode, CACHE_NAME, PRECACHE_ASSETS, listeners: arguments[0] };'
  );
  swApi = factory(fakeSelf, { open: async () => ({}), match: async () => null },
                  async () => ({ ok: true, clone: () => ({}) }), function Response() {}, URL);
  assert(true, 'service-worker.js carrega num sandbox');
} catch (e) {
  assert(false, `service-worker.js carrega num sandbox (${e.message})`);
}

if (swApi) {
  const decide = (pathname, mode) =>
    swApi.isAppCode(new URL('https://example.test' + pathname), { mode: mode || 'no-cors' });

  // código e documentos → network-first
  assert(decide('/modelos/model.js'), 'modelos/model.js usa network-first');
  assert(decide('/modelos/selecoes-model.js'), 'selecoes-model.js usa network-first');
  assert(decide('/apps/index.html'), 'apps/index.html usa network-first');
  assert(decide('/manifest.json'), 'manifest.json usa network-first');
  assert(decide('/', 'navigate'), 'navegação na raiz usa network-first');
  assert(decide('/qualquer/coisa', 'navigate'), 'qualquer navegação usa network-first');

  // assets estáticos seguem cache-first (velocidade + offline)
  assert(!decide('/icons/icon-192.png'), 'icon-192.png segue cache-first');
  assert(!decide('/icons/icon.svg'), 'icon.svg segue cache-first');

  assert(swApi.PRECACHE_ASSETS.includes('./modelos/model.js'),
    'modelos/model.js está no precache');
  assert(/^br26-v\d+$/.test(swApi.CACHE_NAME),
    `CACHE_NAME tem versão (${swApi.CACHE_NAME})`);
}

assert(/async function networkFirst\(/.test(swSrc),
  'service-worker.js implementa networkFirst');

// Detalhe que já passou batido: sem forçar a revalidação, o fetch do
// networkFirst consulta o cache HTTP do navegador e pode devolver o arquivo
// antigo sem perguntar ao servidor — "network-first" no nome e cache-first no
// efeito. Um teste com o service worker ativo mostrou o JS velho sendo servido
// mesmo depois da estratégia mudar.
assert(/fetch\(request, \{ cache: 'no-cache' \}\)/.test(swSrc),
  "networkFirst força revalidação com cache: 'no-cache'");
// compara sobre o código sem comentários — o comentário acima cita
// client.navigate() justamente para explicar por que não se usa
const swCode = swSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert(!/client\.navigate\(/.test(swCode),
  'activate não recarrega abas à força (causava laço de reload)');
assert(/async function cacheFirst\(/.test(swSrc),
  'service-worker.js mantém cacheFirst para assets');

// ── Cabeçalhos de cache (_headers) ────────────────────────────────────────────
//
// Terceira camada contra o bug de versões dessincronizadas: quando a guarda de
// versão se cura, ela remove o service worker, e a partir daí só os cabeçalhos
// do servidor evitam que o navegador segure o JS antigo.
section('Cache headers (_headers)');

const headersPath = path.join(ROOT, '_headers');
assert(fs.existsSync(headersPath), '_headers existe');

if (fs.existsSync(headersPath)) {
  const regras = {};
  let atual = null;
  for (const linha of fs.readFileSync(headersPath, 'utf8').split('\n')) {
    if (!linha.trim() || linha.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(linha)) { atual = linha.trim(); regras[atual] = []; }
    else if (atual) regras[atual].push(linha.trim());
  }

  const revalida = (rota) =>
    Array.isArray(regras[rota]) &&
    regras[rota].some((h) => /cache-control:.*must-revalidate/i.test(h)) &&
    regras[rota].some((h) => /cache-control:.*max-age=0/i.test(h));

  assert(revalida('/*.html'), 'HTML revalida (max-age=0, must-revalidate)');
  assert(revalida('/modelos/*'), 'modelos/* revalida — precisa acompanhar o HTML');
  assert(revalida('/service-worker.js'), 'service-worker.js revalida');
  assert(Object.keys(regras).every((r) => r.startsWith('/')),
    'todas as rotas do _headers começam com /');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`PWA tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
