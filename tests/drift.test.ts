import { acceptOffer, advanceDay, challengeOptions, closeSeason, isMatchDay, newWorld, simulateRound, startCareer, type Career } from '../src/game/career';
import { overall } from '../src/sports/football/lineup';

const avgByDivision = (c: Career) =>
  c.season.divisions.map((d) => {
    const xs = d.teamIds.flatMap((id) => c.clubs[id]!.players.map(overall).sort((a, b) => b - a).slice(0, 11));
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  });

describe('estabilidade do mundo', () => {
  it('nível médio por divisão não infla nem desaba em 5 temporadas', () => {
    const w = newWorld(4242);
    const c = startCareer(4242, 't', 'baixo', challengeOptions(w, 'baixo')[0]!.clubId);
    const start = avgByDivision(c);
    let perfNews = 0;
    for (let s = 0; s < 5; s++) {
      let g = 0;
      while (c.phase !== 'encerramento' && g++ < 3000) {
        if (c.unemployed) acceptOffer(c, c.offers[0]!);
        isMatchDay(c) ? simulateRound(c) : advanceDay(c);
      }
      perfNews += c.news.filter((n) => n.text.includes('grande atuação') && n.date.startsWith(String(c.season.year))).length;
      closeSeason(c);
      if (c.unemployed) acceptOffer(c, c.offers[0]!);
    }
    const end = avgByDivision(c);
    console.log('nível início', start.map((x) => x.toFixed(1)), 'fim', end.map((x) => x.toFixed(1)), 'notícias de atuação/5 temporadas', perfNews);
    end.forEach((v, i) => expect(Math.abs(v - start[i]!)).toBeLessThan(5));
  });
});
