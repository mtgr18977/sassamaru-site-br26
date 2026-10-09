/* Sassamaru 2026 — casca do aplicativo: injeta a barra de abas no topo de cada página.
 * Sem build: a página só precisa de <link href="…/shell/shell.css"> e <script src="…/shell/shell.js">
 * logo depois de i18n/i18n.js. A raiz do site é deduzida do próprio src deste script. */
(function () {
  'use strict';
  var me = document.currentScript;
  var root = me ? me.src.replace(/shell\/shell\.js(\?.*)?$/, '') : './';

  // Chaves de tradução com contexto "@@aba": nomes curtos que não podem colidir com texto solto do DOM.
  // `on(página, parâmetros)` decide se a aba está ativa; as duas divisões usam a mesma página (apps/index.html) com ?comp=
  var SERIE_A = function (p, q) { return ((p === 'apps/index.html' || p === 'apps/tabela.html') && q.comp !== 'serie-b') || p === 'simulacoes/bench-brasileirao2026.html'; };
  var SERIE_B = function (p, q) { return (p === 'apps/index.html' || p === 'apps/tabela.html') && q.comp === 'serie-b'; };
  var TABS = [
    { href: 'index.html',                           key: 'Início@@aba',    ico: '🏠', on: function (p) { return p === 'index.html' || p === ''; } },
    { href: 'apps/index.html?comp=serie-a',         key: 'Série A@@aba',   ico: '🏆', on: SERIE_A },
    { href: 'apps/index.html?comp=serie-b',         key: 'Série B@@aba',   ico: '🥈', on: SERIE_B },
    { href: 'apps/bench-selecoes.html',             key: 'Seleções@@aba',  ico: '🌍', on: function (p) { return p === 'apps/bench-selecoes.html'; } },
    { href: 'simulacoes/bench-copa2026.html',       key: 'Copa 2026@@aba', ico: '🌐', on: function (p) { return p === 'simulacoes/bench-copa2026.html'; } },
    { href: 'bench-docs.html',                      key: 'Docs@@aba',      ico: '📄', on: function (p) { return p === 'bench-docs.html'; } },
  ];
  // segunda linha, só dentro de uma divisão: previsão da rodada × simulação da temporada
  var SUBTABS = {
    a: [
      { href: 'apps/index.html?comp=serie-a',          key: 'Previsão da rodada@@sub',     on: function (p) { return p === 'apps/index.html'; } },
      { href: 'apps/tabela.html?comp=serie-a',         key: 'Classificação@@sub',          on: function (p) { return p === 'apps/tabela.html'; } },
      { href: 'simulacoes/bench-brasileirao2026.html', key: 'Simulação da temporada@@sub', on: function (p) { return p === 'simulacoes/bench-brasileirao2026.html'; } },
    ],
    b: [
      { href: 'apps/index.html?comp=serie-b',          key: 'Previsão da rodada@@sub',     on: function (p) { return p === 'apps/index.html'; } },
      { href: 'apps/tabela.html?comp=serie-b',         key: 'Classificação@@sub',          on: function (p) { return p === 'apps/tabela.html'; } },
    ],
  };
  // ── tema claro/escuro ── aplicado já no <head>, antes da primeira pintura (sem "flash" branco)
  var THEME_KEY = 'br26-theme', html = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  function savedTheme() { try { var v = localStorage.getItem(THEME_KEY); return v === 'dark' || v === 'light' ? v : null; } catch (e) { return null; } }
  function currentTheme() { return savedTheme() || (mq.matches ? 'dark' : 'light'); }
  function applyTheme() {
    var th = currentTheme();
    html.setAttribute('data-theme', th);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', th === 'dark' ? '#12261B' : '#1A4731');
  }
  var pageName = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
  html.setAttribute('data-page', pageName === 'bench-docs' ? 'docs' : pageName);
  applyTheme();
  if (mq.addEventListener) mq.addEventListener('change', function () { if (!savedTheme()) applyTheme(); });

  var T = function (k) { return typeof window._t === 'function' ? window._t(k) : k.replace(/@@.*$/, ''); };

  function here() {
    var p = location.pathname.replace(/\/$/, '/index.html');
    var base = new URL(root, location.href).pathname;
    return p.indexOf(base) === 0 ? p.slice(base.length) : p.replace(/^\//, '');
  }

  function build() {
    if (document.querySelector('.app-bar')) return;
    var cur = here();
    var bar = document.createElement('div');
    bar.className = 'app-bar';
    var q = {}; try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) { /* ignore */ }
    var tabs = TABS.map(function (t) {
      var on = t.on(cur, q);
      return '<a class="app-tab" href="' + root + t.href + '"' + (on ? ' aria-current="page"' : '') + '>' +
             '<span class="ico" aria-hidden="true">' + t.ico + '</span><span>' + T(t.key) + '</span></a>';
    }).join('');
    var grupo = SERIE_A(cur, q) ? 'a' : SERIE_B(cur, q) ? 'b' : null;
    var sub = grupo ? '<nav class="app-sub" aria-label="Sassamaru 2026"><div class="app-sub-in">' + SUBTABS[grupo].map(function (t) {
      return '<a href="' + root + t.href + '"' + (t.on(cur, q) ? ' aria-current="page"' : '') + '>' + T(t.key) + '</a>';
    }).join('') + '</div></nav>' : '';
    bar.innerHTML =
      '<div class="app-bar-in">' +
        '<a class="app-brand" href="' + root + 'index.html"><img src="' + root + 'icons/icon.svg" alt="" width="28" height="28">' +
          '<span>Sassamaru 2026</span></a>' +
        '<nav class="app-tabs" aria-label="Sassamaru 2026">' + tabs + '</nav>' +
        '<div class="app-tools"><button type="button" class="app-theme"></button><button type="button" class="app-install" hidden>' + T('Instalar app') + '</button></div>' +
      '</div>' + sub;
    document.body.insertBefore(bar, document.body.firstChild);

    var sw = document.querySelector('.lang-switch'); // criado por i18n.js
    if (sw) { sw.classList.remove('floating'); bar.querySelector('.app-tools').appendChild(sw); }

    var active = bar.querySelector('[aria-current="page"]');
    if (active && active.scrollIntoView) { // em telas estreitas, a aba atual fica visível
      var nav = bar.querySelector('.app-tabs');
      nav.scrollLeft = Math.max(0, active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2);
    }

    var tb = bar.querySelector('.app-theme');
    function paintToggle() {
      var dark = html.getAttribute('data-theme') === 'dark';
      tb.textContent = dark ? '☀️' : '🌙';
      var lbl = dark ? T('Modo claro') : T('Modo escuro');
      tb.title = lbl; tb.setAttribute('aria-label', lbl);
    }
    tb.addEventListener('click', function () {
      var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* modo privado */ }
      applyTheme(); paintToggle();
    });
    paintToggle();

    var btn = bar.querySelector('.app-install'), ev = null;
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); ev = e; btn.hidden = false; });
    window.addEventListener('appinstalled', function () { btn.hidden = true; });
    btn.addEventListener('click', function () { if (ev) { ev.prompt(); ev = null; btn.hidden = true; } });
  }

  // registrado depois do listener do i18n.js, então o seletor de idioma já existe quando isto roda
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
