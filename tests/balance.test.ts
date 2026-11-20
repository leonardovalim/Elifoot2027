/**
 * Testes de balanceamento: rodam milhares de partidas e verificam se o motor
 * produz um futebol crível e sem tática dominante (o "5-0-5" do Elifoot 98).
 * Rode `npm run balance` após mexer em TUNING.
 */
import { Rng } from '../src/core/rng';
import { simulateFootballMatch } from '../src/sports/football/engine';
import { generateClub } from '../src/sports/football/generate';
import { FORMATIONS } from '../src/sports/football/lineup';
import type { Club, Formation, Style } from '../src/sports/football/types';

const N = 2000;

function stats(make: (rng: Rng, i: number) => [Club, Club], seed = 1) {
  const rng = new Rng(seed);
  let goals = 0, home = 0, draw = 0, away = 0, cards = 0, reds = 0, poss = 0;
  for (let i = 0; i < N; i++) {
    const [h, a] = make(rng, i);
    const o = simulateFootballMatch(h, a, rng);
    goals += o.homeScore + o.awayScore;
    poss += o.possession;
    if (o.homeScore > o.awayScore) home++; else if (o.homeScore === o.awayScore) draw++; else away++;
    cards += o.events.filter((e) => e.type === 'yellow').length;
    reds += o.events.filter((e) => e.type === 'red').length;
  }
  return { goals: goals / N, home: home / N, draw: draw / N, away: away / N, yellows: cards / N, reds: reds / N, poss: poss / N };
}



describe('balanceamento do motor de futebol', () => {
  const lvl = 65;
  const equal = stats((rng) => [generateClub(rng, 'A', lvl, ['#000', '#fff']), generateClub(rng, 'B', lvl, ['#000', '#fff'])]);

  it('média de gols realista (2,3–3,0 por jogo)', () => {
    console.log('times iguais', equal);
    expect(equal.goals).toBeGreaterThan(2.3);
    expect(equal.goals).toBeLessThan(3.0);
  });

  it('vantagem de mando moderada (mandante 40–50%, empate 22–32%)', () => {
    expect(equal.home).toBeGreaterThan(0.4);
    expect(equal.home).toBeLessThan(0.5);
    expect(equal.draw).toBeGreaterThan(0.22);
    expect(equal.draw).toBeLessThan(0.32);
  });

  it('disciplina realista (2–5 amarelos, < 0,25 vermelhos por jogo)', () => {
    expect(equal.yellows).toBeGreaterThan(2);
    expect(equal.yellows).toBeLessThan(5);
    expect(equal.reds).toBeLessThan(0.25);
  });

  it('time melhor vence mais, mas zebra existe', () => {
    const s = stats((rng) => [generateClub(rng, 'A', 75, ['#000', '#fff']), generateClub(rng, 'B', 60, ['#000', '#fff'])]);
    console.log('forte x fraco', s);
    expect(s.home).toBeGreaterThan(0.6);
    expect(s.away).toBeGreaterThan(0.04); // zebra
  });

  it('nenhuma formação domina: todas ficam a ±0,35 pt/jogo do 4-4-2', () => {
    const exact: Record<string, number> = {};
    for (const f of Object.keys(FORMATIONS) as Formation[]) {
      const rng = new Rng(99);
      let p = 0;
      for (let i = 0; i < N; i++) {
        const x = generateClub(rng, 'X', lvl, ['#000', '#fff']);
        const y = generateClub(rng, 'Y', lvl, ['#000', '#fff']);
        x.formation = f;
        const xHome = i % 2 === 0;
        const o = xHome ? simulateFootballMatch(x, y, rng) : simulateFootballMatch(y, x, rng);
        const gx = xHome ? o.homeScore : o.awayScore, gy = xHome ? o.awayScore : o.homeScore;
        p += gx > gy ? 3 : gx === gy ? 1 : 0;
      }
      exact[f] = p / N;
    }
    console.log('pontos por jogo por formação (vs 4-4-2)', exact);
    const base = exact['4-4-2']!;
    for (const v of Object.values(exact)) expect(Math.abs(v - base)).toBeLessThan(0.35);
  });

  it('estilos são trocas: nenhum estilo domina e o ofensivo gera mais gols', () => {
    const out: Record<string, { pts: number; goals: number }> = {};
    for (const st of ['defensive', 'balanced', 'attacking'] as Style[]) {
      const rng = new Rng(55);
      let p = 0, g = 0;
      for (let i = 0; i < N; i++) {
        const x = generateClub(rng, 'X', lvl, ['#000', '#fff']);
        const y = generateClub(rng, 'Y', lvl, ['#000', '#fff']);
        x.style = st;
        const xHome = i % 2 === 0;
        const o = xHome ? simulateFootballMatch(x, y, rng) : simulateFootballMatch(y, x, rng);
        const gx = xHome ? o.homeScore : o.awayScore, gy = xHome ? o.awayScore : o.homeScore;
        p += gx > gy ? 3 : gx === gy ? 1 : 0;
        g += gx + gy;
      }
      out[st] = { pts: p / N, goals: g / N };
    }
    console.log('estilos', out);
    for (const v of Object.values(out)) expect(Math.abs(v.pts - out.balanced!.pts)).toBeLessThan(0.3);
    expect(out.attacking!.goals).toBeGreaterThan(out.defensive!.goals + 0.4);
  });
});

describe('sabor Elifoot 98', () => {
  it('mando de campo forte (mandante 43–49%) e zebras frequentes (fraco vence fora ≥ 12%)', () => {
    const rng = new Rng(31);
    let home = 0, upset = 0;
    for (let i = 0; i < N; i++) {
      const a = generateClub(rng, 'A', 65, ['#000', '#fff']), b = generateClub(rng, 'B', 65, ['#000', '#fff']);
      const o = simulateFootballMatch(a, b, rng);
      if (o.homeScore > o.awayScore) home++;
      const s = generateClub(rng, 'S', 75, ['#000', '#fff']), w = generateClub(rng, 'W', 60, ['#000', '#fff']);
      const z = simulateFootballMatch(s, w, rng);
      if (z.awayScore > z.homeScore) upset++;
    }
    console.log('mandante', home / N, 'zebra', upset / N);
    expect(home / N).toBeGreaterThan(0.43);
    expect(home / N).toBeLessThan(0.49);
    expect(upset / N).toBeGreaterThanOrEqual(0.12);
  });

  it('os 5 desfechos aparecem: gol, defesa, poste, barra e fora', () => {
    const rng = new Rng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const o = simulateFootballMatch(generateClub(rng, 'A', 65, ['#000', '#fff']), generateClub(rng, 'B', 65, ['#000', '#fff']), rng);
      o.events.forEach((e) => seen.add(e.type));
    }
    for (const t of ['goal', 'save', 'post', 'bar', 'miss']) expect(seen.has(t)).toBe(true);
  });
});

describe('raçudo × fair play', () => {
  /** A com toda a linha raçuda (85), B fair play (15), mesmo nível; alterna o mando. */
  function duel(seed = 3) {
    const rng = new Rng(seed);
    const r = { yA: 0, yB: 0, redA: 0, redB: 0, gaA: 0, gaB: 0, ptsA: 0, ptsB: 0, foulsA: 0, foulsB: 0 };
    for (let i = 0; i < N; i++) {
      const a = generateClub(rng, 'A', 65, ['#000', '#fff']);
      const b = generateClub(rng, 'B', 65, ['#000', '#fff']);
      a.players.forEach((p) => { p.aggression = 85; });
      b.players.forEach((p) => { p.aggression = 15; });
      const aHome = i % 2 === 0;
      const o = aHome ? simulateFootballMatch(a, b, rng) : simulateFootballMatch(b, a, rng);
      const sideA = aHome ? 'home' : 'away';
      const [ga, gb] = aHome ? [o.homeScore, o.awayScore] : [o.awayScore, o.homeScore];
      r.gaA += gb; r.gaB += ga;
      r.ptsA += ga > gb ? 3 : ga === gb ? 1 : 0;
      r.ptsB += gb > ga ? 3 : ga === gb ? 1 : 0;
      for (const e of o.events) {
        if (!('side' in e)) continue;
        const mine = e.side === sideA;
        if (e.type === 'yellow') mine ? r.yA++ : r.yB++;
        if (e.type === 'red') mine ? r.redA++ : r.redB++;
      }
      r.foulsA += (aHome ? o.stats.home : o.stats.away).fouls;
      r.foulsB += (aHome ? o.stats.away : o.stats.home).fouls;
    }
    const per = (x: number) => x / N;
    return { yA: per(r.yA), yB: per(r.yB), redA: per(r.redA), redB: per(r.redB), gaA: per(r.gaA), gaB: per(r.gaB), ptsA: per(r.ptsA), ptsB: per(r.ptsB), foulsA: per(r.foulsA), foulsB: per(r.foulsB) };
  }

  it('raçudo faz mais faltas e leva mais cartões, mas o desarme compensa; nenhum perfil domina', () => {
    const d = duel();
    console.log('raçudo x fair play', d);
    expect(d.yA).toBeGreaterThan(d.yB * 1.6); // cartões: raçudo ~1,35× a média, fair play ~0,65×
    expect(d.foulsA).toBeGreaterThan(d.foulsB * 1.6);
    expect(d.redA).toBeGreaterThan(d.redB * 2); // e é expulso bem mais
    // o desarme a mais compensa jogar mais vezes com 10: não sofre mais gols que o fair play
    expect(d.gaA).toBeLessThan(d.gaB * 1.03);
    expect(Math.abs(d.ptsA - d.ptsB)).toBeLessThan(0.3); // é troca, não tática dominante
  });
});
