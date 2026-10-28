// ═══════════════════════════════════════════════════════════════════════════
//  Identidade visual dos clubes (funções puras, sem DOM).
//
//  O escudo é a imagem em icons/clubes/<chave>.png (baixada da Wikipedia por scripts/baixar_escudos.py; os
//  brasões são marcas dos clubes). Se o arquivo faltar, a página cai num brasão SVG gerado, com a cor
//  principal do clube e a sigla (as cores são aproximações). A chave é o nome normalizado do modelo
//  (Model.normalizeTeam): "atletico go", "sao paulo", "vila nova"…
// ═══════════════════════════════════════════════════════════════════════════
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Clubes = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var PRETO = '#1a1a1a', VERM = '#c8001e', VERDE = '#006b3f', AZUL = '#0033a0', AMAR = '#e8b800', BRANCO = '#fff';

  // [fundo, texto]
  var CORES = {
    // Série A 2026
    'flamengo': [VERM, BRANCO], 'palmeiras': [VERDE, BRANCO], 'botafogo': [PRETO, BRANCO],
    'fluminense': ['#8b0d22', BRANCO], 'sao paulo': [VERM, BRANCO], 'corinthians': [PRETO, BRANCO],
    'atletico mineiro': [PRETO, AMAR], 'cruzeiro': [AZUL, BRANCO], 'internacional': [VERM, BRANCO],
    'gremio': ['#1b3c6e', BRANCO], 'athletico paranaense': [VERM, BRANCO], 'bragantino': [VERM, BRANCO],
    'bahia': [AZUL, BRANCO], 'vasco': [PRETO, BRANCO], 'santos': [PRETO, BRANCO],
    'coritiba': [VERDE, BRANCO], 'chapecoense': [VERDE, BRANCO], 'vitoria': [VERM, BRANCO],
    'mirassol': [AMAR, PRETO], 'remo': ['#003b8e', BRANCO],
    // Série B 2026
    'america mg': [VERDE, BRANCO], 'athletic': [PRETO, BRANCO], 'atletico go': [VERM, BRANCO],
    'avai': [AZUL, BRANCO], 'botafogo sp': [VERM, BRANCO], 'crb': [VERM, BRANCO], 'ceara': [PRETO, BRANCO],
    'criciuma': [AMAR, PRETO], 'cuiaba': [VERDE, AMAR], 'fortaleza': [AZUL, BRANCO], 'goias': [VERDE, BRANCO],
    'juventude': [VERDE, BRANCO], 'londrina': [AZUL, BRANCO], 'nautico': [VERM, BRANCO],
    'novorizontino': [AMAR, PRETO], 'operario ferroviario': [PRETO, BRANCO], 'ponte preta': [PRETO, BRANCO],
    'sao bernardo': [AMAR, PRETO], 'sport': [VERM, BRANCO], 'vila nova': [VERM, BRANCO],
  };
  var PADRAO = ['#3a4a6b', BRANCO];

  function cores(chave) { return CORES[chave] || PADRAO; }

  /** Sigla do brasão: duas iniciais se o nome tem mais de uma palavra ("Vila Nova" → VN, "Atlético-GO" → AG),
   *  três letras se tem uma só ("Flamengo" → FLA). */
  function sigla(nome) {
    var palavras = String(nome).replace(/[^A-Za-zÀ-ÿ\s-]/g, '').split(/[\s-]+/).filter(Boolean);
    var s = palavras.length > 1 ? palavras[0][0] + palavras[1][0] : (palavras[0] || '?').slice(0, 3);
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  }

  /** Nome do arquivo em icons/clubes/ ("atletico go" → "atletico-go.png"). */
  function arquivo(chave) { return String(chave).replace(/\s+/g, '-') + '.png'; }

  /** <img> do escudo; `base` é o caminho até a raiz do site ("../"). Se a imagem falhar, a página troca por escudoSvg. */
  function escudoImg(chave, nome, base) {
    return '<img class="escudo-img" src="' + (base || '') + 'icons/clubes/' + arquivo(chave) + '" alt="" width="52" height="62" decoding="async"' +
      ' data-chave="' + chave + '" data-nome="' + String(nome).replace(/"/g, '&quot;') + '">';
  }

  /** Brasão em SVG (string), com a classe `escudo`; o tamanho vem do CSS. */
  function escudoSvg(chave, nome) {
    var c = cores(chave), txt = sigla(nome), tam = txt.length > 2 ? 30 : 38;
    return '<svg class="escudo" viewBox="0 0 100 120" aria-hidden="true" focusable="false">' +
      '<path d="M50 4 L92 16 V58 C92 88 72 108 50 116 C28 108 8 88 8 58 V16 Z" fill="' + c[0] + '" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M50 12 L84 22 V58 C84 83 68 100 50 107 C32 100 16 83 16 58 V22 Z" fill="none" stroke="' + c[1] + '" stroke-opacity=".45" stroke-width="2"/>' +
      '<text x="50" y="68" text-anchor="middle" dominant-baseline="middle" font-family="Bricolage Grotesque, system-ui, sans-serif" font-weight="700" font-size="' + tam + '" fill="' + c[1] + '">' + txt + '</text>' +
      '</svg>';
  }

  return { CORES: CORES, cores: cores, sigla: sigla, arquivo: arquivo, escudoImg: escudoImg, escudoSvg: escudoSvg };
});
