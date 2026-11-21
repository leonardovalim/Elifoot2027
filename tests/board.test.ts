import { boardObjective, challengeOptions, goalDone, myClubId, newWorld, nextPressure, sideGoals, startCareer, type SeasonSummary } from '../src/game/career';

const sum = (o: Partial<SeasonSummary>): SeasonSummary => ({
  position: 5, division: 2, objective: 'meio', achieved: true, fired: false, promoted: false, relegated: false,
  prize: 0, reputationDelta: 0, broke: false, pressure: 0, goals: [], ...o,
});

function career() {
  const w = newWorld(21, 'T');
  return startCareer(21, 'T', 'crescimento', challengeOptions(w, 'crescimento')[0]!.clubId);
}

describe('cobrança da diretoria', () => {
  it('sobe ao cumprir, vai ao máximo com título, cai ao falhar e zera ao mudar de divisão', () => {
    expect(nextPressure(0, sum({ achieved: true }))).toBe(1);
    expect(nextPressure(1, sum({ achieved: true }))).toBe(2);
    expect(nextPressure(2, sum({ achieved: true }))).toBe(2);
    expect(nextPressure(0, sum({ position: 1 }))).toBe(2);
    expect(nextPressure(1, sum({ achieved: false }))).toBe(0);
    expect(nextPressure(-1, sum({ achieved: false }))).toBe(-1);
    expect(nextPressure(2, sum({ promoted: true }))).toBe(0);
  });

  it('cobrança alta sobe a meta da temporada', () => {
    const c = career();
    const id = myClubId(c);
    const ladder = ['permanencia', 'meio', 'acesso', 'titulo'];
    const base = ladder.indexOf(boardObjective(c, id, 0));
    const high = ladder.indexOf(boardObjective(c, id, 2));
    expect(high).toBe(Math.min(3, base + 2));
  });
});

describe('metas secundárias', () => {
  it('são determinísticas por clube e ano e não se repetem', () => {
    const c = career();
    const a = sideGoals(c, myClubId(c), 2), b = sideGoals(c, myClubId(c), 2);
    expect(a).toEqual(b);
    expect(new Set(a.map((g) => g.kind)).size).toBe(2);
  });

  it('meta de caixa é cumprida quando o caixa chega ao alvo', () => {
    const c = career();
    const club = c.clubs[myClubId(c)]!;
    const g = { kind: 'caixa', label: '', target: club.budget + 1000, dir: 'max' as const };
    expect(goalDone(c, g)).toBe(false);
    club.budget += 1000;
    expect(goalDone(c, g)).toBe(true);
  });

  it('a carreira começa com 1 meta secundária e cobrança normal', () => {
    const c = career();
    const bond = c.entrepreneur.bonds[0]!;
    expect(bond.pressure).toBe(0);
    expect(bond.goals).toHaveLength(1);
  });
});
