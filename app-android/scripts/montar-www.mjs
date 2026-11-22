#!/usr/bin/env node
/* Monta app-android/www/ — o conteúdo que vai DENTRO do APK — copiando do site estático (a raiz do repositório) só o que o
 * app usa. O site não tem etapa de build, então "montar" é só copiar; nada é transformado.
 *
 *   node app-android/scripts/montar-www.mjs [pasta-de-destino]      (padrão: app-android/www)
 *
 * Por que uma lista explícita: o repositório também guarda testes, scripts Python, datasets de apoio (o CSV "full" tem MB e não
 * é lido por nenhuma página) e documentação; nada disso deve ir para o celular. tests/android.test.js garante que tudo o que as
 * páginas referenciam por caminho relativo está na lista (um arquivo esquecido = página quebrada offline).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// pastas inteiras e arquivos soltos que entram no app (caminhos relativos à raiz do repositório)
export const INCLUIR = [
  'index.html', 'bench-docs.html', 'manifest.json', 'service-worker.js',
  'apps', 'simulacoes', 'shell', 'modelos', 'i18n',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/clubes',
  'datasets/calendario.js', 'datasets/campeonato-brasileiro-limpo.csv', 'datasets/campeonato-brasileiro-serie-b.csv',
];

function copiar(origem, destino) {
  const st = fs.statSync(origem);
  if (st.isDirectory()) {
    fs.mkdirSync(destino, { recursive: true });
    for (const nome of fs.readdirSync(origem)) if (!/\.md$/i.test(nome)) copiar(path.join(origem, nome), path.join(destino, nome));   // README das pastas não vai para o celular
  } else {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(origem, destino);
  }
}

export function montar(destino) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  for (const rel of INCLUIR) {
    const origem = path.join(RAIZ, rel);
    if (!fs.existsSync(origem)) throw new Error(`Falta no repositório: ${rel}`);
    copiar(origem, path.join(destino, rel));
  }
  return destino;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destino = path.resolve(process.argv[2] || path.join(RAIZ, 'app-android', 'www'));
  montar(destino);
  const bytes = (p) => fs.readdirSync(p, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? bytes(path.join(p, e.name)) : fs.statSync(path.join(p, e.name)).size), 0);
  console.log(`www montado em ${destino} (${(bytes(destino) / 1048576).toFixed(1)} MB)`);
}
