import type { Rng } from '../../core/rng';
import { WEIGHTS, overall } from './lineup';
import { generatePlayer, wageFor } from './generate';
import type { AttrKey, Club, Player } from './types';

const clamp = (v: number) => Math.max(1, Math.min(99, v));

export interface TrainingGain {
  playerId: string;
  playerName: string;
  attr: AttrKey;
}

export const ATTR_SHORT: Record<AttrKey, string> = {
  pace: 'VEL', strength: 'FOR', stamina: 'RES', passing: 'PAS', finishing: 'FIN',
  firstTouch: 'DOM', tackling: 'DES', decisions: 'DEC', positioning: 'POS',
  concentration: 'CON', goalkeeping: 'GOL',
};

/**
 * Treino diário (efeito Game Dev Story: pequenos ganhos visíveis todo dia).
 * Jovens abaixo do potencial evoluem; o CT acelera; veteranos perdem físico.
 * Também recupera a condição física.
 */
export function dailyTraining(club: Club, rng: Rng, recovery = 4): TrainingGain[] {
  const gains: TrainingGain[] = [];
  const ctBoost = 0.7 + club.trainingCenter * 0.15;
  const level = teamLevel(club);
  for (const p of club.players) {
    p.condition = Math.min(100, p.condition + recovery * (0.7 + p.attrs.stamina / 200));
    const ovr = overall(p);
    if (ovr < p.potential) {
      const youth = p.age <= 21 ? 1 : p.age <= 25 ? 0.6 : 0.25;
      if (rng.chance(0.012 * youth * ctBoost * growthFactor(p, ovr, level))) {
        const keys = Object.keys(WEIGHTS[p.position]) as AttrKey[];
        const attr = rng.weighted(keys, (k) => WEIGHTS[p.position][k]!);
        p.attrs[attr] = clamp(p.attrs[attr] + 1);
        gains.push({ playerId: p.id, playerName: p.name, attr });
      }
    }
    if (p.age >= 31 && rng.chance(0.004 + (p.age - 31) * 0.002)) {
      const attr = rng.pick<AttrKey>(['pace', 'stamina', 'strength']);
      p.attrs[attr] = clamp(p.attrs[attr] - 1);
    }
  }
  return gains;
}

/** Nível do time: média de habilidade dos 11 melhores. */
export function teamLevel(club: Club): number {
  const best = club.players.map(overall).sort((a, b) => b - a).slice(0, 11);
  return best.reduce((a, b) => a + b, 0) / Math.max(1, best.length);
}

/**
 * Herança do Elifoot 98: goleiro evolui mais devagar (sorteio extra de 50%) e
 * jogador muito acima do nível do time (janela de ±5) estagna. Aqui viram fatores
 * suaves em vez de travas duras.
 */
function growthFactor(p: Player, ovr: number, level: number): number {
  let f = p.position === 'GK' ? 0.5 : 1;
  if (ovr > level + 5) f *= 0.4;
  return f;
}

/**
 * Aplica efeitos de uma partida: condição, suspensões, estatísticas e
 * evolução por desempenho (Elifoot 98: ±1 pela avaliação da partida).
 * Devolve os ganhos para virar notícia.
 */
export function applyMatch(club: Club, played: string[], ratings: Record<string, number>, conditionAfter: Record<string, number>, sentOff: string[], goals: Record<string, number>, rng: Rng): TrainingGain[] {
  const gains: TrainingGain[] = [];
  const level = teamLevel(club);
  for (const p of club.players) {
    if (p.suspended > 0 && !played.includes(p.id)) p.suspended--;
    if (played.includes(p.id)) {
      p.condition = conditionAfter[p.id] ?? p.condition;
      p.stats.apps++;
      p.stats.ratingSum += ratings[p.id] ?? 6;
      p.stats.goals += goals[p.id] ?? 0;
      const rating = ratings[p.id] ?? 6;
      const ovr = overall(p);
      const keys = Object.keys(WEIGHTS[p.position]) as AttrKey[];
      if (rating >= 7.3 && ovr < p.potential + 3 && rng.chance(0.5 * growthFactor(p, ovr, level))) {
        const attr = rng.weighted(keys, (k) => WEIGHTS[p.position][k]!);
        p.attrs[attr] = clamp(p.attrs[attr] + 1);
        gains.push({ playerId: p.id, playerName: p.name, attr });
      } else if (rating <= 5 && ovr > level - 5 && rng.chance(0.15)) {
        const attr = rng.weighted(keys, (k) => WEIGHTS[p.position][k]!);
        p.attrs[attr] = clamp(p.attrs[attr] - 1);
      }
    }
    if (sentOff.includes(p.id)) p.suspended = 1;
  }
  return gains;
}

/** Virada de temporada: envelhece, aposenta, renova contratos e sobe juniores. */
export function endOfSeason(club: Club, level: number, year: number, rng: Rng): { retired: Player[]; youth: Player[] } {
  const keep: Player[] = [];
  const retired: Player[] = [];
  for (const p of club.players) {
    p.age++;
    p.stats = { apps: 0, goals: 0, ratingSum: 0 };
    const retire = !p.clubLocked && (p.age >= 37 || (p.age >= 33 && rng.chance((p.age - 32) * 0.18)));
    if (retire) { retired.push(p); continue; }
    if (p.contractUntil < year + 1) p.contractUntil = year + 1 + rng.int(0, 2);
    p.wage = wageFor(p);
    p.condition = 100;
    keep.push(p);
  }
  club.players = keep;
  const youth: Player[] = [];
  const need = { GK: 2, DF: 7, MF: 7, FW: 4 } as const;
  for (const pos of ['GK', 'DF', 'MF', 'FW'] as const) {
    const have = club.players.filter((p) => p.position === pos).length;
    for (let i = have; i < need[pos]; i++) {
      const y = generatePlayer(rng, pos, level - 2 + club.trainingCenter, rng.int(17, 19), year + 1);
      club.players.push(y);
      youth.push(y);
    }
  }
  return { retired, youth };
}
