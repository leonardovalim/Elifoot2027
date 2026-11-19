import type { Rng } from '../../core/rng';
import { generatePlayer, wageFor } from './generate';
import type { Club, Player } from './types';

const clamp = (v: number) => Math.max(1, Math.min(99, v));

function mainKey(p: Player): 'attack' | 'defense' | 'passing' | 'goalkeeping' {
  return p.position === 'GK' ? 'goalkeeping' : p.position === 'DF' ? 'defense' : p.position === 'MF' ? 'passing' : 'attack';
}

/**
 * Evolução por rodada. Jovens que jogam crescem rumo ao potencial;
 * veteranos caem. Ritmo bem mais lento que o Elifoot 98 (±1 por rodada),
 * para que uma temporada não transforme reserva em craque.
 */
export function developAfterRound(club: Club, playedIds: Set<string>, rng: Rng) {
  for (const p of club.players) {
    const key = mainKey(p);
    const played = playedIds.has(p.id);
    if (p.age <= 24 && p[key] < p.potential) {
      if (rng.chance(played ? 0.22 : 0.06)) p[key] = clamp(p[key] + 1);
    } else if (p.age >= 31) {
      if (rng.chance(0.04 + (p.age - 31) * 0.02)) p[key] = clamp(p[key] - 1);
    } else if (played && p[key] < p.potential && rng.chance(0.05)) {
      p[key] = clamp(p[key] + 1);
    }
    if (p.suspendedRounds > 0 && !played) p.suspendedRounds--;
    if (p.contractRounds > 0) p.contractRounds--;
  }
}

/** Virada de temporada: envelhece, aposenta, renova contratos e sobe juniores. */
export function endOfSeason(club: Club, level: number, rng: Rng) {
  const keep: Player[] = [];
  for (const p of club.players) {
    p.age++;
    const retire = p.age >= 36 || (p.age >= 33 && rng.chance((p.age - 32) * 0.2));
    if (!retire) {
      if (p.contractRounds <= 0) p.contractRounds = rng.int(22, 66);
      p.wage = wageFor(p);
      keep.push(p);
    }
  }
  club.players = keep;
  const need = { GK: 2, DF: 6, MF: 6, FW: 4 } as const;
  for (const pos of ['GK', 'DF', 'MF', 'FW'] as const) {
    const have = club.players.filter((p) => p.position === pos).length;
    for (let i = have; i < need[pos]; i++) club.players.push(generatePlayer(rng, pos, level - 4, rng.int(17, 19)));
  }
}
