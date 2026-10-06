/* Calendário das competições — dados editados à mão a cada atualização.
 *
 * Por que um arquivo e não uma consulta ao ge.globo.com / Wikipedia: o navegador não consegue ler essas
 * páginas (CORS/bloqueio) e o app precisa funcionar offline. Os dados vêm da tabela detalhada da CBF
 * (divulgada em blocos de 4 rodadas), conferida em ge, valorfinal e Wikipedia. O app compara estas datas
 * com o relógio do dispositivo do visitante (ver modelos/competicoes.js → statusCalendario).
 *
 * status:  concluida   → rodada encerrada (datas só se forem confiáveis; rodadas com jogos adiados ficam sem data)
 *          confirmada  → datas detalhadas pela CBF
 *          provisoria  → datas ainda sujeitas a mudança (Copa do Brasil, Libertadores, Sul-Americana)
 * Datas em 'AAAA-MM-DD' (dia civil de Brasília; o app compara com o dia civil local do visitante).
 */
(function (root, factory) {
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  if (root) root.CALENDARIOS = data;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var C = 'concluida', K = 'confirmada', P = 'provisoria';
  return {
    'serie-a-2026': {
      competicao: 'serie-a',
      temporada: 2026,
      atualizadoEm: '2026-10-06',
      fonte: 'CBF (tabela detalhada), conferida em valorfinal.com.br e Wikipedia',
      rodadas: [
        { n: 1,  inicio: '2026-01-28', fim: '2026-01-29', status: C },
        { n: 2,  inicio: null, fim: null, status: C },   // inclui jogos adiados
        { n: 3,  inicio: '2026-02-10', fim: '2026-02-12', status: C },
        { n: 4,  inicio: null, fim: null, status: C },   // inclui jogos adiados
        { n: 5,  inicio: null, fim: null, status: C },   // inclui jogos adiados
        { n: 6,  inicio: '2026-03-14', fim: '2026-03-16', status: C },
        { n: 7,  inicio: '2026-03-18', fim: '2026-03-19', status: C },
        { n: 8,  inicio: '2026-03-21', fim: '2026-03-22', status: C },
        { n: 9,  inicio: '2026-04-01', fim: '2026-04-02', status: C },
        { n: 10, inicio: '2026-04-04', fim: '2026-04-05', status: C },
        { n: 11, inicio: '2026-04-11', fim: '2026-04-12', status: C },
        { n: 12, inicio: '2026-04-18', fim: '2026-04-19', status: C },
        { n: 13, inicio: '2026-04-25', fim: '2026-04-26', status: C },
        { n: 14, inicio: '2026-05-02', fim: '2026-05-03', status: C },
        { n: 15, inicio: '2026-05-09', fim: '2026-05-10', status: C },
        { n: 16, inicio: '2026-05-16', fim: '2026-05-17', status: C },
        { n: 17, inicio: '2026-05-23', fim: '2026-05-25', status: C },
        { n: 18, inicio: '2026-05-30', fim: '2026-05-31', status: C },
        { n: 19, inicio: '2026-07-16', fim: '2026-07-23', status: C },
        { n: 20, inicio: '2026-07-25', fim: '2026-07-26', status: C },
        { n: 21, inicio: null, fim: null, status: C },   // 3 jogos adiados jogados em set/out; 1 pendente
        { n: 22, inicio: '2026-08-08', fim: '2026-08-09', status: C },
        { n: 23, inicio: '2026-08-15', fim: '2026-08-16', status: C },
        { n: 24, inicio: '2026-08-22', fim: '2026-08-24', status: C },
        { n: 25, inicio: '2026-08-29', fim: '2026-08-31', status: C },
        { n: 26, inicio: '2026-09-05', fim: '2026-09-07', status: C },
        { n: 27, inicio: '2026-09-11', fim: '2026-09-14', status: C },
        { n: 28, inicio: '2026-09-19', fim: '2026-09-20', status: C },
        { n: 29, inicio: '2026-10-07', fim: '2026-10-08', status: K },
        { n: 30, inicio: '2026-10-10', fim: '2026-10-12', status: K },
        { n: 31, inicio: '2026-10-17', fim: '2026-10-19', status: K },
        { n: 32, inicio: '2026-10-23', fim: '2026-10-26', status: K },
        { n: 33, inicio: '2026-10-28', fim: '2026-10-30', status: P },
        { n: 34, inicio: '2026-11-02', fim: '2026-11-06', status: P },
        { n: 35, inicio: '2026-11-18', fim: '2026-11-18', status: P },
        { n: 36, inicio: '2026-11-21', fim: '2026-11-22', status: P },
        { n: 37, inicio: '2026-11-28', fim: '2026-11-29', status: P },
        { n: 38, inicio: '2026-12-01', fim: '2026-12-02', status: P },
      ],
      // jogos atrasados de rodadas já encerradas
      pendentes: [
        { rodada: 21, mandante: 'Chapecoense', visitante: 'Vasco', data: null },
      ],
      // jogos das próximas rodadas (horário de Brasília) — só as rodadas já detalhadas pela CBF
      jogos: [
        { rodada: 29, data: '2026-10-07', hora: '19:30', mandante: 'Bragantino',       visitante: 'Mirassol' },
        { rodada: 29, data: '2026-10-07', hora: '19:30', mandante: 'Internacional',    visitante: 'Corinthians' },
        { rodada: 29, data: '2026-10-07', hora: '19:30', mandante: 'Remo',             visitante: 'Grêmio' },
        { rodada: 29, data: '2026-10-07', hora: '20:00', mandante: 'Vitória',          visitante: 'Chapecoense' },
        { rodada: 29, data: '2026-10-07', hora: '20:30', mandante: 'Botafogo',         visitante: 'Vasco' },
        { rodada: 29, data: '2026-10-07', hora: '21:30', mandante: 'Cruzeiro',         visitante: 'São Paulo' },
        { rodada: 29, data: '2026-10-08', hora: '19:30', mandante: 'Santos',           visitante: 'Flamengo' },
        { rodada: 29, data: '2026-10-08', hora: '20:00', mandante: 'Athletico Paranaense', visitante: 'Atlético Mineiro' },
        { rodada: 29, data: '2026-10-08', hora: '21:30', mandante: 'Fluminense',       visitante: 'Coritiba' },
        { rodada: 29, data: '2026-10-08', hora: '21:30', mandante: 'Palmeiras',        visitante: 'Bahia' },
        { rodada: 30, data: '2026-10-10', hora: '17:00', mandante: 'Vasco',            visitante: 'Remo' },
        { rodada: 30, data: '2026-10-10', hora: '21:00', mandante: 'São Paulo',        visitante: 'Vitória' },
        { rodada: 30, data: '2026-10-11', hora: '16:00', mandante: 'Atlético Mineiro', visitante: 'Santos' },
        { rodada: 30, data: '2026-10-11', hora: '17:30', mandante: 'Flamengo',         visitante: 'Fluminense' },
        { rodada: 30, data: '2026-10-11', hora: '17:30', mandante: 'Palmeiras',        visitante: 'Corinthians' },
        { rodada: 30, data: '2026-10-11', hora: '17:30', mandante: 'Grêmio',           visitante: 'Internacional' },
        { rodada: 30, data: '2026-10-11', hora: '19:30', mandante: 'Coritiba',         visitante: 'Botafogo' },
        { rodada: 30, data: '2026-10-11', hora: '19:30', mandante: 'Bahia',            visitante: 'Mirassol' },
        { rodada: 30, data: '2026-10-12', hora: '19:30', mandante: 'Chapecoense',      visitante: 'Athletico Paranaense' },
        { rodada: 30, data: '2026-10-12', hora: '21:00', mandante: 'Bragantino',       visitante: 'Cruzeiro' },
      ],
    },
  };
});
