import type { PointsRule } from './sport';

export interface Fixture {
  home: string;
  away: string;
}

export interface Result extends Fixture {
  homeScore: number;
  awayScore: number;
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
}

/**
 * Turno e returno pelo método do círculo. Cada time joga uma vez por rodada
 * e alterna mando entre turno e returno.
 */
export function doubleRoundRobin(teamIds: readonly string[]): Fixture[][] {
  if (teamIds.length < 2) return [];
  const ids = [...teamIds];
  if (ids.length % 2 === 1) ids.push('__bye__');
  const n = ids.length;
  const firstLeg: Fixture[][] = [];
  const rotating = ids.slice(1);

  for (let round = 0; round < n - 1; round++) {
    const current = [ids[0]!, ...rotating];
    const fixtures: Fixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = current[i]!;
      const b = current[n - 1 - i]!;
      if (a === '__bye__' || b === '__bye__') continue;
      // alterna mando para equilibrar casa/fora
      fixtures.push((round + i) % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    firstLeg.push(fixtures);
    rotating.unshift(rotating.pop()!);
  }

  const secondLeg = firstLeg.map((r) => r.map((f) => ({ home: f.away, away: f.home })));
  return [...firstLeg, ...secondLeg];
}

export function computeStandings(
  teamIds: readonly string[],
  results: readonly Result[],
  points: PointsRule,
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teamIds.map((id) => [
      id,
      { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, scoreFor: 0, scoreAgainst: 0, points: 0 },
    ]),
  );

  for (const r of results) {
    const h = rows.get(r.home);
    const a = rows.get(r.away);
    if (!h || !a) continue;
    h.played++;
    a.played++;
    h.scoreFor += r.homeScore;
    h.scoreAgainst += r.awayScore;
    a.scoreFor += r.awayScore;
    a.scoreAgainst += r.homeScore;
    if (r.homeScore > r.awayScore) {
      h.won++; a.lost++;
      h.points += points.win; a.points += points.loss;
    } else if (r.homeScore < r.awayScore) {
      a.won++; h.lost++;
      a.points += points.win; h.points += points.loss;
    } else {
      h.drawn++; a.drawn++;
      h.points += points.draw; a.points += points.draw;
    }
  }

  return [...rows.values()].sort(
    (x, y) =>
      y.points - x.points ||
      y.won - x.won ||
      y.scoreFor - y.scoreAgainst - (x.scoreFor - x.scoreAgainst) ||
      y.scoreFor - x.scoreFor ||
      x.teamId.localeCompare(y.teamId),
  );
}
