import type { Attributes, Club, Formation, Player, Position } from './types';

export const FORMATIONS: Record<Formation, { DF: number; MF: number; FW: number }> = {
  '4-4-2': { DF: 4, MF: 4, FW: 2 },
  '4-3-3': { DF: 4, MF: 3, FW: 3 },
  '3-5-2': { DF: 3, MF: 5, FW: 2 },
  '5-3-2': { DF: 5, MF: 3, FW: 2 },
  '4-5-1': { DF: 4, MF: 5, FW: 1 },
  '3-4-3': { DF: 3, MF: 4, FW: 3 },
  '5-4-1': { DF: 5, MF: 4, FW: 1 },
};

/** Peso de cada atributo por posição (somam 1). Fonte única da "habilidade geral". */
export const WEIGHTS: Record<Position, Partial<Record<keyof Attributes, number>>> = {
  GK: { goalkeeping: 0.7, positioning: 0.15, concentration: 0.15 },
  DF: { tackling: 0.35, positioning: 0.25, strength: 0.15, pace: 0.1, concentration: 0.15 },
  MF: { passing: 0.35, decisions: 0.2, firstTouch: 0.15, stamina: 0.15, tackling: 0.075, finishing: 0.075 },
  FW: { finishing: 0.4, pace: 0.2, firstTouch: 0.2, decisions: 0.1, strength: 0.1 },
};

export function ratingAt(p: Player, pos: Position): number {
  let r = 0;
  for (const [k, w] of Object.entries(WEIGHTS[pos])) r += p.attrs[k as keyof Attributes] * w!;
  // goleiro na linha / jogador de linha no gol rendem bem menos
  if ((pos === 'GK') !== (p.position === 'GK')) r *= 0.45;
  return r;
}

export const overall = (p: Player) => Math.round(ratingAt(p, p.position));

/** Fator de rendimento pela condição física: 100% → 1,0; 50% → 0,85. */
export const conditionFactor = (condition: number) => 0.7 + 0.3 * Math.max(0, Math.min(100, condition)) / 100;

export interface Lineup {
  GK: Player;
  DF: Player[];
  MF: Player[];
  FW: Player[];
  bench: Player[];
}

export const available = (p: Player) => p.suspended <= 0;

/**
 * Escalação automática: melhores disponíveis por posição, considerando a condição
 * física (rodar o elenco importa). Banco: 7 melhores restantes.
 */
export function pickLineup(club: Club, formation: Formation = club.formation): Lineup {
  const shape = FORMATIONS[formation];
  const pool = club.players.filter(available);
  const used = new Set<string>();
  const score = (p: Player, pos: Position) => ratingAt(p, pos) * conditionFactor(p.condition);

  const take = (pos: Position, count: number): Player[] => {
    const chosen: Player[] = [];
    const candidates = (natural: boolean) =>
      pool
        .filter((p) => !used.has(p.id) && (natural ? p.position === pos : p.position !== 'GK'))
        .sort((a, b) => score(b, pos) - score(a, pos));
    for (const natural of [true, false]) {
      for (const p of candidates(natural)) {
        if (chosen.length >= count) break;
        chosen.push(p);
        used.add(p.id);
      }
    }
    return chosen;
  };

  const gk = take('GK', 1)[0] ?? pool.find((p) => !used.has(p.id)) ?? club.players[0]!;
  used.add(gk.id);
  const DF = take('DF', shape.DF);
  const MF = take('MF', shape.MF);
  const FW = take('FW', shape.FW);
  const bench = pool
    .filter((p) => !used.has(p.id))
    .sort((a, b) => score(b, b.position) - score(a, a.position))
    .slice(0, 7);
  return { GK: gk, DF, MF, FW, bench };
}

export const starters = (l: Lineup) => [l.GK, ...l.DF, ...l.MF, ...l.FW];
