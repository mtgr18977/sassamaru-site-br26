#!/usr/bin/env node
/* Auditoria de acessibilidade (axe-core + Chromium) de todas as páginas: claro/escuro × desktop/celular, estado inicial.
 * Não faz parte do `npm test` (precisa de navegador e de um servidor estático). Uso:
 *
 *   npm i --no-save axe-core playwright     # uma vez
 *   python -m http.server 8000 &            # na raiz do repositório
 *   npm run audit:a11y                      # ou: node tests/a11y.audit.js http://localhost:8000
 *
 * Sai com código 1 se houver violação "serious" ou "critical" (as "moderate" são listadas, mas não reprovam).
 * Em 22/11/2026: 0 violações nas 9 páginas, e também depois de rodar previsão/simulação e abrir o modal de clube.
 */
'use strict';
let chromium, axeSrc;
try { ({ chromium } = require('playwright')); axeSrc = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); }
catch (e) { console.error('Faltam dependências: npm i --no-save axe-core playwright'); process.exit(2); }

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const PAGES = ['index.html', 'apps/index.html?comp=serie-a', 'apps/index.html?comp=serie-b', 'apps/tabela.html', 'apps/tabela.html?comp=serie-b',
  'apps/clubes.html', 'apps/bench-selecoes.html', 'simulacoes/bench-brasileirao2026.html', 'simulacoes/bench-copa2026.html', 'bench-docs.html'];

(async () => {
  const browser = await chromium.launch(); let ruim = 0, moderadas = 0;
  for (const u of PAGES) for (const tema of ['light', 'dark']) for (const [nome, vp] of [['desktop', { width: 1100, height: 900 }], ['celular', { width: 390, height: 800 }]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: nome === 'celular', hasTouch: nome === 'celular' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('br26-theme', t); localStorage.setItem('br26-lang', 'pt'); } catch (e) { /* */ } }, tema);
    const pg = await ctx.newPage(); await pg.goto(`${BASE}/${u}`); await pg.waitForTimeout(3500); await pg.addScriptTag({ content: axeSrc });
    const v = await pg.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations
      .map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, alvo: JSON.stringify(x.nodes[0].target).slice(0, 70) })));
    const graves = v.filter((x) => x.impact === 'serious' || x.impact === 'critical'); ruim += graves.length; moderadas += v.length - graves.length;
    if (v.length) console.log(`${u} [${tema} ${nome}]`, v.map((x) => `${x.id}(${x.impact},${x.n}) ${x.alvo}`).join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(ruim ? `\n${ruim} violações graves` : '\nsem violações graves', moderadas ? `(${moderadas} moderadas)` : '');
  process.exit(ruim ? 1 : 0);
})();
