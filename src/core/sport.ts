import type { Rng } from './rng';

/**
 * Contrato que cada esporte implementa. O core (temporadas, divisões, tabela,
 * finanças, mercado) só conhece esta interface — por isso adicionar vôlei, F1
 * etc. é escrever um novo plugin em `src/sports/<esporte>`, não reescrever o jogo.
 *
 * Esportes de confronto (futebol, vôlei, basquete...) implementam
 * `HeadToHeadSport`. Esportes de corrida (F1...) ganharão um `RaceSport`
 * na fase 3, reaproveitando o mesmo core de temporada/finanças.
 */
export interface MatchOutcome<TEvent = unknown> {
  homeScore: number;
  awayScore: number;
  events: TEvent[];
}

export interface PointsRule {
  win: number;
  draw: number;
  loss: number;
}

export interface HeadToHeadSport<TTeam, TEvent> {
  id: string;
  name: string;
  format: 'head-to-head';
  points: PointsRule;
  allowsDraw: boolean;
  simulateMatch(home: TTeam, away: TTeam, rng: Rng): MatchOutcome<TEvent>;
}
