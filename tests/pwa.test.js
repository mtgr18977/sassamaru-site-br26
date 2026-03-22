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

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`PWA tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
