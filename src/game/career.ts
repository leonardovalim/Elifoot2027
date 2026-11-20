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
import { DIVISIONS, divisionLevel, generateWorld, playerValue } from '../sports/football/generate';
import { overall, pickLineup, starters } from '../sports/football/lineup';
import type { Club, Player, Work } from '../sports/football/types';
import { marketDay, moraleAfterMatch, releaseLeavers, resolveDecision, type Decision, type DecisionChoice, type MarketCtx } from './market';

export const SAVE_VERSION = 2;
const SPORT = 'football';

export type NewsKind = 'info' | 'good' | 'bad' | 'match' | 'money' | 'training';

export interface News {
  date: IsoDate;
  kind: NewsKind;
  text: string;
}

export interface PlayedMatch {
  divisionIndex: number;
  home: string;
  away: string;
  outcome: FootballOutcome;
}

export interface RoundRecord {
  round: number;
  date: IsoDate;
  matches: PlayedMatch[];
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
  return {
    version: SAVE_VERSION,
    seed,
    rngState: rng.snapshot,
    date: `${year}-01-04`,
    phase: 'pre-temporada',
    entrepreneur: { name: entrepreneurName, cash: 50000, reputation: 10, experience: 0, bonds: [], history: [] },
    clubs,
    season: createSeason(year, world.map((d) => d.map((c) => c.id))),
    roundDates: roundDates(year),
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

export function acceptOffer(c: Career, offer: Offer) {
  const club = c.clubs[offer.clubId]!;
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

export const activeBond = (c: Career): Bond | undefined => c.entrepreneur.bonds[0];
export const myClubId = (c: Career): string => activeBond(c)?.orgId ?? '';

function push(c: Career, kind: NewsKind, text: string) {
  c.news.unshift({ date: c.date, kind, text });
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

export const isMatchDay = (c: Career) => c.phase === 'temporada' && c.roundDates[c.season.round] === c.date;

/**
 * Avança um dia. Não avança em dia de jogo: o jogador precisa disputar
 * (ou simular) a rodada via `prepareRound` + `completeRound`.
 */
export function advanceDay(c: Career): DayReport {
  if (c.unemployed) return { date: c.date, gains: [], news: [], pause: 'unemployed' };
  if (c.phase === 'encerramento') return { date: c.date, gains: [], news: [], pause: 'season-end' };
  if (isMatchDay(c)) return { date: c.date, gains: [], news: [], pause: 'match' };

  const before = c.news.length;
  const rng = new Rng(c.rngState);
  c.date = addDays(c.date, 1);
  const me = myClubId(c);
  let gains: TrainingGain[] = [];

  for (const club of Object.values(c.clubs)) {
    const g = dailyTraining(club, rng);
    if (club.id === me) gains = g;
  }
  for (const g of gains) {
    // destaques raros viram notícia; o resto aparece só como "+1" no CT
    const p = c.clubs[me]!.players.find((x) => x.id === g.playerId);
    if (p && p.age <= 21 && overall(p) >= 65 && rng.chance(0.15)) push(c, 'training', `${p.name} (${p.age}) se destaca nos treinos.`);
  }

  if (dayOf(c.date) === 1) monthly(c);
  finishWorks(c);
  marketDay(marketCtx(c), rng);
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
  return { date: c.date, gains, news: fresh, pause: isMatchDay(c) ? 'match' : undefined };
}

const TV_MONTHLY = [170000, 85000, 42000, 19000];
/** Patrocínio mensal por divisão: a folga que paga contratações e aumentos nas divisões de baixo. */
const SPONSOR_MONTHLY = [20000, 26000, 26000, 22000];

/** Receitas fixas do mês (TV + patrocínio) de um clube. */
export function fixedMonthlyIncome(c: Career, clubId: string) {
  const d = divisionOf(c, clubId);
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
  const me = myClubId(c);
  for (const club of Object.values(c.clubs)) {
    const wages = club.players.reduce((a, p) => a + p.wage, 0);
    const { tv, sponsor } = fixedMonthlyIncome(c, club.id);
    club.budget += tv + sponsor - wages;
    if (club.id === me) {
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
    }
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
  myDivision: number;
  others: PlayedMatch[];
}

/** Simula todas as partidas da rodada exceto a do jogador, que fica preparada. */
export function prepareRound(c: Career): PreparedRound {
  if (!isMatchDay(c)) throw new Error('Hoje não é dia de jogo');
  const rng = new Rng(c.rngState);
  const r = c.season.round;
  const me = myClubId(c);
  const others: PlayedMatch[] = [];
  let mine: { home: string; away: string; div: number } | undefined;

  c.season.divisions.forEach((div, di) => {
    for (const f of div.rounds[r] ?? []) {
      if (f.home === me || f.away === me) { mine = { ...f, div: di }; continue; }
      const home = c.clubs[f.home]!, away = c.clubs[f.away]!;
      aiPrepare(home); aiPrepare(away);
      const m = createMatch(home, away, rng);
      runToEnd(m, rng);
      others.push({ divisionIndex: di, home: f.home, away: f.away, outcome: toOutcome(m) });
    }
  });
  if (!mine) throw new Error('Clube do jogador sem partida na rodada');
  const mrng = new Rng(rng.int(0, 2 ** 31));
  c.rngState = rng.snapshot;
  const match = createMatch(c.clubs[mine.home]!, c.clubs[mine.away]!, mrng);
  const side = mine.home === me ? 'home' : 'away';
  match[side].autoSubs = c.autoSubs;
  return { round: r, match, matchRngState: mrng.snapshot, myDivision: mine.div, others };
}

/** Consolida a rodada: resultados, finanças, condição, suspensões e avança o dia. */
export function completeRound(c: Career, prep: PreparedRound, mine: FootballOutcome): RoundRecord {
  const me = myClubId(c);
  const all: PlayedMatch[] = [
    ...prep.others,
    { divisionIndex: prep.myDivision, home: prep.match.home.clubId, away: prep.match.away.clubId, outcome: mine },
  ];
  const byDiv: Result[][] = c.season.divisions.map(() => []);
  const rng = new Rng(c.rngState);
  let myGains: TrainingGain[] = [];
  for (const m of all) {
    const o = m.outcome;
    byDiv[m.divisionIndex]!.push({ home: m.home, away: m.away, homeScore: o.homeScore, awayScore: o.awayScore });
    const goals: Record<string, number> = {};
    for (const e of o.events) if (e.type === 'goal') goals[e.playerId] = (goals[e.playerId] ?? 0) + 1;
    const home = c.clubs[m.home]!, away = c.clubs[m.away]!;
    const gh = applyMatch(home, o.played.home, o.ratings, o.conditionAfter, o.sentOff, goals, rng);
    const ga = applyMatch(away, o.played.away, o.ratings, o.conditionAfter, o.sentOff, goals, rng);
    if (home.id === me) { myGains = gh; moraleAfterMatch(home, o.played.home); }
    if (away.id === me) { myGains = ga; moraleAfterMatch(away, o.played.away); }
    gate(c, home, away, m.divisionIndex, me);
    fansAfterMatch(home, o.homeScore - o.awayScore);
    fansAfterMatch(away, o.awayScore - o.homeScore);
  }
  c.season.divisions.forEach((d, i) => d.results.push(byDiv[i]!));
  c.rngState = rng.snapshot;

  const record: RoundRecord = { round: prep.round + 1, date: c.date, matches: all };
  const myMatch = all.find((m) => m.home === me || m.away === me)!;
  const myGoals = myMatch.home === me ? myMatch.outcome.homeScore : myMatch.outcome.awayScore;
  const theirGoals = myMatch.home === me ? myMatch.outcome.awayScore : myMatch.outcome.homeScore;
  const opp = c.clubs[myMatch.home === me ? myMatch.away : myMatch.home]!;
  const res = myGoals > theirGoals ? 'Vitória' : myGoals < theirGoals ? 'Derrota' : 'Empate';
  push(c, 'match', `${res} por ${myGoals} x ${theirGoals} contra o ${opp.name}.`);
  for (const g of myGains) push(c, 'training', `${g.playerName} cresceu após grande atuação (+1 ${ATTR_SHORT[g.attr]}).`);

  c.season.round++;
  c.lastRound = record;
  if (c.season.round >= c.roundDates.length) {
    c.phase = 'encerramento';
    push(c, 'info', 'Fim da temporada! Hora do balanço.');
  } else {
    c.date = addDays(c.date, 1);
  }
  return record;
}

/** Atalho (GD-04): simula a rodada inteira sem assistir. */
export function simulateRound(c: Career): RoundRecord {
  const prep = prepareRound(c);
  runToEnd(prep.match, liveRng(prep));
  return completeRound(c, prep, toOutcome(prep.match));
}

/** RNG para avançar a partida do jogador ao vivo (mesma sequência do simulateRound). */
export function liveRng(prep: PreparedRound): Rng {
  return new Rng(prep.matchRngState);
}

function gate(c: Career, home: Club, away: Club, division: number, me: string) {
  const demand = home.fans * (1 + (away.fans / (home.fans + away.fans)) * 0.5);
  const attendance = Math.min(home.stadium, Math.round(demand * (30 / (home.ticketPrice + 20))));
  const income = attendance * home.ticketPrice;
  home.budget += income;
  if (home.id === me) c.ledger.gate += income;
  void division;
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
  const me = myClubId(c);
  for (const club of Object.values(c.clubs)) {
    if (!club.works?.length) continue;
    const done = club.works.filter((w) => w.doneOn <= c.date);
    if (!done.length) continue;
    club.works = club.works.filter((w) => w.doneOn > c.date);
    for (const w of done) {
      if (w.kind === 'stadium') club.stadium += w.seats ?? 0;
      else club.trainingCenter = Math.max(club.trainingCenter, w.level ?? club.trainingCenter);
      if (club.id === me) {
        push(c, 'good', w.kind === 'stadium'
          ? `Obra concluída: o ${club.stadiumName} agora tem ${club.stadium.toLocaleString('pt-BR')} lugares.`
          : `Obra concluída: CT nível ${club.trainingCenter}. Treinos e base melhoram.`);
      }
    }
  }
}

/** IA (GD-10, versão inicial): ajusta formação ao elenco disponível e postura à condição física. */
function aiPrepare(club: Club) {
  const fw = club.players.filter((p) => p.position === 'FW' && p.suspended <= 0).length;
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
  const sum = seasonSummary(c);
  const rng = new Rng(c.rngState);
  const me = myClubId(c);
  const myClub = c.clubs[me]!;
  const year = c.season.year;
  const e = c.entrepreneur;

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
    push(c, di === sum.division ? 'good' : 'info', `${year}: ${champ.name} é campeão da Divisão ${di + 1}.`);
  });
  c.ledger.prizes += sum.prize;

  // avaliação do empreendedor
  e.history.unshift({ year, orgName: myClub.name, division: sum.division + 1, position: sum.position, objective: sum.objective, achieved: sum.achieved });
  e.reputation = Math.max(0, Math.min(100, e.reputation + sum.reputationDelta));
  e.experience = Math.min(100, e.experience + 6 + (sum.achieved ? 4 : 0));
  if (sum.achieved) {
    const bonus = activeBond(c)!.monthlySalary * 3;
    e.cash += bonus;
    push(c, 'good', `Objetivo cumprido! Bônus de ${fmtMoney(bonus)} no seu patrimônio.`);
  } else if (!sum.fired) {
    push(c, 'bad', 'Objetivo não cumprido. A diretoria mantém você, mas a pressão aumenta.');
  }

  // acesso e rebaixamento
  const next = promoteAndRelegate(c.season, football.points);
  // quem não renovou vai a leilão antes da renovação automática
  for (const a of releaseLeavers(c.clubs, me, year, rng)) {
    if (a.buyer) {
      c.ledger.sales += a.fee;
      push(c, 'money', `Leilão: ${a.name} foi arrematado pelo ${a.buyer} por ${fmtMoney(a.fee)}.`);
    } else {
      push(c, 'info', `Leilão sem lances: ${a.name} saiu de graça.`);
    }
  }
  c.decisions = [];
  // evolução de fim de ciclo
  c.season.divisions.forEach((d, di) => {
    for (const id of d.teamIds) {
      const { youth } = endOfSeason(c.clubs[id]!, divisionLevel(di), year, rng);
      if (id === me && youth.length) push(c, 'training', `Subiram da base: ${youth.map((p) => p.name).join(', ')}.`);
    }
  });

  c.season = createSeason(year + 1, next);
  c.roundDates = roundDates(year + 1);
  c.phase = 'entressafra';
  c.date = addDays(c.date, 1);
  c.lastRound = undefined;
  c.ledger = emptyLedger();
  c.rngState = rng.snapshot;

  if (sum.fired) {
    push(c, 'bad', sum.broke ? `Você foi demitido do ${myClub.name}: a temporada terminou com o caixa negativo.` : `Você foi demitido do ${myClub.name}.`);
    c.entrepreneur.bonds = [];
    c.unemployed = true;
  } else {
    activeBond(c)!.objective = boardObjective(c, me);
  }
  c.offers = generateOffers(c, sum.fired ? 3 : sum.achieved ? 2 : 0);
  if (c.offers.length && !sum.fired) push(c, 'good', `Você recebeu ${c.offers.length} proposta(s) de outros clubes.`);
  return sum;
}

/** Propostas de trabalho conforme a reputação do empreendedor (GDD 2.11). */
export function generateOffers(c: Career, count: number): Offer[] {
  if (count <= 0) return [];
  const me = myClubId(c);
  const rep = c.entrepreneur.reputation;
  return Object.values(c.clubs)
    .filter((cl) => cl.id !== me && cl.reputation <= rep + 18)
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
    if (club.id === me) continue;
    for (const p of club.players) if (!p.clubLocked) all.push({ player: p, clubId: club.id, price: askingPrice(p) });
  }
  return rng.shuffle(all).slice(0, limit).sort((a, b) => overall(b.player) - overall(a.player));
}

export function buyPlayer(c: Career, playerId: string, fromClubId: string): string | null {
  const me = c.clubs[myClubId(c)]!;
  const seller = c.clubs[fromClubId];
  const p = seller?.players.find((x) => x.id === playerId);
  if (!seller || !p) return 'Atleta indisponível.';
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
    .filter((cl) => cl.id !== me.id && cl.budget > price * 1.5 && cl.players.length < 28)
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
