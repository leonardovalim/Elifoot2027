import { track } from './analytics';

/**
 * Interesse por modalidades futuras (descoberta de demanda — define a ordem do roadmap).
 * O voto fica no navegador (para mostrar o estado) e vai para o PostHog via `track()`.
 */
const KEY = 'mestres-do-esporte.interest';

export type Votes = Record<string, number>;

export function loadVotes(): Votes {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Votes;
  } catch {
    return {};
  }
}

export function saveVote(sport: string, stars: number): Votes {
  const votes = { ...loadVotes(), [sport]: stars };
  try {
    localStorage.setItem(KEY, JSON.stringify(votes));
  } catch {
    /* sem armazenamento: o voto ainda vai para o track */
  }
  track('sport_interest', { sport, stars });
  return votes;
}
