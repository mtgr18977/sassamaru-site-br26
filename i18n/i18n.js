/* Internacionalização (pt-BR · en · zh-CN) — sem build, sem dependências.
 *
 * Modelo "gettext": a CHAVE de tradução é o próprio texto em português.
 *   - O português continua escrito direto no HTML/JS (funciona sem este script);
 *   - i18n/en.js e i18n/zh.js mapeiam "texto em português" → tradução;
 *   - textos com interpolação usam t('Rodada {n} de {total}', {n, total});
 *   - blocos de prosa com marcação interna (bench-docs) usam chaves explícitas
 *     via data-i18n-html="docs.p12".
 *
 * Texto estático do HTML é traduzido varrendo o DOM: nós de texto e os
 * atributos title/placeholder/aria-label/alt cujo conteúdo (com espaços
 * normalizados) bate exatamente com uma chave. Um MutationObserver cobre o
 * que o JS da página insere depois.
 *
 * Trocar de idioma grava a escolha em localStorage e recarrega a página: os
 * modelos são reconstruídos do zero, o que é mais simples e mais seguro do que
 * re-renderizar tabelas de simulação já calculadas.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.I18N = api; root._t = api.t; root._n = api.num; root._o = api.ord; root._tn = api.team; root._tm = api.tm; } // atalhos globais: _t('texto', {vars})
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var STORAGE_KEY = 'br26-lang';
  var LANGS = {
    pt: { short: 'PT',   label: 'Português', locale: 'pt-BR', html: 'pt-BR' },
    en: { short: 'EN',   label: 'English',   locale: 'en-US', html: 'en'    },
    zh: { short: '中文', label: '简体中文',   locale: 'zh-CN', html: 'zh-CN' },
  };
  var dicts = { pt: {}, en: {}, zh: {} };
  var hasDOM = typeof document !== 'undefined' && !!document.documentElement;

  function safeGet() { try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } }
  function safeSet(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch (e) { /* modo privado */ } }

  function fromNavigator() {
    var list = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || '').toLowerCase();
      if (l.indexOf('pt') === 0) return 'pt';
      if (l.indexOf('zh') === 0) return 'zh';
      if (l.indexOf('en') === 0) return 'en';
    }
    return 'en';
  }

  function detect() {
    var q = null;
    try { q = new URLSearchParams(root.location.search).get('lang'); } catch (e) { /* Node */ }
    if (q && LANGS[q]) { safeSet(q); return q; }
    var saved = safeGet();
    if (saved && LANGS[saved]) return saved;
    return fromNavigator();
  }

  var lang = hasDOM ? detect() : 'pt';

  // 'V@@resultado' = texto 'V' com contexto: evita colidir com nós de texto soltos "V" na varredura do DOM.
  var CTX_RE = /@@[^@]*$/;

  function interpolate(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : m;
    });
  }

  /** Traduz `key` (texto em português ou id explícito) para o idioma atual. */
  function t(key, vars) {
    var d = dicts[lang];
    var out = d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : key.replace(CTX_RE, '');
    return interpolate(out, vars);
  }

  /** Traduz uma mensagem de erro/aviso vinda dos modelos (texto em português, possivelmente com números
   *  no meio): tenta a chave exata e depois as chaves com {variáveis}, tratadas como padrões. */
  function tm(msg) {
    msg = String(msg == null ? '' : msg);
    var d = dicts[lang];
    if (lang === 'pt' || !d) return msg;
    if (Object.prototype.hasOwnProperty.call(d, msg)) return d[msg];
    for (var k in d) {
      if (k.indexOf('{') < 0 || !Object.prototype.hasOwnProperty.call(d, k)) continue;
      var names = [];
      var re = new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, function (m, n) { names.push(n); return '([\\s\\S]+?)'; }) + '$');
      var m = re.exec(msg);
      if (m) { var vars = {}; names.forEach(function (n, i) { vars[n] = m[i + 1]; }); return interpolate(d[k], vars); }
    }
    return msg;
  }

  function register(code, dict) {
    if (!dicts[code]) dicts[code] = {};
    for (var k in dict) if (Object.prototype.hasOwnProperty.call(dict, k)) dicts[code][k] = dict[k];
  }

  function locale() { return LANGS[lang].locale; }

  // ── Nomes de seleções ──────────────────────────────────────────────────
  // O dataset internacional usa nomes em inglês. Em zh mostramos o nome em chinês
  // (entradas 'team:<nome normalizado>' de zh.js) e aceitamos o nome em chinês
  // como entrada; em pt/en o nome do dataset é mantido como está.
  function teamNorm(s) {
    return String(s || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  /** Nome de exibição de uma seleção (recebe o nome do dataset, em inglês). */
  function team(name) {
    var d = dicts[lang], k = 'team:' + teamNorm(name);
    return d && Object.prototype.hasOwnProperty.call(d, k) ? d[k] : name;
  }
  var teamRev = null;
  /** Texto digitado pelo usuário → nome em inglês normalizado quando for um nome em chinês; senão devolve o próprio texto. */
  function teamKey(text) {
    var d = dicts[lang], s = String(text || '').trim();
    if (lang !== 'zh' || !d) return text;
    if (!teamRev) {
      teamRev = {};
      for (var k in d) if (k.indexOf('team:') === 0) teamRev[d[k]] = k.slice(5);
    }
    return Object.prototype.hasOwnProperty.call(teamRev, s) ? teamRev[s] : text;
  }
  /** Ordinal: 3º · 3rd · 第3名 */
  function ord(n) {
    n = Number(n);
    if (lang === 'en') {
      var v = n % 100, sfx = (v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
      return n + sfx;
    }
    if (lang === 'zh') return '第' + n + '名';
    return n + 'º';
  }
  /** Número formatado no locale atual (1 000 / 1,000 / 1,000). */
  function num(x, opts) { return Number(x).toLocaleString(locale(), opts); }

  // ── DOM ────────────────────────────────────────────────────────────────
  var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 0, NOSCRIPT: 1 };
  var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }

  function translateTextNode(n) {
    if (seen && seen.has(n)) return;
    var raw = n.nodeValue;
    if (!raw || !/\S/.test(raw)) return;
    var d = dicts[lang];
    var key = norm(raw);
    if (Object.prototype.hasOwnProperty.call(d, key)) {
      var lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
      n.nodeValue = lead + d[key] + trail;
      if (seen) seen.add(n);
    }
  }

  function translateElement(el) {
    var d = dicts[lang], i, a, v;
    for (i = 0; i < ATTRS.length; i++) {
      a = ATTRS[i];
      v = el.getAttribute && el.getAttribute(a);
      if (v && Object.prototype.hasOwnProperty.call(d, norm(v))) el.setAttribute(a, d[norm(v)]);
    }
    var k = el.getAttribute('data-i18n-html');
    if (k && Object.prototype.hasOwnProperty.call(d, k)) { el.innerHTML = d[k]; return true; }
    k = el.getAttribute('data-i18n');
    if (k && Object.prototype.hasOwnProperty.call(d, k)) { el.textContent = d[k]; return true; }
    return false;
  }

  function apply(node) {
    if (lang === 'pt' || !node) return;
    if (node.nodeType === 3) { translateTextNode(node); return; }
    if (node.nodeType !== 1) return;
    if (SKIP[node.tagName]) { if (node.tagName === 'TEXTAREA') translateElement(node); return; } // só o placeholder
    if (translateElement(node)) return; // conteúdo substituído por inteiro
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) apply(kids[i]);
    // <input placeholder> etc. já tratados acima; <option> é filho normal.
  }

  var observer = null;
  function observe() {
    if (!hasDOM || typeof MutationObserver === 'undefined' || lang === 'pt') return;
    observer = new MutationObserver(function (records) {
      observer.disconnect();
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'characterData') { if (seen) seen.delete(r.target); translateTextNode(r.target); }
        else if (r.type === 'attributes') translateElement(r.target);
        else for (var j = 0; j < r.addedNodes.length; j++) apply(r.addedNodes[j]);
      }
      start();
    });
    start();
  }
  function start() {
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
  }

  // ── Seletor de idioma ─────────────────────────────────────────────────
  function setLang(code) {
    if (!LANGS[code] || code === lang) return;
    safeSet(code);
    try { // mantém ?lang= coerente se ele estiver na URL
      var u = new URL(root.location.href);
      if (u.searchParams.has('lang')) { u.searchParams.set('lang', code); root.location.replace(u.toString()); return; }
    } catch (e) { /* ignore */ }
    root.location.reload();
  }

  function buildSwitcher() {
    var box = document.createElement('div');
    box.className = 'lang-switch';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Language / Idioma / 语言');
    Object.keys(LANGS).forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = LANGS[code].short;
      b.lang = LANGS[code].html;
      b.title = LANGS[code].label;
      b.setAttribute('data-lang', code);
      b.setAttribute('aria-pressed', code === lang ? 'true' : 'false');
      if (code === lang) b.className = 'on';
      b.addEventListener('click', function () { setLang(code); });
      box.appendChild(b);
    });
    var css = document.createElement('style');
    css.textContent =
      '.lang-switch{display:inline-flex;border:1px solid rgba(128,128,128,.35);border-radius:99px;overflow:hidden;' +
      'font:500 11px/1 "IBM Plex Mono",ui-monospace,monospace;flex-shrink:0;background:rgba(255,255,255,.04)}' +
      '.lang-switch button{all:unset;cursor:pointer;padding:6px 10px;color:inherit;opacity:.65;box-sizing:border-box}' +
      '.lang-switch button:hover{opacity:1}' +
      '.lang-switch button.on{opacity:1;background:rgba(128,128,128,.22);font-weight:700}' +
      '.lang-switch button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}' +
      '.lang-switch.floating{position:fixed;top:10px;right:10px;z-index:9999;background:#fff;color:#141412}';
    document.head.appendChild(css);
    // dentro do cabeçalho da página quando existir; senão flutuante
    var host = document.querySelector('header .header-inner') || document.querySelector('header');
    if (host) host.appendChild(box); else { box.className += ' floating'; document.body.appendChild(box); }
  }

  function init() {
    document.documentElement.lang = LANGS[lang].html;
    if (lang !== 'pt') {
      apply(document.body);
      var tt = document.title && norm(document.title);
      if (tt && Object.prototype.hasOwnProperty.call(dicts[lang], tt)) document.title = dicts[lang][tt];
    }
    buildSwitcher();
    observe();
  }

  if (hasDOM) {
    // Dicionário do idioma atual, carregado de forma síncrona antes do restante da página.
    var here = document.currentScript && document.currentScript.src;
    if (lang !== 'pt' && here) {
      var extra = document.currentScript.getAttribute('data-i18n-extra'); // ex.: "docs" → en-docs.js
      var files = [lang + '.js'].concat(extra ? extra.split(',').map(function (x) { return lang + '-' + x.trim() + '.js'; }) : []);
      files.forEach(function (f) {
        document.write('<script src="' + here.replace(/i18n\.js(\?.*)?$/, f + '$1') + '"><\/script>');
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return {
    LANGS: LANGS, dicts: dicts, register: register, t: t, tm: tm, num: num, ord: ord, team: team, teamKey: teamKey, teamNorm: teamNorm, apply: apply,
    setLang: setLang,
    get lang() { return lang; },
    get locale() { return locale(); },
    _setLangForTest: function (c) { lang = c; },
  };
});
