import { computeStandings, doubleRoundRobin, type Fixture, type Result } from './league';
import type { PointsRule } from './sport';

export interface DivisionSeason {
  teamIds: string[];
  rounds: Fixture[][];
  results: Result[][];
}

export interface Season {
  year: number;
  round: number;
  divisions: DivisionSeason[];
}

export function createSeason(year: number, divisions: string[][]): Season {
  return {
    year,
    round: 0,
    divisions: divisions.map((teamIds) => ({ teamIds, rounds: doubleRoundRobin(teamIds), results: [] })),
  };
}

export function totalRounds(s: Season): number {
  return Math.max(...s.divisions.map((d) => d.rounds.length));
}

export function isSeasonOver(s: Season): boolean {
  return s.round >= totalRounds(s);
}

export function divisionStandings(d: DivisionSeason, points: PointsRule) {
  return computeStandings(d.teamIds, d.results.flat(), points);
}

/**
 * Acesso e rebaixamento: os `swap` primeiros sobem, os `swap` últimos descem.
 * Devolve a nova composição das divisões (ordem: elite → base).
 */
export function promoteAndRelegate(s: Season, points: PointsRule, swap = 2): string[][] {
  const tables = s.divisions.map((d) => divisionStandings(d, points).map((r) => r.teamId));
  const next = tables.map((t) => [...t]);
  for (let i = 0; i < tables.length - 1; i++) {
    const upper = tables[i]!;
    const lower = tables[i + 1]!;
    const relegated = upper.slice(-swap);
    const promoted = lower.slice(0, swap);
    next[i] = next[i]!.filter((id) => !relegated.includes(id)).concat(promoted);
    next[i + 1] = next[i + 1]!.filter((id) => !promoted.includes(id)).concat(relegated);
  }
  return next;
}
