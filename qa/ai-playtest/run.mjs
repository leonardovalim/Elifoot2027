#!/usr/bin/env node
/**
 * Playtest com IA (um modelo local joga o jogo como um humano). Um comando só:
 *
 *   npm run qa:ia                         60 passos, gemma4, sem janela
 *   npm run qa:ia -- --steps 100          mais longo
 *   npm run qa:ia -- --visible            abre o navegador para assistir
 *   npm run qa:ia -- --model gemma4:latest --url http://localhost:5173
 *
 * Faz: cria o ambiente Python na 1ª vez (qa/ai-playtest/.venv), confere Ollama + modelo,
 * sobe o jogo se não estiver no ar, roda o agente e escreve qa-report/ia/report.md separando
 * O QUE A IA DIZ do QUE O LOG COMPROVA (o modelo exagera: trate o que o log não mostra como não verificado).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const STEPS = Number(opt('steps', 60));
const MODEL = String(opt('model', 'gemma4:latest'));
const VISIBLE = !!opt('visible', false);
const OLLAMA = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
let URL = String(opt('url', 'http://localhost:5173'));
const OUT = join(ROOT, 'qa-report', 'ia');
const WIN = process.platform === 'win32';
const VENV = join(HERE, '.venv');
const PY = join(VENV, WIN ? 'Scripts/python.exe' : 'bin/python');

const fail = (msg) => { console.error(`\n✖ ${msg}`); process.exit(2); };
const has = (cmd) => spawnSync(`${cmd} --version`, { shell: true, stdio: 'ignore' }).status === 0;
const up = async (u) => { try { return (await fetch(u, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };

// ---------------------------------------------------------------- 1. ambiente Python (só na 1ª vez)
function ensureVenv() {
  if (existsSync(PY)) return;
  console.log('Preparando o ambiente Python (só na primeira vez)...');
  const req = join(HERE, 'requirements.txt');
  // sem shell: o caminho do projeto pode ter espaços ("Área de Trabalho") e o shell o partiria em pedaços
  const run = (cmd, a) => spawnSync(cmd, a, { stdio: 'inherit' }).status === 0;
  if (has('uv')) {
    if (!run('uv', ['venv', '--python', '3.12', VENV])) fail('uv venv falhou');
    if (!run('uv', ['pip', 'install', '--python', PY, '-r', req])) fail('instalação do browser-use falhou');
  } else {
    const py = has('python') ? 'python' : has('python3') ? 'python3' : fail('Python 3.11+ não encontrado (ou instale o uv).');
    if (!run(py, ['-m', 'venv', VENV])) fail('python -m venv falhou');
    if (!run(PY, ['-m', 'pip', 'install', '-r', req])) fail('instalação do browser-use falhou');
  }
}

// ---------------------------------------------------------------- 2. Ollama e modelo
async function ensureModel() {
  let tags;
  try { tags = await (await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) })).json(); }
  catch { fail(`Ollama não respondeu em ${OLLAMA}. Abra o Ollama e tente de novo.`); }
  const names = (tags.models ?? []).map((m) => m.name);
  if (!names.includes(MODEL) && !names.includes(`${MODEL}:latest`)) fail(`Modelo ${MODEL} não está no Ollama. Rode: ollama pull ${MODEL}`);
}

// ---------------------------------------------------------------- 3. jogo no ar
async function ensureServer() {
  if (await up(URL)) return null;
  console.log(`Jogo não respondeu em ${URL}; subindo o vite na porta 5181...`);
  const proc = spawn('npx vite --port 5181 --strictPort', { cwd: ROOT, shell: true, stdio: 'ignore' });
  URL = 'http://localhost:5181';
  for (let i = 0; i < 60; i++) { if (await up(URL)) return proc; await new Promise((r) => setTimeout(r, 500)); }
  stopTree(proc);
  fail('não consegui subir o vite');
}
/** No Windows, matar só o processo deixa o vite órfão: encerra a árvore inteira. */
function stopTree(proc) {
  if (!proc?.pid) return;
  if (WIN) spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  else proc.kill('SIGTERM');
}

// ---------------------------------------------------------------- 4. agente
function runAgent() {
  mkdirSync(OUT, { recursive: true });
  const logPath = join(OUT, 'agent.log');
  const log = createWriteStream(logPath);
  console.log(`IA jogando (${MODEL}, até ${STEPS} passos${VISIBLE ? ', navegador visível' : ''})... acompanhe em ${logPath}`);
  return new Promise((done) => {
    const p = spawn(PY, [join(HERE, 'play.py'), URL, String(STEPS), MODEL, OUT, ...(VISIBLE ? [] : ['--headless'])], {
      cwd: HERE, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ANONYMIZED_TELEMETRY: 'false', BROWSER_USE_LOGGING_LEVEL: 'info', OLLAMA_HOST: OLLAMA },
    });
    const onData = (d) => {
      log.write(d);
      for (const line of String(d).split('\n')) { const m = clean(line).match(/📍 Step (\d+)/); if (m) process.stdout.write(`  passo ${m[1]}\r`); }
    };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    p.on('close', (code) => { log.end(); done({ code, logPath }); });
  });
}

// ---------------------------------------------------------------- 5. relatório (o que o log comprova)
const clean = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const CHECKS = [
  ['Criou a carreira', /Assumir o desafio/],
  ['Abriu o Elenco', /Clicked button "👥/],
  ['Mexeu na escalação', /Mandar para o banco|Escalar como titular|Tirar da relação/],
  ['Abriu o Mercado', /Clicked button "🔁/],
  ['Contratou um atleta', /Contratar/],
  ['Abriu as Finanças', /Clicked button "💰/],
  ['Mudou o ingresso', /Clicked button "[+−]"/],
  ['Abriu a Tabela', /Clicked button "🏆/],
  ['Abriu a Carreira', /Clicked button "👤/],
  ['Abriu a ajuda', /Ajuda: como jogar/],
  ['Assistiu partida narrada', /Assistir \(narrado\)/],
  ['Simulou partida', /Simular resultado|Até o fim/],
  ['Respondeu decisão do mercado', /Vender por|Cobrir salário|Recusar|Dar aumento|Negar|Renovar|Deixar sair/],
];

function writeReport({ code, logPath }) {
  const lines = readFileSync(logPath, 'utf8').split('\n').map(clean);
  const actions = lines.filter((l) => /🖱️|⌨️|🔗 Navigated/.test(l)).map((l) => l.replace(/^INFO\s+\[[^\]]+\]\s*/, '').trim());
  const warnings = lines.filter((l) => /⚠️|❌|Traceback|Error:/.test(l)).map((l) => l.trim()).slice(0, 20);
  const steps = lines.filter((l) => /📍 Step \d+/.test(l)).length;
  const endMatches = actions.filter((a) => /"Continuar ›"/.test(a)).length;
  let result = null;
  try { result = JSON.parse(readFileSync(join(OUT, 'result.json'), 'utf8')); } catch { /* agente caiu antes de terminar */ }
  const text = actions.join('\n');
  const md = [
    `# Playtest com IA — ${new Date().toLocaleString('pt-BR')}`,
    '',
    `Modelo **${MODEL}** · ${URL} · ${steps} passos${result ? ` em ${result.minutes} min` : ''} · ${result?.done ? 'concluiu' : `**não concluiu** (código ${code})`}`,
    '',
    '> A IA costuma exagerar no relatório final. Vale o que o **log comprova** (tabela abaixo); o resto é não verificado.',
    '',
    '## O que o log comprova',
    '',
    '| Tarefa | Feito? |', '|---|---|',
    ...CHECKS.map(([name, re]) => `| ${name} | ${re.test(text) ? '✅' : '❌ não aparece no log'} |`),
    `| Partidas concluídas ("Continuar ›") | ${endMatches} |`,
    '',
    '## O que a IA disse',
    '',
    result?.final ? result.final : '_(sem relatório final: o agente não terminou)_',
    '',
    warnings.length ? ['## Avisos e erros do agente', '', ...warnings.map((w) => `- ${w.slice(0, 200)}`), ''].join('\n') : '',
    `## Ações (${actions.length})`,
    '',
    ...actions.map((a, i) => `${i + 1}. ${a.slice(0, 160)}`),
    '',
  ].join('\n');
  writeFileSync(join(OUT, 'report.md'), md);
  return { steps, actions: actions.length, endMatches, done: !!result?.done };
}

// ---------------------------------------------------------------- main
ensureVenv();
await ensureModel();
const server = await ensureServer();
let summary;
try {
  summary = writeReport(await runAgent());
} finally {
  stopTree(server);
}
console.log(`\n${summary.done ? '✔' : '⚠'} ${summary.steps} passos · ${summary.actions} ações · ${summary.endMatches} partidas concluídas`);
console.log(`Relatório: ${join(OUT, 'report.md')}`);
