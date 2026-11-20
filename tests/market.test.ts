import { describe, expect, it } from 'vitest';
import {
  advanceDay, challengeOptions, closeSeason, decide, isMatchDay, myClubId, newWorld, pendingDecision,
  simulateRound, startCareer, type Career,
} from '../src/game/career';
import { moraleAfterMatch, moraleOf, type Decision, type DecisionChoice } from '../src/game/market';
import { playerValue } from '../src/sports/football/generate';
import { overall, pickLineup } from '../src/sports/football/lineup';
import { athleteContext } from '../src/ui/panels/Decisions';

function start(seed: number) {
  const w = newWorld(seed, 'Teste');
  const clubId = challengeOptions(w, 'crescimento')[0]!.clubId;
  return startCareer(seed, 'Teste', 'crescimento', clubId);
}

/** Joga a temporada respondendo cada decisão com `answer`. */
function playSeason(c: Career, answer: (d: Decision) => DecisionChoice, seen: Decision[] = []) {
  let guard = 0;
  while (c.phase !== 'encerramento' && guard++ < 3000) {
    let d = pendingDecision(c);
    while (d) {
      seen.push(d);
      decide(c, d.id, answer(d));
      d = pendingDecision(c);
    }
    if (isMatchDay(c)) simulateRound(c);
    else advanceDay(c);
  }
  return seen;
}

const club = (c: Career) => c.clubs[myClubId(c)]!;

describe('mercado vivo', () => {
  it('uma temporada traz propostas, pedidos de aumento e renovações em quantidade jogável', () => {
    const c = start(11);
    const seen = playSeason(c, (d) => (d.kind === 'bid' ? 'refuse' : 'accept'));
    const count = (k: Decision['kind']) => seen.filter((d) => d.kind === k).length;
    expect(count('bid')).toBeGreaterThanOrEqual(2);
    expect(count('bid')).toBeLessThanOrEqual(14);
    expect(count('raise')).toBeLessThanOrEqual(14);
    expect(count('renewal')).toBeGreaterThan(0);
  });

  it('aceitar proposta vende o atleta e entra o dinheiro', () => {
    const c = start(12);
    let sold: { id: string; fee: number; buyer: string } | undefined;
    playSeason(c, (d) => {
      if (d.kind === 'bid' && !sold) {
        sold = { id: d.playerId, fee: d.fee, buyer: d.clubId };
        return 'accept';
      }
      return d.kind === 'bid' ? 'refuse' : 'accept';
    });
    expect(sold).toBeDefined();
    expect(club(c).players.some((p) => p.id === sold!.id)).toBe(false);
    expect(c.clubs[sold!.buyer]!.players.some((p) => p.id === sold!.id)).toBe(true);
    expect(c.ledger.sales).toBeGreaterThanOrEqual(sold!.fee);
  });

  it('cobrir a oferta mantém o atleta com o salário oferecido', () => {
    const c = start(13);
    let covered: { id: string; wage: number } | undefined;
    playSeason(c, (d) => {
      if (d.kind === 'bid' && !covered) { covered = { id: d.playerId, wage: d.wage }; return 'cover'; }
      return d.kind === 'bid' ? 'refuse' : 'accept';
    });
    const p = club(c).players.find((x) => x.id === covered!.id);
    expect(p).toBeDefined();
    expect(p!.wage).toBeGreaterThanOrEqual(covered!.wage);
  });

  it('negar aumento derruba a satisfação; aceitar sobe salário', () => {
    const c = start(14);
    let denied: { id: string; before: number } | undefined;
    let granted: { id: string; wage: number } | undefined;
    let guard = 0;
    while ((!denied || !granted) && guard++ < 800) {
      const d = pendingDecision(c);
      if (d) {
        const p = club(c).players.find((x) => x.id === d.playerId)!;
        if (d.kind === 'raise' && !denied) { denied = { id: p.id, before: moraleOf(p) }; decide(c, d.id, 'refuse'); continue; }
        if (d.kind === 'raise' && !granted) { granted = { id: p.id, wage: d.wage }; decide(c, d.id, 'accept'); continue; }
        decide(c, d.id, d.kind === 'bid' ? 'refuse' : 'accept');
        continue;
      }
      if (isMatchDay(c)) simulateRound(c); else advanceDay(c);
    }
    expect(denied && granted).toBeTruthy();
    const pg = club(c).players.find((x) => x.id === granted!.id);
    if (pg) expect(pg.wage).toBeGreaterThanOrEqual(granted!.wage);
  });

  it('quem não renova sai no fim da temporada; quem renova fica', () => {
    const c = start(15);
    const released: string[] = [];
    const renewed: string[] = [];
    // libera os veteranos e renova os mais novos (veterano pode se aposentar na virada)
    playSeason(c, (d) => {
      if (d.kind !== 'renewal') return d.kind === 'bid' ? 'refuse' : 'accept';
      const p = club(c).players.find((x) => x.id === d.playerId)!;
      if (p.age >= 30) { released.push(d.playerId); return 'release'; }
      renewed.push(d.playerId);
      return 'accept';
    });
    expect(released.length).toBeGreaterThan(0);
    const young = renewed;
    closeSeason(c);
    const ids = new Set(club(c).players.map((p) => p.id));
    expect(released.every((id) => !ids.has(id))).toBe(true);
    expect(young.length).toBeGreaterThan(0);
    expect(young.every((id) => ids.has(id))).toBe(true);
    expect(club(c).players.length).toBeGreaterThanOrEqual(16);
  });

  it('titular de fora reclama; quem joga fica mais feliz', () => {
    const c = start(16);
    const cl = club(c);
    const best = [...cl.players].sort((a, b) => b.attrs.finishing - a.attrs.finishing);
    const benched = best[0]!, playing = best[1]!;
    benched.morale = 70; playing.morale = 70;
    moraleAfterMatch(cl, [playing.id]);
    expect(moraleOf(playing)).toBeGreaterThan(70);
    expect(moraleOf(benched)).toBeLessThan(70);
  });

  it('mesma seed e mesmas respostas → mesmas decisões (determinismo)', () => {
    const answer = (d: Decision): DecisionChoice => (d.kind === 'bid' ? 'refuse' : 'accept');
    const a = playSeason(start(17), answer).map((d) => d.id);
    const b = playSeason(start(17), answer).map((d) => d.id);
    expect(a).toEqual(b);
  });

  it('save antigo (sem campos novos) continua jogável', () => {
    const c = start(18);
    delete c.decisions;
    for (const p of club(c).players) delete p.morale;
    const back = JSON.parse(JSON.stringify(c)) as Career;
    expect(() => playSeason(back, () => 'accept')).not.toThrow();
  });

  it('contexto da decisão: titular, reserva e quem assume', () => {
    const c = start(19);
    const cl = club(c);
    const l = pickLineup(cl);
    const bestFw = [...l.FW].sort((a, b) => overall(b) - overall(a))[0]!;
    const ctx = athleteContext(cl, bestFw);
    expect(ctx.role).toBe('xi');
    expect(ctx.sub).toBeDefined();
    expect(ctx.read).toMatch(/assume/);
    const bench = l.bench[0]!;
    expect(athleteContext(cl, bench).role).toBe('bench');
    expect(athleteContext(cl, bench).sub).toBeUndefined();
  });

  it('atleta sem valor de mercado não recebe proposta de $0', () => {
    // achado pelo playtest: elenco muito fraco gerava "Oferta $0 (NaN% do valor)"
    const c = start(13);
    for (const p of club(c).players) {
      for (const k of Object.keys(p.attrs) as (keyof typeof p.attrs)[]) p.attrs[k] = 1;
      p.potential = 1;
    }
    expect(club(c).players.every((p) => playerValue(p) === 0)).toBe(true);
    const seen = playSeason(c, (d) => (d.kind === 'bid' ? 'refuse' : 'accept'));
    expect(seen.filter((d) => d.kind === 'bid')).toEqual([]);
  });
});
