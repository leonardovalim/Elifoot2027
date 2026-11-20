#!/usr/bin/env node
/**
 * Playtest automático do Mestres do Esporte — zero tokens de LLM.
 *
 *   npm run qa                         roteiro fixo nos 3 tamanhos de tela
 *   npm run qa -- --explore 300        roteiro + 300 cliques aleatórios por tela
 *   npm run qa -- --seed 1234          repete exatamente uma execução anterior
 *   npm run qa -- --viewport mobile    só um tamanho (mobile | laptop | desktop)
 *   npm run qa -- --headed             abre o navegador visível
 *   npm run qa -- --url http://localhost:5173
 *   npm run qa -- --review             + revisão visual de cada tela pelo gemma4 local (Ollama) — EXPERIMENTAL:
 *                                        com o gemma4 8B (nov/2026) os apontamentos são genéricos e ele não
 *                                        acha problemas reais conhecidos; trate como palpite a confirmar.
 *   npm run qa -- --review modelo:tag  usa outro modelo de visão do Ollama (um maior tende a ser mais útil)
 *
 * Saída em qa-report/: report.md (resumo legível), report.json (para outro agente/LLM)
 * e screenshots/ — cada problema aponta para o screenshot da tela onde apareceu.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------- argumentos
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const SEED = Number(opt('seed', Date.now() % 1_000_000));
const EXPLORE = Number(opt('explore', 0)) || 0;
const HEADED = !!opt('headed', false);
const ONLY = opt('viewport', null);
let BASE = opt('url', 'http://localhost:5173');
const REVIEW = (() => { const v = opt('review', false); return v === true ? 'gemma4:latest' : v; })();
const OLLAMA = opt('ollama', 'http://127.0.0.1:11434');

const VIEWPORTS = {
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
};
const SEASONS = Number(opt('seasons', 0)) || 0;
const OUT = String(opt('out', 'qa-report'));
const SHOTS = join(OUT, 'screenshots');

// ---------------------------------------------------------------- aleatoriedade reprodutível
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// ---------------------------------------------------------------- servidor
async function up(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); return r.ok; } catch { return false; }
}
async function ensureServer() {
  if (await up(BASE)) return null;
  console.log(`Servidor não respondeu em ${BASE}; iniciando vite...`);
  const proc = spawn('npx', ['vite', '--port', '5179', '--strictPort'], { shell: true, stdio: 'ignore' });
  BASE = 'http://localhost:5179';
  for (let i = 0; i < 60; i++) {
    if (await up(BASE)) return proc;
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error('Não consegui iniciar o vite.');
}

// ---------------------------------------------------------------- checagens (rodam dentro da página)
/* Tudo aqui é executado no navegador. Retorna a lista de problemas da tela atual. */
function pageChecks(isMobile) {
  const issues = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const desc = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const txt = (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.tagName.toLowerCase()}${cls}>${txt ? ` "${txt}"` : ''}`;
  };
  // conteúdo de <details> fechado não está na tela (o Chrome ainda informa posição para ele)
  const inClosedDetails = (el) => { const d = el.closest('details:not([open])'); return !!d && !el.closest('summary'); };
  const visible = (el) => {
    if (inClosedDetails(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const scrollableAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) return p;
    }
    return null;
  };

  // escopo: se há janela aberta, só ela importa (o resto está atrás do overlay)
  const dialogs = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter(visible);
  const scope = dialogs.at(-1) ?? document.body;

  // 1. rolagem horizontal da página
  if (document.documentElement.scrollWidth > vw + 1) {
    issues.push({ kind: 'rolagem-horizontal', severity: 'alta', detail: `página tem ${document.documentElement.scrollWidth}px de largura numa tela de ${vw}px` });
  }

  const all = [...scope.querySelectorAll('*')].filter(visible);

  for (const el of all) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);

    // 2. elemento saindo da tela (fora de containers com rolagem, onde é intencional)
    if ((r.right > vw + 2 || r.left < -2) && !scrollableAncestor(el) && el.children.length === 0 && (el.innerText || '').trim()) {
      issues.push({ kind: 'fora-da-tela', severity: 'alta', el: desc(el), detail: `x ${Math.round(r.left)}→${Math.round(r.right)} com tela de ${vw}px` });
    }

    // 3. texto cortado: conteúdo maior que a caixa com overflow escondido
    const clipsX = /(hidden|clip)/.test(s.overflowX), clipsY = /(hidden|clip)/.test(s.overflowY);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && clipsX && el.scrollWidth > el.clientWidth + 1) {
      issues.push({ kind: 'texto-cortado', severity: s.textOverflow === 'ellipsis' ? 'baixa' : 'media', el: desc(el), detail: `${el.scrollWidth}px de texto em ${el.clientWidth}px${s.textOverflow === 'ellipsis' ? ' (com reticências)' : ''}` });
    }
    if (hasText && clipsY && el.scrollHeight > el.clientHeight + 2 && s.webkitLineClamp === 'none') {
      issues.push({ kind: 'texto-cortado', severity: 'media', el: desc(el), detail: `${el.scrollHeight}px de altura em ${el.clientHeight}px` });
    }
  }

  // 4. valores quebrados visíveis
  const text = scope.innerText || '';
  for (const bad of ['NaN', 'undefined', 'null', 'Infinity', '[object Object]']) {
    const re = new RegExp(`(^|[^\\w])${bad.replace(/[[\]]/g, '\\$&')}([^\\w]|$)`);
    if (re.test(text)) {
      const at = text.search(re);
      issues.push({ kind: 'valor-quebrado', severity: 'alta', detail: `"${bad}" visível: …${text.slice(Math.max(0, at - 30), at + 30).replace(/\s+/g, ' ')}…` });
    }
  }

  // 5. controles: cobertos, sobrepostos, pequenos demais
  // fora da área visível do container com rolagem (ex.: linha rolada para baixo do cabeçalho fixo): não está na tela
  const inScrollView = (el) => {
    const sa = scrollableAncestor(el);
    if (!sa) return true;
    const a = sa.getBoundingClientRect(), r = el.getBoundingClientRect();
    const head = sa.querySelector('th')?.getBoundingClientRect(); // o th é que fica fixo (sticky), o thead rola junto
    const top = head && head.bottom > a.top && head.bottom < a.bottom ? head.bottom : a.top;
    const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
    return cy > top && cy < a.bottom && cx > a.left && cx < a.right;
  };
  const ctrls = [...scope.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=radio], [role=tab]')]
    .filter((el) => visible(el) && !el.disabled && inScrollView(el));
  for (const el of ctrls) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx >= 0 && cy >= 0 && cx < vw && cy < vh) {
      const top = document.elementFromPoint(cx, cy);
      // sobreposição temporária de propósito (ex.: banner de conquista) não conta
      if (top && top !== el && !el.contains(top) && !top.contains(el) && !top.closest('[data-qa-transient]')) {
        issues.push({ kind: 'controle-coberto', severity: 'alta', el: desc(el), detail: `o centro do controle está coberto por ${desc(top)}` });
      }
    }
    // um input dentro de <label> é tocado pela área do label inteiro (ex.: checkbox com texto ao lado)
    let hit = el.closest('label')?.getBoundingClientRect() ?? r;
    // data-hitslop="N": a área de toque foi ampliada N px por CSS (::after) sem mudar o visual
    const slop = Number(el.dataset?.hitslop || 0);
    if (slop) hit = { width: hit.width + slop, height: hit.height + 2 * slop }; // CSS: inset -N px na vertical, -N/2 na horizontal
    if (isMobile && (hit.width < 24 || hit.height < 24)) {
      issues.push({ kind: 'alvo-pequeno', severity: 'baixa', el: desc(el), detail: `${Math.round(r.width)}×${Math.round(r.height)}px (mínimo recomendado 24×24 para toque)` });
    }
  }
  for (let i = 0; i < ctrls.length; i++) {
    const a = ctrls[i].getBoundingClientRect();
    for (let j = i + 1; j < ctrls.length; j++) {
      if (ctrls[i].contains(ctrls[j]) || ctrls[j].contains(ctrls[i])) continue;
      if (ctrls[i].closest('[data-qa-transient]') || ctrls[j].closest('[data-qa-transient]')) continue; // banner temporário
      const b = ctrls[j].getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 2 && w * h > 0.2 * Math.min(a.width * a.height, b.width * b.height)) {
        issues.push({ kind: 'controles-sobrepostos', severity: 'alta', el: desc(ctrls[i]), detail: `sobrepõe ${desc(ctrls[j])} em ${Math.round(w)}×${Math.round(h)}px` });
      }
    }
  }
  return issues;
}

/* Lista os controles clicáveis da camada de cima, para o explorador sortear. */
function clickables() {
  const visible = (el) => { if (el.closest('details:not([open])') && !el.closest('summary')) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const dialogs = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter(visible);
  const scope = dialogs.at(-1) ?? document.body;
  document.querySelectorAll('[data-qa-pick]').forEach((el) => el.removeAttribute('data-qa-pick'));
  return [...scope.querySelectorAll('button, a[href], input, select, [role=button], [role=radio], label.check')]
    // o explorador não confirma ações destrutivas (ex.: "Apagar e sair"), para não apagar a carreira no meio do teste
    .filter((el) => visible(el) && !el.disabled && !(el.closest('[role=alertdialog]') && el.classList.contains('danger') && /apagar|encerrar/i.test(el.innerText)))
    .map((el, i) => { el.dataset.qaPick = String(i); return { i, tag: el.tagName.toLowerCase(), type: el.tagName === 'INPUT' ? el.type : '', text: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40) }; });
}

// ---------------------------------------------------------------- cenários de carreira (--scenario)
/* Cada cenário diz, por temporada, como alterar o save antes de jogá-la: força do elenco, caixa do clube
   e o que fazer com as propostas. Assim cada caminho (acesso, título, demissão, troca de clube, falência)
   é testado de propósito, em vez de depender da sorte da simulação. */
const SCENARIOS = {
  normal: { desc: 'sem interferência', plan: () => ({ label: 'normal', team: 'normal', offers: 'ficar' }) },
  campeao: {
    desc: 'elenco no máximo toda temporada, começando na Divisão 4: acesso atrás de acesso até o título da Divisão 1',
    challenge: 'Começar de baixo',
    plan: () => ({ label: 'elenco 99', team: 'forte', offers: 'ficar' }),
  },
  demissao: {
    desc: 'alterna elenco no mínimo e no máximo: demissão, sem clube, nova proposta, recuperação',
    plan: (i) => (i % 2 === 0 ? { label: 'elenco 1', team: 'fraco', offers: 'ficar' } : { label: 'elenco 99', team: 'forte', offers: 'ficar' }),
  },
  carrossel: { desc: 'elenco no máximo e aceita toda proposta: troca de clube a cada temporada', plan: () => ({ label: 'elenco 99 + aceita propostas', team: 'forte', offers: 'aceitar' }) },
  'demissao-caixa': {
    desc: 'elenco no máximo (cumpre o objetivo) com caixa em -50 milhões: demissão por terminar no vermelho',
    plan: () => ({ label: 'elenco 99 + caixa -50M', team: 'forte', budget: -50_000_000, offers: 'ficar' }),
  },
  falencia: { desc: 'caixa do clube em -5 milhões no início de cada temporada', plan: () => ({ label: 'caixa -5M', team: 'normal', budget: -5_000_000, offers: 'ficar' }) },
  caos: {
    desc: 'sorteia por temporada: força do elenco, caixa e o que fazer com propostas',
    plan: (i, rand) => {
      const team = ['forte', 'fraco', 'normal'][Math.floor(rand() * 3)];
      const budget = rand() < 0.3 ? [-20_000_000, 0, 999_999_999][Math.floor(rand() * 3)] : undefined;
      const offers = rand() < 0.5 ? 'aceitar' : 'ficar';
      return { label: `caos: ${team}${budget !== undefined ? `, caixa ${budget}` : ''}, ${offers}`, team, budget, offers };
    },
  },
};
const SCENARIO = String(opt('scenario', 'normal'));
if (!SCENARIOS[SCENARIO]) { console.error(`Cenário desconhecido: ${SCENARIO}. Opções: ${Object.keys(SCENARIOS).join(', ')}`); process.exit(2); }

/* (no navegador) altera o save conforme o plano da temporada. */
function tamperSave(plan) {
  const KEY = 'mestres-do-esporte.save';
  const c = JSON.parse(localStorage.getItem(KEY));
  const club = c.clubs[c.entrepreneur.bonds[0]?.orgId];
  if (!club) return;
  if (plan.team !== 'normal') {
    const v = plan.team === 'forte' ? 99 : 1;
    for (const p of club.players) {
      for (const k of Object.keys(p.attrs)) if (typeof p.attrs[k] === 'number') p.attrs[k] = v;
      p.potential = v; p.condition = 100; p.suspended = 0;
    }
  }
  if (plan.budget !== undefined) club.budget = plan.budget;
  localStorage.setItem(KEY, JSON.stringify(c));
}

/* (no navegador) resumo do save para as regras de negócio. */
function snapshotSave() {
  const c = JSON.parse(localStorage.getItem('mestres-do-esporte.save'));
  const me = c.entrepreneur.bonds[0]?.orgId ?? '';
  const div = c.season.divisions.findIndex((d) => d.teamIds.includes(me));
  const nums = [c.entrepreneur.cash, c.entrepreneur.reputation, ...Object.values(c.clubs).map((x) => x.budget)];
  return {
    year: c.season.year, me, club: c.clubs[me]?.name ?? null, div, divSize: div >= 0 ? c.season.divisions[div].teamIds.length : 0,
    unemployed: !!c.unemployed, offers: c.offers.length, objective: c.entrepreneur.bonds[0]?.objective ?? null,
    reputation: c.entrepreneur.reputation, cash: c.entrepreneur.cash, budget: c.clubs[me]?.budget ?? null,
    titles: c.clubs[me]?.titles?.length ?? 0, histLen: c.entrepreneur.history.length, lastHistory: c.entrepreneur.history[0] ?? null,
    squad: c.clubs[me]?.players?.length ?? 0,
    // regras do caixa negativo: demissão se a temporada fecha no vermelho; -1 de reputação por mês no vermelho
    brokeFired: c.news.slice(0, 30).some((n) => /demitido/.test(n.text) && /caixa negativo/.test(n.text)),
    redMonths: c.news.filter((n) => /no vermelho/.test(n.text)).length,
    badNumbers: nums.filter((n) => typeof n !== 'number' || !Number.isFinite(n)).length,
  };
}

/* Confere se o jogo reagiu à temporada como as regras dizem. before = início da temporada,
   closed = logo após o fechamento, after = depois da escolha no balanço. */
function businessRules(before, closed, after, plan, action, fired = null, midSwitch = false) {
  const out = [];
  const bad = (severity, text) => out.push({ severity, text });
  if (fired) {
    // caminho da demissão: closed já é o novo clube, então confere a demissão a partir do momento "sem clube"
    const h = fired.lastHistory;
    if (!h || fired.histLen !== before.histLen + 1) bad('alta', 'demitido, mas a temporada não entrou no histórico da carreira');
    else if (h.achieved && !fired.brokeFired) bad('alta', `demitido mesmo tendo cumprido o objetivo (${h.position}º) e sem caixa negativo`);
    if (!fired.unemployed) bad('alta', 'tela "sem clube" apareceu mas o save não marca o jogador como desempregado');
    if (fired.offers === 0) bad('alta', 'demitido sem nenhuma proposta: carreira travada');
    if (closed.unemployed || !closed.club) bad('alta', 'aceitou proposta após demissão e continuou sem clube');
    if (closed.badNumbers || after.badNumbers) bad('alta', 'valores de dinheiro/reputação inválidos (NaN/Infinity) no save');
    if (plan.team === 'forte') bad('media', `elenco todo com atributos 99 e mesmo assim demitido (${h?.position}º)`);
    return out;
  }
  const h = closed.lastHistory;
  if (!h || closed.histLen !== before.histLen + 1) { bad('alta', 'a temporada não entrou no histórico da carreira'); return out; }
  const d = h.division, pos = h.position, n = before.divSize;
  if (!midSwitch && before.div + 1 !== d) bad('alta', `histórico diz Divisão ${d}, mas o clube começou a temporada na Divisão ${before.div + 1}`);
  // Medido em 20 temporadas na Div. 1: elenco 99 é campeão ~90% das vezes (V 65% · E 20% · D 14% por jogo).
  // Fora do top 2 é raro mas possível; se o cenário vendeu atletas nas decisões, o elenco 99 nem existe mais.
  if (plan.team === 'forte' && !plan.sold && pos > 2) bad('baixa', `elenco todo com atributos 99 terminou em ${pos}º na Divisão ${d} (raro, ~5%; repetir com outra seed para ver se é azar)`);
  if (plan.team === 'forte' && !plan.sold && !h.achieved && pos > 2) bad('baixa', `elenco todo 99 e objetivo "${h.objective}" não cumprido (${pos}º)`);
  if (plan.team === 'fraco' && pos <= Math.ceil(n / 2)) bad('media', `elenco todo com atributos 1 terminou em ${pos}º de ${n}`);
  const promoted = d > 1 && pos <= 2, relegated = d < 4 && pos > n - 2;
  // demissão com objetivo cumprido só é válida se a temporada fechou com o caixa negativo (regra do jogo)
  if (h.achieved && closed.unemployed && !closed.brokeFired) bad('alta', `cumpriu o objetivo (${pos}º) e foi demitido sem caixa negativo`);
  if (closed.unemployed && closed.offers === 0) bad('alta', 'demitido sem nenhuma proposta: carreira travada');
  if (!closed.unemployed) {
    const expected = promoted ? d - 1 : relegated ? d + 1 : d;
    if (closed.div + 1 !== expected) bad('alta', `terminou em ${pos}º na Divisão ${d}${promoted ? ' (acesso)' : relegated ? ' (rebaixamento)' : ''}, mas a nova temporada começou na Divisão ${closed.div + 1} (esperado ${expected})`);
    if (pos === 1 && !midSwitch && closed.titles !== before.titles + 1) bad('alta', `campeão da Divisão ${d} mas o título não foi registrado no clube`);
  }
  if (h.achieved && closed.reputation < before.reputation && !closed.brokeFired && closed.redMonths <= before.redMonths) bad('media', `cumpriu o objetivo e a reputação caiu (${before.reputation} → ${closed.reputation})`);
  if (closed.badNumbers || after.badNumbers) bad('alta', 'valores de dinheiro/reputação inválidos (NaN/Infinity) no save');
  if (/aceitou/.test(action)) {
    if (after.unemployed || !after.club) bad('alta', `aceitou proposta e continuou sem clube`);
    else if (after.me === closed.me) bad('alta', `aceitou proposta mas continuou no mesmo clube (${after.club})`);
  } else if (after.me !== closed.me) bad('alta', `escolheu "${action}" mas trocou de clube (${closed.club} → ${after.club})`);
  if (after.squad < 16) bad('media', `elenco com só ${after.squad} atletas no início da nova temporada (mínimo do jogo é 16)`);
  return out;
}

// ---------------------------------------------------------------- execução por tela
async function runViewport(browser, vpName, report) {
  const rand = rng(SEED + vpName.length * 7919);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor ?? 1, locale: 'pt-BR' });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('mestres-do-esporte.intro-seen', '1'); } catch {} });
  const page = await ctx.newPage();

  let screen = 'inicio', shotN = 0;
  const seen = new Set();
  const add = (issue) => {
    // na exploração cada ação é uma "tela" nova: agrupa pelo elemento para não repetir o mesmo achado 80 vezes
    const where = screen.startsWith('explorar-') ? 'explorar' : screen;
    const key = `${vpName}|${where}|${issue.kind}|${issue.el ?? ''}|${issue.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    report.issues.push({ viewport: vpName, screen, ...issue });
  };
  page.on('console', (m) => { if (m.type() === 'error') add({ kind: 'erro-console', severity: 'alta', detail: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => add({ kind: 'exceção-js', severity: 'alta', detail: String(e.message || e).slice(0, 300) }));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) add({ kind: 'requisição-falhou', severity: 'media', detail: `${r.status()} ${r.url()}` }); });
  page.on('dialog', (d) => d.dismiss()); // recusa "apagar save?" etc.

  const check = async (name) => {
    screen = name;
    await page.waitForTimeout(350); // deixa transições terminarem
    const file = `${vpName}-${String(++shotN).padStart(3, '0')}-${name}.png`;
    await page.screenshot({ path: join(SHOTS, file) });
    report.screens.push({ viewport: vpName, screen: name, screenshot: `screenshots/${file}` });
    const before = report.issues.length;
    for (const i of await page.evaluate(pageChecks, !!vp.isMobile)) add({ ...i, screenshot: `screenshots/${file}` });
    for (const i of report.issues.slice(before)) i.screenshot ??= `screenshots/${file}`;
  };
  const step = async (name, fn) => {
    try { await fn(); return true; } catch (e) {
      screen = name;
      const file = `${vpName}-${String(++shotN).padStart(3, '0')}-FALHOU-${name}.png`;
      await page.screenshot({ path: join(SHOTS, file) }).catch(() => {});
      add({ kind: 'passo-falhou', severity: 'alta', detail: String(e.message).split('\n')[0].slice(0, 250), screenshot: `screenshots/${file}` });
      return false;
    }
  };
  const click = (loc) => loc.first().click({ timeout: 5000 });

  // ------------------------------------------------ roteiro fixo
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await check('titulo');

  const randomChallenge = pick(['Começar de baixo', 'Buscar crescimento', 'Administrar a pressão']);
  const challenge = SCENARIOS[SCENARIO].challenge ?? randomChallenge;
  report.choices[vpName] = { challenge };
  const ok =
    (await step('nova-carreira', async () => { await click(page.getByRole('button', { name: 'Nova carreira' })); await check('criar-1-perfil'); })) &&
    (await step('nome-vazio', async () => { await click(page.getByRole('button', { name: /Escolher desafio/ })); await check('criar-1-erro-nome'); })) &&
    (await step('perfil', async () => { await page.getByLabel('Seu nome').fill('Teste QA'); await click(page.getByRole('button', { name: /Escolher desafio/ })); await check('criar-2-desafio'); })) &&
    (await step('desafio', async () => { await click(page.getByRole('button', { name: new RegExp(challenge) })); await click(page.getByRole('button', { name: /Ver oportunidades/ })); await check('criar-3-oportunidades'); })) &&
    (await step('assumir', async () => {
      const offers = page.getByRole('button', { name: 'Assumir o desafio' });
      const n = await offers.count();
      const k = Math.floor(rand() * n); report.choices[vpName].offer = k + 1;
      await offers.nth(k).click({ timeout: 5000 });
      await page.locator('.hud').waitFor({ timeout: 5000 });
      await check('jogo');
    }));

  if (ok) {
    const menus = ['Elenco', 'Mercado', 'Tabela', 'Finanças', 'Carreira'].sort(() => rand() - 0.5);
    for (const m of menus) {
      await step(`menu-${m}`, async () => {
        await click(page.locator('.dock').getByRole('button', { name: m }));
        await page.getByRole('dialog', { name: m }).waitFor({ timeout: 3000 });
        await check(`menu-${m.toLowerCase()}`);
        if (m === 'Elenco' && (await page.locator('.squad-list .mrow').count())) {
          // celular: o atleta abre embaixo do cartão, com os atributos recolhidos
          await click(page.locator('.squad-list .mrow').nth(2));
          await page.waitForTimeout(400);
          await click(page.locator('.attr-details > summary'));
          await check('menu-elenco-atleta-aberto');
          await click(page.locator('.squad-list li.open .mrow'));
        }
        if (m === 'Elenco') {
          // tocar num selo abre a ajuda direto na explicação dele
          const tag = page.getByRole('dialog', { name: m }).locator('.tag-help').first();
          if (await tag.count()) {
            const label = (await tag.innerText()).trim();
            await tag.click({ timeout: 3000 });
            const help = page.getByRole('dialog', { name: 'Como jogar' });
            await help.waitFor({ timeout: 3000 });
            if (!(await help.locator('.help-tags .hl').count())) throw new Error(`tocar no selo "${label}" abriu a ajuda sem destacar a explicação dele`);
            await check('ajuda-selo');
            await click(help.getByRole('button', { name: 'Fechar' }));
          }
        }
        await click(page.getByRole('dialog', { name: m }).getByRole('button', { name: 'Fechar' }));
      });
    }
    await step('ajuda', async () => {
      await click(page.getByRole('button', { name: /Ajuda/ }));
      const help = page.getByRole('dialog', { name: 'Como jogar' });
      await help.waitFor({ timeout: 3000 });
      for (const t of await help.locator('.help-nav button').allInnerTexts()) {
        await click(help.locator('.help-nav').getByRole('button', { name: t, exact: true }));
        const slug = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
        await check(`ajuda-${slug}`);
      }
      await click(help.getByRole('button', { name: 'Fechar' }));
    });
    await step('partida', async () => {
      // até o dia de jogo podem surgir decisões (proposta por atleta, aumento, renovação): responde e segue
      const until = Date.now() + 120_000;
      const seenHere = new Set();
      for (;;) {
        if (Date.now() > until) throw new Error('o dia de jogo não chegou em 2 minutos');
        const fast = page.getByRole('button', { name: 'Velocidade 3' });
        if (await fast.isEnabled().catch(() => false) && (await fast.getAttribute('aria-pressed')) !== 'true') await fast.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
        const dialog = page.locator('[role=dialog], [role=alertdialog]').last();
        const title = (await dialog.isVisible().catch(() => false)) ? await dialog.getAttribute('aria-label') : null;
        if (title === 'Dia de jogo') break;
        if (!title) continue;
        const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!seenHere.has(slug)) { seenHere.add(slug); await check(`decisao-${slug}`); }
        const buttons = dialog.locator('button:not([disabled])');
        const n = await buttons.count();
        if (n) await buttons.nth(Math.floor(rand() * n)).click({ timeout: 3000 }).catch(() => {});
        else await page.keyboard.press('Escape');
      }
      await check('partida-pre-jogo');
      await click(page.getByRole('button', { name: /Assistir/ }));
      await page.waitForTimeout(2500);
      await check('partida-ao-vivo');
      await click(page.getByRole('button', { name: /Até o fim/ }));
      await page.getByRole('button', { name: /Continuar ›/ }).waitFor({ timeout: 30_000 });
      await check('partida-resultado');
      await click(page.getByRole('button', { name: /Continuar ›/ }));
      await check('jogo-pos-partida');
    });
    await step('conquistas', async () => {
      // a primeira partida destrava "Primeiro apito": banner na tela e conquista salva
      const banner = page.locator('.ach-toast');
      await banner.first().waitFor({ timeout: 6000 }).catch(() => {});
      const saved = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mestres-do-esporte.conquistas') || '{}').unlocked || {}));
      if (!saved.includes('primeiro-apito')) throw new Error(`depois da 1ª partida a conquista "primeiro-apito" não foi salva (salvas: ${saved.join(', ') || 'nenhuma'})`);
      report.achievements = { afterFirstMatch: saved };
      // todas as 50 de uma vez: CT completo e coleção (sem banners, pois não foram "ganhas" agora)
      const realCollection = await page.evaluate(() => localStorage.getItem('mestres-do-esporte.conquistas'));
      await page.evaluate(() => {
        const KEY = 'mestres-do-esporte.conquistas';
        const s = JSON.parse(localStorage.getItem(KEY) || '{}');
        const ids = window.__ACH_IDS__ || [];
        s.unlocked = Object.fromEntries(ids.map((id) => [id, new Date().toISOString()]));
        localStorage.setItem(KEY, JSON.stringify(s));
      }).catch(() => {});
      const ids = await page.evaluate(() => (window.__ACH_IDS__ || []).length);
      if (ids < 50) throw new Error(`esperava as conquistas expostas em window.__ACH_IDS__, veio ${ids}`);
      await page.reload({ waitUntil: 'networkidle' });
      await click(page.getByRole('button', { name: 'Continuar carreira' }));
      await page.locator('.hud').waitFor({ timeout: 5000 });
      await page.waitForTimeout(400);
      await page.locator('.scene').scrollIntoViewIfNeeded();
      await check('ct-todas-conquistas');
      await page.locator('.scene').screenshot({ path: join(SHOTS, `${vpName}-ct-close.png`) });
      await click(page.locator('.dock').getByRole('button', { name: 'Carreira' }));
      const dlg = page.getByRole('dialog', { name: 'Carreira' });
      await dlg.waitFor({ timeout: 3000 });
      await dlg.locator('.ach-section').scrollIntoViewIfNeeded();
      await check('carreira-conquistas');
      await click(dlg.getByRole('button', { name: 'Fechar' }));
      // devolve a coleção verdadeira: temporadas e exploração seguem com o progresso real
      await page.evaluate((v) => { if (v) localStorage.setItem('mestres-do-esporte.conquistas', v); }, realCollection);
      await page.reload({ waitUntil: 'networkidle' });
      await click(page.getByRole('button', { name: 'Continuar carreira' }));
      await page.locator('.hud').waitFor({ timeout: 5000 });
    });
  }

  // ------------------------------------------------ temporadas inteiras (fim de temporada, balanço, propostas, demissão)
  /* Checa a tela atual sem screenshot; só salva imagem se aparecer problema novo. */
  const quickCheck = async (name) => {
    screen = name;
    const before = report.issues.length;
    for (const i of await page.evaluate(pageChecks, !!vp.isMobile).catch(() => [])) add(i);
    if (report.issues.length > before) {
      const file = `${vpName}-${String(++shotN).padStart(3, '0')}-${name}.png`;
      await page.screenshot({ path: join(SHOTS, file) }).catch(() => {});
      for (const i of report.issues.slice(before)) i.screenshot = `screenshots/${file}`;
    }
  };
  if (ok && SEASONS > 0) {
    await step('temporadas', async () => {
      const autoSim = () => page.getByLabel('Simular jogos automaticamente').check({ timeout: 5000 });
      await autoSim();
      let done = 0, ticks = 0, lastDate = '', sameDate = 0;
      let plan = null, before = null;
      const decisionsSeen = {};
      const startSeason = async () => {
        plan = SCENARIOS[SCENARIO].plan(done, rand);
        // altera o save para forçar o caminho do cenário e recarrega a carreira
        if (plan.team !== 'normal' || plan.budget !== undefined) {
          await page.evaluate(tamperSave, plan);
          await page.reload({ waitUntil: 'networkidle' });
          await click(page.getByRole('button', { name: 'Continuar carreira' }));
          await page.locator('.hud').waitFor({ timeout: 5000 });
          await autoSim();
        }
        before = await page.evaluate(snapshotSave);
        report.seasons.push({ viewport: vpName, season: done + 1, plan: { ...plan }, before });
      };
      await startSeason();
      const deadline = Date.now() + SEASONS * 6 * 60_000;
      while (done < SEASONS) {
        if (Date.now() > deadline) throw new Error(`tempo esgotado na temporada ${done + 1}`);
        await page.waitForTimeout(1500);
        const dialog = page.locator('[role=dialog], [role=alertdialog]').last();
        const title = (await dialog.isVisible().catch(() => false)) ? await dialog.getAttribute('aria-label') : null;
        const tag = `temporada-${done + 1}`;
        if (title?.startsWith('Fim da temporada')) {
          await check(`${tag}-fim`);
          await click(dialog.getByRole('button', { name: /Ver premiação/ }));
        } else if (title?.startsWith('Balanço')) {
          await check(`${tag}-balanco`);
          const closed = await page.evaluate(snapshotSave); // já com o resultado da temporada (closeSeason salva)
          const rec = report.seasons.at(-1);
          rec.text = (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 300);
          rec.result = closed.lastHistory;
          const accept = dialog.getByRole('button', { name: 'Aceitar' });
          const go = dialog.getByRole('button', { name: /Seguir para a nova temporada|Ficar no clube/ });
          let action;
          if (!(await go.count())) { if (!(await accept.count())) throw new Error('demitido e sem nenhuma proposta — carreira travada'); action = 'aceitou proposta (demitido)'; await click(accept); }
          else if (plan.offers === 'aceitar' && (await accept.count())) { action = 'aceitou proposta'; await click(accept); }
          else { action = (await go.innerText()).replace(/\s*›/, ''); await click(go); }
          rec.action = action;
          const after = await page.evaluate(snapshotSave);
          rec.after = after;
          if (rec.firedFlow) rec.action = action = `demitido → ${closed.club}; ${action}`;
          for (const v of businessRules(rec.before, closed, after, rec.midSwitch ? { ...plan, team: 'normal', label: `${plan.label} → trocou de clube no meio` } : plan, action, rec.firedFlow ? rec.unemployedSnapshot : null, !!rec.midSwitch)) add({ kind: 'regra-de-negócio', severity: v.severity, detail: `temporada ${done + 1} (${plan.label}): ${v.text}` });
          done++;
          await check(`${tag}-nova-temporada`);
          if (done < SEASONS) await startSeason();
        } else if (title === 'Você está sem clube') {
          await check(`${tag}-sem-clube`);
          const rec = report.seasons.at(-1);
          if (rec && !rec.firedFlow) {
            rec.firedFlow = true;
            // o balanço da temporada deveria vir antes da tela de "sem clube"
            if (!rec.text) add({ kind: 'fluxo', severity: 'media', detail: `temporada ${done + 1}: demitido vê "Você está sem clube" antes do balanço da temporada (o balanço só aparece depois de aceitar outro clube)` });
            rec.unemployedSnapshot = await page.evaluate(snapshotSave);
          }
          const accept = dialog.getByRole('button', { name: 'Aceitar' });
          if (await accept.count()) await click(accept); else throw new Error('demitido e sem nenhuma proposta — carreira travada');
        } else if (title === 'Dia de jogo') {
          await click(dialog.getByRole('button', { name: /Simular resultado/ }));
          await click(page.getByRole('button', { name: /Continuar ›/ }));
        } else if (title) {
          // janela de decisão (ex.: "Proposta por atleta"): checa a tela e escolhe um botão ao acaso
          const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const nTimes = (decisionsSeen[slug] = (decisionsSeen[slug] ?? 0) + 1);
          if (nTimes <= 2) await check(`${tag}-${slug}`); else await quickCheck(`${tag}-${slug}`);
          const buttons = dialog.locator('button:not([disabled])');
          const n = await buttons.count();
          if (!n) { await page.keyboard.press('Escape'); continue; }
          const k = Math.floor(rand() * n);
          const label = (await buttons.nth(k).innerText().catch(() => '?')).replace(/\s+/g, ' ').trim();
          (report.decisions ??= []).push({ viewport: vpName, season: done + 1, dialog: title, choice: label });
          if (/^Vender|^Deixar sair/i.test(label) && plan) plan.sold = true; // elenco forçado deixou de ser o original
          if (title === 'Janela do meio do campeonato' && /^Aceitar/.test(label)) {
            const rec = report.seasons.at(-1);
            if (rec) rec.midSwitch = true; // trocou de clube no meio: as regras da temporada valem para o clube novo
            (report.midSeason ??= []).push({ viewport: vpName, season: done + 1, choice: 'aceitou' });
          } else if (title === 'Janela do meio do campeonato') (report.midSeason ??= []).push({ viewport: vpName, season: done + 1, choice: label });
          await buttons.nth(k).click({ timeout: 3000 }).catch(() => {});
        } else {
          // tempo correndo: após cada jogo o jogo volta para a velocidade 1, então acelera de novo
          const fast = page.getByRole('button', { name: 'Velocidade 3' });
          if (await fast.isEnabled().catch(() => false) && (await fast.getAttribute('aria-pressed')) !== 'true') await fast.click({ timeout: 2000 }).catch(() => {});
          if (++ticks % 4 === 0) await quickCheck(`${tag}-correndo`);
          // relógio parado sem nenhuma janela aberta = jogo travado
          const date = await page.locator('.hud-date b').innerText().catch(() => '');
          sameDate = date && date === lastDate ? sameDate + 1 : 0; lastDate = date;
          if (sameDate > 20) throw new Error(`o calendário parou em ${date} sem nenhuma janela aberta`);
        }
      }
    });
  }

  // ------------------------------------------------ exploração aleatória
  if (EXPLORE > 0) {
    let lastFingerprint = '', stuck = 0;
    for (let n = 1; n <= EXPLORE; n++) {
      const items = await page.evaluate(clickables).catch(() => []);
      if (!items.length) { await page.keyboard.press('Escape'); continue; }
      const it = pick(items);
      const label = `${it.tag}${it.type ? `[${it.type}]` : ''} "${it.text}"`;
      report.exploreLog.push({ viewport: vpName, n, action: label });
      await step(`explorar-${n}`, async () => {
        const loc = page.locator(`[data-qa-pick="${it.i}"]`);
        // o relógio do jogo continua andando: se uma janela abriu por cima (ex.: dia de jogo) entre o sorteio
        // e o clique, o alvo não existe mais na camada de cima — isso não é bug, só pula a ação
        const stillOnTop = () => page.evaluate(({ i, text }) => {
          const el = document.querySelector(`[data-qa-pick="${i}"]`);
          const dialogs = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')];
          const scope = dialogs.at(-1) ?? document.body;
          return !!el && scope.contains(el) && (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40) === text;
        }, it).catch(() => false);
        const skip = () => { report.exploreLog.at(-1).skipped = 'a tela mudou antes do clique'; };
        if (!(await stillOnTop())) return skip();
        // sorteia antes de agir, para a sequência aleatória não depender de o clique dar certo
        const text = pick(['', 'A', 'Nome Bem Comprido Para Testar Layout', '123', '<b>x</b>', 'ÇÃÕ ñ 🎉']);
        try {
          if (it.tag === 'select') {
            const values = await loc.evaluate((s) => [...s.options].filter((o) => !o.disabled).map((o) => o.value));
            await loc.selectOption(values[Math.floor(rand() * values.length)], { timeout: 3000 });
          } else if (it.tag === 'input' && /^(text|search|number|)$/.test(it.type)) await loc.fill(text, { timeout: 3000 });
          else await loc.click({ timeout: 3000 });
        } catch (e) {
          if (!(await stillOnTop())) return skip(); // corrida com o relógio do jogo, não é bug
          throw e; // o alvo continua lá e mesmo assim não deu para clicar: isso sim é problema
        }
      });
      await page.waitForTimeout(120 + Math.floor(rand() * 400));
      screen = `explorar-${n}`;
      // checa a tela a cada ação, mas só salva screenshot quando aparece problema novo
      const before = report.issues.length;
      for (const i of await page.evaluate(pageChecks, !!vp.isMobile).catch(() => [])) add(i);
      if (report.issues.length > before) {
        const file = `${vpName}-${String(++shotN).padStart(3, '0')}-explorar-${n}.png`;
        await page.screenshot({ path: join(SHOTS, file) }).catch(() => {});
        for (const i of report.issues.slice(before)) { i.screenshot = `screenshots/${file}`; i.after = label; }
      }
      // se a tela não muda há muitas ações, fecha janelas para não ficar preso
      const fp = await page.evaluate(() => document.body.innerText.length + '|' + document.querySelectorAll('[role=dialog], [role=alertdialog]').length).catch(() => '');
      stuck = fp === lastFingerprint ? stuck + 1 : 0; lastFingerprint = fp;
      if (stuck > 15) { await page.keyboard.press('Escape'); await page.locator('[aria-label=Fechar]').last().click({ timeout: 1000 }).catch(() => {}); stuck = 0; }
    }
    await check('explorar-final');
  }
  // conquistas salvas ao fim desta tela (para conferir os ganchos de partida/temporada na interface real)
  const finalAch = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mestres-do-esporte.conquistas') || '{}').unlocked || {})).catch(() => []);
  (report.achievementsFinal ??= {})[vpName] = finalAch;
  await ctx.close();
}

// ---------------------------------------------------------------- revisão visual com LLM local (opcional)
/* Mostra cada screenshot do roteiro ao modelo de visão do Ollama e pergunta só o que código não pega:
   alinhamento, consistência, hierarquia, legibilidade. Uma pergunta curta por imagem — tarefa que um
   modelo pequeno consegue fazer bem, ao contrário de "jogar e julgar tudo" num loop de agente. */
async function visualReview(report) {
  const prompt = `Você revisa a interface de um jogo web de gerenciamento de futebol (estilo pixel art, intencional).
Olhe este screenshot e aponte SÓ problemas visuais concretos que um jogador notaria:
caixas desalinhadas ou com larguras inconsistentes, elementos duplicados, espaçamento quebrado,
texto ilegível (contraste baixo), conteúdo sobreposto, área vazia estranha.
Não comente estilo, cores da marca nem sugira funcionalidades. Se não houver problema, responda só: OK
Responda em português, no máximo 3 itens, um por linha, começando com "- ".`;
  const shots = report.screens.filter((s) => !s.screen.startsWith('explorar'));
  console.log(`\nRevisão visual com ${REVIEW} (${shots.length} telas)...`);
  for (const s of shots) {
    try {
      const image = readFileSync(join(OUT, s.screenshot)).toString('base64');
      const r = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({ model: REVIEW, stream: false, think: false, options: { temperature: 0.1 }, messages: [{ role: 'user', content: prompt, images: [image] }] }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!r.ok) throw new Error(`Ollama respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const answer = ((await r.json()).message?.content ?? '').trim();
      s.review = answer;
      process.stdout.write(answer === 'OK' || /^ok\.?$/i.test(answer) ? '.' : '!');
      for (const line of answer.split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter((l) => l && !/^ok\.?$/i.test(l))) {
        report.issues.push({ viewport: s.viewport, screen: s.screen, kind: 'revisão-visual (LLM experimental, confirmar)', severity: 'baixa', detail: line.slice(0, 300), screenshot: s.screenshot });
      }
    } catch (e) {
      console.warn(`\nRevisão falhou em ${s.screenshot}: ${e.message}`);
      if (/ECONNREFUSED|fetch failed/.test(e.message)) { console.warn('Ollama fora do ar; revisão interrompida.'); break; }
    }
  }
  console.log('');
}

// ---------------------------------------------------------------- relatório
function writeReport(report) {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const sevOrder = { alta: 0, media: 1, baixa: 2 };
  const issues = [...report.issues].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  const count = (s) => issues.filter((i) => i.severity === s).length;
  const lines = [
    `# Playtest — ${new Date().toLocaleString('pt-BR')}`,
    '',
    `Seed **${report.seed}** · exploração: ${report.explore} ações por tela · telas: ${report.viewports.join(', ')}`,
    `Para repetir exatamente: \`npm run qa -- --seed ${report.seed}${report.explore ? ` --explore ${report.explore}` : ''}${report.seasonsTarget ? ` --seasons ${report.seasonsTarget}` : ''}${report.scenario !== 'normal' ? ` --scenario ${report.scenario}` : ''}\``,
    '',
    `**${issues.length} problemas** — ${count('alta')} alta · ${count('media')} média · ${count('baixa')} baixa`,
    '',
  ];
  if (report.seasons.length) {
    lines.push(`## Temporadas jogadas — cenário "${report.scenario}" (${SCENARIOS[report.scenario].desc})`, '');
    lines.push('| tela | temp. | plano | clube (div.) | resultado | objetivo | decisão | depois |', '|---|---|---|---|---|---|---|---|');
    for (const s of report.seasons) {
      const r = s.result;
      const after = s.after ? (s.after.unemployed ? 'sem clube' : `${s.after.club} (Div. ${s.after.div + 1})`) : '—';
      lines.push(`| ${s.viewport} | ${s.season} | ${s.plan?.label ?? ''} | ${s.before?.club ?? '?'} (Div. ${(s.before?.div ?? -1) + 1}) | ${r ? `${r.position}º` : 'não terminou'} | ${r ? `${r.objective}: ${r.achieved ? '✅' : '❌'}` : ''} | ${s.action ?? ''} | ${after} |`);
    }
    lines.push('');
  }
  const byKind = {};
  for (const i of issues) (byKind[i.kind] ??= []).push(i);
  for (const [kind, list] of Object.entries(byKind)) {
    lines.push(`## ${kind} (${list.length})`, '');
    for (const i of list.slice(0, 40)) {
      lines.push(`- **[${i.severity}]** ${i.viewport} · ${i.screen}${i.el ? ` · \`${i.el}\`` : ''} — ${i.detail}${i.after ? ` _(após clicar ${i.after})_` : ''}${i.screenshot ? ` → [screenshot](${i.screenshot})` : ''}`);
    }
    if (list.length > 40) lines.push(`- … e mais ${list.length - 40} (ver report.json)`);
    lines.push('');
  }
  if (!issues.length) lines.push('Nenhum problema detectado. 🎉', '');
  lines.push('## Telas capturadas', '', ...report.screens.map((s) => `- ${s.viewport} · ${s.screen} → [${s.screenshot}](${s.screenshot})`));
  writeFileSync(join(OUT, 'report.md'), lines.join('\n'));
  return { total: issues.length, alta: count('alta'), media: count('media'), baixa: count('baixa') };
}

// ---------------------------------------------------------------- main
const server = await ensureServer();
// no Windows a pasta pode estar aberta no Explorer/editor: apaga só os screenshots, com novas tentativas
try { rmSync(SHOTS, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { console.warn(`Aviso: não consegui limpar ${SHOTS} (${e.code}); screenshots antigos podem permanecer.`); }
mkdirSync(SHOTS, { recursive: true });
const vps = ONLY ? [ONLY] : Object.keys(VIEWPORTS);
const report = { seed: SEED, explore: EXPLORE, seasonsTarget: SEASONS, scenario: SCENARIO, url: BASE, viewports: vps, choices: {}, issues: [], screens: [], seasons: [], exploreLog: [] };
const browser = await chromium.launch({ headless: !HEADED });
try {
  for (const v of vps) {
    console.log(`▶ ${v}...`);
    await runViewport(browser, v, report);
  }
} finally {
  await browser.close();
  server?.kill();
}
if (REVIEW) await visualReview(report);
const t = writeReport(report);
console.log(`\n${t.total} problemas (${t.alta} alta · ${t.media} média · ${t.baixa} baixa) — seed ${SEED}`);
console.log(`Relatório: ${join(OUT, 'report.md')}`);
