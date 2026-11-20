import { describe, expect, it } from 'vitest';
import {
  advanceDay, challengeOptions, closeSeason, decide, generateOffers, isMatchDay, myClubId, newWorld, pendingDecision,
  simulateRound, startCareer, type Career,
} from '../src/game/career';
import { CONTINENTAL_ROUNDS, cupKind } from '../src/game/cup';
import { ANDRE_ELIAS_ID, playerValue } from '../src/sports/football/generate';
import { overall } from '../src/sports/football/lineup';
import { FOREIGN_SHARE, isForeigner, nationalityOf } from '../src/sports/football/nations';

function start(seed: number, type: 'baixo' | 'crescimento' | 'pressao' = 'pressao') {
  const w = newWorld(seed);
  return startCareer(seed, 'Teste', type, challengeOptions(w, type)[0]!.clubId);
}

function playSeason(c: Career) {
  let g = 0;
  while (c.phase !== 'encerramento' && g++ < 2000) {
    let d = pendingDecision(c);
    while (d) { decide(c, d.id, d.kind === 'bid' ? 'refuse' : 'accept'); d = pendingDecision(c); }
    if (isMatchDay(c)) simulateRound(c); else advanceDay(c);
  }
}

describe('nacionalidades', () => {
  it('a liga é brasileira com uns 8% de estrangeiros; os estrangeiros têm nome do país', () => {
    const c = newWorld(12);
    const domestic = c.season.divisions.flatMap((d) => d.teamIds).flatMap((id) => c.clubs[id]!.players);
    const share = domestic.filter(isForeigner).length / domestic.length;
    expect(share).toBeGreaterThan(FOREIGN_SHARE * 0.5);
    expect(share).toBeLessThan(FOREIGN_SHARE * 1.6);
    const foreignClubs = Object.values(c.clubs).filter((x) => x.country);
    expect(foreignClubs).toHaveLength(12);
    for (const f of foreignClubs) for (const p of f.players) expect(nationalityOf(p)).toBe(f.country);
    // André Elias segue o melhor e mais caro do mundo, estrangeiros inclusive
    const all = Object.values(c.clubs).flatMap((x) => x.players);
    const andre = all.find((p) => p.id === ANDRE_ELIAS_ID)!;
    expect(nationalityOf(andre)).toBe('BRA');
    for (const p of all) if (p !== andre) {
      expect(overall(p)).toBeLessThan(overall(andre));
      expect(playerValue(p)).toBeLessThan(playerValue(andre));
    }
  });
});

describe('taça continental', () => {
  it('16 clubes: os 4 de maior reputação da elite e 12 estrangeiros', () => {
    const c = newWorld(13);
    const t = c.continental!;
    expect(cupKind(t)).toBe('continental');
    const ids = t.ties[0]!.flatMap((x) => [x.home, x.away]);
    expect(ids).toHaveLength(16);
    expect(ids.filter((id) => c.clubs[id]!.country)).toHaveLength(12);
    const brs = ids.filter((id) => !c.clubs[id]!.country);
    expect(brs.every((id) => c.season.divisions[0]!.teamIds.includes(id))).toBe(true);
    // datas não batem com as da copa
    for (const d of t.dates) expect(c.cup!.dates).not.toContain(d);
  });

  it('a temporada fecha com campeão; os 4 primeiros vão para a próxima; estrangeiro não oferece emprego', () => {
    const c = start(17);
    const me = myClubId(c);
    const year = c.season.year;
    playSeason(c);
    const t = c.continental!;
    expect(t.round).toBe(CONTINENTAL_ROUNDS.length);
    expect(t.championId).toBeDefined();
    expect(c.clubs[t.championId!]!.titles.some((x) => x.competition === 'Taça Continental' && x.year === year)).toBe(true);
    const ages = Object.values(c.clubs).filter((x) => x.country).map((x) => x.players[0]!.age);
    closeSeason(c);
    expect(c.continental!.year).toBe(year + 1);
    const brs = c.continental!.ties[0]!.flatMap((x) => [x.home, x.away]).filter((id) => !c.clubs[id]!.country);
    expect(brs).toHaveLength(4);
    expect(c.news.some((n) => n.text.startsWith(`Classificados para a Taça Continental ${year + 1}`))).toBe(true);
    // estrangeiros envelhecem (o primeiro pode ter se aposentado: confere que alguém fez aniversário)
    expect(Object.values(c.clubs).filter((x) => x.country).some((x, i) => x.players[0]!.age !== ages[i])).toBe(true);
    for (const o of generateOffers(c, 40)) expect(c.clubs[o.clubId]!.country).toBeUndefined();
    void me;
  });

  it('save antigo sem estrangeiros ganha a competição na virada', () => {
    const c = start(19, 'baixo');
    for (const id of Object.keys(c.clubs)) if (c.clubs[id]!.country) delete c.clubs[id];
    delete c.continental;
    playSeason(c);
    closeSeason(c);
    expect(Object.values(c.clubs).filter((x) => x.country)).toHaveLength(12);
    expect(c.continental!.ties[0]).toHaveLength(8);
  });
});
