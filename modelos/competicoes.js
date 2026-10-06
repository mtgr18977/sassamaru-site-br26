// ═══════════════════════════════════════════════════════════════════════════
//  Competições suportadas + lógica de calendário (funções puras, sem DOM).
//
//  Serve ao navegador e aos testes em Node. Para acrescentar uma competição,
//  basta uma entrada em COMPETICOES e um CSV no formato do Brasileirão
//  (ID,rodata,mandante,visitante,vencedor,mandante_Placar,visitante_Placar,
//  em ordem cronológica) — o modelo (modelos/model.js) não sabe qual é a
//  divisão; tudo que muda de uma para outra mora aqui.
// ═══════════════════════════════════════════════════════════════════════════
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Competicoes = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var COMPETICOES = {
    'serie-a': {
      id: 'serie-a',
      nome: 'Série A',
      pontosCorridosDesde: 2003,   // índice 0 do dataset = 2003
      treinarAPartirDe: 2015,      // temporadas anteriores têm peso residual demais para valer o custo
      ultimaTemporadaNoCsv: 2026,  // temporada em andamento
      nTimes: 20,
      rodadas: 38,
      csv: 'datasets/campeonato-brasileiro-limpo.csv',
      dados: 'embutido',           // CSV já embutido na página (window.__EMBEDDED_CSV__)
      calendario: 'serie-a-2026',
      // faixas de posição final (1-indexado, inclusive) usadas na simulação de temporada
      zonas: { libertadores: [1, 6], sulamericana: [7, 12], rebaixamento: [17, 20] },
      promocao: null,
      taxaBase: { pH: 0.47, pD: 0.27, pA: 0.26 },   // referência do backtest: prever sempre isto não pode ganhar do modelo
      limiteLogLoss: 1.035,                          // trava de regressão (tests/backtest.test.js)
    },
    'serie-b': {
      id: 'serie-b',
      nome: 'Série B',
      pontosCorridosDesde: 2006,   // 20 clubes × 38 rodadas desde 2006
      primeiraTemporadaNoCsv: 2007, // 2006 não tem fonte com os 380 resultados
      treinarAPartirDe: 2007,      // todo o histórico: no backtest, janelas curtas pioram (log-loss 1,039 com tudo × 1,046 desde 2018)
      rodadasSinteticas: true,     // a fonte (Wikipedia) não traz data/rodada: a ordem dos jogos na temporada é inventada
      ultimaTemporadaNoCsv: 2025,
      nTimes: 20,
      rodadas: 38,
      csv: 'datasets/campeonato-brasileiro-serie-b.csv',  // gerado por scripts/importar_wikipedia_serie_b.py
      dados: 'disponivel',         // 'pendente' = CSV ainda não importado → a UI mostra o passo a passo;
                                   // 'disponivel' = CSV existe e é lido por fetch (lembre de pô-lo no precache do service-worker.js)
      calendario: null,
      zonas: { acesso: [1, 4], rebaixamento: [17, 20] },
      taxaBase: { pH: 0.49, pD: 0.27, pA: 0.24 },   // frequência histórica 2007–2025 (7 220 jogos)
      limiteLogLoss: 1.045,                          // medido: 1.039 (2007+); a Série B é mais parelha, o ganho sobre a taxa-base é pequeno
      promocao: 'serie-a',
      // Elenco muda muito mais que na Série A (4 sobem, 4 caem, 4 chegam da C todo ano): times sem
      // histórico entram na média da liga (α=β=1, Elo 1500) com aviso. Ver ToDo.md.
      rotatividade: 'alta',
    },
  };

  var PADRAO = 'serie-a';

  function obter(id) { return COMPETICOES[id] || COMPETICOES[PADRAO]; }
  function lista() { return Object.keys(COMPETICOES).map(function (k) { return COMPETICOES[k]; }); }
  /** Índice (0 = primeira temporada do CSV) a partir do qual o modelo treina — vai em buildModel({trainFromSeason}). */
  function indiceTreino(comp) { return comp.treinarAPartirDe - (comp.primeiraTemporadaNoCsv || comp.pontosCorridosDesde); }

  // ── datas ────────────────────────────────────────────────────────────────
  /** 'AAAA-MM-DD' → Date à meia-noite LOCAL (comparar dias civis sem depender do fuso/horário de verão). */
  function dia(s) {
    if (!s) return null;
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function diaDe(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function diasEntre(a, b) { return Math.round((b - a) / 86400000); }

  /**
   * Situação do calendário num dado dia (o "hoje" do visitante).
   *   estado: 'em-andamento' (hoje cai dentro de uma rodada) | 'entre-rodadas' | 'antes' | 'encerrada'
   *   atual:   rodada em andamento hoje (ou null)
   *   proxima: primeira rodada que ainda não começou (ou null)
   *   ultima:  última rodada já encerrada com data conhecida (ou null)
   * Rodadas 'concluida' sem datas são ignoradas; "dias" usa dias civis (hoje→início = 0 significa hoje).
   */
  function statusCalendario(cal, hoje) {
    var h = diaDe(hoje || new Date());
    var datadas = cal.rodadas.filter(function (r) { return r.inicio && r.fim; }).map(function (r) {
      return { n: r.n, status: r.status, inicio: dia(r.inicio), fim: dia(r.fim), inicioStr: r.inicio, fimStr: r.fim };
    });
    var atual = null, proxima = null, ultima = null;
    datadas.forEach(function (r) {
      if (r.inicio <= h && h <= r.fim) atual = r;
      else if (r.inicio > h && (!proxima || r.inicio < proxima.inicio)) proxima = r;
      else if (r.fim < h && (!ultima || r.fim > ultima.fim)) ultima = r;
    });
    var seguinte = null; // a rodada depois da atual (quando há uma em andamento)
    if (atual) datadas.forEach(function (r) { if (r.inicio > atual.fim && (!seguinte || r.inicio < seguinte.inicio)) seguinte = r; });
    var alvo = atual ? seguinte : proxima;
    var estado = atual ? 'em-andamento' : proxima ? (ultima ? 'entre-rodadas' : 'antes') : 'encerrada';
    return {
      estado: estado,
      hoje: h,
      atual: atual,
      ultima: ultima,
      proxima: alvo,                                         // próxima rodada a começar
      diasAteProxima: alvo ? diasEntre(h, alvo.inicio) : null,
      diasParaFimAtual: atual ? diasEntre(h, atual.fim) : null,
      // rodada em foco para a interface: a que está rolando; senão a próxima
      foco: atual || alvo,
      diasAteFoco: (atual || alvo) ? Math.max(0, diasEntre(h, (atual || alvo).inicio)) : null,
    };
  }

  function jogosDaRodada(cal, n) { return cal.jogos.filter(function (j) { return j.rodada === n; }); }

  return {
    COMPETICOES: COMPETICOES, PADRAO: PADRAO, obter: obter, lista: lista, indiceTreino: indiceTreino,
    dia: dia, diasEntre: diasEntre, statusCalendario: statusCalendario, jogosDaRodada: jogosDaRodada,
  };
});
