import { challengeOptions, makeOffer, marketListings, myClubId, newWorld, offerTerms, startCareer, MAX_TRIES } from '../src/game/career';

function career(type: 'baixo' | 'crescimento' | 'pressao' = 'crescimento') {
  const w = newWorld(17, 'T');
  const c = startCareer(17, 'T', type, challengeOptions(w, type)[0]!.clubId);
  c.clubs[myClubId(c)]!.budget = 1e9;
  return c;
}

const pick = (c: ReturnType<typeof career>) => marketListings(c, 120).find((l) => !offerTerms(c, l.player.id, l.clubId)!.refuses)!;

describe('proposta negociada', () => {
  it('pagando o mínimo do clube e do atleta, a contratação sai com o salário oferecido', () => {
    const c = career();
    const l = pick(c);
    const t = offerTerms(c, l.player.id, l.clubId)!;
    const r = makeOffer(c, l.player.id, l.clubId, t.minFee, t.minWage);
    expect(r).toMatchObject({ status: 'accepted' });
    const p = c.clubs[myClubId(c)]!.players.find((x) => x.id === l.player.id)!;
    expect(p.wage).toBe(t.minWage);
    expect(p.joinedOn).toBe(c.date);
  });

  it('proposta um pouco abaixo vira contraproposta com os valores pedidos', () => {
    const c = career();
    const l = pick(c);
    const t = offerTerms(c, l.player.id, l.clubId)!;
    const r = makeOffer(c, l.player.id, l.clubId, Math.round(t.minFee * 0.9), t.minWage);
    expect(r).toMatchObject({ status: 'counter', fee: t.minFee });
  });

  it('proposta ofensiva encerra a conversa até o mês seguinte', () => {
    const c = career();
    const l = pick(c);
    const t = offerTerms(c, l.player.id, l.clubId)!;
    expect(makeOffer(c, l.player.id, l.clubId, Math.round(t.minFee * 0.5), t.minWage)).toMatchObject({ status: 'refused' });
    expect(makeOffer(c, l.player.id, l.clubId, t.minFee, t.minWage)).toMatch(/não quer mais conversar/);
  });

  it(`no máximo ${MAX_TRIES} tentativas por atleta no mês`, () => {
    const c = career();
    const l = pick(c);
    const t = offerTerms(c, l.player.id, l.clubId)!;
    const low = Math.round(t.minFee * 0.9);
    makeOffer(c, l.player.id, l.clubId, low, t.minWage);
    makeOffer(c, l.player.id, l.clubId, low, t.minWage);
    expect(makeOffer(c, l.player.id, l.clubId, low, t.minWage)).toMatchObject({ status: 'refused' });
    expect(typeof makeOffer(c, l.player.id, l.clubId, t.minFee, t.minWage)).toBe('string');
  });

  it('atleta bom recusa descer duas divisões', () => {
    const c = career('baixo'); // Divisão 4
    const fromTop = marketListings(c, 400).find((l) => c.season.divisions[0]!.teamIds.includes(l.clubId) && l.player.age < 33);
    if (fromTop) expect(offerTerms(c, fromTop.player.id, fromTop.clubId)!.refuses).toBeTruthy();
  });
});
