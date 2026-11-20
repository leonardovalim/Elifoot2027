import { describe, expect, it } from 'vitest';
import {
  acceptOffer, activeIndex, advanceDay, anyUnemployed, challengeOptions, closeSeasonAll, completeRound, decide, isMatchDay,
  managerClubs, managerNeedingAttention, managerState, myClubId, newWorld, nextQueuedMatch, pendingDecision, prepareRound,
  resolveMidSeason, startMultiCareer, switchManager, visibleNews, type Career,
} from '../src/game/career';
import { Rng } from '../src/core/rng';
import { runToEnd, toOutcome } from '../src/sports/football/engine';

function twoPlayers(seed: number, sameDivision = false) {
  const w = newWorld(seed);
  const a = challengeOptions(w, 'baixo', 12);
  const b = sameDivision ? a : challengeOptions(w, 'crescimento', 12);
  const first = a[0]!.clubId;
  const second = b.find((o) => o.clubId !== first)!.clubId;
  return startMultiCareer(seed, [
    { name: 'Ana', type: 'baixo', clubId: first },
    { name: 'Bia', type: sameDivision ? 'baixo' : 'crescimento', clubId: second },
  ]);
}

/** Resolve o que cada técnico tiver pendente (como a tela faria, passando a vez). */
function settle(c: Career) {
  for (let guard = 0; guard < 50; guard++) {
    const i = managerNeedingAttention(c);
    if (i < 0) return;
    switchManager(c, i);
    if (c.unemployed) { acceptOffer(c, c.offers[0]!); continue; }
    if (c.midSeason?.open) { resolveMidSeason(c, null); continue; }
    const d = pendingDecision(c)!;
    decide(c, d.id, d.kind === 'bid' ? 'refuse' : 'accept');
  }
}

function playSeason(c: Career) {
  let g = 0;
  while (c.phase !== 'encerramento' && g++ < 3000) {
    settle(c);
    if (isMatchDay(c)) {
      let prep = prepareRound(c);
      for (;;) {
        runToEnd(prep.match, new Rng(prep.matchRngState));
        const o = toOutcome(prep.match);
        const next = nextQueuedMatch(prep, o);
        if (!next) { completeRound(c, prep, o); break; }
        prep = next;
      }
    } else advanceDay(c);
  }
}

describe('multijogador local', () => {
  it('cada técnico tem o seu clube, nome e caixa; passar a vez troca tudo', () => {
    const c = twoPlayers(31);
    const [a, b] = managerClubs(c);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
    expect(c.entrepreneur.name).toBe('Ana');
    expect(myClubId(c)).toBe(a);
    switchManager(c, 1);
    expect(activeIndex(c)).toBe(1);
    expect(c.entrepreneur.name).toBe('Bia');
    expect(myClubId(c)).toBe(b);
    c.entrepreneur.cash = 12345;
    switchManager(c, 0);
    expect(c.entrepreneur.name).toBe('Ana');
    expect(managerState(c, 1).entrepreneur.cash).toBe(12345);
    // ninguém assume o clube do outro
    expect(acceptOffer(c, { clubId: b!, objective: 'meio', monthlySalary: 1000 })).toMatch(/já tem técnico/);
    expect(myClubId(c)).toBe(a);
  });

  it('uma temporada inteira: as duas partidas por rodada, caixas e notícias separados', () => {
    const c = twoPlayers(32);
    const [a, b] = managerClubs(c);
    playSeason(c);
    expect(c.phase).toBe('encerramento');
    // cada um jogou as 22 rodadas
    for (const id of [a!, b!]) {
      const d = c.season.divisions.findIndex((x) => x.teamIds.includes(id));
      const games = c.season.divisions[d]!.results.flat().filter((r) => r.home === id || r.away === id).length;
      expect(games).toBe(22);
    }
    // bilheteria de cada um no próprio balanço
    expect(managerState(c, 0).ledger.gate).toBeGreaterThan(0);
    expect(managerState(c, 1).ledger.gate).toBeGreaterThan(0);
    // notícias com dono: cada um vê as suas e as de todos, não as do outro
    const owners = new Set(c.news.map((n) => n.owner));
    expect(owners.has(0)).toBe(true);
    expect(owners.has(1)).toBe(true);
    switchManager(c, 0);
    expect(visibleNews(c).some((n) => n.owner === 1)).toBe(false);
    // a IA não negocia atletas dos clubes humanos
    for (const t of c.transfers ?? []) {
      expect([a, b]).not.toContain(t.from);
      expect([a, b]).not.toContain(t.to);
    }
    const sums = closeSeasonAll(c);
    expect(sums).toHaveLength(2);
    expect(managerState(c, 0).entrepreneur.history).toHaveLength(1);
    expect(managerState(c, 1).entrepreneur.history).toHaveLength(1);
    // proposta nunca é do clube do outro técnico
    for (let i = 0; i < 2; i++) for (const o of managerState(c, i).offers) expect(managerClubs(c)).not.toContain(o.clubId);
    expect(anyUnemployed(c)).toBe(sums.some((x) => x.fired));
  });

  it('confronto entre os dois: uma partida só, comandada pelo mandante', () => {
    const c = twoPlayers(33, true);
    const [a, b] = managerClubs(c);
    let met = false;
    for (let g = 0; g < 2000 && c.phase !== 'encerramento' && !met; g++) {
      settle(c);
      if (!isMatchDay(c)) { advanceDay(c); continue; }
      const prep = prepareRound(c);
      const all = [prep, ...(prep.queue ?? [])].map((x) => x.match);
      const derby = all.find((m) => [m.home.clubId, m.away.clubId].includes(a!) && [m.home.clubId, m.away.clubId].includes(b!));
      if (derby) {
        met = true;
        expect(all).toHaveLength(1);
        expect(prep.manager).toBe(managerClubs(c).indexOf(derby.home.clubId));
      }
      // termina a rodada normalmente
      let p = prep;
      for (;;) {
        runToEnd(p.match, new Rng(p.matchRngState));
        const o = toOutcome(p.match);
        const next = nextQueuedMatch(p, o);
        if (!next) { completeRound(c, p, o); break; }
        p = next;
      }
    }
    expect(met).toBe(true);
  });

  it('um jogador só continua igual (sem técnicos extras)', () => {
    const c = startMultiCareer(34, [{ name: 'Solo', type: 'baixo', clubId: challengeOptions(newWorld(34), 'baixo')[0]!.clubId }]);
    expect(c.managers).toHaveLength(1);
    playSeason(c);
    expect(c.news.every((n) => n.owner === undefined)).toBe(true);
  });
});
