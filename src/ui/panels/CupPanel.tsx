import { formatDate } from '../../core/calendar';
import { myClubId, type Career } from '../../game/career';
import { cupIn, cupKind, cupName, cupPrizes, cupStatus, stageName, type Cup, type CupTie } from '../../game/cup';
import { Flag } from '../flag';
import { money } from '../util';

/** Chaveamento da copa: fase a fase, com o seu caminho em destaque. */
export function CupPanel({ career, cup, title }: { career: Career; cup: Cup | undefined; title: string }) {
  if (!cup) return <p className="hint">A {title} começa na próxima temporada.</p>;
  const me = myClubId(career);
  const name = (id: string) => career.clubs[id]?.name ?? id;
  const st = cupStatus(cup, me);
  const copa = cupKind(cup) === 'copa';
  return (
    <div className="cup">
      <p className="cup-status">{statusText(cup, st, name)}</p>
      <p className="hint">{copa
        ? 'Mata-mata em jogo único com os 48 clubes. Quem é de divisão mais baixa joga em casa; empate vai para os pênaltis.'
        : 'Os 4 primeiros da Divisão 1 contra 12 clubes da América do Sul, em jogo único com mando sorteado; empate vai para os pênaltis.'}
        {' '}Prêmio por fase vencida: {cupPrizes(cup).map((p) => money(p)).join(' · ')}.</p>
      {cup.ties.slice().reverse().map((ties, ri) => {
        const r = cup.ties.length - 1 - ri;
        return (
          <section key={r} className="cup-round">
            <h5>{stageName(cup, r)} <span className="hint">· {formatDate(cup.dates[r]!)}</span></h5>
            <ul className="rb-list">
              {ties.map((t) => <TieRow key={`${t.home}-${t.away}`} t={t} me={me} career={career} />)}
            </ul>
          </section>
        );
      })}
      {cup.round === 0 && cup.byes.length > 0 && (
        <p className="hint">Entram na {stageName(cup, 1)}: {cup.byes.map(name).join(', ')}.</p>
      )}
    </div>
  );
}

function TieRow({ t, me, career }: { t: CupTie; me: string; career: Career }) {
  const played = t.winner !== undefined;
  const mine = t.home === me || t.away === me;
  const name = (id: string) => {
    const club = career.clubs[id];
    return <>{club?.country && <Flag country={club.country} />} {club?.name ?? id}</>;
  };
  return (
    <li className={`rb-row ${mine ? 'me' : ''}`}>
      <span className={`rb-team home ${t.winner === t.home ? 'won' : played ? 'lost' : ''}`}>{name(t.home)}</span>
      <b className="rb-score">{played ? `${t.hs} × ${t.as}` : '×'}{t.pens && <small className="pens">pên. {t.pens[0]}-{t.pens[1]}</small>}</b>
      <span className={`rb-team ${t.winner === t.away ? 'won' : played ? 'lost' : ''}`}>{name(t.away)}</span>
    </li>
  );
}

function statusText(cup: Cup, st: ReturnType<typeof cupStatus>, name: (id: string) => string): string {
  if (cup.championId && st?.champion) return `🏆 Você é o campeão da ${cupName(cup)} ${cup.year}!`;
  if (!st) return cupKind(cup) === 'copa' ? 'Seu clube não está na copa deste ano.' : `Seu clube não se classificou. Os 4 primeiros da Divisão 1 vão à ${cupName(cup)} do ano seguinte.${cup.championId ? ` Campeão: ${name(cup.championId)}.` : ''}`;
  if (st.out) return `Eliminado ${cupIn(cup, st.round)} pelo ${name(st.by!)}.${cup.championId ? ` Campeão: ${name(cup.championId)}.` : ''}`;
  if (cup.championId) return `Campeão: ${name(cup.championId)}.`;
  return `Seu clube está ${cupIn(cup, st.round)}, em ${formatDate(cup.dates[st.round]!)}.`;
}
