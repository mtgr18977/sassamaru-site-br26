'use strict';
/**
 * Internacionalização (pt-BR · en · zh-CN)
 *
 * O português vive no próprio HTML/JS; i18n/en.js e i18n/zh.js mapeiam
 * "texto em português" → tradução. Este teste garante que:
 *   - os dois dicionários cobrem as mesmas chaves e preservam os {placeholders};
 *   - toda chamada _t('…') nas páginas tem tradução nos dois idiomas;
 *   - todo bloco tagueado de bench-docs.html (data-i18n-html) está traduzido;
 *   - nenhuma chave do dicionário coincide com nome de time (a varredura do DOM
 *     traduz nós de texto inteiros — "Internacional" virava "International"
 *     também na tabela de clubes);
 *   - as páginas carregam o script e o service worker faz o precache dos dicionários.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.error(`  ✗ ${msg}`); failed++; }
}
function section(name) { console.log(`\n${name}`); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const I18N = require('../i18n/i18n.js');
const EN = require('../i18n/en.js');
const ZH = require('../i18n/zh.js');
const EN_DOCS = require('../i18n/en-docs.js');
const ZH_DOCS = require('../i18n/zh-docs.js');

const PAGES = [
  'index.html',
  'bench-docs.html',
  'mundial-2026.html',
  'apps/index.html',
  'apps/bench-selecoes.html',
  'simulacoes/bench-brasileirao2026.html',
  'simulacoes/bench-copa2026.html',
];

const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const isTeam = (k) => k.startsWith('team:');

// ── 1. Dicionários ────────────────────────────────────────────────────────────
section('Dicionários en / zh');
{
  const enKeys = Object.keys(EN);
  const zhKeys = Object.keys(ZH).filter((k) => !isTeam(k));
  const missingZh = enKeys.filter((k) => !(k in ZH));
  const missingEn = zhKeys.filter((k) => !(k in EN));
  assert(missingZh.length === 0, `todas as chaves de en existem em zh${missingZh.length ? ' — faltam: ' + missingZh.slice(0, 5).join(' | ') : ''}`);
  assert(missingEn.length === 0, `todas as chaves de zh existem em en${missingEn.length ? ' — faltam: ' + missingEn.slice(0, 5).join(' | ') : ''}`);

  const badPh = [];
  for (const [dict, name] of [[EN, 'en'], [ZH, 'zh']]) {
    for (const [k, v] of Object.entries(dict)) {
      if (isTeam(k)) continue;
      if (placeholders(k.replace(/@@.*$/, '')) !== placeholders(v)) badPh.push(`${name}: ${k}`);
    }
  }
  assert(badPh.length === 0, `traduções preservam os {placeholders}${badPh.length ? ' — ' + badPh.slice(0, 5).join(' | ') : ''}`);

  const empty = [...Object.entries(EN), ...Object.entries(ZH)].filter(([, v]) => !String(v).trim());
  assert(empty.length === 0, 'nenhuma tradução vazia');

  const docsPt = [...read('bench-docs.html').matchAll(/data-i18n-html="(docs\.\d+)"/g)].map((m) => m[1]);
  const zhLacks = docsPt.filter((k) => !(k in ZH_DOCS));
  const enLacks = docsPt.filter((k) => !(k in EN_DOCS));
  // só ficam de fora blocos sem texto a traduzir: fórmulas puras e siglas idênticas nos três idiomas
  const NEUTRAL = /^(<span class="eq-line[^"]*">[^<]*<\/span>)+$|^(Elo|Poisson \(λ\)|RPS ↓|Sassamaru Docs|Log-loss ↓)$/;
  const html = read('bench-docs.html');
  // conteúdo interno do elemento marcado (fecha na tag de mesmo nome, contando aninhamento)
  const innerOf = (k) => {
    const open = new RegExp(`<(\\w+)[^>]*data-i18n-html="${k.replace('.', '\\.')}"[^>]*>`).exec(html);
    if (!open) return '';
    const tag = open[1], re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    re.lastIndex = open.index + open[0].length;
    let depth = 1, m;
    while ((m = re.exec(html))) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) return html.slice(open.index + open[0].length, m.index).replace(/\s+/g, ' ').trim();
    }
    return '';
  };
  const unjustified = (lacks) => lacks.filter((k) => {
    const inner = innerOf(k);
    return !NEUTRAL.test(inner) || /[À-ÖØ-öø-ÿ]/.test(inner);
  });
  assert(docsPt.length > 200, `bench-docs.html tem ${docsPt.length} blocos data-i18n-html`);
  assert(unjustified(enLacks).length === 0, `docs: todos os blocos têm tradução en${unjustified(enLacks).length ? ' — faltam ' + unjustified(enLacks).join(', ') : ''}`);
  assert(unjustified(zhLacks).length === 0, `docs: todos os blocos têm tradução zh${unjustified(zhLacks).length ? ' — faltam ' + unjustified(zhLacks).join(', ') : ''}`);
  const stray = Object.keys(EN_DOCS).concat(Object.keys(ZH_DOCS)).filter((k) => !docsPt.includes(k));
  assert(stray.length === 0, `docs: nenhuma chave de dicionário órfã${stray.length ? ' — ' + stray.slice(0, 5).join(', ') : ''}`);
}

// ── 2. Toda chamada _t('…') tem tradução ──────────────────────────────────────
section("Chamadas _t('…') nas páginas");
{
  // lê só o JS/HTML fora dos CSVs embutidos (blocos de crases enormes)
  const strip = (src) => src.replace(/`(?:date|ID),[^`]{2000,}`/g, '``');
  const CALL = /\b_t\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\$])*)`)/g;
  let total = 0;
  const missing = [];
  for (const f of PAGES) {
    const src = strip(read(f));
    for (const m of src.matchAll(CALL)) {
      let key = m[1] ?? m[2] ?? m[3];
      key = key.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      total++;
      if (!(key in EN)) missing.push(`en ${f}: ${key.slice(0, 60)}`);
      if (!(key in ZH)) missing.push(`zh ${f}: ${key.slice(0, 60)}`);
    }
  }
  assert(total > 150, `encontradas ${total} chamadas _t()`);
  assert(missing.length === 0, `todas as chaves de _t() têm tradução${missing.length ? ' — ' + missing.slice(0, 6).join(' || ') : ''}`);
}

// ── 3. Chaves × nomes de times ───────────────────────────────────────────────
section('Chaves não colidem com nomes de times');
{
  const csv = read('datasets/campeonato-brasileiro-limpo.csv').split('\n');
  const head = csv[0].split(',');
  const iH = head.indexOf('mandante'), iA = head.indexOf('visitante');
  const clubs = new Set();
  for (const l of csv.slice(1)) { const c = l.split(','); if (c[iH]) clubs.add(c[iH].trim()); if (c[iA]) clubs.add(c[iA].trim()); }
  const display = [...read('apps/index.html').matchAll(/"[a-z ]+":"([^"]+)"/g)].map((m) => m[1]);
  for (const d of display) clubs.add(d);
  const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const clubNorm = new Set([...clubs].map(norm));
  const clash = [];
  for (const [name, dict] of [['en', EN], ['zh', ZH]]) {
    for (const k of Object.keys(dict)) if (!isTeam(k) && clubNorm.has(norm(k))) clash.push(`${name}: ${k}`);
  }
  assert(clubNorm.size > 30, `${clubNorm.size} nomes de clubes lidos`);
  assert(clash.length === 0, `nenhuma chave coincide com nome de clube${clash.length ? ' — ' + clash.join(' | ') : ''}`);

  // as 48 seleções da Copa 2026 (nomes em português, como aparecem nas páginas)
  const selecoes = [
    'México', 'África do Sul', 'Coreia do Sul', 'Tchéquia', 'Canadá', 'Catar', 'Suíça', 'Bósnia-Herz.', 'Brasil', 'Marrocos', 'Haiti', 'Escócia', 'EUA', 'Paraguai', 'Austrália', 'Turquia', 'Alemanha', 'Curaçao', 'Costa do Marfim', 'Equador', 'Holanda', 'Japão', 'Suécia', 'Tunísia', 'Bélgica', 'Egito', 'Irã', 'Nova Zelândia', 'Espanha', 'Cabo Verde', 'Arábia Saudita', 'Uruguai', 'França', 'Senegal', 'Iraque', 'Noruega', 'Argentina', 'Argélia', 'Áustria', 'Jordânia', 'Portugal', 'Rep. D. Congo', 'Colômbia', 'Uzbequistão', 'Inglaterra', 'Croácia', 'Gana', 'Panamá',
  ];
  const selClash = [];
  for (const [name, dict] of [['en', EN], ['zh', ZH]]) {
    // nomes das 48 seleções TÊM de estar no dicionário (é como são traduzidos)…
    const lacking = selecoes.filter((s) => !(s in dict));
    assert(selecoes.length === 48 && lacking.length === 0, `${name}: as 48 seleções da Copa 2026 estão traduzidas${lacking.length ? ' — faltam ' + lacking.join(', ') : ''}`);
  }
  assert(selClash.length === 0, 'ok');
}

// ── 4. Motor (i18n.js) ────────────────────────────────────────────────────────
section('Motor i18n.js');
{
  I18N.register('en', { 'Rodada {n} de {total}': 'Round {n} of {total}', 'V@@vitória': 'W' });
  I18N._setLangForTest('en');
  assert(I18N.t('Rodada {n} de {total}', { n: 3, total: 38 }) === 'Round 3 of 38', 't() interpola {n} e {total}');
  assert(I18N.t('texto sem tradução') === 'texto sem tradução', 't() devolve o original quando não há tradução');
  assert(I18N.t('V@@vitória') === 'W', 'chave com contexto (@@) usa a tradução');
  assert(I18N.t('Z@@teste') === 'Z', 'chave com contexto sem tradução cai no texto sem o contexto');
  assert(I18N.t('{a}x', { a: 1 }) === '1x', 'variável usada sem tradução também é interpolada');
  assert(I18N.t('{a}x', {}) === '{a}x', 'variável ausente é mantida');
  assert([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map((n) => I18N.ord(n)).join(' ') === '1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 101st', 'ord() em inglês');
  I18N._setLangForTest('zh');
  assert(I18N.ord(3) === '第3名', 'ord() em chinês');
  I18N._setLangForTest('pt');
  assert(I18N.ord(3) === '3º', 'ord() em português');
  assert(I18N.t('Rodada {n} de {total}', { n: 3, total: 38 }) === 'Rodada 3 de 38', 'em pt o texto original é usado');
  assert(I18N.t('V@@vitória') === 'V', 'em pt o contexto (@@) é removido');

  I18N._setLangForTest('zh');
  assert(I18N.team('Brazil') === '巴西' && I18N.team('South Korea') === '韩国', 'team() traduz nomes do dataset em zh');
  assert(I18N.team('Bosnia-Herzegovina') === 'Bosnia-Herzegovina', 'team() mantém nome desconhecido');
  assert(I18N.team('Curaçao') === '库拉索', 'team() normaliza acentos');
  assert(I18N.teamKey('巴西') === 'brazil', 'teamKey() converte nome em chinês para a chave do dataset');
  assert(I18N.teamKey('Brazil') === 'Brazil', 'teamKey() deixa nomes em inglês como estão');
  I18N._setLangForTest('en');
  assert(I18N.team('Brazil') === 'Brazil', 'team() é identidade em en');

  I18N._setLangForTest('en');
  assert(I18N.tm('Poucos jogos após o corte de temporada (12). Reduza CONFIG.TRAIN_FROM_SEASON (atual: 5).').startsWith('Too few matches'),
    'tm() traduz mensagens com números no meio');
  assert(I18N.tm('mensagem desconhecida') === 'mensagem desconhecida', 'tm() devolve a mensagem quando não há padrão');
  I18N._setLangForTest('pt');
}

// ── 5. Páginas e service worker ───────────────────────────────────────────────
section('Páginas e service worker');
{
  for (const f of PAGES) {
    const src = read(f);
    const head = src.slice(0, 6000);
    assert(/<script src="(\.\.\/)?i18n\/i18n\.js"/.test(head), `${f}: carrega i18n/i18n.js no <head>`);
    const i18nAt = src.indexOf('i18n/i18n.js');
    const firstScript = src.indexOf('<script');
    assert(i18nAt > 0 && i18nAt - firstScript < 30, `${f}: i18n.js é o primeiro <script>`);
  }
  assert(/data-i18n-extra="docs"/.test(read('bench-docs.html')), 'bench-docs.html pede os dicionários *-docs.js');
  const sw = read('service-worker.js');
  for (const f of ['i18n.js', 'en.js', 'zh.js', 'en-docs.js', 'zh-docs.js']) {
    assert(sw.includes(`./i18n/${f}`), `service worker faz o precache de i18n/${f}`);
    assert(fs.existsSync(path.join(ROOT, 'i18n', f)), `i18n/${f} existe`);
  }
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`i18n tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
