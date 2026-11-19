import type { Rng } from '../../core/rng';
import type { HeadToHeadSport, MatchOutcome } from '../../core/sport';
import { pickLineup, ratingAt, type Lineup } from './lineup';
import type { Club, MatchEvent, Player, Style } from './types';

/**
 * Motor de partida do futebol.
 *
 * Diferenças deliberadas em relação ao Elifoot 98 (ver docs/DESIGN.md):
 * - Existe posse de bola, decidida pelo meio-campo → empilhar atacantes tem custo.
 * - Cada setor usa um atributo diferente (defesa, passe, ataque, goleiro).
 * - Estilo de jogo é uma troca: atacar cria mais chances mas expõe a defesa.
 */
export const TUNING = {
  minutes: 90,
  attackPerMinute: 0.5,
  shotFactor: 0.62,
  conversion: 0.225,
  homeBoost: 1.07,
  possessionExponent: 1.25,
  yellowPerMinute: 0.0035,
  directRedPerMinute: 0.000025,
};

const STYLE: Record<Style, { own: number; conceded: number }> = {
  defensive: { own: 0.8, conceded: 0.78 },
  balanced: { own: 1, conceded: 1 },
  attacking: { own: 1.2, conceded: 1.16 },
};

export interface SectorPower {
  defense: number;
  midfield: number;
  attack: number;
  keeper: number;
}

const sum = (players: Player[], f: (p: Player) => number) => players.reduce((a, p) => a + f(p), 0);

export function sectorPower(l: Lineup): SectorPower {
  return {
    defense: sum(l.DF, (p) => ratingAt(p, 'DF')) + 0.35 * sum(l.MF, (p) => p.defense),
    midfield:
      sum(l.MF, (p) => ratingAt(p, 'MF')) + 0.25 * sum(l.DF, (p) => p.passing) + 0.25 * sum(l.FW, (p) => p.passing),
    attack: sum(l.FW, (p) => ratingAt(p, 'FW')) + 0.4 * sum(l.MF, (p) => p.attack) + 0.1 * sum(l.DF, (p) => p.attack),
    keeper: ratingAt(l.GK, 'GK'),
  };
}

export interface FootballOutcome extends MatchOutcome<MatchEvent> {
  homeXI: string[];
  awayXI: string[];
  /** Posse do mandante, 0–1. */
  possession: number;
}

type Side = 'home' | 'away';

interface LiveSide {
  club: Club;
  lineup: Lineup;
  power: SectorPower;
  yellows: Set<string>;
}

function removePlayer(s: LiveSide, id: string) {
  const l = s.lineup;
  let DF = l.DF.filter((p) => p.id !== id);
  let MF = l.MF.filter((p) => p.id !== id);
  let FW = l.FW.filter((p) => p.id !== id);
  let GK = l.GK;
  if (l.GK.id === id) {
    // goleiro expulso: o jogador de linha mais fraco no ataque vai pro gol
    const stand = [...DF, ...MF, ...FW].sort((a, b) => a.attack - b.attack)[0];
    if (stand) {
      GK = stand;
      DF = DF.filter((p) => p.id !== stand.id);
      MF = MF.filter((p) => p.id !== stand.id);
      FW = FW.filter((p) => p.id !== stand.id);
    }
  }
  s.lineup = { GK, DF, MF, FW };
  s.power = sectorPower(s.lineup);
}

export function simulateFootballMatch(home: Club, away: Club, rng: Rng): FootballOutcome {
  const mk = (club: Club): LiveSide => {
    const lineup = pickLineup(club);
    return { club, lineup, power: sectorPower(lineup), yellows: new Set() };
  };
  const sides: Record<Side, LiveSide> = { home: mk(home), away: mk(away) };
  const homeXI = [sides.home.lineup.GK, ...sides.home.lineup.DF, ...sides.home.lineup.MF, ...sides.home.lineup.FW].map((p) => p.id);
  const awayXI = [sides.away.lineup.GK, ...sides.away.lineup.DF, ...sides.away.lineup.MF, ...sides.away.lineup.FW].map((p) => p.id);

  const events: MatchEvent[] = [];
  const score = { home: 0, away: 0 };
  let homePossessionMinutes = 0;
  const stoppage = rng.int(1, 5);
  const total = TUNING.minutes + stoppage;

  for (let minute = 1; minute <= total; minute++) {
    const hb = TUNING.homeBoost;
    const hm = sides.home.power.midfield * hb;
    const am = sides.away.power.midfield;
    const e = TUNING.possessionExponent;
    const possession = hm ** e / (hm ** e + am ** e);
    const attacking: Side = rng.chance(possession) ? 'home' : 'away';
    if (attacking === 'home') homePossessionMinutes++;

    // cartões (independem de quem ataca)
    for (const side of ['home', 'away'] as const) {
      const s = sides[side];
      const outfield = [...s.lineup.DF, ...s.lineup.MF, ...s.lineup.FW];
      if (outfield.length === 0) continue;
      if (rng.chance(TUNING.yellowPerMinute * outfield.length * 0.5)) {
        // quem já tem amarelo joga com cautela → peso menor
        const p = rng.weighted(outfield, (x) => (x.aggression + 60) * (s.yellows.has(x.id) ? 0.3 : 1));
        if (s.yellows.has(p.id)) {
          events.push({ minute, type: 'red', side, playerId: p.id, playerName: p.name });
          removePlayer(s, p.id);
        } else {
          s.yellows.add(p.id);
          events.push({ minute, type: 'yellow', side, playerId: p.id, playerName: p.name });
        }
      } else if (rng.chance(TUNING.directRedPerMinute * outfield.length)) {
        const p = rng.weighted(outfield, (x) => x.aggression ** 2);
        events.push({ minute, type: 'red', side, playerId: p.id, playerName: p.name });
        removePlayer(s, p.id);
      }
    }

    if (!rng.chance(TUNING.attackPerMinute)) continue;

    const att = sides[attacking];
    const def = sides[attacking === 'home' ? 'away' : 'home'];
    const attackPower = att.power.attack * (attacking === 'home' ? hb : 1);
    const ratio = attackPower / (attackPower + def.power.defense);
    const styleMult = STYLE[att.club.style].own * STYLE[def.club.style].conceded;
    if (!rng.chance(Math.min(0.95, TUNING.shotFactor * ratio * styleMult))) continue;

    const shooters = [...att.lineup.FW, ...att.lineup.MF, ...att.lineup.DF];
    if (shooters.length === 0) continue;
    const shooter = rng.weighted(shooters, (p) => {
      const w = att.lineup.FW.includes(p) ? 3 : att.lineup.MF.includes(p) ? 1.4 : 0.35;
      return w * p.attack;
    });
    const gk = def.power.keeper;
    const pGoal = TUNING.conversion * (2 * shooter.attack) / (shooter.attack + gk);

    const roll = rng.next();
    if (roll < pGoal) {
      score[attacking]++;
      events.push({ minute, type: 'goal', side: attacking, playerId: shooter.id, playerName: shooter.name });
    } else if (roll < pGoal + 0.03) {
      events.push({ minute, type: 'post', side: attacking, playerName: shooter.name });
    } else if (roll < pGoal + 0.4) {
      events.push({ minute, type: 'save', side: attacking, playerName: shooter.name });
    } else {
      events.push({ minute, type: 'miss', side: attacking, playerName: shooter.name });
    }
  }

  return {
    homeScore: score.home,
    awayScore: score.away,
    events,
    homeXI,
    awayXI,
    possession: homePossessionMinutes / total,
  };
}

export const football: HeadToHeadSport<Club, MatchEvent> = {
  id: 'football',
  name: 'Futebol',
  format: 'head-to-head',
  points: { win: 3, draw: 1, loss: 0 },
  allowsDraw: true,
  simulateMatch: simulateFootballMatch,
};
