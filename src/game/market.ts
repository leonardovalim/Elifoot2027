/**
 * Mercado vivo: propostas da IA pelos atletas do jogador, pedidos de aumento,
 * renovação de contrato e satisfação. Tudo determinístico (usa o RNG da carreira).
 *
 * Cada evento vira uma `Decision` pendente. A interface pausa o tempo enquanto
 * houver decisão e chama `resolveDecision` com a escolha.
 */
import { dayOf, monthOf, type IsoDate } from '../core/calendar';
import type { Rng } from '../core/rng';
import { playerValue, wageFor } from '../sports/football/generate';
import { overall } from '../sports/football/lineup';
import type { Club, Player, Position } from '../sports/football/types';

export type Decision =
  | { id: string; kind: 'bid'; date: IsoDate; playerId: string; clubId: string; fee: number; wage: number }
  | { id: string; kind: 'raise'; date: IsoDate; playerId: string; wage: number }
  | { id: string; kind: 'renewal'; date: IsoDate; playerId: string; wage: number; years: number };

export type BidChoice = 'accept' | 'cover' | 'refuse';
export type RaiseChoice = 'accept' | 'refuse';
export type RenewalChoice = 'accept' | 'release';
export type DecisionChoice = BidChoice | RaiseChoice | RenewalChoice;

/** O que o mercado precisa da carreira (evita dependência circular com career.ts). */
export interface MarketCtx {
  date: IsoDate;
  year: number;
  phase: string;
  clubs: Record<string, Club>;
  me: string;
  /** Clubes de técnicos humanos (multijogador): a IA não compra deles nem eles entram como comprador. */
  humans?: string[];
  /** Data em que o técnico assumiu o clube (carência para propostas e pedidos). */
  since?: IsoDate;
  decisions: Decision[];
  push: (kind: 'good' | 'bad' | 'money' | 'info', text: string) => void;
  addSale: (fee: number) => void;
}

export const DEFAULT_MORALE = 70;
export const moraleOf = (p: Player) => p.morale ?? DEFAULT_MORALE;
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
export const setMorale = (p: Player, v: number) => { p.morale = clamp(v); };

export type MoraleLevel = 'feliz' | 'satisfeito' | 'insatisfeito' | 'revoltado';
export function moraleLevel(m: number): MoraleLevel {
  return m >= 75 ? 'feliz' : m >= 50 ? 'satisfeito' : m >= 25 ? 'insatisfeito' : 'revoltado';
}

/** Contrato termina ao fim desta temporada. */
export const expiresThisSeason = (p: Player, year: number) => p.contractUntil <= year;

const round100 = (v: number) => Math.round(v / 100) * 100;
const round1000 = (v: number) => Math.round(v / 1000) * 1000;
const fmt = (v: number) => `$ ${v.toLocaleString('pt-BR')}`;
const MAX_PENDING = 3;
const RAISE_COOLDOWN_DAYS = 120;
/**
 * Carência ao assumir um clube: ninguém faz proposta nos primeiros 60 dias nem pede
 * aumento nos primeiros 45. Quem está começando conhece o elenco antes das decisões.
 */
export const BID_GRACE_DAYS = 60;
export const RAISE_GRACE_DAYS = 45;
const inGrace = (ctx: MarketCtx, days: number) => !!ctx.since && daysBetween(ctx.since, ctx.date) < days;

function daysBetween(a: IsoDate, b: IsoDate) {
  return (Date.parse(b) - Date.parse(a)) / 86400000;
}

/** Atletas que o elenco consegue liberar sem ficar abaixo do mínimo (16, com 2 goleiros). */
function canLose(club: Club, p: Player) {
  if (club.players.length <= 16) return false;
  if (p.position === 'GK' && club.players.filter((x) => x.position === 'GK').length <= 2) return false;
  return true;
}

/** Id determinístico: no máximo um evento de cada tipo por atleta por dia. */
const newId = (ctx: MarketCtx, kind: string, playerId: string) => `${kind}:${playerId}:${ctx.date}`;

// ---------------------------------------------------------------- geração diária

/** Roda uma vez por dia (depois de avançar a data). Pode criar decisões. */
export function marketDay(ctx: MarketCtx, rng: Rng) {
  const club = ctx.clubs[ctx.me];
  if (!club) return;
  if (ctx.phase !== 'pre-temporada' && ctx.phase !== 'temporada') return;

  if (dayOf(ctx.date) === 1) monthlyMorale(club);

  if (ctx.decisions.length >= MAX_PENDING) return;
  maybeBid(ctx, club, rng);
  if (ctx.decisions.length >= MAX_PENDING) return;
  if (dayOf(ctx.date) === 1 || dayOf(ctx.date) === 15) maybeRaise(ctx, club, rng);
  if (ctx.phase === 'temporada' && dayOf(ctx.date) === 1 && monthOf(ctx.date) >= 8) askRenewals(ctx, club);
}

/** Proposta de outro clube por um atleta: ~1 a cada 2 meses, mais se houver alguém insatisfeito. */
function maybeBid(ctx: MarketCtx, club: Club, rng: Rng) {
  if (ctx.decisions.some((d) => d.kind === 'bid')) return;
  if (inGrace(ctx, BID_GRACE_DAYS)) return;
  // atleta sem valor de mercado não recebe proposta (evitava oferta de $0 e "NaN% do valor" na tela)
  const pool = club.players.filter((p) => canLose(club, p) && !p.leaving && !p.clubLocked && playerValue(p) > 0);
  if (!pool.length) return;
  const unhappy = pool.some((p) => moraleOf(p) < 25);
  if (!rng.chance(unhappy ? 0.03 : 0.016)) return;
  const p = rng.weighted(pool, (x) => playerValue(x) * (moraleOf(x) < 25 ? 3 : 1));
  const fee = round1000(playerValue(p) * (0.9 + rng.next() * 0.55));
  if (fee <= 0) return;
  const buyers = Object.values(ctx.clubs).filter((c) => c.id !== club.id && !ctx.humans?.includes(c.id) && c.budget > fee * 1.2 && c.players.length < 28);
  if (!buyers.length) return;
  const buyer = rng.weighted(buyers, (c) => Math.max(1, c.reputation - club.reputation + 30));
  const wage = round100(Math.max(p.wage, wageFor(p)) * (1.25 + rng.next() * 0.45));
  ctx.decisions.push({ id: newId(ctx, 'bid', p.id), kind: 'bid', date: ctx.date, playerId: p.id, clubId: buyer.id, fee, wage });
}

/** Boa temporada: 5+ jogos com média 6,8 ou mais. */
const goodSeason = (p: Player) => p.stats.apps >= 5 && p.stats.ratingSum / p.stats.apps >= 6.8;

/** Pedido de aumento: atleta mal pago, insatisfeito ou em boa fase; no máximo um por quinzena. */
function maybeRaise(ctx: MarketCtx, club: Club, rng: Rng) {
  if (ctx.decisions.some((d) => d.kind === 'raise')) return;
  if (inGrace(ctx, RAISE_GRACE_DAYS)) return;
  const median = [...club.players].map(overall).sort((a, b) => a - b)[Math.floor(club.players.length / 2)] ?? 0;
  const eligible = club.players.filter((p) =>
    !p.leaving
    && !expiresThisSeason(p, ctx.year)
    && (!p.raiseAskedOn || daysBetween(p.raiseAskedOn, ctx.date) >= RAISE_COOLDOWN_DAYS)
    && (wageFor(p) > p.wage * 1.1 || (moraleOf(p) < 45 && overall(p) >= median) || goodSeason(p)));
  if (!eligible.length || !rng.chance(0.4)) return;
  const p = rng.weighted(eligible, (x) => wageFor(x) / x.wage + (100 - moraleOf(x)) / 50);
  p.raiseAskedOn = ctx.date;
  const wage = round100(Math.max(wageFor(p) * 1.05, p.wage * 1.15));
  ctx.decisions.push({ id: newId(ctx, 'raise', p.id), kind: 'raise', date: ctx.date, playerId: p.id, wage });
}

/** A partir de agosto, quem tem contrato acabando pede renovação (até 2 por mês). */
function askRenewals(ctx: MarketCtx, club: Club) {
  const expiring = club.players
    // o ídolo preso ao clube renova sozinho na virada da temporada
    .filter((p) => expiresThisSeason(p, ctx.year) && p.renewalAsked !== ctx.year && !p.leaving && !p.clubLocked)
    .sort((a, b) => overall(b) - overall(a));
  // em novembro todos os que faltam pedem de uma vez, para ninguém sair sem aviso
  const take = monthOf(ctx.date) >= 11 ? expiring.length : 2;
  for (const p of expiring.slice(0, take)) {
    p.renewalAsked = ctx.year;
    const m = moraleOf(p);
    const mult = m >= 60 ? 1.05 : m >= 35 ? 1.2 : 1.45;
    const wage = round100(Math.max(p.wage, wageFor(p) * mult));
    const years = p.age >= 32 ? 1 : p.age >= 28 ? 2 : 3;
    ctx.decisions.push({ id: newId(ctx, 'renewal', p.id), kind: 'renewal', date: ctx.date, playerId: p.id, wage, years });
  }
}

// ---------------------------------------------------------------- satisfação

/** Mensal: mal pago perde satisfação; todos voltam devagar para perto de 60. */
function monthlyMorale(club: Club) {
  for (const p of club.players) {
    let m = moraleOf(p);
    if (wageFor(p) > p.wage * 1.2) m -= 3;
    m += (60 - m) * 0.1;
    setMorale(p, m);
  }
}

/**
 * Depois de cada jogo do clube do jogador: quem joga fica mais feliz; quem é
 * dos melhores do elenco e ficou de fora reclama.
 */
export function moraleAfterMatch(club: Club, played: string[]) {
  const ranked = [...club.players].sort((a, b) => overall(b) - overall(a));
  const top = new Set(ranked.slice(0, 13).map((p) => p.id));
  for (const p of club.players) {
    if (played.includes(p.id)) setMorale(p, moraleOf(p) + 3);
    else if (p.suspended > 0 || (p.injured ?? 0) > 0) continue;
    else setMorale(p, moraleOf(p) - (top.has(p.id) ? 5 : 1));
  }
}

// ---------------------------------------------------------------- decisões

/** Aplica a escolha do jogador. Devolve uma mensagem de erro ou null. */
export function resolveDecision(ctx: MarketCtx, id: string, choice: DecisionChoice): string | null {
  const i = ctx.decisions.findIndex((d) => d.id === id);
  if (i < 0) return 'Decisão não encontrada.';
  const d = ctx.decisions[i]!;
  ctx.decisions.splice(i, 1);
  const club = ctx.clubs[ctx.me];
  const p = club?.players.find((x) => x.id === d.playerId);
  if (!club || !p) return null; // atleta já saiu: a decisão perde o sentido

  if (d.kind === 'bid') {
    const buyer = ctx.clubs[d.clubId]!;
    if (choice === 'accept') {
      if (buyer.budget < d.fee || !canLose(club, p)) {
        ctx.push('info', `${buyer.name} desistiu da proposta por ${p.name}.`);
        return null;
      }
      club.budget += d.fee;
      buyer.budget -= d.fee;
      ctx.addSale(d.fee);
      club.players = club.players.filter((x) => x.id !== p.id);
      if (club.lineup) club.lineup = { xi: club.lineup.xi.filter((x) => x !== p.id), bench: club.lineup.bench.filter((x) => x !== p.id) };
      p.joinedOn = ctx.date;
      p.wage = d.wage;
      delete p.morale; delete p.raiseAskedOn; delete p.renewalAsked; delete p.leaving;
      buyer.players.push(p);
      ctx.push('money', `Vendido: ${p.name} para o ${buyer.name} por ${fmt(d.fee)}.`);
    } else if (choice === 'cover') {
      p.wage = d.wage;
      setMorale(p, moraleOf(p) + 10);
      ctx.push('good', `${p.name} fica: você cobriu a oferta do ${buyer.name} (salário de ${fmt(d.wage)}).`);
    } else {
      const bigRaise = d.wage > p.wage * 1.15;
      const biggerClub = buyer.reputation > club.reputation;
      setMorale(p, moraleOf(p) - (bigRaise ? 12 : 5) - (biggerClub ? 8 : 0));
      ctx.push(bigRaise ? 'bad' : 'info', `Proposta do ${buyer.name} por ${p.name} recusada.${bigRaise ? ' Ele ficou chateado.' : ''}`);
    }
    return null;
  }

  if (d.kind === 'raise') {
    if (choice === 'accept') {
      p.wage = d.wage;
      setMorale(p, moraleOf(p) + 15);
      ctx.push('good', `${p.name} ganhou aumento: agora recebe ${fmt(d.wage)}/mês.`);
    } else {
      setMorale(p, moraleOf(p) - 20);
      ctx.push('bad', `Aumento negado. ${p.name} ficou insatisfeito.`);
    }
    return null;
  }

  // renovação
  if (choice === 'accept') {
    p.wage = d.wage;
    p.contractUntil = ctx.year + d.years;
    p.leaving = false;
    setMorale(p, moraleOf(p) + 10);
    ctx.push('good', `${p.name} renovou até ${p.contractUntil} (${fmt(d.wage)}/mês).`);
  } else {
    p.leaving = true;
    ctx.push('info', `${p.name} não vai renovar e deixa o clube ao fim da temporada.`);
  }
  return null;
}

export interface AuctionResult { name: string; fee: number; buyer: string | null }

/**
 * Fim de temporada, antes de renovar contratos: quem não renovou vai a leilão
 * (como no Elifoot). Rende pouco: 25% a 45% do valor, pago pelo clube que leva.
 */
export function releaseLeavers(clubs: Record<string, Club>, me: string, year: number, rng: Rng, humans: string[] = [me]): AuctionResult[] {
  const club = clubs[me];
  if (!club) return [];
  const out: AuctionResult[] = [];
  for (const p of [...club.players]) {
    if (!p.leaving || p.clubLocked || !expiresThisSeason(p, year)) continue;
    club.players = club.players.filter((x) => x.id !== p.id);
    if (club.lineup) club.lineup = { xi: club.lineup.xi.filter((x) => x !== p.id), bench: club.lineup.bench.filter((x) => x !== p.id) };
    delete p.morale; delete p.raiseAskedOn; delete p.renewalAsked; delete p.leaving;
    const fee = round1000(playerValue(p) * (0.25 + rng.next() * 0.2));
    const bidders = Object.values(clubs).filter((c) => !humans.includes(c.id) && c.players.length < 28 && c.budget >= fee * 1.2);
    if (fee > 0 && bidders.length) {
      const buyer = rng.weighted(bidders, (c) => c.reputation + 10);
      buyer.budget -= fee;
      club.budget += fee;
      p.joinedOn = undefined;
      buyer.players.push(p);
      out.push({ name: p.name, fee, buyer: buyer.name });
      continue;
    }
    // ninguém deu lance: sai de graça para quem tiver vaga
    const dest = Object.values(clubs).filter((c) => !humans.includes(c.id) && c.players.length < 28);
    if (dest.length) rng.pick(dest).players.push(p);
    out.push({ name: p.name, fee: 0, buyer: null });
  }
  return out;
}

// ---------------------------------------------------------------- mercado entre clubes da IA

/** Negociação entre dois clubes da IA (registro para a tela de mercado e as notícias). */
export interface AiTransfer {
  date: IsoDate;
  playerName: string;
  position: Position;
  ovr: number;
  age: number;
  from: string;
  to: string;
  fee: number;
}

/** Quantos titulares cada posição tem num 4-4-2 (referência para achar a carência). */
const STARTERS: Record<Position, number> = { GK: 1, DF: 4, MF: 4, FW: 2 };

/** Posição mais fraca do time: o pior titular de cada posição, comparado. */
export function weakestSpot(club: Club): { position: Position; ovr: number } {
  let worst: { position: Position; ovr: number } = { position: 'FW', ovr: Infinity };
  for (const pos of ['GK', 'DF', 'MF', 'FW'] as Position[]) {
    const ovrs = club.players.filter((p) => p.position === pos && !p.leaving).map(overall).sort((a, b) => b - a);
    const nth = ovrs[STARTERS[pos] - 1] ?? 0;
    if (nth < worst.ovr) worst = { position: pos, ovr: nth };
  }
  return worst;
}

/**
 * Clubes da IA também se reforçam: um clube com caixa procura alguém melhor que o
 * pior titular da posição mais carente e paga o valor de mercado (+0–30%) a outro
 * clube da IA. Mais movimento na pré-temporada; o clube do jogador fica de fora.
 */
export function aiTransferDay(ctx: MarketCtx, rng: Rng): AiTransfer | null {
  if (ctx.phase !== 'pre-temporada' && ctx.phase !== 'temporada') return null;
  if (!rng.chance(ctx.phase === 'pre-temporada' ? 0.3 : 0.06)) return null;
  const ai = Object.values(ctx.clubs).filter((c) => c.id !== ctx.me && !ctx.humans?.includes(c.id));
  const buyers = ai.filter((c) => c.budget > 60000 && c.players.length < 28);
  if (!buyers.length) return null;
  const buyer = rng.weighted(buyers, (c) => c.budget);
  const need = weakestSpot(buyer);
  const limit = buyer.budget * 0.6;
  const targets = ai
    .filter((s) => s.id !== buyer.id)
    .flatMap((s) => {
      const atPos = s.players.filter((p) => p.position === need.position).length;
      if (atPos <= (need.position === 'GK' ? 2 : 3)) return [];
      return s.players
        .filter((p) => p.position === need.position && !p.clubLocked && !p.leaving && canLose(s, p) && overall(p) >= need.ovr + 2)
        .filter((p) => playerValue(p) > 0 && playerValue(p) * 1.15 <= limit)
        .map((p) => ({ p, s }));
    });
  if (!targets.length) return null;
  // clube grande compra de clube menor; quem está no vermelho vende mais fácil
  const { p, s } = rng.weighted(targets, ({ p, s }) =>
    (overall(p) - need.ovr) * (1 + Math.max(0, buyer.reputation - s.reputation) / 20) * (s.budget < 0 ? 2 : 1));
  const fee = round1000(playerValue(p) * (1 + rng.next() * 0.3));
  if (fee <= 0 || fee > buyer.budget) return null;
  buyer.budget -= fee;
  s.budget += fee;
  s.players = s.players.filter((x) => x.id !== p.id);
  if (s.lineup) s.lineup = { xi: s.lineup.xi.filter((x) => x !== p.id), bench: s.lineup.bench.filter((x) => x !== p.id) };
  p.wage = round100(Math.max(p.wage, wageFor(p)) * 1.1);
  p.contractUntil = Math.max(p.contractUntil, ctx.year + 2 + rng.int(0, 2));
  p.joinedOn = ctx.date;
  delete p.morale; delete p.raiseAskedOn; delete p.renewalAsked;
  buyer.players.push(p);
  return { date: ctx.date, playerName: p.name, position: p.position, ovr: overall(p), age: p.age, from: s.id, to: buyer.id, fee };
}
