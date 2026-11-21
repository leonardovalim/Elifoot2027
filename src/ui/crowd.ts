import type { MatchEvent } from '../sports/football/types';

/**
 * Torcida da partida, sempre do ponto de vista do time da casa: gol do mandante
 * explode o estádio, gol do visitante cala. Puro e testável: aqui só se decide
 * o que a torcida faz; quem toca é o sound.tsx.
 */
export type CrowdCue = 'roar' | 'groan' | 'ooh' | 'save' | 'boo' | 'tension' | 'applause' | 'win' | 'loss';

/** Placar e minuto, o que a torcida precisa saber da partida. */
export interface CrowdMatch {
  minute: number;
  total: number;
  home: { goals: number };
  away: { goals: number };
}

/** Prioridade: uma reação mais forte corta a fraca, nunca o contrário. */
export const CUE_PRIORITY: Record<CrowdCue, number> = {
  ooh: 1, save: 1, applause: 1, boo: 2, tension: 2, roar: 3, groan: 3, win: 4, loss: 4,
};

/** Reação da torcida da casa a um evento (null = segue o murmúrio). */
export function crowdReaction(e: MatchEvent, m: CrowdMatch): CrowdCue | null {
  const diff = m.home.goals - m.away.goals;
  switch (e.type) {
    case 'goal': return e.side === 'home' ? 'roar' : 'groan';
    // `side` é quem chutou: chance do mandante é "uhh"; do visitante, alívio calado
    case 'post': case 'bar': case 'miss': return e.side === 'home' ? 'ooh' : null;
    // defesa do goleiro da casa é aplaudida; do goleiro visitante, "uhh" de quase
    case 'save': return e.side === 'away' ? 'save' : 'ooh';
    case 'penalty': return e.side === 'home' ? 'tension' : 'boo';
    case 'yellow': case 'red': return e.side === 'home' ? 'boo' : null;
    case 'extra': return 'tension';
    case 'half': return diff < 0 ? 'boo' : 'applause';
    case 'end': return diff > 0 ? 'win' : diff < 0 ? 'loss' : 'applause';
    default: return null;
  }
}

/** Volume das duas camadas contínuas (0–1): murmúrio e cantoria com bateria. */
export interface CrowdLevels { bed: number; chant: number }

/** Público que soa como estádio cheio. Abaixo disso a torcida fica mais baixa. */
const FULL_HOUSE = 40000;

export function crowdLevels(m: CrowdMatch, attendance: number): CrowdLevels {
  const size = 0.35 + 0.65 * Math.min(1, Math.max(0, attendance) / FULL_HOUSE);
  const diff = m.home.goals - m.away.goals;
  // reta final com placar apertado: o estádio sobe junto
  const late = Math.min(1, Math.max(0, (m.minute - 75) / 15));
  const tension = Math.abs(diff) <= 1 ? late : 0;
  const bed = Math.min(1, size * (0.7 + 0.3 * tension));
  // canta quando a casa vence; empatado, só da metade do segundo tempo em diante
  const mood = diff > 0 ? 1 : diff === 0 ? (m.minute >= 60 ? 0.5 : 0.25) : 0;
  return { bed, chant: size * mood };
}
