import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS, HELP_TOPIC_COUNT, checkState, emptyAch, normalizeAch, onAction, onHelpTopic, onMatch, onSeasonEnd,
  seasonFacts, snapshotForActions, type AchState,
} from '../src/game/achievements';
import {
  advanceDay, buyPlayer, challengeOptions, closeSeason, decide, isMatchDay, marketListings, myClubId, newWorld,
  pendingDecision, seasonSummary, sellPlayer, simulateRound, startCareer, type Career,
} from '../src/game/career';
import { NOVA_IGUACU_ID } from '../src/sports/football/generate';

function start(seed: number, type: 'baixo' | 'crescimento' | 'pressao' = 'crescimento') {
  const w = newWorld(seed, 'T');
  return startCareer(seed, 'T', type, challengeOptions(w, type)[0]!.clubId);
}

/** Joga a temporada simulando tudo e alimentando as conquistas de partida. */
function playSeason(c: Career, s: AchState, opts: { watched?: boolean } = {}) {
  const got: string[] = [];
  let guard = 0;
  while (c.phase !== 'encerramento' && guard++ < 3000) {
    let d = pendingDecision(c);
    while (d) { decide(c, d.id, d.kind === 'bid' ? 'refuse' : 'accept'); d = pendingDecision(c); }
    if (isMatchDay(c)) {
      const year = c.season.year;
      const r = simulateRound(c);
      const me = myClubId(c);
      const m = r.matches.find((x) => x.home === me || x.away === me)!;
      got.push(...onMatch(s, { career: c, outcome: m.outcome, side: m.home === me ? 'home' : 'away', homeId: m.home, awayId: m.away, watched: !!opts.watched, simulated: !opts.watched, subs: 0, year }));
    } else advanceDay(c);
  }
  return got;
}

const boost = (c: Career, v: number) => {
  for (const p of c.clubs[myClubId(c)]!.players) for (const k of Object.keys(p.attrs) as (keyof typeof p.attrs)[]) p.attrs[k] = v;
};

describe('conquistas: catálogo', () => {
  it('51 conquistas, ids únicos, numeradas de 1 a 51, 20/15/10/6 por raridade', () => {
    expect(ACHIEVEMENTS).toHaveLength(51);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(51);
    expect(ACHIEVEMENTS.map((a) => a.n)).toEqual(Array.from({ length: 51 }, (_, i) => i + 1));
    const count = (t: string) => ACHIEVEMENTS.filter((a) => a.tier === t).length;
    expect([count('bronze'), count('prata'), count('ouro'), count('lendaria')]).toEqual([20, 15, 10, 6]);
  });

  it('estado salvo corrompido ou antigo vira um estado válido', () => {
    expect(normalizeAch(null).unlocked).toEqual({});
    expect(normalizeAch('lixo').matches).toBe(0);
    const old = normalizeAch({ unlocked: { 'primeiro-apito': 'x' } });
    expect(old.unlocked['primeiro-apito']).toBe('x');
    expect(old.helpTopics).toEqual([]);
  });
});

describe('conquistas: partidas e temporada', () => {
  it('uma temporada simulada destrava as básicas e não repete desbloqueio', () => {
    const c = start(31);
    const s = emptyAch();
    const got = playSeason(c, s);
    expect(got).toContain('primeiro-apito');
    expect(got).toContain('primeira-vitoria');
    expect(got).toContain('classico-do-sofa');
    expect(got.filter((id) => id === 'primeiro-apito')).toHaveLength(1);
    expect(s.matches).toBe(22);
  });

  it('elenco no máximo: campeão, objetivo cumprido e conquistas de temporada', () => {
    const c = start(32);
    boost(c, 99);
    const s = emptyAch();
    playSeason(c, s);
    const facts = seasonFacts(c, seasonSummary(c));
    expect(facts.summary.position).toBe(1);
    closeSeason(c);
    const got = onSeasonEnd(s, facts, c);
    expect(got).toEqual(expect.arrayContaining(['missao-cumprida', 'campeao']));
    if (facts.summary.promoted) expect(got).toContain('subiu');
    if (facts.lost === 0) expect(got).toContain('temporada-perfeita');
  });

  it('assistir narrada conta para "Ouvido colado"', () => {
    const c = start(33);
    const s = emptyAch();
    const got = playSeason(c, s, { watched: true });
    expect(got).toContain('ouvido-colado');
    expect(got).not.toContain('classico-do-sofa');
  });
});

describe('conquistas: ações, ajuda e colecionador', () => {
  it('comprar e vender atleta', () => {
    const c = start(34);
    c.clubs[myClubId(c)]!.budget = 50_000_000;
    const s = emptyAch();
    const l = marketListings(c)[0]!;
    let snap = snapshotForActions(c);
    expect(buyPlayer(c, l.player.id, l.clubId)).toBeNull();
    expect(onAction(s, snap, c)).toContain('reforco');
    snap = snapshotForActions(c);
    const p = c.clubs[myClubId(c)]!.players.find((x) => x.id !== l.player.id)!;
    expect(sellPlayer(c, p.id)).toBeNull();
    expect(onAction(s, snap, c)).toContain('negocio-fechado');
  });

  it('ler todos os assuntos da ajuda', () => {
    const s = emptyAch();
    const topics = ['jogo', 'tempo', 'partida', 'elenco', 'mercado', 'financas', 'temporada', 'selos'];
    expect(topics).toHaveLength(HELP_TOPIC_COUNT);
    let got: string[] = [];
    for (const t of topics) got = got.concat(onHelpTopic(s, t), onHelpTopic(s, t));
    expect(got).toEqual(['licao-de-casa']);
  });

  it('"Colecionador" chega sozinho ao completar todas as outras', () => {
    const s = emptyAch();
    for (const a of ACHIEVEMENTS) if (a.id !== 'colecionador' && a.id !== 'licao-de-casa') s.unlocked[a.id] = 'x';
    s.helpTopics = ['jogo', 'tempo', 'partida', 'elenco', 'mercado', 'financas', 'temporada'];
    expect(onHelpTopic(s, 'selos')).toEqual(['licao-de-casa', 'colecionador']);
  });
});

describe('Nova Iguaçu (conquista 51)', () => {
  it('existe exatamente um Nova Iguaçu em todo mundo gerado', () => {
    for (const seed of [1, 2, 3, 42, 777, 2026]) {
      const w = newWorld(seed, 'T');
      const ni = Object.values(w.clubs).filter((c) => c.name === 'Nova Iguaçu');
      expect(ni, `seed ${seed}`).toHaveLength(1);
      expect(ni[0]!.id).toBe(NOVA_IGUACU_ID);
    }
  });

  it('receber proposta do Nova Iguaçu destrava "Laranja da Baixada"', () => {
    const c = start(35);
    const s = emptyAch();
    const ni = c.clubs[NOVA_IGUACU_ID]!;
    c.offers = [{ clubId: ni.id, objective: 'meio', monthlySalary: 10_000 }];
    expect(checkState(s, c)).toContain('laranja-da-baixada');
  });
});
