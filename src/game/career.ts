import { addDays, dayOf, formatDate, monthOf, nextSunday, type IsoDate, type Phase } from '../core/calendar';
import {
  OBJECTIVE_LABEL,
  objectiveAchieved,
  type Bond,
  type Entrepreneur,
  type SeasonObjective,
} from '../core/entrepreneur';
import type { Result } from '../core/league';
import { Rng } from '../core/rng';
import { createSeason, divisionStandings, promoteAndRelegate, type Season } from '../core/season';
import { ATTR_SHORT, applyMatch, dailyTraining, endOfSeason, type TrainingGain } from '../sports/football/development';
import { createMatch, football, runToEnd, toOutcome, type FootballOutcome, type MatchState } from '../sports/football/engine';
import { ANDRE_ELIAS_ID, DIVISIONS, NOVA_IGUACU_ID, andreElias, capStars, divisionLevel, generateClub, generateWorld, playerValue } from '../sports/football/generate';
import { available, overall, pickLineup, starters } from '../sports/football/lineup';
import type { Club, Player, Work } from '../sports/football/types';
import { CONTINENTAL_SPOTS, advanceCup, aliveInCup, createContinental, createCup, cupIn, cupKind, cupName, cupPrizes, cupStages, currentTies, isCupDate, settleTie, shootout, stageName, tieOf, type Cup, type CupKind, type CupTie, type Shootout } from './cup';
import { FOREIGN_CLUBS, naturalize } from '../sports/football/nations';
import { aiTransferDay, marketDay, type AiTransfer, moraleAfterMatch, releaseLeavers, resolveDecision, type Decision, type DecisionChoice, type MarketCtx } from './market';

export const SAVE_VERSION = 2;
const SPORT = 'football';

export type NewsKind = 'info' | 'good' | 'bad' | 'match' | 'money' | 'training';

export interface News {
  date: IsoDate;
  kind: NewsKind;
  text: string;
  /** Multijogador: de qual técnico é a notícia (ausente = de todos). */
  owner?: number;
}

export interface PlayedMatch {
  divisionIndex: number;
  home: string;
  away: string;
  outcome: FootballOutcome;
  /** Pênaltis (só na copa, quando empata). */
  pens?: [number, number];
}

export interface RoundRecord {
  round: number;
  date: IsoDate;
  matches: PlayedMatch[];
  /** Fase da copa, quando a partida foi pela copa. */
  cup?: number;
  cupKind?: CupKind;
}

export interface Ledger {
  gate: number;
  tv: number;
  /** Patrocínio mensal (ausente em saves antigos). */
  sponsor?: number;
  prizes: number;
  sales: number;
  wages: number;
  purchases: number;
  management: number;
  /** Dinheiro recebido de empréstimo (ausente em saves antigos). */
  loanIn?: number;
  /** Obras de estádio e CT (ausente em saves antigos). */
  works?: number;
  /** Parcelas e quitação de empréstimo pagas (ausente em saves antigos). */
  loanPaid?: number;
}

/** Empréstimo bancário do clube do jogador: um por vez, parcelas fixas no dia 1. */
export interface Loan {
  principal: number;
  /** Juros totais do contrato (fração do principal). */
  rate: number;
  months: number;
  installment: number;
  monthsLeft: number;
  takenOn: IsoDate;
}

export interface Offer {
  clubId: string;
  objective: SeasonObjective;
  monthlySalary: number;
}

/** Convite na janela do meio do campeonato: por mérito (bom turno) ou por crise (clube na zona). */
export interface MidOffer extends Offer {
  reason: 'merito' | 'crise';
  /** Posição do clube que convida, no momento da janela. */
  clubPosition: number;
}

export interface MidSeasonWindow {
  year: number;
  /** Sua posição ao fim do turno. */
  position: number;
  offers: MidOffer[];
  /** true enquanto aguarda a sua resposta (pausa o tempo). */
  open: boolean;
}

/** Custo de aceitar no meio do campeonato e prêmio por recusar. */
export const MID_SEASON = { fineSalaries: 2, leaveReputation: 3, stayReputation: 2 };

export interface SeasonAward {
  year: number;
  division: number;
  championId: string;
  championName: string;
  topScorer?: { name: string; club: string; goals: number };
}

export interface Career {
  version: number;
  seed: number;
  rngState: number;
  date: IsoDate;
  phase: Phase;
  entrepreneur: Entrepreneur;
  clubs: Record<string, Club>;
  season: Season;
  roundDates: IsoDate[];
  lastRound?: RoundRecord;
  news: News[];
  ledger: Ledger;
  offers: Offer[];
  /** true quando o empreendedor está sem organização (demitido) e precisa escolher uma oferta. */
  unemployed: boolean;
  awards: SeasonAward[];
  /** Assistente faz substituições por cansaço na partida do jogador (delegação simples, GDD 2.3). */
  autoSubs: boolean;
  /** Mercado vivo: propostas, pedidos de aumento e renovações esperando resposta (ausente em saves antigos). */
  decisions?: Decision[];
  loan?: Loan;
  /** Meses seguidos fechando com o caixa negativo (ausente = 0). */
  monthsInRed?: number;
  /** Janela do meio do campeonato (fim do 1º turno), ausente fora dela. */
  midSeason?: MidSeasonWindow;
  /**
   * Multijogador local: estado guardado de cada técnico. O técnico da vez (`active`)
   * fica "carregado" nos campos de cima (entrepreneur, ledger, decisions...); os
   * outros esperam aqui. Ausente = um jogador só.
   */
  managers?: Manager[];
  active?: number;
  /** Copa da temporada (ausente em saves antigos até a próxima temporada). */
  cup?: Cup;
  /** Taça Continental da temporada (ausente em saves antigos até a próxima temporada). */
  continental?: Cup;
  /** Últimas negociações entre clubes da IA (mais recente primeiro). */
  transfers?: AiTransfer[];
}

// ---------------------------------------------------------------- criação

export type ChallengeType = 'baixo' | 'crescimento' | 'pressao';

export const CHALLENGES: Record<ChallengeType, { title: string; text: string; divisions: number[]; reputation: number }> = {
  baixo: { title: 'Começar de baixo', text: 'Poucos recursos, estrutura limitada e baixa reputação.', divisions: [3], reputation: 8 },
  crescimento: { title: 'Buscar crescimento', text: 'Organização estruturada, com espaço para evoluir.', divisions: [2, 1], reputation: 25 },
  pressao: { title: 'Administrar a pressão', text: 'Clube de ponta, recursos maiores e expectativa alta.', divisions: [0], reputation: 45 },
};

export function newWorld(seed: number, entrepreneurName = 'Você'): Career {
  const rng = new Rng(seed);
  const world = generateWorld(rng);
  const clubs: Record<string, Club> = {};
  for (const div of world) for (const c of div) clubs[c.id] = c;
  const year = 2027;
  const divisions = world.map((d) => d.map((c) => c.id));
  for (const f of generateForeignClubs(new Rng((seed ^ 0x2f6b) >>> 0))) clubs[f.id] = f;
  const dates = roundDates(year);
  return {
    version: SAVE_VERSION,
    seed,
    rngState: rng.snapshot,
    date: `${year}-01-04`,
    phase: 'pre-temporada',
    entrepreneur: { name: entrepreneurName, cash: 50000, reputation: 10, experience: 0, bonds: [], history: [] },
    clubs,
    season: createSeason(year, divisions),
    roundDates: dates,
    cup: createCup(year, divisions, clubs, dates, cupRng(seed, year)),
    continental: createContinental(year, continentalEntrants(clubs, divisions[0]!.slice().sort((a, b) => clubs[b]!.reputation - clubs[a]!.reputation)), dates, cupRng(seed, year + 7)),
    news: [],
    ledger: emptyLedger(),
    offers: [],
    unemployed: true,
    awards: [],
    autoSubs: true,
    decisions: [],
  };
}

/** Rodadas quinzenais aos domingos, de fevereiro a novembro. */
export function roundDates(year: number, rounds = 22): IsoDate[] {
  const first = nextSunday(`${year}-02-01`);
  return Array.from({ length: rounds }, (_, i) => addDays(first, i * 14));
}

/** Os 12 clubes estrangeiros da Taça Continental (fictícios, elenco do próprio país). */
function generateForeignClubs(rng: Rng): Club[] {
  const out: Club[] = [];
  let k = 0;
  for (const f of FOREIGN_CLUBS) {
    f.cities.forEach((city, i) => {
      const level = divisionLevel(0) - 1 + rng.gaussian() * 3;
      const club = generateClub(rng, city, level, FOREIGN_COLORS[k++ % FOREIGN_COLORS.length]!);
      const prefix = f.prefixes[i % f.prefixes.length]!;
      club.id = `cx-${f.country.toLowerCase()}-${i}`;
      club.name = `${prefix} ${city}`;
      club.short = (prefix[0]! + city.split(' ').filter((w) => w.length > 2).map((w) => w[0]).join('')).slice(0, 3).toUpperCase();
      club.stadiumName = `Estadio ${city}`;
      club.country = f.country;
      for (const p of club.players) naturalize(p, f.country, rng);
      capStars(club.players);
      out.push(club);
    });
  }
  return out;
}
const FOREIGN_COLORS: [string, string][] = [['#74acdf', '#ffffff'], ['#1c2c5b', '#e8b62c'], ['#c8323c', '#222222'], ['#ffffff', '#2f5fbf'], ['#2e8b4a', '#ffffff'], ['#e8b62c', '#1c2c5b'], ['#7a3fa0', '#ffffff'], ['#222222', '#e8b62c']];

export const isForeignClub = (club: Club | undefined) => !!club?.country;

/** Classificados do Brasil (já na ordem de prioridade) + todos os estrangeiros. */
function continentalEntrants(clubs: Record<string, Club>, ranking: string[]): string[] {
  return [...ranking.slice(0, CONTINENTAL_SPOTS), ...Object.values(clubs).filter((c) => c.country).map((c) => c.id)];
}

/** Sorteio da copa com RNG próprio: criar a copa não altera o resto da simulação. */
const cupRng = (seed: number, year: number) => new Rng((seed * 2654435761 + year * 40503) >>> 0);

const emptyLedger = (): Ledger => ({ gate: 0, tv: 0, sponsor: 0, prizes: 0, sales: 0, wages: 0, purchases: 0, management: 0, works: 0 });

export function divisionOf(c: Career, clubId: string): number {
  return c.season.divisions.findIndex((d) => d.teamIds.includes(clubId));
}

export function clubStrength(club: Club): number {
  const xi = starters(pickLineup(club));
  return xi.reduce((a, p) => a + overall(p), 0) / xi.length;
}

/** Objetivo definido pela diretoria a partir da força relativa do elenco. */
export function boardObjective(c: Career, clubId: string): SeasonObjective {
  const d = divisionOf(c, clubId);
  const ranked = c.season.divisions[d]!.teamIds
    .map((id) => ({ id, s: clubStrength(c.clubs[id]!) }))
    .sort((a, b) => b.s - a.s);
  const rank = ranked.findIndex((r) => r.id === clubId) + 1;
  const top = d === 0;
  const bottom = d === DIVISIONS - 1;
  if (rank === 1) return top ? 'titulo' : 'acesso';
  if (rank <= 3 && !top) return 'acesso';
  if (rank <= 6 || bottom) return 'meio';
  return 'permanencia';
}

const salaryFor = (club: Club) => Math.round((3000 + club.reputation ** 1.6 * 25) / 500) * 500;

export function challengeOptions(c: Career, type: ChallengeType, count = 4): Offer[] {
  const ids = CHALLENGES[type].divisions.flatMap((d) => c.season.divisions[d]!.teamIds);
  const sorted = ids
    .map((id) => c.clubs[id]!)
    .sort((a, b) => (type === 'pressao' ? clubStrength(b) - clubStrength(a) : a.reputation - b.reputation));
  const pool = type === 'crescimento' ? sorted.slice(Math.floor(sorted.length / 3)) : sorted;
  return pool.slice(0, count).map((club) => ({ clubId: club.id, objective: boardObjective(c, club.id), monthlySalary: salaryFor(club) }));
}

export function acceptOffer(c: Career, offer: Offer): string | null {
  const club = c.clubs[offer.clubId]!;
  const owner = managerOf(c, offer.clubId);
  if (owner >= 0 && owner !== activeIndex(c)) return `O ${club.name} já tem técnico.`;
  // a dívida é do clube antigo: o saldo restante é cobrado dele de uma vez
  const old = c.clubs[myClubId(c)];
  if (c.loan && old) old.budget -= c.loan.installment * c.loan.monthsLeft;
  c.loan = undefined;
  c.monthsInRed = 0;
  const bond: Bond = {
    orgId: club.id,
    sport: SPORT,
    type: 'contratado',
    share: 0,
    monthlySalary: offer.monthlySalary,
    since: c.date,
    objective: offer.objective,
  };
  c.entrepreneur.bonds = [bond];
  c.unemployed = false;
  c.offers = [];
  c.decisions = [];
  c.ledger = emptyLedger();
  push(c, 'good', `Você assumiu o ${club.name}. Objetivo da diretoria: ${OBJECTIVE_LABEL[offer.objective].toLowerCase()}.`);
  return null;
}

export function startCareer(seed: number, name: string, type: ChallengeType, clubId: string): Career {
  const c = newWorld(seed, name);
  c.entrepreneur.reputation = CHALLENGES[type].reputation;
  const offer = challengeOptions(c, type, 12).find((o) => o.clubId === clubId) ?? {
    clubId,
    objective: boardObjective(c, clubId),
    monthlySalary: salaryFor(c.clubs[clubId]!),
  };
  acceptOffer(c, offer);
  return c;
}

/**
 * Toda carreira tem o Nova Iguaçu na elite com o André Elias. Saves criados antes
 * dessa regra ganham os dois ao abrir: o clube mais forte da Divisão 1 que não é
 * de um técnico humano vira o Nova Iguaçu (o id é trocado em todo o save) e recebe
 * o André no lugar do atacante mais fraco. Devolve o próprio save quando nada muda.
 */
export function withNovaIguacu(c: Career): Career {
  const hasClub = !!c.clubs[NOVA_IGUACU_ID];
  const hasAndre = Object.values(c.clubs).some((cl) => cl.players.some((p) => p.id === ANDRE_ELIAS_ID));
  if (hasClub && hasAndre) return c;
  let out = c;
  if (!hasClub) {
    const humans = new Set(Array.from({ length: c.managers?.length ?? 1 }, (_, i) =>
      (i === (c.active ?? 0) || !c.managers ? c.entrepreneur : c.managers[i]!.entrepreneur).bonds[0]?.orgId));
    const elite = c.season.divisions[0]?.teamIds ?? [];
    const target = elite.filter((id) => !humans.has(id)).sort((a, b) => clubStrength(c.clubs[b]!) - clubStrength(c.clubs[a]!))[0];
    if (!target) return c;
    // ids de clube são únicos no save inteiro: trocar o texto renomeia tabela, copas, prêmios e histórico de uma vez
    out = JSON.parse(JSON.stringify(c).split(`"${target}"`).join(`"${NOVA_IGUACU_ID}"`)) as Career;
    const ni = out.clubs[NOVA_IGUACU_ID]!;
    ni.name = 'Nova Iguaçu';
    ni.short = 'NIG';
    ni.city = 'Nova Iguaçu';
    ni.colors = ['#e5762a', '#ffb04d'];
    ni.stadiumName = 'Estádio de Nova Iguaçu';
    ni.reputation = Math.max(ni.reputation, 95);
  }
  if (!Object.values(out.clubs).some((cl) => cl.players.some((p) => p.id === ANDRE_ELIAS_ID))) {
    const ni = out.clubs[NOVA_IGUACU_ID]!;
    const andre = andreElias(new Rng((out.seed ^ 0xa11d) >>> 0), out.season.year);
    andre.age = Math.max(26, andre.age);
    const fws = ni.players.filter((p) => p.position === 'FW').sort((a, b) => overall(a) - overall(b));
    const out1 = fws[0];
    ni.players = out1 ? ni.players.map((p) => (p.id === out1.id ? andre : p)) : [...ni.players, andre];
    if (ni.lineup && out1) ni.lineup = { xi: ni.lineup.xi.filter((x) => x !== out1.id), bench: ni.lineup.bench.filter((x) => x !== out1.id) };
  }
  return out;
}

export const activeBond = (c: Career): Bond | undefined => c.entrepreneur.bonds[0];
export const myClubId = (c: Career): string => activeBond(c)?.orgId ?? '';

// ---------------------------------------------------------------- multijogador local

/** O que é de cada técnico (o resto do mundo é compartilhado). */
export interface Manager {
  entrepreneur: Entrepreneur;
  ledger: Ledger;
  offers: Offer[];
  unemployed: boolean;
  autoSubs: boolean;
  decisions?: Decision[];
  loan?: Loan;
  monthsInRed?: number;
  midSeason?: MidSeasonWindow;
}

const MANAGER_KEYS = ['entrepreneur', 'ledger', 'offers', 'unemployed', 'autoSubs', 'decisions', 'loan', 'monthsInRed', 'midSeason'] as const;
export const MAX_MANAGERS = 4;

function snapshotManager(c: Career): Manager {
  const m = {} as Record<string, unknown>;
  for (const k of MANAGER_KEYS) if (c[k] !== undefined) m[k] = c[k];
  return m as unknown as Manager;
}

function loadManager(c: Career, m: Manager) {
  const target = c as unknown as Record<string, unknown>;
  for (const k of MANAGER_KEYS) {
    const v = (m as unknown as Record<string, unknown>)[k];
    if (v === undefined) delete target[k]; else target[k] = v;
  }
}

export const managerCount = (c: Career) => c.managers?.length ?? 1;
export const isMultiplayer = (c: Career) => managerCount(c) > 1;
export const activeIndex = (c: Career) => c.active ?? 0;

/** Passa a vez: guarda o técnico atual e carrega o técnico `i`. */
export function switchManager(c: Career, i: number) {
  if (!c.managers || i === activeIndex(c)) return;
  c.managers[activeIndex(c)] = snapshotManager(c);
  loadManager(c, c.managers[i]!);
  c.active = i;
}

/** Estado de um técnico sem trocar a vez (o da vez vem dos campos de cima). */
export function managerState(c: Career, i: number): Manager {
  return i === activeIndex(c) || !c.managers ? snapshotManager(c) : c.managers[i]!;
}

/** Clube de cada técnico ('' = sem clube). */
export function managerClubs(c: Career): string[] {
  return Array.from({ length: managerCount(c) }, (_, i) => managerState(c, i).entrepreneur.bonds[0]?.orgId ?? '');
}

/** Índice do técnico humano que dirige o clube, ou -1 (IA). */
export const managerOf = (c: Career, clubId: string) => (clubId ? managerClubs(c).indexOf(clubId) : -1);
export const isHumanClub = (c: Career, clubId: string) => managerOf(c, clubId) >= 0;

/** De quem são as notícias publicadas agora: índice, null (todos) ou undefined (o da vez). */
let newsOwner: number | null | undefined;

/** Roda `fn` como se fosse a vez do técnico `i` e volta para quem estava. */
export function withManager<T>(c: Career, i: number, fn: () => T): T {
  const prev = activeIndex(c);
  const prevOwner = newsOwner;
  switchManager(c, i);
  newsOwner = i;
  try { return fn(); } finally { newsOwner = prevOwner; switchManager(c, prev); }
}

/** Roda `fn` para cada técnico humano, na vez de cada um. */
export function forEachManager(c: Career, fn: (i: number) => void) {
  for (let i = 0; i < managerCount(c); i++) withManager(c, i, () => fn(i));
}

/** Notícias publicadas dentro de `fn` são de todos (resultados gerais, campeões...). */
function asGlobal<T>(fn: () => T): T {
  const prev = newsOwner;
  newsOwner = null;
  try { return fn(); } finally { newsOwner = prev; }
}

/** Notícias que o técnico da vez enxerga: as dele e as de todos. */
export function visibleNews(c: Career): News[] {
  const me = activeIndex(c);
  return c.news.filter((n) => n.owner === undefined || n.owner === me);
}

/** Algum técnico precisa decidir algo (proposta, janela, emprego)? Devolve o índice. */
export function managerNeedingAttention(c: Career): number {
  for (let i = 0; i < managerCount(c); i++) {
    const need = withManager(c, i, () => c.unemployed || !!c.midSeason?.open || !!pendingDecision(c));
    if (need) return i;
  }
  return -1;
}

export interface NewManager { name: string; type: ChallengeType; clubId: string }

/** Carreira com 2 a 4 técnicos no mesmo aparelho, cada um no seu clube. */
export function startMultiCareer(seed: number, players: NewManager[]): Career {
  if (players.length < 1 || players.length > MAX_MANAGERS) throw new Error('De 1 a 4 técnicos');
  if (new Set(players.map((x) => x.clubId)).size !== players.length) throw new Error('Cada técnico precisa de um clube diferente');
  const c = newWorld(seed, players[0]!.name);
  c.managers = players.map((pl) => ({
    entrepreneur: { name: pl.name, cash: 50000, reputation: CHALLENGES[pl.type].reputation, experience: 0, bonds: [], history: [] },
    ledger: emptyLedger(), offers: [], unemployed: true, autoSubs: true, decisions: [],
  }));
  c.active = 0;
  loadManager(c, c.managers[0]!);
  players.forEach((pl, i) => withManager(c, i, () => {
    const offer = challengeOptions(c, pl.type, 12).find((o) => o.clubId === pl.clubId) ?? {
      clubId: pl.clubId, objective: boardObjective(c, pl.clubId), monthlySalary: salaryFor(c.clubs[pl.clubId]!),
    };
    acceptOffer(c, offer);
  }));
  return c;
}

function push(c: Career, kind: NewsKind, text: string) {
  const owner = !isMultiplayer(c) ? undefined : newsOwner === undefined ? activeIndex(c) : newsOwner ?? undefined;
  c.news.unshift(owner === undefined ? { date: c.date, kind, text } : { date: c.date, kind, text, owner });
  if (c.news.length > 200) c.news.length = 200;
}

// ---------------------------------------------------------------- mercado vivo

function marketCtx(c: Career): MarketCtx {
  c.decisions ??= [];
  return {
    date: c.date,
    year: c.season.year,
    phase: c.phase,
    clubs: c.clubs,
    me: myClubId(c),
    humans: managerClubs(c).filter(Boolean),
    since: activeBond(c)?.since,
    decisions: c.decisions,
    push: (kind, text) => push(c, kind, text),
    addSale: (fee) => { c.ledger.sales += fee; },
  };
}

/** Decisão pendente mais antiga (propostas, aumento, renovação). A interface pausa o tempo enquanto houver. */
export function pendingDecision(c: Career): Decision | undefined {
  const club = c.clubs[myClubId(c)];
  // descarta decisões sobre atletas que já saíram
  if (c.decisions && club) c.decisions = c.decisions.filter((d) => club.players.some((p) => p.id === d.playerId));
  return c.decisions?.[0];
}

export function decide(c: Career, id: string, choice: DecisionChoice): string | null {
  return resolveDecision(marketCtx(c), id, choice);
}

// ---------------------------------------------------------------- tempo

export type PauseReason = 'match' | 'season-end' | 'unemployed' | 'event';

export interface DayReport {
  date: IsoDate;
  gains: TrainingGain[];
  news: News[];
  pause?: PauseReason;
}

/** Dia de copa com o seu clube ainda vivo (se já caiu, os jogos rodam sozinhos). */
export const cupsOf = (c: Career): Cup[] => [c.cup, c.continental].filter((x): x is Cup => !!x);
/** Competição de mata-mata com jogos hoje (as datas nunca coincidem). */
export const cupToday = (c: Career): Cup | undefined => (c.phase === 'temporada' ? cupsOf(c).find((x) => isCupDate(x, c.date)) : undefined);
/** Dia de copa com algum técnico humano vivo (senão os jogos rodam sozinhos). */
export const isCupDay = (c: Career) => { const cup = cupToday(c); return !!cup && managerClubs(c).some((id) => aliveInCup(cup, id)); };
const cupByKind = (c: Career, kind: CupKind | undefined) => (kind === 'continental' ? c.continental : c.cup)!;

/** Próximo jogo de mata-mata do seu clube (a copa que vier primeiro). */
export function nextCupMatch(c: Career): { cup: Cup; tie: CupTie; date: IsoDate } | undefined {
  if (c.phase === 'encerramento' || c.unemployed) return undefined;
  const me = myClubId(c);
  return cupsOf(c)
    .filter((cup) => aliveInCup(cup, me))
    .map((cup) => ({ cup, tie: tieOf(cup, me)!, date: cup.dates[cup.round]! }))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}
export const isMatchDay = (c: Career) => (c.phase === 'temporada' && c.roundDates[c.season.round] === c.date) || isCupDay(c);

/**
 * Avança um dia. Não avança em dia de jogo: o jogador precisa disputar
 * (ou simular) a rodada via `prepareRound` + `completeRound`.
 */
export function advanceDay(c: Career): DayReport {
  if (anyUnemployed(c)) return { date: c.date, gains: [], news: [], pause: 'unemployed' };
  if (c.phase === 'encerramento') return { date: c.date, gains: [], news: [], pause: 'season-end' };
  if (isMatchDay(c)) return { date: c.date, gains: [], news: [], pause: 'match' };
  return asGlobal(() => {
    const before = c.news.length;
    const rng = new Rng(c.rngState);
    c.date = addDays(c.date, 1);
    const me = myClubId(c);
    const humans = managerClubs(c);
    const gainsBy: Record<string, TrainingGain[]> = {};

    for (const club of Object.values(c.clubs)) {
      const g = dailyTraining(club, rng);
      if (humans.includes(club.id)) gainsBy[club.id] = g;
    }
    forEachManager(c, () => {
      const mine = myClubId(c);
      for (const g of gainsBy[mine] ?? []) {
        // destaques raros viram notícia; o resto aparece só como "+1" no CT
        const p = c.clubs[mine]!.players.find((x) => x.id === g.playerId);
        if (p && p.age <= 21 && overall(p) >= 65 && rng.chance(0.15)) push(c, 'training', `${p.name} (${p.age}) se destaca nos treinos.`);
      }
    });

    if (dayOf(c.date) === 1) monthly(c);
    finishWorks(c);
    // copa sem nenhum técnico humano vivo: a fase roda sozinha e vira notícia
    const today = cupToday(c);
    if (today && !humans.some((id) => aliveInCup(today, id))) finishCupRound(c, today, currentTies(today).map((t) => playAiCup(c, t, rng)), rng);
    forEachManager(c, () => marketDay(marketCtx(c), rng));
    const t = aiTransferDay(marketCtx(c), rng);
    if (t) logTransfer(c, t);
    if (c.phase === 'pre-temporada' && c.date >= addDays(c.roundDates[0]!, -6)) {
      c.phase = 'temporada';
      push(c, 'info', `Começa a temporada ${c.season.year}! Primeira rodada: ${formatDate(c.roundDates[0]!)}.`);
    }
    if (c.phase === 'entressafra' && c.date >= `${c.season.year}-01-01`) {
      c.phase = 'pre-temporada';
      push(c, 'info', `Pré-temporada ${c.season.year}: hora de reforçar o elenco.`);
    }

    c.rngState = rng.snapshot;
    const fresh = c.news.slice(0, c.news.length - before);
    return { date: c.date, gains: gainsBy[me] ?? [], news: fresh, pause: isMatchDay(c) ? 'match' : undefined };
  });
}

/** Algum técnico está sem clube (o tempo espera ele escolher uma proposta). */
export function anyUnemployed(c: Career): boolean {
  for (let i = 0; i < managerCount(c); i++) if (managerState(c, i).unemployed) return true;
  return false;
}

const TV_MONTHLY = [170000, 85000, 42000, 19000];
/** Patrocínio mensal por divisão: a folga que paga contratações e aumentos nas divisões de baixo. */
const SPONSOR_MONTHLY = [20000, 26000, 26000, 22000];

/** Receitas fixas do mês (TV + patrocínio) de um clube. */
export function fixedMonthlyIncome(c: Career, clubId: string) {
  // estrangeiro recebe como clube de elite
  const d = c.clubs[clubId]?.country ? 0 : divisionOf(c, clubId);
  return { tv: TV_MONTHLY[d] ?? 10000, sponsor: SPONSOR_MONTHLY[d] ?? 15000 };
}

/**
 * Previsão de um mês típico de temporada para o clube do jogador:
 * receitas fixas + um jogo em casa − folha − salário do gestor.
 */
export function monthlyForecast(c: Career) {
  const me = myClubId(c);
  const club = c.clubs[me]!;
  const { tv, sponsor } = fixedMonthlyIncome(c, me);
  const gate = lastAttendance(club, club) * club.ticketPrice;
  const wages = club.players.reduce((a, p) => a + p.wage, 0);
  const management = activeBond(c)?.monthlySalary ?? 0;
  const loan = c.loan?.installment ?? 0;
  const withGame = tv + sponsor + gate - wages - management - loan;
  return { tv, sponsor, gate, wages, management, loan, withGame, withoutGame: withGame - gate };
}

// ---------------------------------------------------------------- empréstimo

/** Prazos disponíveis e juros totais de cada um. */
export const LOAN_TERMS = [
  { months: 6, rate: 0.08 },
  { months: 12, rate: 0.18 },
] as const;

/** Limite: 4 meses de receita típica (TV, patrocínio e um jogo em casa). */
export function loanLimit(c: Career): number {
  const f = monthlyForecast(c);
  return Math.max(0, Math.floor(((f.tv + f.sponsor + f.gate) * 4) / 10000) * 10000);
}

export function loanQuote(principal: number, months: number) {
  const term = LOAN_TERMS.find((t) => t.months === months) ?? LOAN_TERMS[0];
  const total = Math.round(principal * (1 + term.rate));
  return { months: term.months, rate: term.rate, total, installment: Math.ceil(total / term.months / 100) * 100, interest: total - principal };
}

/** Saldo para quitar agora: parcelas restantes com 5% de desconto. */
export const loanPayoff = (loan: Loan) => Math.round((loan.installment * loan.monthsLeft * 0.95) / 100) * 100;

export function takeLoan(c: Career, principal: number, months: number): string | null {
  if (c.loan) return 'Já existe um empréstimo em aberto.';
  if (c.unemployed) return 'Sem clube no momento.';
  const limit = loanLimit(c);
  if (principal <= 0 || principal > limit) return `O banco libera no máximo ${fmtMoney(limit)}.`;
  const q = loanQuote(principal, months);
  const club = c.clubs[myClubId(c)]!;
  club.budget += principal;
  c.ledger.loanIn = (c.ledger.loanIn ?? 0) + principal;
  c.loan = { principal, rate: q.rate, months: q.months, installment: q.installment, monthsLeft: q.months, takenOn: c.date };
  push(c, 'money', `Empréstimo de ${fmtMoney(principal)} em ${q.months}x de ${fmtMoney(q.installment)}.`);
  return null;
}

export function payOffLoan(c: Career): string | null {
  const loan = c.loan;
  if (!loan) return 'Nenhum empréstimo em aberto.';
  const club = c.clubs[myClubId(c)]!;
  const amount = loanPayoff(loan);
  if (club.budget < amount) return 'Caixa insuficiente para quitar.';
  club.budget -= amount;
  c.ledger.loanPaid = (c.ledger.loanPaid ?? 0) + amount;
  c.loan = undefined;
  push(c, 'good', `Empréstimo quitado por ${fmtMoney(amount)}.`);
  return null;
}

/** Dia 1: desconta a parcela e acompanha meses seguidos no vermelho. */
function monthlyLoanAndRed(c: Career, club: Club) {
  const loan = c.loan;
  if (loan) {
    club.budget -= loan.installment;
    c.ledger.loanPaid = (c.ledger.loanPaid ?? 0) + loan.installment;
    loan.monthsLeft--;
    if (loan.monthsLeft <= 0) {
      c.loan = undefined;
      push(c, 'good', 'Última parcela paga: empréstimo quitado.');
    }
  }
  if (club.budget < 0) {
    const n = (c.monthsInRed ?? 0) + 1;
    c.monthsInRed = n;
    c.entrepreneur.reputation = Math.max(0, c.entrepreneur.reputation - 1);
    push(c, 'bad', n === 1
      ? `Caixa no vermelho (${fmtMoney(club.budget)}). A diretoria cobra uma solução.`
      : `${n}º mês seguido no vermelho. Se a temporada terminar com o caixa negativo, você será demitido.`);
  } else {
    c.monthsInRed = 0;
  }
}

function monthly(c: Career) {
  for (const club of Object.values(c.clubs)) {
    const wages = club.players.reduce((a, p) => a + p.wage, 0);
    const { tv, sponsor } = fixedMonthlyIncome(c, club.id);
    club.budget += tv + sponsor - wages;
    const owner = managerOf(c, club.id);
    if (owner >= 0) withManager(c, owner, () => {
      const bond = activeBond(c)!;
      club.budget -= bond.monthlySalary;
      c.entrepreneur.cash += bond.monthlySalary;
      c.ledger.tv += tv;
      c.ledger.sponsor = (c.ledger.sponsor ?? 0) + sponsor;
      c.ledger.wages += wages;
      c.ledger.management += bond.monthlySalary;
      monthlyLoanAndRed(c, club);
      const st = financialState(club);
      if (st === 'atencao') push(c, 'money', `Atenção: o caixa não cobre três meses de folha.`);
    });
  }
}

export type FinancialState = 'estavel' | 'atencao' | 'critica';

export function financialState(club: Club): FinancialState {
  const wages = club.players.reduce((a, p) => a + p.wage, 0);
  if (club.budget < 0) return 'critica';
  if (club.budget < wages * 3) return 'atencao';
  return 'estavel';
}

const fmtMoney = (v: number) => `$ ${v.toLocaleString('pt-BR')}`;

// ---------------------------------------------------------------- rodada

export interface PreparedRound {
  round: number;
  /** Partida do jogador, pronta para ser avançada minuto a minuto. */
  match: MatchState;
  /** Estado do RNG da partida do jogador logo após a criação (determinismo com intervenções). */
  matchRngState: number;
  /** Divisão da partida; -1 quando é pela copa. */
  myDivision: number;
  others: PlayedMatch[];
  /** Fase da copa, quando o jogo é pela copa. */
  cup?: number;
  cupKind?: CupKind;
  /** "Copa Mestres · Oitavas de final", para as telas da partida. */
  cupLabel?: string;
  /** Multijogador: técnico que comanda `match` (o mandante, se os dois forem humanos). */
  manager?: number;
  /** Multijogador: partidas dos outros técnicos, jogadas em seguida, uma de cada vez. */
  queue?: QueuedMatch[];
}

export interface QueuedMatch {
  manager: number;
  match: MatchState;
  matchRngState: number;
  division: number;
}

/** Partidas com técnico humano: cada uma com seu RNG, comandada por um técnico. */
function humanMatches(c: Career, fixtures: { home: string; away: string; div: number }[], rng: Rng): QueuedMatch[] {
  const list = fixtures.map((f) => {
    const mrng = new Rng(rng.int(0, 2 ** 31));
    const match = createMatch(c.clubs[f.home]!, c.clubs[f.away]!, mrng);
    if (f.div === -1) match.knockout = true; // copa: empate vai para a prorrogação
    for (const side of ['home', 'away'] as const) {
      const owner = managerOf(c, match[side].clubId);
      if (owner >= 0) match[side].autoSubs = managerState(c, owner).autoSubs;
    }
    const hm = managerOf(c, f.home);
    return { manager: hm >= 0 ? hm : managerOf(c, f.away), match, matchRngState: mrng.snapshot, division: f.div };
  });
  return list.sort((a, b) => a.manager - b.manager);
}

function fromQueue(base: PreparedRound, q: QueuedMatch[]): PreparedRound {
  const [first, ...rest] = q;
  return { ...base, match: first!.match, matchRngState: first!.matchRngState, myDivision: first!.division, manager: first!.manager, queue: rest };
}

/**
 * Multijogador: guarda o resultado da partida que acabou e devolve a próxima da fila
 * (a vez passa para o técnico dela), ou null quando todas foram jogadas.
 */
export function nextQueuedMatch(prep: PreparedRound, outcome: FootballOutcome): PreparedRound | null {
  if (!prep.queue?.length) return null;
  const sh = shootoutFor(prep, outcome);
  const played: PlayedMatch = { divisionIndex: prep.myDivision, home: prep.match.home.clubId, away: prep.match.away.clubId, outcome, pens: sh ? [sh.home, sh.away] : undefined };
  return fromQueue({ ...prep, others: [...prep.others, played] }, prep.queue);
}

/** Simula todas as partidas da rodada exceto a do jogador, que fica preparada. */
export function prepareRound(c: Career): PreparedRound {
  if (!isMatchDay(c)) throw new Error('Hoje não é dia de jogo');
  if (isCupDay(c)) return prepareCup(c);
  const rng = new Rng(c.rngState);
  const r = c.season.round;
  const humans = managerClubs(c);
  const others: PlayedMatch[] = [];
  const mine: { home: string; away: string; div: number }[] = [];

  c.season.divisions.forEach((div, di) => {
    for (const f of div.rounds[r] ?? []) {
      if (humans.includes(f.home) || humans.includes(f.away)) { mine.push({ ...f, div: di }); continue; }
      const home = c.clubs[f.home]!, away = c.clubs[f.away]!;
      aiPrepare(home); aiPrepare(away);
      const m = createMatch(home, away, rng);
      runToEnd(m, rng);
      others.push({ divisionIndex: di, home: f.home, away: f.away, outcome: toOutcome(m) });
    }
  });
  if (!mine.length) throw new Error('Clube do jogador sem partida na rodada');
  const q = humanMatches(c, mine, rng);
  c.rngState = rng.snapshot;
  return fromQueue({ round: r, match: q[0]!.match, matchRngState: 0, myDivision: 0, others }, q);
}

/** Consolida a rodada: resultados, finanças, condição, suspensões e avança o dia. */
export function completeRound(c: Career, prep: PreparedRound, mine: FootballOutcome): RoundRecord {
  if (prep.queue?.length) throw new Error('Ainda há partidas de outros técnicos para jogar');
  if (prep.cup !== undefined) return completeCup(c, prep, mine);
  return asGlobal(() => {
    const all: PlayedMatch[] = [
      ...prep.others,
      { divisionIndex: prep.myDivision, home: prep.match.home.clubId, away: prep.match.away.clubId, outcome: mine },
    ];
    const byDiv: Result[][] = c.season.divisions.map(() => []);
    const rng = new Rng(c.rngState);
    const gainsBy: Record<string, TrainingGain[]> = {};
    for (const m of all) {
      const o = m.outcome;
      byDiv[m.divisionIndex]!.push({ home: m.home, away: m.away, homeScore: o.homeScore, awayScore: o.awayScore });
      Object.assign(gainsBy, matchEffects(c, m, rng, true));
    }
    c.season.divisions.forEach((d, i) => d.results.push(byDiv[i]!));
    c.rngState = rng.snapshot;

    const record: RoundRecord = { round: prep.round + 1, date: c.date, matches: all };
    forEachManager(c, () => pushMyResult(c, all, gainsBy[myClubId(c)] ?? [], ''));

    c.season.round++;
    c.lastRound = record;
    if (c.season.round === Math.floor(c.roundDates.length / 2)) forEachManager(c, () => openMidSeasonWindow(c));
    if (c.season.round >= c.roundDates.length) {
      c.phase = 'encerramento';
      push(c, 'info', 'Fim da temporada! Hora do balanço.');
    } else {
      c.date = addDays(c.date, 1);
    }
    return record;
  });
}

/** Notícia do resultado do jogador e dos atletas que cresceram com a atuação. */
function pushMyResult(c: Career, all: PlayedMatch[], myGains: TrainingGain[], prefix: string) {
  const me = myClubId(c);
  const myMatch = all.find((m) => m.home === me || m.away === me);
  if (!myMatch) return;
  const myGoals = myMatch.home === me ? myMatch.outcome.homeScore : myMatch.outcome.awayScore;
  const theirGoals = myMatch.home === me ? myMatch.outcome.awayScore : myMatch.outcome.homeScore;
  const opp = c.clubs[myMatch.home === me ? myMatch.away : myMatch.home]!;
  const res = myGoals > theirGoals ? 'Vitória' : myGoals < theirGoals ? 'Derrota' : 'Empate';
  push(c, 'match', `${prefix}${res} por ${myGoals} x ${theirGoals} contra o ${opp.name}.`);
  for (const g of myGains) push(c, 'training', `${g.playerName} cresceu após grande atuação (+1 ${ATTR_SHORT[g.attr]}).`);
}

/**
 * Efeitos de uma partida nos dois clubes: condição, lesões, suspensões, moral,
 * bilheteria e torcida. Na copa (`league = false`) não conta para as estatísticas.
 * Devolve os ganhos de treino do clube do jogador, se ele jogou.
 */
function matchEffects(c: Career, m: PlayedMatch, rng: Rng, league: boolean): Record<string, TrainingGain[]> {
  const gainsBy: Record<string, TrainingGain[]> = {};
  const o = m.outcome;
  const goals: Record<string, number> = {};
  for (const e of o.events) if (e.type === 'goal') goals[e.playerId] = (goals[e.playerId] ?? 0) + 1;
  const home = c.clubs[m.home]!, away = c.clubs[m.away]!;
  const injuries = o.injuries ?? {};
  // quem volta de lesão: medido antes de a partida descontar a rodada
  const healing = (club: Club) => club.players.filter((p) => p.injured === 1 && !injuries[p.id]).map((p) => p.name);
  const healed = { home: healing(home), away: healing(away) };
  const gh = applyMatch(home, o.played.home, o.ratings, o.conditionAfter, o.sentOff, goals, rng, injuries, league);
  const ga = applyMatch(away, o.played.away, o.ratings, o.conditionAfter, o.sentOff, goals, rng, injuries, league);
  const income = gate(home, away);
  for (const side of ['home', 'away'] as const) {
    const club = side === 'home' ? home : away;
    const owner = managerOf(c, club.id);
    if (owner < 0) continue;
    gainsBy[club.id] = side === 'home' ? gh : ga;
    withManager(c, owner, () => {
      for (const p of club.players) {
        const r = injuries[p.id];
        if (r) push(c, 'bad', `${p.name} se lesionou e fica fora por ${r} ${r === 1 ? 'rodada' : 'rodadas'}.`);
      }
      const back = healed[side];
      if (back.length) push(c, 'good', `Recuperado${back.length > 1 ? 's' : ''} de lesão: ${back.join(', ')}.`);
      moraleAfterMatch(club, o.played[side]);
      if (side === 'home') c.ledger.gate += income;
    });
  }
  fansAfterMatch(home, o.homeScore - o.awayScore);
  fansAfterMatch(away, o.awayScore - o.homeScore);
  return gainsBy;
}

// ---------------------------------------------------------------- mercado entre clubes

const TRANSFER_LOG = 40;
/** Contratação que vira notícia: bomba (≥ $2,5 mi) ou reforço de um rival da sua divisão. */
const NEWS_FEE = 2500000;

function logTransfer(c: Career, t: AiTransfer) {
  (c.transfers ??= []).unshift(t);
  c.transfers.length = Math.min(c.transfers.length, TRANSFER_LOG);
  const text = `Mercado: o ${c.clubs[t.to]!.name} contratou ${t.playerName} (${t.ovr}) do ${c.clubs[t.from]!.name} por ${fmtMoney(t.fee)}.`;
  if (t.fee >= NEWS_FEE) { push(c, 'info', text); return; }
  // reforço de um rival da divisão: notícia só para quem disputa com ele
  forEachManager(c, () => {
    const d = divisionOf(c, myClubId(c));
    if (d >= 0 && divisionOf(c, t.to) === d) push(c, 'info', text);
  });
}

// ---------------------------------------------------------------- copa

function playAiCup(c: Career, t: CupTie, rng: Rng): PlayedMatch {
  const home = c.clubs[t.home]!, away = c.clubs[t.away]!;
  aiPrepare(home); aiPrepare(away);
  const m = createMatch(home, away, rng);
  m.knockout = true;
  runToEnd(m, rng);
  const outcome = toOutcome(m);
  const pens = outcome.homeScore === outcome.awayScore ? shootout(m, rng) : undefined;
  return { divisionIndex: -1, home: t.home, away: t.away, outcome, pens: pens && [pens.home, pens.away] };
}

/** Dia de copa com o seu clube em campo: os outros confrontos já saem sorteados. */
function prepareCup(c: Career): PreparedRound {
  const cup = cupToday(c)!;
  const rng = new Rng(c.rngState);
  const humans = managerClubs(c);
  const isMine = (t: CupTie) => humans.includes(t.home) || humans.includes(t.away);
  const others = currentTies(cup).filter((t) => !isMine(t)).map((t) => playAiCup(c, t, rng));
  const q = humanMatches(c, currentTies(cup).filter(isMine).map((t) => ({ home: t.home, away: t.away, div: -1 })), rng);
  c.rngState = rng.snapshot;
  return fromQueue({
    round: c.season.round, match: q[0]!.match, matchRngState: 0, myDivision: -1, others,
    cup: cup.round, cupKind: cupKind(cup), cupLabel: `${cupName(cup)} · ${stageName(cup, cup.round)}`,
  }, q);
}

/**
 * Pênaltis da partida do jogador (só se empatou). Determinístico: a tela do
 * pós-jogo e a consolidação chegam ao mesmo resultado.
 */
export function myShootout(prep: PreparedRound, o: FootballOutcome): Shootout | null {
  return shootoutFor(prep, o);
}

function shootoutFor(prep: PreparedRound, o: FootballOutcome): Shootout | null {
  if (prep.cup === undefined || o.homeScore !== o.awayScore) return null;
  return shootout(prep.match, new Rng((prep.matchRngState ^ 0x9e3779b9) >>> 0));
}

function completeCup(c: Career, prep: PreparedRound, mine: FootballOutcome): RoundRecord {
  return asGlobal(() => {
    const sh = shootoutFor(prep, mine);
    const own: PlayedMatch = { divisionIndex: -1, home: prep.match.home.clubId, away: prep.match.away.clubId, outcome: mine, pens: sh ? [sh.home, sh.away] : undefined };
    const all = [...prep.others, own];
    const rng = new Rng(c.rngState);
    const cup = cupByKind(c, prep.cupKind);
    const phase = cup.round;
    finishCupRound(c, cup, all, rng);
    c.rngState = rng.snapshot;
    c.date = addDays(c.date, 1);
    return { round: prep.round, date: addDays(c.date, -1), matches: all, cup: phase, cupKind: cupKind(cup) };
  });
}

/** Consolida uma fase da copa: efeitos das partidas, prêmios, notícias e o sorteio seguinte. */
function finishCupRound(c: Career, cup: Cup, all: PlayedMatch[], rng: Rng) {
  const phase = cup.round;
  const name = stageName(cup, phase);
  const CUP = cupName(cup);
  const prizes = cupPrizes(cup);
  const gainsBy: Record<string, TrainingGain[]> = {};
  for (const m of all) {
    Object.assign(gainsBy, matchEffects(c, m, rng, false));
    const t = currentTies(cup).find((x) => x.home === m.home && x.away === m.away)!;
    settleTie(t, m.outcome.homeScore, m.outcome.awayScore, m.pens);
    const prize = prizes[phase]!;
    c.clubs[t.winner!]!.budget += prize;
    const owner = managerOf(c, t.winner!);
    if (owner >= 0) withManager(c, owner, () => { c.ledger.prizes += prize; });
  }
  const last = phase === cupStages(cup).length - 1;
  forEachManager(c, () => {
    const me = myClubId(c);
    const mineTie = currentTies(cup).find((t) => t.home === me || t.away === me);
    if (!mineTie || !all.some((m) => m.home === me || m.away === me)) return;
    const pens = mineTie.pens ? ` (pênaltis ${mineTie.home === me ? `${mineTie.pens[0]} x ${mineTie.pens[1]}` : `${mineTie.pens[1]} x ${mineTie.pens[0]}`})` : '';
    pushMyResult(c, all, gainsBy[me] ?? [], `${CUP}, ${name}: `);
    if (mineTie.winner === me) {
      push(c, 'good', last
        ? `🏆 Campeão da ${CUP}${pens}! Prêmio de ${fmtMoney(prizes[phase]!)}.`
        : `Classificado${pens}! Prêmio de ${fmtMoney(prizes[phase]!)} e vaga ${cupIn(cup, phase + 1)}.`);
    } else {
      push(c, 'bad', `Eliminado da ${CUP} ${cupIn(cup, phase)}${pens}.`);
    }
  });
  const { finished } = advanceCup(cup, cupKind(cup) === 'copa' ? c.season.divisions.map((d) => d.teamIds) : [], rng);
  if (finished) {
    const champ = c.clubs[cup.championId!]!;
    champ.titles.push({ year: cup.year, competition: CUP });
    // o campeão humano já recebeu a notícia dele; os outros ficam sabendo aqui
    const owner = managerOf(c, champ.id);
    forEachManager(c, (i) => { if (i !== owner) push(c, 'info', `${champ.name} é campeão da ${CUP} ${cup.year}.`); });
    return;
  }
  forEachManager(c, () => {
    const me = myClubId(c);
    const next = tieOf(cup, me);
    if (!next) return;
    const opp = c.clubs[next.home === me ? next.away : next.home]!;
    push(c, 'info', `Sorteio da ${CUP}: ${stageName(cup, cup.round)} contra o ${opp.name}, ${next.home === me ? 'em casa' : 'fora'}, em ${formatDate(cup.dates[cup.round]!)}.`);
  });
}

/** Atalho (GD-04): simula a rodada inteira sem assistir. */
export function simulateRound(c: Career): RoundRecord {
  let prep = prepareRound(c);
  for (;;) {
    runToEnd(prep.match, liveRng(prep));
    const o = toOutcome(prep.match);
    const next = nextQueuedMatch(prep, o);
    if (!next) return completeRound(c, prep, o);
    prep = next;
  }
}

/** RNG para avançar a partida do jogador ao vivo (mesma sequência do simulateRound). */
export function liveRng(prep: PreparedRound): Rng {
  return new Rng(prep.matchRngState);
}

function gate(home: Club, away: Club): number {
  const income = lastAttendance(home, away) * home.ticketPrice;
  home.budget += income;
  return income;
}

export function lastAttendance(home: Club, away: Club): number {
  const demand = home.fans * (1 + (away.fans / (home.fans + away.fans)) * 0.5);
  return Math.min(home.stadium, Math.round(demand * (30 / (home.ticketPrice + 20))));
}

// ---------------------------------------------------------------- torcida

const MIN_FANS = 800;

/** Vitória atrai torcedor, derrota afasta (devagar: o que pesa é a sequência). */
function fansAfterMatch(club: Club, goalDiff: number) {
  const f = goalDiff > 0 ? 1.006 : goalDiff === 0 ? 1.001 : 0.996;
  club.fans = Math.max(MIN_FANS, Math.round(club.fans * f));
}

/** Público típico de um jogo em casa e a ocupação do estádio (0–1). */
export function stadiumUse(club: Club) {
  const crowd = lastAttendance(club, club);
  return { crowd, occupancy: club.stadium ? crowd / club.stadium : 0 };
}

// ---------------------------------------------------------------- obras (estádio e CT)

export const STADIUM_WORK_DAYS = 90;
export const CT_WORK_DAYS = 60;
/** Custo por lugar novo no estádio. */
export const SEAT_COST = 150;
/** Custo para levar o CT ao nível do índice (2 a 5). */
export const CT_COST = [0, 0, 200000, 400000, 800000, 1500000];

const workOf = (club: Club, kind: Work['kind']) => club.works?.find((w) => w.kind === kind);

/** Ampliação do estádio: +15% dos lugares (mínimo 1.000), arredondado ao milhar. */
export function stadiumQuote(club: Club) {
  const seats = Math.max(1000, Math.round((club.stadium * 0.15) / 1000) * 1000);
  return { seats, cost: seats * SEAT_COST, days: STADIUM_WORK_DAYS, busy: workOf(club, 'stadium') };
}

/** Próximo nível do CT (null se já está no máximo). */
export function ctQuote(club: Club) {
  const pending = workOf(club, 'ct');
  const level = (pending?.level ?? club.trainingCenter) + 1;
  if (level > 5) return null;
  return { level, cost: CT_COST[level]!, days: CT_WORK_DAYS, busy: pending };
}

/** Começa uma obra no clube do jogador: paga na hora e fica pronta depois do prazo. */
export function startWork(c: Career, kind: Work['kind']): string | null {
  const club = c.clubs[myClubId(c)]!;
  if (workOf(club, kind)) return 'Já existe uma obra dessas em andamento.';
  const q = kind === 'stadium' ? stadiumQuote(club) : ctQuote(club);
  if (!q) return 'O CT já está no nível máximo.';
  if (club.budget < q.cost) return 'Caixa insuficiente para a obra.';
  club.budget -= q.cost;
  c.ledger.works = (c.ledger.works ?? 0) + q.cost;
  const work: Work = { kind, startedOn: c.date, doneOn: addDays(c.date, q.days), cost: q.cost };
  if (kind === 'stadium') work.seats = (q as ReturnType<typeof stadiumQuote>).seats;
  else work.level = (q as NonNullable<ReturnType<typeof ctQuote>>).level;
  club.works = [...(club.works ?? []), work];
  push(c, 'money', kind === 'stadium'
    ? `Obra iniciada: +${work.seats!.toLocaleString('pt-BR')} lugares no ${club.stadiumName}, pronta em ${formatDate(work.doneOn)}.`
    : `Obra iniciada: CT nível ${work.level}, pronto em ${formatDate(work.doneOn)}.`);
  return null;
}

function finishWorks(c: Career) {
  for (const club of Object.values(c.clubs)) {
    if (!club.works?.length) continue;
    const done = club.works.filter((w) => w.doneOn <= c.date);
    if (!done.length) continue;
    club.works = club.works.filter((w) => w.doneOn > c.date);
    for (const w of done) {
      if (w.kind === 'stadium') club.stadium += w.seats ?? 0;
      else club.trainingCenter = Math.max(club.trainingCenter, w.level ?? club.trainingCenter);
      const owner = managerOf(c, club.id);
      if (owner >= 0) withManager(c, owner, () => push(c, 'good', w.kind === 'stadium'
        ? `Obra concluída: o ${club.stadiumName} agora tem ${club.stadium.toLocaleString('pt-BR')} lugares.`
        : `Obra concluída: CT nível ${club.trainingCenter}. Treinos e base melhoram.`));
    }
  }
}

/** IA (GD-10, versão inicial): ajusta formação ao elenco disponível e postura à condição física. */
function aiPrepare(club: Club) {
  const fw = club.players.filter((p) => p.position === 'FW' && available(p)).length;
  club.formation = fw >= 3 ? '4-3-3' : '4-4-2';
}

// ---------------------------------------------------------------- fim de temporada

export interface SeasonSummary {
  position: number;
  division: number;
  objective: SeasonObjective;
  achieved: boolean;
  fired: boolean;
  promoted: boolean;
  relegated: boolean;
  prize: number;
  reputationDelta: number;
  /** Terminou a temporada com o caixa negativo (mesmo somando a premiação): demissão. */
  broke: boolean;
}

const PRIZE = [[2500000, 1200000, 700000], [900000, 450000, 250000], [400000, 200000, 100000], [180000, 90000, 50000]];

export function seasonSummary(c: Career): SeasonSummary {
  const me = myClubId(c);
  const d = divisionOf(c, me);
  const table = divisionStandings(c.season.divisions[d]!, football.points);
  const pos = table.findIndex((r) => r.teamId === me) + 1;
  const bond = activeBond(c)!;
  const achieved = objectiveAchieved(bond.objective, pos, table.length, d === 0, d === DIVISIONS - 1);
  const relegated = d < DIVISIONS - 1 && pos > table.length - 2;
  const promoted = d > 0 && pos <= 2;
  const expected = { titulo: 1, acesso: 2, meio: 6, permanencia: 10 }[bond.objective];
  const prize = PRIZE[d]?.[pos - 1] ?? 0;
  const broke = c.clubs[me]!.budget + prize < 0;
  const fired = broke || (!achieved && (relegated || pos - expected >= 4));
  // quebrar o clube pesa mais que o resultado em campo: demitido por caixa negativo leva a penalidade de demissão
  const reputationDelta = (broke ? -10 : achieved ? 8 : fired ? -10 : -4) + (promoted ? 4 : 0) + (pos === 1 ? 5 : 0);
  return { position: pos, division: d, objective: bond.objective, achieved, fired, promoted, relegated, prize, reputationDelta, broke };
}

/** Fecha a temporada: premiação, avaliação, acesso/queda, envelhecimento, nova tabela e ofertas. */
export function closeSeason(c: Career): SeasonSummary {
  return closeSeasonAll(c)[activeIndex(c)]!;
}

/**
 * Fecha a temporada: premiação, avaliação de cada técnico, acesso/queda,
 * envelhecimento, nova tabela, copas e ofertas. Devolve o balanço de cada técnico
 * (sem clube = sem balanço; o índice segue o dos técnicos).
 */
export function closeSeasonAll(c: Career): SeasonSummary[] {
  return asGlobal(() => {
    const sums: SeasonSummary[] = [];
    forEachManager(c, (i) => { c.midSeason = undefined; if (!c.unemployed) sums[i] = seasonSummary(c); });
    const rng = new Rng(c.rngState);
    const year = c.season.year;
    const humanDivs = new Set(sums.filter(Boolean).map((x) => x.division));

    // premiação e campeões
    c.season.divisions.forEach((d, di) => {
      const table = divisionStandings(d, football.points);
      table.forEach((row, i) => {
        const prize = PRIZE[di]?.[i] ?? 0;
        c.clubs[row.teamId]!.budget += prize;
        const club = c.clubs[row.teamId]!;
        club.reputation = Math.max(1, Math.min(99, club.reputation + (i < 2 ? 2 : i >= table.length - 2 ? -2 : 0)));
        const swing = i === 0 ? 1.12 : i < 2 ? 1.07 : i >= table.length - 2 ? 0.9 : 1;
        club.fans = Math.max(MIN_FANS, Math.round(club.fans * swing));
      });
      const champ = c.clubs[table[0]!.teamId]!;
      champ.titles.push({ year, competition: `Divisão ${di + 1}` });
      const scorer = d.teamIds
        .flatMap((id) => c.clubs[id]!.players.map((p) => ({ p, club: c.clubs[id]!.name })))
        .sort((a, b) => b.p.stats.goals - a.p.stats.goals)[0];
      c.awards.unshift({
        year, division: di + 1, championId: champ.id, championName: champ.name,
        topScorer: scorer && scorer.p.stats.goals > 0 ? { name: scorer.p.name, club: scorer.club, goals: scorer.p.stats.goals } : undefined,
      });
      push(c, humanDivs.has(di) ? 'good' : 'info', `${year}: ${champ.name} é campeão da Divisão ${di + 1}.`);
    });

    // avaliação de cada técnico
    forEachManager(c, (i) => {
      const sum = sums[i];
      if (!sum) return;
      const e = c.entrepreneur;
      c.ledger.prizes += sum.prize;
      e.history.unshift({ year, orgName: c.clubs[myClubId(c)]!.name, division: sum.division + 1, position: sum.position, objective: sum.objective, achieved: sum.achieved });
      e.reputation = Math.max(0, Math.min(100, e.reputation + sum.reputationDelta));
      e.experience = Math.min(100, e.experience + 6 + (sum.achieved ? 4 : 0));
      if (sum.achieved) {
        const bonus = activeBond(c)!.monthlySalary * 3;
        e.cash += bonus;
        push(c, 'good', `Objetivo cumprido! Bônus de ${fmtMoney(bonus)} no seu patrimônio.`);
      } else if (!sum.fired) {
        push(c, 'bad', 'Objetivo não cumprido. A diretoria mantém você, mas a pressão aumenta.');
      }
    });

    // os 4 primeiros da elite vão à Taça Continental do ano que vem
    const elite = divisionStandings(c.season.divisions[0]!, football.points).map((r) => r.teamId);
    // acesso e rebaixamento
    const next = promoteAndRelegate(c.season, football.points);
    // quem não renovou vai a leilão antes da renovação automática
    const humans = managerClubs(c).filter(Boolean);
    forEachManager(c, () => {
      for (const a of releaseLeavers(c.clubs, myClubId(c), year, rng, humans)) {
        if (a.buyer) {
          c.ledger.sales += a.fee;
          push(c, 'money', `Leilão: ${a.name} foi arrematado pelo ${a.buyer} por ${fmtMoney(a.fee)}.`);
        } else {
          push(c, 'info', `Leilão sem lances: ${a.name} saiu de graça.`);
        }
      }
      c.decisions = [];
    });
    // evolução de fim de ciclo
    c.season.divisions.forEach((d, di) => {
      for (const id of d.teamIds) {
        const { youth } = endOfSeason(c.clubs[id]!, divisionLevel(di), year, rng);
        const owner = managerOf(c, id);
        if (owner >= 0 && youth.length) withManager(c, owner, () => push(c, 'training', `Subiram da base: ${youth.map((p) => p.name).join(', ')}.`));
      }
    });
    // estrangeiros também envelhecem e renovam; a base deles é do próprio país
    for (const club of Object.values(c.clubs)) {
      if (!club.country) continue;
      const { youth } = endOfSeason(club, divisionLevel(0) - 1, year, rng);
      for (const p of youth) naturalize(p, club.country, rng);
    }

    c.season = createSeason(year + 1, next);
    c.roundDates = roundDates(year + 1);
    c.cup = createCup(year + 1, next, c.clubs, c.roundDates, cupRng(c.seed, year + 1));
    if (!Object.values(c.clubs).some((x) => x.country)) {
      // save antigo: os estrangeiros chegam agora
      for (const f of generateForeignClubs(new Rng((c.seed ^ 0x2f6b) >>> 0))) c.clubs[f.id] = f;
    }
    c.continental = createContinental(year + 1, continentalEntrants(c.clubs, elite), c.roundDates, cupRng(c.seed, year + 8));
    const qualified = elite.slice(0, CONTINENTAL_SPOTS);
    push(c, qualified.some((id) => humans.includes(id)) ? 'good' : 'info', `Classificados para a Taça Continental ${year + 1}: ${qualified.map((id) => c.clubs[id]!.name).join(', ')}.`);
    c.phase = 'entressafra';
    c.date = addDays(c.date, 1);
    c.lastRound = undefined;
    c.rngState = rng.snapshot;

    // demissões primeiro, ofertas depois: assim ninguém recebe proposta do clube de outro técnico
    forEachManager(c, (i) => {
      c.ledger = emptyLedger();
      const sum = sums[i];
      if (!sum?.fired) return;
      const club = c.clubs[myClubId(c)]!;
      push(c, 'bad', sum.broke ? `Você foi demitido do ${club.name}: a temporada terminou com o caixa negativo.` : `Você foi demitido do ${club.name}.`);
      c.entrepreneur.bonds = [];
      c.unemployed = true;
    });
    forEachManager(c, (i) => {
      const sum = sums[i];
      if (sum && !sum.fired) activeBond(c)!.objective = boardObjective(c, myClubId(c));
      // sem clube desde antes (demitido e ainda escolhendo) também recebe propostas novas
      c.offers = generateOffers(c, !sum || sum.fired ? 3 : sum.achieved ? 2 : 0);
      if (c.offers.length && sum && !sum.fired) push(c, 'good', `Você recebeu ${c.offers.length} proposta(s) de outros clubes.`);
    });
    return sums;
  });
}

// ---------------------------------------------------------------- janela do meio do campeonato

const positionIn = (c: Career, clubId: string) => {
  const d = divisionOf(c, clubId);
  return divisionStandings(c.season.divisions[d]!, football.points).findIndex((r) => r.teamId === clubId) + 1;
};

/**
 * Fim do 1º turno: um clube maior chama quem está entre os 3 primeiros (mérito) e,
 * às vezes, um clube na zona de rebaixamento chama para salvar a temporada (crise).
 * RNG próprio (derivado da seed e do ano): não mexe na sequência do resto da simulação.
 */
export function openMidSeasonWindow(c: Career) {
  if (c.unemployed) return;
  const me = myClubId(c);
  const mine = c.clubs[me];
  if (!mine) return;
  const d = divisionOf(c, me);
  const position = positionIn(c, me);
  const rep = c.entrepreneur.reputation;
  const rng = new Rng((c.seed ^ Math.imul(c.season.year, 7919) ^ 0x51ed) >>> 0);
  const offers: MidOffer[] = [];

  const salaryNow = activeBond(c)?.monthlySalary ?? 0;
  const raise = (cl: Club, mult: number) => Math.round(Math.max(salaryFor(cl) * mult, salaryNow * 1.2) / 500) * 500;
  if (position <= 3) {
    // "clube maior" de verdade: de divisão acima; quem já está na 1ª recebe de um rival maior da metade de cima
    const bigger = Object.values(c.clubs)
      .filter((cl) => cl.id !== me && !cl.country && !isHumanClub(c, cl.id) && cl.reputation <= rep + 25 && (d > 0
        ? divisionOf(c, cl.id) < d
        : cl.reputation > mine.reputation && positionIn(c, cl.id) <= 6))
      .sort((a, b) => a.reputation - b.reputation)
      .slice(0, 3);
    if (bigger.length) {
      const cl = bigger[rng.int(0, bigger.length - 1)]!;
      offers.push({ clubId: cl.id, objective: boardObjective(c, cl.id), monthlySalary: raise(cl, 1.15), reason: 'merito', clubPosition: positionIn(c, cl.id) });
    }
  }

  const inDanger = c.season.divisions.flatMap((div, di) => {
    if (di >= DIVISIONS - 1) return []; // a última divisão não tem rebaixamento
    const rows = divisionStandings(div, football.points);
    return rows.slice(-2).map((r) => r.teamId);
  }).filter((id) => id !== me && !isHumanClub(c, id) && c.clubs[id]!.reputation <= rep + 18);
  if (inDanger.length && rng.chance(0.3)) { // ~1 em 3 carreiras: convite de crise é evento, não rotina
    const cl = c.clubs[inDanger[rng.int(0, inDanger.length - 1)]!]!;
    offers.push({ clubId: cl.id, objective: 'permanencia', monthlySalary: raise(cl, 1.25), reason: 'crise', clubPosition: positionIn(c, cl.id) });
  }

  if (!offers.length) return;
  c.midSeason = { year: c.season.year, position, offers, open: true };
  push(c, 'good', `Janela do meio do campeonato: ${offers.length === 1 ? 'um clube quer' : `${offers.length} clubes querem`} você.`);
}

/** Resposta à janela: aceitar um convite (paga multa e perde reputação) ou ficar (ganha reputação). */
export function resolveMidSeason(c: Career, acceptClubId: string | null): string | null {
  const w = c.midSeason;
  if (!w?.open) return 'Nenhuma proposta em aberto.';
  const e = c.entrepreneur;
  const old = c.clubs[myClubId(c)];
  if (acceptClubId) {
    const offer = w.offers.find((o) => o.clubId === acceptClubId);
    if (!offer) return 'Proposta não encontrada.';
    const fine = Math.min(e.cash, (activeBond(c)?.monthlySalary ?? 0) * MID_SEASON.fineSalaries);
    e.cash -= fine;
    e.reputation = Math.max(0, e.reputation - MID_SEASON.leaveReputation);
    w.open = false;
    acceptOffer(c, offer);
    push(c, 'bad', `Você deixou o ${old?.name ?? 'clube'} no meio da temporada: multa de ${fmtMoney(fine)} e −${MID_SEASON.leaveReputation} de reputação.`);
  } else {
    e.reputation = Math.min(100, e.reputation + MID_SEASON.stayReputation);
    w.open = false;
    push(c, 'good', `Você recusou as propostas e ficou no ${old?.name ?? 'clube'}: +${MID_SEASON.stayReputation} de reputação pela fidelidade.`);
  }
  return null;
}

/** Propostas de trabalho conforme a reputação do empreendedor (GDD 2.11). */
export function generateOffers(c: Career, count: number): Offer[] {
  if (count <= 0) return [];
  const me = myClubId(c);
  const rep = c.entrepreneur.reputation;
  return Object.values(c.clubs)
    .filter((cl) => cl.id !== me && !cl.country && !isHumanClub(c, cl.id) && cl.reputation <= rep + 18)
    .sort((a, b) => Math.abs(a.reputation - (rep + 8)) - Math.abs(b.reputation - (rep + 8)))
    .slice(0, count)
    .map((cl) => ({ clubId: cl.id, objective: boardObjective(c, cl.id), monthlySalary: salaryFor(cl) }));
}

// ---------------------------------------------------------------- mercado

export interface Listing {
  player: Player;
  clubId: string;
  price: number;
}

export function marketListings(c: Career, limit = 50): Listing[] {
  const month = monthOf(c.date);
  const rng = new Rng(c.seed ^ (c.season.year * 131 + month * 7));
  const all: Listing[] = [];
  const me = myClubId(c);
  for (const club of Object.values(c.clubs)) {
    if (club.id === me || isHumanClub(c, club.id)) continue; // outro técnico humano não vende sem querer
    for (const p of club.players) if (!p.clubLocked) all.push({ player: p, clubId: club.id, price: askingPrice(p) });
  }
  return rng.shuffle(all).slice(0, limit).sort((a, b) => overall(b.player) - overall(a.player));
}

export function buyPlayer(c: Career, playerId: string, fromClubId: string): string | null {
  const me = c.clubs[myClubId(c)]!;
  const seller = c.clubs[fromClubId];
  const p = seller?.players.find((x) => x.id === playerId);
  if (!seller || !p) return 'Atleta indisponível.';
  if (isHumanClub(c, fromClubId)) return `O ${seller.name} é de outro técnico.`;
  if (p.clubLocked) return `${p.name} não sai do ${seller.name} por dinheiro nenhum.`;
  if (me.players.length >= 28) return 'Elenco cheio (máx. 28).';
  if (seller.players.filter((x) => x.position === p.position).length <= (p.position === 'GK' ? 1 : 3))
    return `${seller.name} não libera: está sem reposição nessa posição.`;
  const price = askingPrice(p);
  if (me.budget < price) return 'Caixa insuficiente.';
  me.budget -= price;
  seller.budget += price;
  c.ledger.purchases += price;
  seller.players = seller.players.filter((x) => x.id !== playerId);
  p.joinedOn = c.date;
  me.players.push(p);
  push(c, 'money', `Contratado: ${p.name} (${seller.name}) por ${fmtMoney(price)}.`);
  return null;
}

/** Contratado há menos de 30 dias: aparece com o selo "novo" no elenco. */
export function isNewSigning(p: Player, today: IsoDate): boolean {
  if (!p.joinedOn) return false;
  return (Date.parse(today) - Date.parse(p.joinedOn)) / 86400000 < 30;
}

/** Preço pedido no mercado (o mesmo cobrado em buyPlayer). */
export const askingPrice = (p: Player) => Math.round(playerValue(p) * 1.15 / 1000) * 1000;

export function sellPlayer(c: Career, playerId: string): string | null {
  const me = c.clubs[myClubId(c)]!;
  const p = me.players.find((x) => x.id === playerId);
  if (!p) return 'Atleta não encontrado.';
  if (p.clubLocked) return `${p.name} é ídolo do ${me.name} e não pode ser vendido.`;
  if (me.players.length <= 16) return 'Elenco mínimo é 16.';
  if (p.position === 'GK' && me.players.filter((x) => x.position === 'GK').length <= 1) return 'Você precisa de um goleiro.';
  const price = Math.round(playerValue(p) * 0.85 / 1000) * 1000;
  // GD-10: a IA respeita o próprio caixa
  const buyer = Object.values(c.clubs)
    .filter((cl) => cl.id !== me.id && !isHumanClub(c, cl.id) && cl.budget > price * 1.5 && cl.players.length < 28)
    .sort((a, b) => b.reputation - a.reputation)[0];
  if (!buyer) return 'Nenhum clube pode pagar.';
  me.budget += price;
  buyer.budget -= price;
  c.ledger.sales += price;
  me.players = me.players.filter((x) => x.id !== playerId);
  p.joinedOn = c.date;
  buyer.players.push(p);
  push(c, 'money', `Vendido: ${p.name} para o ${buyer.name} por ${fmtMoney(price)}.`);
  return null;
}
