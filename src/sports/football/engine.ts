import type { Rng } from '../../core/rng';
import type { HeadToHeadSport, MatchOutcome } from '../../core/sport';
import { FORMATIONS, conditionFactor, pickLineup, ratingAt } from './lineup';
import type { Club, Formation, MatchEvent, Player, Position, Side, Style, TeamStats } from './types';

/**
 * Motor de partida incremental (minuto a minuto).
 *
 * O estado da partida é avançado por `stepMinute`, o que permite intervenções
 * do jogador no meio do jogo (estilo, formação, substituição — GDD 2.4).
 * Para partidas da IA, `simulateFootballMatch` roda tudo de uma vez.
 *
 * Diferenças deliberadas em relação ao Elifoot 98: posse de bola decidida pelo
 * meio-campo, atributos por setor, cansaço ao longo do jogo e estilo como troca
 * (atacar cria chances e expõe a defesa).
 */
export const TUNING = {
  attackPerMinute: 0.5,
  shotFactor: 0.62,
  conversion: 0.205,
  /** Mando de campo na criação de chances: 7000/6000, como no Elifoot 98. */
  homeChanceBoost: 7000 / 6000,
  /** Mando de campo na posse (leve). */
  homePossessionBoost: 1.04,
  /** Lances de sorte por minuto (Elifoot 98: 1/180 em casa, 1/270 fora). */
  luckyHome: 1 / 180,
  luckyAway: 1 / 270,
  /** Desfechos de finalização que não são gol: trave, travessão, defesa (resto: fora). */
  postShare: 0.018,
  barShare: 0.012,
  saveShare: 0.35,
  possessionExponent: 1.1,
  yellowPerMinute: 0.0035,
  directRedPerMinute: 0.000025,
  /**
   * Agressividade no desarme: ±5% na defesa de quem marca (DF inteiro e o desarme do MF),
   * de agressividade 1 a 99. É o lado bom do raçudo (ver `temperament.ts`).
   */
  aggressionTackle: 0.05,
  fatiguePerMinute: 0.2,
  maxSubs: 5,
  autoSubCondition: 70,
};

const STYLE: Record<Style, { own: number; conceded: number; fatigue: number }> = {
  defensive: { own: 0.8, conceded: 0.78, fatigue: 0.9 },
  balanced: { own: 1, conceded: 1, fatigue: 1 },
  attacking: { own: 1.2, conceded: 1.16, fatigue: 1.15 },
};

export interface SectorPower { defense: number; midfield: number; attack: number; keeper: number }

export interface SideState {
  clubId: string;
  short: string;
  style: Style;
  formation: Formation;
  GK: Player;
  DF: Player[];
  MF: Player[];
  FW: Player[];
  bench: Player[];
  condition: Record<string, number>;
  ratings: Record<string, number>;
  yellows: string[];
  sentOff: string[];
  played: string[];
  subsLeft: number;
  autoSubs: boolean;
  stats: TeamStats;
  goals: number;
}

export interface MatchState {
  minute: number;
  firstHalfEnd: number;
  total: number;
  home: SideState;
  away: SideState;
  events: MatchEvent[];
  finished: boolean;
}

const onPitch = (s: SideState) => [s.GK, ...s.DF, ...s.MF, ...s.FW];
const outfield = (s: SideState) => [...s.DF, ...s.MF, ...s.FW];
const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

function eff(s: SideState, p: Player, pos: Position) {
  return ratingAt(p, pos) * conditionFactor(s.condition[p.id] ?? p.condition);
}

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

/** Fator de desarme pela agressividade: 1 na média (50), até ±aggressionTackle nos extremos. */
const bite = (p: Player) => 1 + (TUNING.aggressionTackle * (p.aggression - 50)) / 50;

/**
 * Quantas faltas/cartões o time comete em relação à média: média de agressividade
 * 50 → 1,0; time só de raçudos (~75) → ~1,25; só de fair play (~25) → ~0,75.
 */
export function foulRate(players: Pick<Player, 'aggression'>[]): number {
  if (!players.length) return 1;
  return (sum(players.map((p) => p.aggression)) / players.length + 50) / 100;
}

export function sectorPower(s: SideState): SectorPower {
  return {
    defense: sum(s.DF.map((p) => eff(s, p, 'DF') * bite(p))) + 0.35 * sum(s.MF.map((p) => p.attrs.tackling * bite(p) * conditionFactor(s.condition[p.id]!))),
    midfield:
      sum(s.MF.map((p) => eff(s, p, 'MF'))) +
      0.25 * sum(s.DF.map((p) => p.attrs.passing)) +
      0.25 * sum(s.FW.map((p) => p.attrs.passing)),
    attack:
      sum(s.FW.map((p) => eff(s, p, 'FW'))) +
      0.4 * sum(s.MF.map((p) => (p.attrs.finishing * 0.5 + p.attrs.passing * 0.5) * conditionFactor(s.condition[p.id]!))) +
      0.1 * sum(s.DF.map((p) => p.attrs.finishing)),
    keeper: eff(s, s.GK, 'GK'),
  };
}

function makeSide(club: Club): SideState {
  const l = pickLineup(club);
  const s: SideState = {
    clubId: club.id,
    short: club.short,
    style: club.style,
    formation: club.formation,
    GK: l.GK, DF: l.DF, MF: l.MF, FW: l.FW, bench: l.bench,
    condition: {},
    ratings: {},
    yellows: [],
    sentOff: [],
    played: [],
    subsLeft: TUNING.maxSubs,
    autoSubs: true,
    stats: { shots: 0, onTarget: 0, corners: 0, fouls: 0, possessionMinutes: 0 },
    goals: 0,
  };
  for (const p of [...onPitch(s), ...s.bench]) s.condition[p.id] = p.condition;
  for (const p of onPitch(s)) { s.ratings[p.id] = 6; s.played.push(p.id); }
  return s;
}

export function createMatch(home: Club, away: Club, rng: Rng): MatchState {
  const firstHalfEnd = 45 + rng.int(0, 2);
  return {
    minute: 0,
    firstHalfEnd,
    total: firstHalfEnd + 45 + rng.int(1, 5),
    home: makeSide(home),
    away: makeSide(away),
    events: [],
    finished: false,
  };
}

const bump = (s: SideState, id: string, delta: number) => {
  if (s.ratings[id] !== undefined) s.ratings[id] = Math.max(3, Math.min(10, s.ratings[id]! + delta));
};

function removeFromPitch(s: SideState, id: string) {
  s.DF = s.DF.filter((p) => p.id !== id);
  s.MF = s.MF.filter((p) => p.id !== id);
  s.FW = s.FW.filter((p) => p.id !== id);
  if (s.GK.id === id) {
    // goleiro expulso: entra o reserva se houver substituição; senão um da linha vai pro gol
    const benchGk = s.bench.find((p) => p.position === 'GK');
    const victim = [...s.FW, ...s.MF, ...s.DF].sort((a, b) => ratingAt(a, a.position) - ratingAt(b, b.position))[0];
    if (benchGk && s.subsLeft > 0 && victim) {
      removeFromPitch(s, victim.id);
      s.GK = benchGk;
      s.bench = s.bench.filter((p) => p.id !== benchGk.id);
      s.subsLeft--;
      s.ratings[benchGk.id] = 6;
      s.played.push(benchGk.id);
    } else if (victim) {
      removeFromPitch(s, victim.id);
      s.GK = victim;
    }
  }
}

/** Substituição. Devolve mensagem de erro ou null. */
export function substitute(m: MatchState, side: Side, outId: string, inId: string, reason: 'cansaço' | 'tática' = 'tática'): string | null {
  const s = m[side];
  if (m.finished) return 'Partida encerrada.';
  if (s.subsLeft <= 0) return 'Sem substituições restantes.';
  const incoming = s.bench.find((p) => p.id === inId);
  const leaving = onPitch(s).find((p) => p.id === outId);
  if (!incoming || !leaving) return 'Jogador inválido.';
  const swap = (arr: Player[]) => arr.map((p) => (p.id === outId ? incoming : p));
  if (s.GK.id === outId) s.GK = incoming;
  s.DF = swap(s.DF); s.MF = swap(s.MF); s.FW = swap(s.FW);
  s.bench = s.bench.filter((p) => p.id !== inId);
  s.subsLeft--;
  s.ratings[inId] = 6;
  s.played.push(inId);
  m.events.push({ minute: Math.max(1, m.minute), type: 'sub', side, playerId: outId, playerName: leaving.name, inId, inName: incoming.name, reason });
  return null;
}

export function changeStyle(m: MatchState, side: Side, style: Style) {
  if (m[side].style === style) return;
  m[side].style = style;
  const label = { defensive: 'recua e passa a se defender', balanced: 'equilibra o time', attacking: 'adianta as linhas e vai pra cima' }[style];
  m.events.push({ minute: Math.max(1, m.minute), type: 'tactic', side, text: `${m[side].short} ${label}.` });
}

/** Reorganiza os jogadores em campo numa nova formação, pelo melhor encaixe. */
export function changeFormation(m: MatchState, side: Side, formation: Formation) {
  const s = m[side];
  if (s.formation === formation) return;
  const shape = FORMATIONS[formation];
  const pool = outfield(s);
  const total = shape.DF + shape.MF + shape.FW;
  // com expulsões, tira proporcionalmente do ataque primeiro
  let missing = total - pool.length;
  const want = { ...shape };
  for (const k of ['FW', 'MF', 'DF'] as const) { while (missing > 0 && want[k] > 1) { want[k]--; missing--; } }
  const used = new Set<string>();
  const take = (pos: Position, n: number) => {
    const picked = pool.filter((p) => !used.has(p.id)).sort((a, b) => ratingAt(b, pos) - ratingAt(a, pos)).slice(0, n);
    picked.forEach((p) => used.add(p.id));
    return picked;
  };
  s.DF = take('DF', want.DF); s.MF = take('MF', want.MF); s.FW = take('FW', want.FW);
  s.formation = formation;
  m.events.push({ minute: Math.max(1, m.minute), type: 'tactic', side, text: `${s.short} muda para o ${formation}.` });
}

function autoSubstitutions(m: MatchState, side: Side) {
  const s = m[side];
  if (!s.autoSubs || s.subsLeft <= 0 || m.minute < 55) return;
  const tired = outfield(s)
    .filter((p) => s.condition[p.id]! < TUNING.autoSubCondition)
    .sort((a, b) => s.condition[a.id]! - s.condition[b.id]!)[0];
  if (!tired) return;
  const replacement = s.bench
    .filter((p) => p.position === tired.position && p.position !== 'GK')
    .sort((a, b) => ratingAt(b, b.position) - ratingAt(a, a.position))[0];
  if (replacement) substitute(m, side, tired.id, replacement.id, 'cansaço');
}

export function stepMinute(m: MatchState, rng: Rng) {
  if (m.finished) return;
  m.minute++;
  const minute = m.minute;

  // cansaço
  for (const side of ['home', 'away'] as const) {
    const s = m[side];
    for (const p of onPitch(s)) {
      const drop = TUNING.fatiguePerMinute * (1.5 - p.attrs.stamina / 100) * STYLE[s.style].fatigue * (p.position === 'GK' ? 0.3 : 1);
      s.condition[p.id] = Math.max(0, s.condition[p.id]! - drop);
    }
    if (minute % 5 === 0) autoSubstitutions(m, side);
  }

  const hp = sectorPower(m.home);
  const ap = sectorPower(m.away);
  const power = { home: hp, away: ap };
  const e = TUNING.possessionExponent;
  const hm = hp.midfield * TUNING.homePossessionBoost;
  const possession = hm ** e / (hm ** e + ap.midfield ** e);
  const attacking: Side = rng.chance(possession) ? 'home' : 'away';
  m[attacking].stats.possessionMinutes++;

  // disciplina
  for (const side of ['home', 'away'] as const) {
    const s = m[side];
    const field = outfield(s);
    if (field.length === 0) continue;
    // time mais agressivo comete mais faltas e leva mais cartões (mesmo número de sorteios: o placar segue determinístico)
    const rate = foulRate(field);
    if (rng.chance(TUNING.yellowPerMinute * field.length * 0.5 * rate)) {
      const p = rng.weighted(field, (x) => (x.aggression + 60) * (s.yellows.includes(x.id) ? 0.3 : 1));
      s.stats.fouls++;
      if (s.yellows.includes(p.id)) {
        m.events.push({ minute, type: 'red', side, playerId: p.id, playerName: p.name });
        s.sentOff.push(p.id);
        bump(s, p.id, -1.5);
        removeFromPitch(s, p.id);
      } else {
        s.yellows.push(p.id);
        bump(s, p.id, -0.3);
        m.events.push({ minute, type: 'yellow', side, playerId: p.id, playerName: p.name });
      }
    } else if (rng.chance(TUNING.directRedPerMinute * field.length * rate)) {
      const p = rng.weighted(field, (x) => x.aggression ** 2);
      s.stats.fouls++;
      m.events.push({ minute, type: 'red', side, playerId: p.id, playerName: p.name });
      s.sentOff.push(p.id);
      bump(s, p.id, -1.5);
      removeFromPitch(s, p.id);
    } else if (rng.chance(0.06 * rate)) {
      s.stats.fouls++;
    }
  }

  if (rng.chance(TUNING.attackPerMinute)) {
    const defSide = other(attacking);
    const attackPower = power[attacking].attack;
    const ratio = attackPower / (attackPower + power[defSide].defense);
    const home = attacking === 'home' ? TUNING.homeChanceBoost : 1;
    const styleMult = STYLE[m[attacking].style].own * STYLE[m[defSide].style].conceded * home;
    if (rng.chance(Math.min(0.95, TUNING.shotFactor * ratio * styleMult))) shoot(m, attacking, power[defSide].keeper, minute, rng);
    else if (m[defSide].DF.length > 0) bump(m[defSide], rng.pick(m[defSide].DF).id, 0.04);
  }

  // "lance de sorte" (Elifoot 98: Random(180) em casa, Random(270) fora):
  // uma finalização que independe da força dos times — fonte das zebras.
  if (rng.chance(TUNING.luckyHome)) shoot(m, 'home', power.away.keeper, minute, rng);
  if (rng.chance(TUNING.luckyAway)) shoot(m, 'away', power.home.keeper, minute, rng);

  if (minute === m.firstHalfEnd) m.events.push({ minute, type: 'half' });
  if (minute >= m.total) finish(m);
}

/** Resolve uma finalização: gol, defesa, poste, barra ou fora (os 5 desfechos do Elifoot 98). */
function shoot(m: MatchState, attacking: Side, keeper: number, minute: number, rng: Rng) {
  const att = m[attacking];
  const def = m[other(attacking)];
  const shooters = [...att.FW, ...att.MF, ...att.DF];
  if (shooters.length === 0) return;
  const shooter = rng.weighted(shooters, (p) => {
    const w = att.FW.includes(p) ? 3 : att.MF.includes(p) ? 1.4 : 0.35;
    return w * p.attrs.finishing;
  });
  const finishing = shooter.attrs.finishing * conditionFactor(att.condition[shooter.id]!);
  const pGoal = TUNING.conversion * (2 * finishing) / (finishing + keeper);
  att.stats.shots++;
  const roll = rng.next();
  const T = TUNING;
  if (roll < pGoal) {
    att.stats.onTarget++;
    att.goals++;
    const mates = shooters.filter((p) => p.id !== shooter.id);
    const assist = mates.length > 0 && rng.chance(0.7) ? rng.weighted(mates, (p) => p.attrs.passing * (att.MF.includes(p) ? 1.5 : 1)) : undefined;
    bump(att, shooter.id, 1);
    if (assist) bump(att, assist.id, 0.5);
    bump(def, def.GK.id, -0.4);
    def.DF.forEach((p) => bump(def, p.id, -0.15));
    m.events.push({ minute, type: 'goal', side: attacking, playerId: shooter.id, playerName: shooter.name, assistName: assist?.name });
  } else if (roll < pGoal + T.postShare) {
    bump(att, shooter.id, 0.1);
    m.events.push({ minute, type: 'post', side: attacking, playerId: shooter.id, playerName: shooter.name });
  } else if (roll < pGoal + T.postShare + T.barShare) {
    bump(att, shooter.id, 0.1);
    m.events.push({ minute, type: 'bar', side: attacking, playerId: shooter.id, playerName: shooter.name });
  } else if (roll < pGoal + T.postShare + T.barShare + T.saveShare) {
    att.stats.onTarget++;
    bump(att, shooter.id, 0.15);
    bump(def, def.GK.id, 0.3);
    if (rng.chance(0.35)) att.stats.corners++;
    m.events.push({ minute, type: 'save', side: attacking, playerId: shooter.id, playerName: shooter.name, keeperName: def.GK.name });
  } else {
    bump(att, shooter.id, -0.05);
    if (rng.chance(0.25)) att.stats.corners++;
    m.events.push({ minute, type: 'miss', side: attacking, playerId: shooter.id, playerName: shooter.name });
  }
}

function finish(m: MatchState) {
  m.finished = true;
  m.events.push({ minute: m.minute, type: 'end' });
  const diff = m.home.goals - m.away.goals;
  for (const side of ['home', 'away'] as const) {
    const s = m[side];
    const d = side === 'home' ? diff : -diff;
    for (const id of s.played) bump(s, id, d > 0 ? 0.3 : d < 0 ? -0.2 : 0);
    if (m[other(side)].goals === 0) { bump(s, s.GK.id, 0.6); s.DF.forEach((p) => bump(s, p.id, 0.3)); }
  }
}

export function runToEnd(m: MatchState, rng: Rng, untilMinute = Infinity) {
  while (!m.finished && m.minute < untilMinute) stepMinute(m, rng);
}

export interface FootballOutcome extends MatchOutcome<MatchEvent> {
  stats: { home: TeamStats; away: TeamStats };
  /** Notas finais por jogador (todos que entraram). */
  ratings: Record<string, number>;
  played: { home: string[]; away: string[] };
  conditionAfter: Record<string, number>;
  sentOff: string[];
  /** Posse do mandante 0–1. */
  possession: number;
  motm: { playerId: string; side: Side; rating: number };
}

export function toOutcome(m: MatchState): FootballOutcome {
  const ratings: Record<string, number> = {};
  const conditionAfter: Record<string, number> = {};
  let motm = { playerId: m.home.GK.id, side: 'home' as Side, rating: 0 };
  for (const side of ['home', 'away'] as const) {
    const s = m[side];
    for (const id of s.played) {
      const r = Math.round(s.ratings[id]! * 10) / 10;
      ratings[id] = r;
      if (r > motm.rating) motm = { playerId: id, side, rating: r };
      conditionAfter[id] = Math.round(s.condition[id]!);
    }
  }
  const hp = m.home.stats.possessionMinutes, ap = m.away.stats.possessionMinutes;
  return {
    homeScore: m.home.goals,
    awayScore: m.away.goals,
    events: m.events,
    stats: { home: m.home.stats, away: m.away.stats },
    ratings,
    played: { home: m.home.played, away: m.away.played },
    conditionAfter,
    sentOff: [...m.home.sentOff, ...m.away.sentOff],
    possession: hp + ap > 0 ? hp / (hp + ap) : 0.5,
    motm,
  };
}

export function simulateFootballMatch(home: Club, away: Club, rng: Rng): FootballOutcome {
  const m = createMatch(home, away, rng);
  runToEnd(m, rng);
  return toOutcome(m);
}

export const football: HeadToHeadSport<Club, MatchEvent> = {
  id: 'football',
  name: 'Futebol',
  format: 'head-to-head',
  points: { win: 3, draw: 1, loss: 0 },
  allowsDraw: true,
  simulateMatch: simulateFootballMatch,
};
