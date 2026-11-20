import {
  acceptOffer, advanceDay, buyPlayer, challengeOptions, closeSeason, completeRound, isMatchDay, liveRng,
  marketListings, myClubId, newWorld, prepareRound, seasonSummary, simulateRound, startCareer, type Career,
} from '../src/game/career';
import { changeStyle, runToEnd, substitute, toOutcome } from '../src/sports/football/engine';

/** Joga até o fim da temporada simulando as rodadas. */
function playSeason(c: Career) {
  let guard = 0;
  while (c.phase !== 'encerramento' && guard++ < 2000) {
    if (c.unemployed) break;
    if (isMatchDay(c)) simulateRound(c);
    else advanceDay(c);
  }
}

function start(seed: number, type: 'baixo' | 'crescimento' | 'pressao' = 'baixo') {
  const w = newWorld(seed, 'Teste');
  const clubId = challengeOptions(w, type)[0]!.clubId;
  return startCareer(seed, 'Teste', type, clubId);
}

describe('carreira com calendário', () => {
  it('empreendedor é separado da organização (GDD 2.7)', () => {
    const c = start(1);
    const club = c.clubs[myClubId(c)]!;
    expect(c.entrepreneur.bonds[0]!.type).toBe('contratado');
    const cash0 = c.entrepreneur.cash, budget0 = club.budget;
    while (c.date < '2027-02-01') advanceDay(c); // passa o dia 1º de fev → salário mensal
    expect(c.entrepreneur.cash).toBeGreaterThan(cash0);
    expect(club.budget).not.toBe(budget0);
  });

  it('desafios oferecem clubes da divisão certa com objetivo', () => {
    const w = newWorld(3);
    const low = challengeOptions(w, 'baixo');
    const high = challengeOptions(w, 'pressao');
    expect(low.every((o) => w.season.divisions[3]!.teamIds.includes(o.clubId))).toBe(true);
    expect(high.every((o) => w.season.divisions[0]!.teamIds.includes(o.clubId))).toBe(true);
    expect(high.some((o) => o.objective === 'titulo')).toBe(true);
  });

  it('mesma seed → mesma carreira (base do online)', () => {
    const a = start(123), b = start(123);
    playSeason(a); playSeason(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('partida ao vivo com a mesma sequência dá o mesmo resultado que simular', () => {
    const a = start(7), b = start(7);
    while (!isMatchDay(a)) { advanceDay(a); advanceDay(b); }
    simulateRound(a);
    const prep = prepareRound(b);
    runToEnd(prep.match, liveRng(prep));
    completeRound(b, prep, toOutcome(prep.match));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('intervenções mudam a partida e são aceitas pelo motor', () => {
    const c = start(8);
    while (!isMatchDay(c)) advanceDay(c);
    const prep = prepareRound(c);
    const rng = liveRng(prep);
    const side = prep.match.home.clubId === myClubId(c) ? 'home' : 'away';
    runToEnd(prep.match, rng, 30);
    changeStyle(prep.match, side, 'attacking');
    const s = prep.match[side];
    expect(substitute(prep.match, side, s.FW[0]!.id, s.bench.find((p) => p.position !== 'GK')!.id)).toBeNull();
    runToEnd(prep.match, rng);
    const o = toOutcome(prep.match);
    expect(o.events.some((e) => e.type === 'tactic')).toBe(true);
    expect(o.events.some((e) => e.type === 'sub')).toBe(true);
    completeRound(c, prep, o);
    expect(c.season.round).toBe(1);
  });

  it('roda 3 temporadas completas com elencos válidos e calendário coerente', () => {
    const c = start(9);
    for (let s = 0; s < 3; s++) {
      playSeason(c);
      if (c.unemployed) {
        expect(c.offers.length).toBeGreaterThan(0);
      }
      if (c.phase === 'encerramento') closeSeason(c);
      if (c.unemployed) {
        // aceita a primeira proposta e segue
        const o = c.offers[0]!;
        acceptOffer(c, o);
      }
    }
    expect(c.season.year).toBe(2030);
    expect(c.entrepreneur.history).toHaveLength(3);
    expect(c.awards.length).toBe(12);
    for (const club of Object.values(c.clubs)) {
      expect(club.players.filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(1);
      expect(club.players.length).toBeGreaterThanOrEqual(16);
    }
  });

  it('save sobrevive a JSON', () => {
    const c = start(5);
    for (let i = 0; i < 40; i++) isMatchDay(c) ? simulateRound(c) : advanceDay(c);
    const r: Career = JSON.parse(JSON.stringify(c));
    for (let i = 0; i < 40; i++) { isMatchDay(c) ? simulateRound(c) : advanceDay(c); isMatchDay(r) ? simulateRound(r) : advanceDay(r); }
    expect(JSON.stringify(r)).toBe(JSON.stringify(c));
  });

  it('compra respeita o caixa', () => {
    const c = start(11);
    c.clubs[myClubId(c)]!.budget = 0;
    const l = marketListings(c)[0]!;
    expect(buyPlayer(c, l.player.id, l.clubId)).toBe('Caixa insuficiente.');
  });
});

describe('demissão por caixa negativo', () => {
  it('quem quebra o clube perde reputação mesmo cumprindo o objetivo em campo', () => {
    const w = newWorld(21, 'Teste');
    const c = startCareer(21, 'Teste', 'crescimento', challengeOptions(w, 'crescimento')[0]!.clubId);
    const club = c.clubs[myClubId(c)]!;
    for (const p of club.players) {
      for (const k of Object.keys(p.attrs) as (keyof typeof p.attrs)[]) p.attrs[k] = 99;
    }
    playSeason(c);
    club.budget = -50_000_000; // fecha a temporada no vermelho, mesmo somando a premiação
    const s = seasonSummary(c);
    expect(s.achieved).toBe(true);
    expect(s.broke).toBe(true);
    expect(s.fired).toBe(true);
    expect(s.reputationDelta).toBe(-10 + (s.promoted ? 4 : 0) + (s.position === 1 ? 5 : 0));
    expect(s.reputationDelta).toBeLessThan(0);
  });
});
