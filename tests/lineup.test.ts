import { buyPlayer, challengeOptions, isNewSigning, marketListings, myClubId, newWorld, startCareer } from '../src/game/career';
import { applyMove, pickLineup, planMove, starters, statusOf } from '../src/sports/football/lineup';

function career() {
  const w = newWorld(11, 'Teste');
  return startCareer(11, 'Teste', 'crescimento', challengeOptions(w, 'crescimento')[0]!.clubId);
}

describe('escalação manual', () => {
  it('escalar um reserva troca com o titular mais fraco da mesma posição e mantém 11', () => {
    const c = career();
    const club = c.clubs[myClubId(c)]!;
    const st = statusOf(club);
    const reserve = club.players.find((p) => st[p.id] !== 'xi' && p.position === 'MF' && p.suspended <= 0)!;
    const plan = planMove(club, reserve.id, 'xi')!;
    expect(plan.swapWith?.position).toBe('MF');
    applyMove(club, reserve.id, 'xi');
    const xi = starters(pickLineup(club)).map((p) => p.id);
    expect(xi).toHaveLength(11);
    expect(xi).toContain(reserve.id);
    expect(xi).not.toContain(plan.swapWith!.id);
    expect(statusOf(club)[plan.swapWith!.id]).toBe('bench');
  });

  it('tirar um titular da relação põe o melhor reserva da posição', () => {
    const c = career();
    const club = c.clubs[myClubId(c)]!;
    const gk = pickLineup(club).GK;
    applyMove(club, gk.id, 'out');
    const l = pickLineup(club);
    expect(l.GK.id).not.toBe(gk.id);
    expect(l.GK.position).toBe('GK');
    expect(statusOf(club)[gk.id]).toBe('out');
  });

  it('a escolha manual vale mesmo com atleta cansado, e suspenso é reposto', () => {
    const c = career();
    const club = c.clubs[myClubId(c)]!;
    const tired = club.players.find((p) => statusOf(club)[p.id] === 'out' && p.position === 'FW')
      ?? club.players.find((p) => statusOf(club)[p.id] === 'bench' && p.position === 'FW')!;
    applyMove(club, tired.id, 'xi');
    tired.condition = 40;
    expect(starters(pickLineup(club)).map((p) => p.id)).toContain(tired.id);
    tired.suspended = 1;
    const xi = starters(pickLineup(club));
    expect(xi).toHaveLength(11);
    expect(xi.map((p) => p.id)).not.toContain(tired.id);
  });
});

describe('contratação', () => {
  it('atleta contratado recebe o selo novo por 30 dias', () => {
    const c = career();
    const me = c.clubs[myClubId(c)]!;
    me.budget = 1e9;
    let bought;
    for (const l of marketListings(c, 60)) if (!buyPlayer(c, l.player.id, l.clubId)) { bought = me.players.find((p) => p.id === l.player.id); break; }
    expect(bought).toBeDefined();
    expect(isNewSigning(bought!, c.date)).toBe(true);
    expect(isNewSigning(bought!, '2099-01-01')).toBe(false);
  });
});
