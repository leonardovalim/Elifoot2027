import { computeStandings, doubleRoundRobin } from '../src/core/league';
import { createSeason, promoteAndRelegate } from '../src/core/season';
import { Rng } from '../src/core/rng';

describe('doubleRoundRobin', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `t${i}`);
  const rounds = doubleRoundRobin(ids);

  it('gera 2(n-1) rodadas com n/2 jogos', () => {
    expect(rounds).toHaveLength(22);
    for (const r of rounds) expect(r).toHaveLength(6);
  });

  it('cada time joga uma vez por rodada', () => {
    for (const r of rounds) {
      const seen = r.flatMap((f) => [f.home, f.away]);
      expect(new Set(seen).size).toBe(12);
    }
  });

  it('cada par se enfrenta uma vez em casa e uma fora', () => {
    const pairs = new Set(rounds.flat().map((f) => `${f.home}>${f.away}`));
    expect(pairs.size).toBe(12 * 11);
  });

  it('lida com número ímpar de times', () => {
    const r = doubleRoundRobin(['a', 'b', 'c']);
    expect(r.flat()).toHaveLength(6);
  });
});

describe('computeStandings', () => {
  it('soma pontos e ordena por pontos e saldo', () => {
    const t = computeStandings(['a', 'b', 'c'], [
      { home: 'a', away: 'b', homeScore: 2, awayScore: 0 },
      { home: 'b', away: 'c', homeScore: 1, awayScore: 1 },
      { home: 'c', away: 'a', homeScore: 3, awayScore: 0 },
    ], { win: 3, draw: 1, loss: 0 });
    expect(t.map((r) => r.teamId)).toEqual(['c', 'a', 'b']);
    expect(t[0]!.points).toBe(4);
  });
});

describe('promoteAndRelegate', () => {
  it('troca 2 de cima com 2 de baixo entre divisões', () => {
    const s = createSeason(2027, [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']]);
    // a > b > c > d na div 1; e > f > g > h na div 2
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    s.divisions.forEach((d) => {
      d.results = d.rounds.map((r) =>
        r.map((f) => {
          const hw = order.indexOf(f.home) < order.indexOf(f.away);
          return { ...f, homeScore: hw ? 1 : 0, awayScore: hw ? 0 : 1 };
        }),
      );
    });
    const next = promoteAndRelegate(s, { win: 3, draw: 1, loss: 0 });
    expect(next[0]!.sort()).toEqual(['a', 'b', 'e', 'f']);
    expect(next[1]!.sort()).toEqual(['c', 'd', 'g', 'h']);
  });
});

describe('Rng', () => {
  it('é determinístico pela seed', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('retoma a sequência a partir do snapshot', () => {
    const a = new Rng(7);
    a.next(); a.next();
    const b = new Rng(a.snapshot);
    expect(b.next()).toBe(a.next());
  });
});
