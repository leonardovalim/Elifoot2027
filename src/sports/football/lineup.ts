import type { Club, Formation, Player, Position } from './types';

export const FORMATIONS: Record<Formation, { DF: number; MF: number; FW: number }> = {
  '4-4-2': { DF: 4, MF: 4, FW: 2 },
  '4-3-3': { DF: 4, MF: 3, FW: 3 },
  '3-5-2': { DF: 3, MF: 5, FW: 2 },
  '5-3-2': { DF: 5, MF: 3, FW: 2 },
  '4-5-1': { DF: 4, MF: 5, FW: 1 },
  '3-4-3': { DF: 3, MF: 4, FW: 3 },
  '5-4-1': { DF: 5, MF: 4, FW: 1 },
};

/** Valor do jogador numa posição. Fora de posição ele rende menos. */
export function ratingAt(p: Player, pos: Position): number {
  switch (pos) {
    case 'GK': return p.position === 'GK' ? p.goalkeeping : p.goalkeeping * 0.3;
    case 'DF': return p.defense * 0.8 + p.passing * 0.2;
    case 'MF': return p.passing * 0.6 + p.attack * 0.2 + p.defense * 0.2;
    case 'FW': return p.attack * 0.85 + p.passing * 0.15;
  }
}

export function overall(p: Player): number {
  return Math.round(ratingAt(p, p.position));
}

export interface Lineup {
  GK: Player;
  DF: Player[];
  MF: Player[];
  FW: Player[];
}

export function available(p: Player): boolean {
  return p.suspendedRounds <= 0;
}

/**
 * Escalação automática: preenche cada setor com os melhores disponíveis,
 * priorizando jogadores da posição e só depois improvisando.
 */
export function pickLineup(club: Club, formation: Formation = club.formation): Lineup {
  const shape = FORMATIONS[formation];
  const pool = club.players.filter(available);
  const used = new Set<string>();

  const take = (pos: Position, count: number): Player[] => {
    const chosen: Player[] = [];
    const natural = pool
      .filter((p) => p.position === pos && !used.has(p.id))
      .sort((a, b) => ratingAt(b, pos) - ratingAt(a, pos));
    for (const p of natural) {
      if (chosen.length >= count) break;
      chosen.push(p);
      used.add(p.id);
    }
    if (chosen.length < count) {
      const rest = pool
        .filter((p) => !used.has(p.id) && p.position !== 'GK')
        .sort((a, b) => ratingAt(b, pos) - ratingAt(a, pos));
      for (const p of rest) {
        if (chosen.length >= count) break;
        chosen.push(p);
        used.add(p.id);
      }
    }
    return chosen;
  };

  const gk = take('GK', 1)[0] ?? pool.find((p) => !used.has(p.id)) ?? club.players[0]!;
  used.add(gk.id);
  return { GK: gk, DF: take('DF', shape.DF), MF: take('MF', shape.MF), FW: take('FW', shape.FW) };
}
