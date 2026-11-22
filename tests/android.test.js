'use strict';
/**
 * Casca Android (Capacitor): o app embute o site dentro do APK, então tudo o que as páginas referenciam por caminho
 * relativo precisa estar no pacote — um arquivo esquecido na lista de app-android/scripts/montar-www.mjs vira página
 * quebrada (e offline, sem rede para quebrar o galho). Este teste monta o pacote numa pasta temporária e confere isso,
 * além da configuração do Capacitor e das regras de assinatura (a chave nunca entra no repositório).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { console.log(`  ✓ ${m}`); passed++; } else { console.error(`  ✗ ${m}`); failed++; } };
const section = (n) => console.log(`\n${n}`);

(async () => {
  const { montar, INCLUIR } = await import(path.join(ROOT, 'app-android/scripts/montar-www.mjs'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'www-'));
  montar(tmp);
  const existe = (rel) => fs.existsSync(path.join(tmp, rel));
  const lerTodos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? lerTodos(path.join(dir, e.name)) : [path.join(dir, e.name)]);

  section('Pacote do app (www)');
  ok(existe('index.html') && existe('manifest.json') && existe('service-worker.js'), 'index.html, manifest.json e service-worker.js estão no pacote');
  ok(INCLUIR.every((r) => existe(r)), 'tudo o que a lista INCLUIR promete foi copiado');
  ok(!existe('tests') && !existe('scripts') && !existe('datasets/campeonato-brasileiro-full_ate_2025.csv') && !existe('icons/screenshots'), 'testes, scripts, CSV "full" e capturas da loja ficam de fora');
  const mb = lerTodos(tmp).reduce((n, f) => n + fs.statSync(f).size, 0) / 1048576;
  ok(mb < 25, `pacote com ${mb.toFixed(1)} MB (limite de sanidade: 25 MB)`);

  section('Referências relativas das páginas');
  const htmls = lerTodos(tmp).filter((f) => f.endsWith('.html'));
  ok(htmls.length >= 8, `${htmls.length} páginas HTML no pacote`);
  const faltando = [];
  for (const f of htmls) {
    const txt = fs.readFileSync(f, 'utf8').replace(/`;[\s\S]*?(?=<\/script>)/g, ''); // ignora os CSVs embutidos
    const dir = path.dirname(f);
    for (const m of txt.matchAll(/<(?:script|link|img|a)\b[^>]*?\b(?:src|href)=["']([^"'#?]+)(?:[?#][^"']*)?["']/gi)) {
      const ref = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\{|\$|javascript)/i.test(ref) || ref.includes('${') || !/\.(?:js|css|html|png|svg|json|csv|webp|ico)$/i.test(ref)) continue;
      const alvo = ref.startsWith('/') ? path.join(tmp, ref) : path.join(dir, ref);
      if (!fs.existsSync(alvo)) faltando.push(`${path.relative(tmp, f)} → ${ref}`);
    }
  }
  ok(faltando.length === 0, 'todo src/href relativo existe no pacote' + (faltando.length ? ` (faltam: ${[...new Set(faltando)].slice(0, 6).join('; ')})` : ''));

  const C = require(path.join(ROOT, 'modelos/competicoes.js'));
  ok(['serie-a', 'serie-b'].every((id) => { const c = C.obter(id); return c.dados !== 'disponivel' || existe(c.csv); }), 'o CSV de cada divisão lido por fetch está no pacote');

  section('Service worker e manifest dentro do pacote');
  const sw = fs.readFileSync(path.join(tmp, 'service-worker.js'), 'utf8');
  const pre = [...sw.slice(sw.indexOf('PRECACHE_ASSETS'), sw.indexOf('];', sw.indexOf('PRECACHE_ASSETS'))).matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
  ok(pre.length > 15 && pre.every((p) => existe(p)), `os ${pre.length} arquivos do pré-cache existem no pacote`);
  const man = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
  ok(man.icons.every((i) => existe(i.src.replace(/^\.\//, ''))), 'os ícones do manifest existem no pacote');
  ok(man.shortcuts.every((s) => existe(s.url.replace(/^\.\//, '').replace(/[?#].*$/, ''))), 'os atalhos do manifest apontam para páginas do pacote');

  section('Projeto Android');
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'app-android/capacitor.config.json'), 'utf8'));
  ok(cfg.webDir === 'www' && cfg.server && cfg.server.androidScheme === 'https', 'Capacitor lê www/ e serve por https (service worker exige contexto seguro)');
  ok(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(cfg.appId), `appId válido (${cfg.appId})`);
  const gradle = fs.readFileSync(path.join(ROOT, 'app-android/android/app/build.gradle'), 'utf8');
  ok(gradle.includes(`applicationId "${cfg.appId}"`) && gradle.includes(`namespace = "${cfg.appId}"`), 'applicationId e namespace do Gradle batem com o appId do Capacitor');
  ok(/KEYSTORE_PATH/.test(gradle) && /appVersionCode/.test(gradle), 'assinatura do release e versão vêm de variáveis (nada fixo no repositório)');
  ok(fs.existsSync(path.join(ROOT, 'app-android/android/gradlew')) && fs.existsSync(path.join(ROOT, 'app-android/android/gradle/wrapper/gradle-wrapper.jar')), 'Gradle wrapper versionado');
  const res = path.join(ROOT, 'app-android/android/app/src/main/res');
  ok(['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].every((d) => fs.existsSync(path.join(res, `mipmap-${d}/ic_launcher.png`))), 'ícones do launcher por densidade');
  ok(/#1A4731/i.test(fs.readFileSync(path.join(res, 'values/ic_launcher_background.xml'), 'utf8')), 'fundo do ícone adaptativo na cor do app (não o branco do template)');

  section('Segredos');
  let rastreados = '';
  try { rastreados = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }); } catch (e) { /* fora de um repositório git */ }
  ok(!/\.(keystore|jks)$/m.test(rastreados), 'nenhuma chave de assinatura (.keystore/.jks) versionada');
  ok(!/storePassword\s+['"][^$]/.test(gradle), 'senha da chave não está escrita no build.gradle');
  const wf = path.join(ROOT, '.github/workflows/android.yml');
  ok(fs.existsSync(wf) && /secrets\.ANDROID_KEYSTORE_BASE64/.test(fs.readFileSync(wf, 'utf8')), 'workflow lê a chave dos Secrets do GitHub');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${'─'.repeat(50)}\nandroid: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
