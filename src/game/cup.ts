import { addDays, type IsoDate } from '../core/calendar';
import type { Rng } from '../core/rng';
import type { MatchState } from '../sports/football/engine';
import type { Club, Side } from '../sports/football/types';

/**
 * Copa (mata-mata em jogo único, estilo Copa do Brasil): os 48 clubes entram.
 * Divisões 3 e 4 e os 8 mais fracos da 2 abrem na 1ª fase; a elite e os 4 melhores
 * da 2 entram na 2ª. Sorteio a cada fase, mando do clube de divisão mais baixa
 * (a festa é do pequeno), empate vai para os pênaltis.
 */
export interface CupTie {
  home: string;
  away: string;
  hs?: number;
  as?: number;
  /** Disputa de pênaltis quando empata no tempo normal. */
  pens?: [number, number];
  winner?: string;
}

export type CupKind = 'copa' | 'continental';

export interface Cup {
  /** Qual competição (ausente = Copa, saves da primeira versão). */
  kind?: CupKind;
  year: number;
  /** Data de cada fase (quartas-feiras entre as rodadas do campeonato). */
  dates: IsoDate[];
  /** Fase atual (0 = 1ª fase); igual a CUP_ROUNDS.length quando acabou. */
  round: number;
  ties: CupTie[][];
  /** Entram direto na 2ª fase. */
  byes: string[];
  championId?: string;
}

export const CUP_NAME = 'Copa Mestres';
export const CUP_ROUNDS = ['1ª fase', '2ª fase', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];
export const CONTINENTAL_NAME = 'Taça Continental';
export const CONTINENTAL_ROUNDS = ['Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];
export const CONTINENTAL_PRIZE = [150000, 300000, 600000, 2500000];
/** Classificados do Brasil: os 4 primeiros da Divisão 1. */
export const CONTINENTAL_SPOTS = 4;
const CONTINENTAL_AFTER = [3, 8, 12, 16];

export const cupKind = (cup: Cup): CupKind => cup.kind ?? 'copa';
export const cupName = (cup: Cup) => (cupKind(cup) === 'copa' ? CUP_NAME : CONTINENTAL_NAME);
export const cupStages = (cup: Cup) => (cupKind(cup) === 'copa' ? CUP_ROUNDS : CONTINENTAL_ROUNDS);
export const cupPrizes = (cup: Cup) => (cupKind(cup) === 'copa' ? CUP_PRIZE : CONTINENTAL_PRIZE);
export const stageName = (cup: Cup, round: number) => cupStages(cup)[round]!;
/** "na 2ª fase", "nas Quartas de final"... */
export const cupIn = (cup: Cup, round: number) => {
  const st = stageName(cup, round);
  return `${/^(Oitavas|Quartas)/.test(st) ? 'nas' : 'na'} ${st}`;
};
/** Prêmio para quem vence o confronto de cada fase (o último é o do campeão). */
export const CUP_PRIZE = [30000, 50000, 100000, 200000, 400000, 1200000];
/** Depois de quais rodadas do campeonato (índice) entra cada fase, sempre na quarta seguinte. */
const AFTER_ROUND = [1, 4, 7, 10, 14, 18];

export function cupDates(roundDates: IsoDate[], after = AFTER_ROUND): IsoDate[] {
  return after.map((r) => addDays(roundDates[Math.min(r, roundDates.length - 1)]!, 3));
}

/** Divisão de cada clube na temporada da copa (para o mando). */
type DivOf = (id: string) => number;

function draw(ids: string[], divOf: DivOf, rng: Rng): CupTie[] {
  const pool = rng.shuffle(ids);
  const ties: CupTie[] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) {
    const a = pool[i]!, b = pool[i + 1]!;
    // mando do clube de divisão mais baixa; mesma divisão fica como saiu no sorteio
    ties.push(divOf(b) > divOf(a) ? { home: b, away: a } : { home: a, away: b });
  }
  return ties;
}

export function createCup(year: number, divisions: string[][], clubs: Record<string, Club>, roundDates: IsoDate[], rng: Rng): Cup {
  const div2 = [...(divisions[1] ?? [])].sort((a, b) => clubs[b]!.reputation - clubs[a]!.reputation);
  const byes = [...(divisions[0] ?? []), ...div2.slice(0, 4)];
  const first = [...div2.slice(4), ...divisions.slice(2).flat()];
  const divOf = divOfFrom(divisions);
  return { kind: 'copa', year, dates: cupDates(roundDates), round: 0, ties: [draw(first, divOf, rng)], byes };
}

/** Taça Continental: 4 do Brasil e 12 estrangeiros, mata-mata desde as oitavas, mando sorteado. */
export function createContinental(year: number, entrants: string[], roundDates: IsoDate[], rng: Rng): Cup {
  return { kind: 'continental', year, dates: cupDates(roundDates, CONTINENTAL_AFTER), round: 0, ties: [draw(entrants, () => 0, rng)], byes: [] };
}

export function divOfFrom(divisions: string[][]): DivOf {
  const map = new Map<string, number>();
  divisions.forEach((d, i) => d.forEach((id) => map.set(id, i)));
  return (id) => map.get(id) ?? 0;
}

export const cupOver = (cup: Cup) => cup.round >= cupStages(cup).length;
export const currentTies = (cup: Cup): CupTie[] => cup.ties[cup.round] ?? [];
export const isCupDate = (cup: Cup | undefined, date: IsoDate) => !!cup && !cupOver(cup) && cup.dates[cup.round] === date;
export const tieOf = (cup: Cup, clubId: string) => currentTies(cup).find((t) => t.home === clubId || t.away === clubId);

/** Ainda vivo na copa (está no confronto da fase atual). */
export const aliveInCup = (cup: Cup | undefined, clubId: string) => !!cup && !cupOver(cup) && !!tieOf(cup, clubId);

/** Onde o clube caiu (ou se foi campeão), para a tela e as notícias. */
export function cupStatus(cup: Cup, clubId: string): { round: number; out: boolean; by?: string; champion: boolean } | null {
  for (let r = cup.ties.length - 1; r >= 0; r--) {
    const t = cup.ties[r]!.find((x) => x.home === clubId || x.away === clubId);
    if (!t) continue;
    if (!t.winner) return { round: r, out: false, champion: false };
    if (t.winner !== clubId) return { round: r, out: true, by: t.winner, champion: false };
    return { round: r, out: false, champion: r === cupStages(cup).length - 1 };
  }
  // ainda não estreou: é dos que entram na 2ª fase
  return cup.byes.includes(clubId) ? { round: 1, out: false, champion: false } : null;
}

/** Registra o resultado; o vencedor sai do placar ou dos pênaltis. */
export function settleTie(t: CupTie, hs: number, as: number, pens?: [number, number]) {
  t.hs = hs; t.as = as;
  if (hs === as && pens) t.pens = pens;
  t.winner = hs > as ? t.home : as > hs ? t.away : pens![0] > pens![1] ? t.home : t.away;
}

/** Fecha a fase e sorteia a próxima (ou coroa o campeão). */
export function advanceCup(cup: Cup, divisions: string[][], rng: Rng): { finished: boolean } {
  const winners = currentTies(cup).map((t) => t.winner!);
  cup.round++;
  if (cupOver(cup)) {
    cup.championId = winners[0];
    return { finished: true };
  }
  const entrants = cup.round === 1 ? [...winners, ...cup.byes] : winners;
  cup.ties.push(draw(entrants, divOfFrom(divisions), rng));
  return { finished: false };
}

// ---------------------------------------------------------------- pênaltis

export interface Kick { side: Side; name: string; scored: boolean }
export interface Shootout { home: number; away: number; kicks: Kick[] }

/**
 * Disputa de pênaltis com quem terminou em campo: batem os melhores finalizadores,
 * o goleiro adversário pesa. 5 cobranças e depois alternadas até alguém errar.
 */
export function shootout(m: MatchState, rng: Rng): Shootout {
  const order = (s: Side) => {
    const st = m[s];
    const outfield = [...st.DF, ...st.MF, ...st.FW].sort((a, b) => b.attrs.finishing - a.attrs.finishing);
    return [...outfield, st.GK];
  };
  const takers = { home: order('home'), away: order('away') };
  const keeper = { home: m.home.GK.attrs.goalkeeping, away: m.away.GK.attrs.goalkeeping };
  const score = { home: 0, away: 0 };
  const kicks: Kick[] = [];
  const kick = (s: Side, i: number) => {
    const p = takers[s][i % takers[s].length]!;
    const other: Side = s === 'home' ? 'away' : 'home';
    const chance = Math.max(0.55, Math.min(0.92, 0.76 + (p.attrs.finishing - keeper[other]) / 300 + (p.attrs.concentration - 60) / 600));
    const scored = rng.chance(chance);
    if (scored) score[s]++;
    kicks.push({ side: s, name: p.name, scored });
  };
  for (let i = 0; i < 5; i++) {
    kick('home', i);
    if (decided(score, i + 1, i)) break;
    kick('away', i);
    if (decided(score, i + 1, i + 1)) break;
  }
  for (let i = 5; score.home === score.away && i < 60; i++) {
    kick('home', i);
    kick('away', i);
  }
  return { home: score.home, away: score.away, kicks };
}

/** Na série de 5, alguém já não alcança o outro? */
function decided(s: { home: number; away: number }, homeTaken: number, awayTaken: number) {
  return s.home + (5 - homeTaken) < s.away || s.away + (5 - awayTaken) < s.home;
}
