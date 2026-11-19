import { Rng } from '../core/rng';
import type { Result } from '../core/league';
import {
  createSeason,
  divisionStandings,
  isSeasonOver,
  promoteAndRelegate,
  type Season,
} from '../core/season';
import { developAfterRound, endOfSeason } from '../sports/football/development';
import { football, type FootballOutcome } from '../sports/football/engine';
import { generateWorld, playerValue } from '../sports/football/generate';
import type { Club, Player } from '../sports/football/types';

export const SAVE_VERSION = 1;

export interface RoundReport {
  round: number;
  matches: { divisionIndex: number; home: string; away: string; outcome: FootballOutcome }[];
  finance?: { income: number; wages: number };
}

export interface Career {
  version: number;
  seed: number;
  rngState: number;
  clubs: Record<string, Club>;
  season: Season;
  managerClubId: string;
  lastReport?: RoundReport;
  history: { year: number; division: number; position: number }[];
  news: string[];
}

export function newCareer(seed: number): Career {
  const rng = new Rng(seed);
  const world = generateWorld(rng);
  const clubs: Record<string, Club> = {};
  for (const div of world) for (const c of div) clubs[c.id] = c;
  const season = createSeason(2027, world.map((d) => d.map((c) => c.id)));
  return {
    version: SAVE_VERSION,
    seed,
    rngState: rng.snapshot,
    clubs,
    season,
    managerClubId: world[world.length - 1]![0]!.id,
    history: [],
    news: ['Bem-vindo! Você assumiu um clube da última divisão. Objetivo: subir.'],
  };
}

export function divisionOf(career: Career, clubId: string): number {
  return career.season.divisions.findIndex((d) => d.teamIds.includes(clubId));
}

export const divisionLevel = (d: number) => 72 - d * 9;

/** Joga a próxima rodada de todas as divisões. Muta e devolve a carreira. */
export function playRound(career: Career): RoundReport {
  if (isSeasonOver(career.season)) throw new Error('Temporada encerrada — chame finishSeason()');
  const rng = new Rng(career.rngState);
  const r = career.season.round;
  const report: RoundReport = { round: r + 1, matches: [] };

  career.season.divisions.forEach((div, di) => {
    const fixtures = div.rounds[r] ?? [];
    const results: Result[] = [];
    for (const f of fixtures) {
      const home = career.clubs[f.home]!;
      const away = career.clubs[f.away]!;
      if (f.home !== career.managerClubId && f.away !== career.managerClubId) {
        aiPrepare(home);
        aiPrepare(away);
      }
      const outcome = football.simulateMatch(home, away, rng) as FootballOutcome;
      results.push({ ...f, homeScore: outcome.homeScore, awayScore: outcome.awayScore });
      report.matches.push({ divisionIndex: di, home: f.home, away: f.away, outcome });

      applyDiscipline(home, outcome, 'home');
      applyDiscipline(away, outcome, 'away');
      developAfterRound(home, new Set(outcome.homeXI), rng);
      developAfterRound(away, new Set(outcome.awayXI), rng);
      const fin = settleFinances(home, away, di);
      if (f.home === career.managerClubId) report.finance = { income: fin.income, wages: fin.homeWages };
      if (f.away === career.managerClubId) report.finance = { income: fin.awayIncome, wages: fin.awayWages };
    }
    div.results.push(results);
  });

  career.season.round++;
  career.rngState = rng.snapshot;
  career.lastReport = report;
  return report;
}

function applyDiscipline(club: Club, o: FootballOutcome, side: 'home' | 'away') {
  for (const e of o.events) {
    if (e.side === side && e.type === 'red') {
      const p = club.players.find((x) => x.id === e.playerId);
      if (p) p.suspendedRounds = 1;
    }
  }
}

/** Cota de TV por rodada, por divisão. */
const TV_QUOTA = [90000, 45000, 22000, 10000];

function settleFinances(home: Club, away: Club, division: number) {
  const demand = home.fans * (1 + (away.fans / (home.fans + away.fans)) * 0.5);
  // elasticidade: ingresso caro esvazia o estádio
  const attendance = Math.min(home.stadium, Math.round(demand * (30 / (home.ticketPrice + 20))));
  const tv = TV_QUOTA[division] ?? 10000;
  const income = attendance * home.ticketPrice + tv;
  const homeWages = home.players.reduce((a, p) => a + p.wage, 0);
  const awayWages = away.players.reduce((a, p) => a + p.wage, 0);
  const awayIncome = tv;
  home.budget += income - homeWages;
  away.budget += awayIncome - awayWages;
  return { income, awayIncome, homeWages, awayWages };
}

/** IA simples: escolhe estilo pelo equilíbrio do elenco. */
function aiPrepare(club: Club) {
  const fw = club.players.filter((p) => p.position === 'FW' && p.suspendedRounds <= 0).length;
  club.formation = fw >= 3 ? '4-3-3' : '4-4-2';
}

export function finishSeason(career: Career) {
  const rng = new Rng(career.rngState);
  const pts = football.points;
  const mine = divisionOf(career, career.managerClubId);
  const table = divisionStandings(career.season.divisions[mine]!, pts);
  const pos = table.findIndex((r) => r.teamId === career.managerClubId) + 1;
  career.history.push({ year: career.season.year, division: mine + 1, position: pos });

  career.season.divisions.forEach((d, di) => {
    const champ = divisionStandings(d, pts)[0]!;
    career.news.unshift(`${career.season.year}: ${career.clubs[champ.teamId]!.name} campeão da Divisão ${di + 1}.`);
    for (const id of d.teamIds) endOfSeason(career.clubs[id]!, divisionLevel(di), rng);
  });

  const next = promoteAndRelegate(career.season, pts);
  const newDiv = next.findIndex((d) => d.includes(career.managerClubId));
  if (newDiv < mine) career.news.unshift(`🎉 Acesso! Você subiu para a Divisão ${newDiv + 1}.`);
  if (newDiv > mine) career.news.unshift(`Rebaixado para a Divisão ${newDiv + 1}.`);

  career.season = createSeason(career.season.year + 1, next);
  career.rngState = rng.snapshot;
  career.lastReport = undefined;
}

// ---------- Mercado ----------

export interface Listing {
  player: Player;
  clubId: string;
  price: number;
}

export function marketListings(career: Career, limit = 40): Listing[] {
  const rng = new Rng(career.seed ^ (career.season.year * 97 + career.season.round));
  const all: Listing[] = [];
  for (const club of Object.values(career.clubs)) {
    if (club.id === career.managerClubId) continue;
    for (const p of club.players) all.push({ player: p, clubId: club.id, price: Math.round(playerValue(p) * 1.25) });
  }
  return rng.shuffle(all).slice(0, limit).sort((a, b) => b.price - a.price);
}

export function buyPlayer(career: Career, playerId: string, fromClubId: string): string | null {
  const me = career.clubs[career.managerClubId]!;
  const seller = career.clubs[fromClubId];
  const p = seller?.players.find((x) => x.id === playerId);
  if (!seller || !p) return 'Jogador indisponível.';
  if (me.players.length >= 26) return 'Elenco cheio (máx. 26).';
  if (seller.players.filter((x) => x.position === p.position).length <= (p.position === 'GK' ? 1 : 3))
    return `${seller.name} não libera: está sem reposição nessa posição.`;
  const price = Math.round(playerValue(p) * 1.25);
  if (me.budget < price) return 'Dinheiro insuficiente.';
  me.budget -= price;
  seller.budget += price;
  seller.players = seller.players.filter((x) => x.id !== playerId);
  me.players.push(p);
  career.news.unshift(`Contratado: ${p.name} (${seller.name}).`);
  return null;
}

export function sellPlayer(career: Career, playerId: string): string | null {
  const me = career.clubs[career.managerClubId]!;
  const p = me.players.find((x) => x.id === playerId);
  if (!p) return 'Jogador não encontrado.';
  if (me.players.length <= 16) return 'Elenco mínimo é 16.';
  if (p.position === 'GK' && me.players.filter((x) => x.position === 'GK').length <= 1) return 'Você precisa de um goleiro.';
  const buyers = Object.values(career.clubs).filter((c) => c.id !== me.id && c.budget > playerValue(p));
  const buyer = buyers.sort((a, b) => b.budget - a.budget)[0];
  if (!buyer) return 'Nenhum clube pode pagar.';
  const price = Math.round(playerValue(p) * 0.85);
  me.budget += price;
  buyer.budget -= price;
  me.players = me.players.filter((x) => x.id !== playerId);
  buyer.players.push(p);
  career.news.unshift(`Vendido: ${p.name} para ${buyer.name}.`);
  return null;
}
