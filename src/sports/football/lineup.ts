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

const BENCH_SIZE = 7;
const score = (p: Player, pos: Position) => ratingAt(p, pos) * conditionFactor(p.condition);

/** Distribui um grupo de atletas nas posições da formação (posição natural primeiro). */
function assign(pool: Player[], formation: Formation, fallback: Player) {
  const shape = FORMATIONS[formation];
  const used = new Set<string>();
  const take = (pos: Position, count: number): Player[] => {
    const chosen: Player[] = [];
    const passes: ((p: Player) => boolean)[] = [(p) => p.position === pos, (p) => p.position !== 'GK', () => true];
    for (const ok of passes) {
      const cands = pool.filter((p) => !used.has(p.id) && ok(p)).sort((a, b) => score(b, pos) - score(a, pos));
      for (const p of cands) {
        if (chosen.length >= count) break;
        chosen.push(p);
        used.add(p.id);
      }
    }
    return chosen;
  };
  const GK = take('GK', 1)[0] ?? fallback;
  used.add(GK.id);
  return { GK, DF: take('DF', shape.DF), MF: take('MF', shape.MF), FW: take('FW', shape.FW), used };
}

/**
 * Escalação da partida. Sem escolha manual, o auxiliar escala os melhores disponíveis
 * considerando a condição física (rodar o elenco importa). Com escolha manual, respeita
 * os 11 e o banco definidos e só completa vagas de suspensos ou negociados.
 */
export function pickLineup(club: Club, formation: Formation = club.formation): Lineup {
  const pool = club.players.filter(available);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const best = (xs: Player[]) => [...xs].sort((a, b) => score(b, b.position) - score(a, a.position));

  if (club.lineup) {
    const xi = club.lineup.xi.map((id) => byId.get(id)).filter((p): p is Player => !!p).slice(0, 11);
    const benchPick = club.lineup.bench.map((id) => byId.get(id)).filter((p): p is Player => !!p && !xi.includes(p));
    if (xi.length < 11) {
      // vaga aberta: entra primeiro alguém do banco escolhido, da mesma posição se possível
      const auto = assign(pool, formation, club.players[0]!);
      const autoXi = [auto.GK, ...auto.DF, ...auto.MF, ...auto.FW];
      for (const p of [...best(benchPick), ...autoXi, ...best(pool)]) {
        if (xi.length >= 11) break;
        if (!xi.includes(p)) xi.push(p);
      }
    }
    const a = assign(xi, formation, xi[0] ?? club.players[0]!);
    // banco: só quem foi escolhido (quem o jogador tirou da relação não volta sozinho)
    const bench = benchPick.filter((p) => !a.used.has(p.id));
    return { GK: a.GK, DF: a.DF, MF: a.MF, FW: a.FW, bench: bench.slice(0, BENCH_SIZE) };
  }

  const a = assign(pool, formation, pool[0] ?? club.players[0]!);
  const bench = best(pool.filter((p) => !a.used.has(p.id))).slice(0, BENCH_SIZE);
  return { GK: a.GK, DF: a.DF, MF: a.MF, FW: a.FW, bench };
}

export const starters = (l: Lineup) => [l.GK, ...l.DF, ...l.MF, ...l.FW];

// ---------------------------------------------------------------- escalação manual

export type SquadStatus = 'xi' | 'bench' | 'out';

export function statusOf(club: Club): Record<string, SquadStatus> {
  const l = pickLineup(club);
  const out: Record<string, SquadStatus> = {};
  for (const p of club.players) out[p.id] = 'out';
  for (const p of l.bench) out[p.id] = 'bench';
  for (const p of starters(l)) out[p.id] = 'xi';
  return out;
}

export interface MovePlan {
  xi: string[];
  bench: string[];
  /** Quem troca de lugar com o atleta movido (para o rótulo do botão). */
  swapWith?: Player;
}

/**
 * Planeja mover um atleta para titular, banco ou fora da relação, sempre como troca:
 * escalar alguém tira o titular mais fraco da mesma posição; tirar um titular põe o
 * melhor reserva da mesma posição. Assim o time nunca fica com 10.
 */
export function planMove(club: Club, playerId: string, to: SquadStatus): MovePlan | null {
  const l = pickLineup(club);
  const xi = starters(l).map((p) => p.id);
  const bench = l.bench.map((p) => p.id);
  const get = (id: string) => club.players.find((p) => p.id === id)!;
  const me = club.players.find((p) => p.id === playerId);
  if (!me) return null;
  const from: SquadStatus = xi.includes(playerId) ? 'xi' : bench.includes(playerId) ? 'bench' : 'out';
  if (from === to) return null;
  if (to === 'xi' && !available(me)) return null;
  const rank = (ids: string[], pos: Position) =>
    ids.map(get).sort((a, b) => (a.position === pos ? 0 : 1) - (b.position === pos ? 0 : 1) || score(a, pos) - score(b, pos));
  const drop = (ids: string[], id: string) => ids.filter((x) => x !== id);

  let nx = drop(xi, playerId), nb = drop(bench, playerId);
  let swapWith: Player | undefined;
  if (to === 'xi') {
    // sai o titular mais fraco da mesma posição (ou o mais fraco do time)
    swapWith = rank(nx, me.position)[0];
    if (swapWith) { nx = drop(nx, swapWith.id); if (from === 'bench') nb.push(swapWith.id); else nb.unshift(swapWith.id); }
    nx.push(playerId);
  } else if (from === 'xi') {
    // entra o melhor reserva da mesma posição
    const cands = nb.map(get).filter(available).sort((a, b) => (a.position === me.position ? 0 : 1) - (b.position === me.position ? 0 : 1) || score(b, me.position) - score(a, me.position));
    swapWith = cands[0];
    if (swapWith) { nb = drop(nb, swapWith.id); nx.push(swapWith.id); }
    if (to === 'bench') nb.push(playerId);
  } else if (to === 'bench') {
    if (nb.length >= BENCH_SIZE) { swapWith = rank(nb, me.position)[0]; if (swapWith) nb = drop(nb, swapWith.id); }
    nb.push(playerId);
  }
  return { xi: nx, bench: nb.slice(0, BENCH_SIZE), swapWith };
}

export function applyMove(club: Club, playerId: string, to: SquadStatus): boolean {
  const plan = planMove(club, playerId, to);
  if (!plan) return false;
  club.lineup = { xi: plan.xi, bench: plan.bench };
  return true;
}
