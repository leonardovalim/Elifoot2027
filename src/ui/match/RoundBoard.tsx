import { useState } from 'react';
import type { Career, PreparedRound } from '../../game/career';
import type { MatchEvent } from '../../sports/football/types';
import { Flag } from '../flag';

export type Scope = 'div' | 'all';
/** Escolha lembrada enquanto o jogo está aberto: a próxima rodada abre do mesmo jeito. */
let lastScope: Scope = 'div';

interface Row {
  key: string;
  home: string;
  away: string;
  hs: number;
  as: number;
  /** Lado que acabou de marcar (destaque piscando, como no placar da rodada clássico). */
  fresh: 'home' | 'away' | null;
  mine: boolean;
  pens?: [number, number];
}

const FRESH_MINUTES = 3;

function scoreAt(events: MatchEvent[], minute: number, final: boolean) {
  let hs = 0, as = 0;
  let fresh: Row['fresh'] = null;
  for (const e of events) {
    if (e.type !== 'goal') continue;
    if (!final && e.minute > minute) continue;
    if (e.side === 'home') hs++; else as++;
    if (!final && e.minute > minute - FRESH_MINUTES) fresh = e.side;
  }
  return { hs, as, fresh };
}

/**
 * Placar dos jogos da rodada. Durante a partida os outros jogos andam junto com o
 * relógio (os resultados já estão sorteados; só revelamos os gols minuto a minuto).
 */
export function RoundBoard({ career, prep, minute, final, myPens, scope: fixed }: {
  career: Career; prep: PreparedRound; minute: number; final: boolean; myPens?: [number, number];
  /** Escopo escolhido fora (abas do jogo ao vivo): esconde os botões próprios. */
  scope?: Scope;
}) {
  const cup = prep.cup !== undefined;
  const [own, setScope] = useState<Scope>(lastScope);
  const scope = fixed ?? own;
  const choose = (s: Scope) => { lastScope = s; setScope(s); };
  const m = prep.match;

  const byDiv = new Map<number, Row[]>();
  const push = (di: number, r: Row) => { if (!byDiv.has(di)) byDiv.set(di, []); byDiv.get(di)!.push(r); };
  const mineScore = scoreAt(m.events, m.minute, final);
  push(prep.myDivision, { key: 'me', home: m.home.clubId, away: m.away.clubId, ...mineScore, hs: m.home.goals, as: m.away.goals, mine: true, pens: final ? myPens : undefined });
  for (const x of prep.others) {
    if (!cup && scope === 'div' && x.divisionIndex !== prep.myDivision) continue;
    push(x.divisionIndex, { key: `${x.home}-${x.away}`, home: x.home, away: x.away, ...scoreAt(x.outcome.events, minute, final), mine: false, pens: final ? x.pens : undefined });
  }
  // a sua divisão primeiro, depois as outras em ordem
  const divs = [...byDiv.keys()].sort((a, b) => Number(b === prep.myDivision) - Number(a === prep.myDivision) || a - b);
  const name = (id: string) => {
    const club = career.clubs[id];
    return <>{club?.country && <Flag country={club.country} />}{club?.name ?? id}</>;
  };

  return (
    <section className="round-board" aria-label="Jogos da rodada">
      <div className="rb-head">
        <h4>{cup ? prep.cupLabel : `Rodada ${prep.round + 1}`}{final ? ' · resultados' : ' · ao vivo'}</h4>
        {!cup && !fixed && <div className="chips" role="group" aria-label="Quais jogos mostrar">
          <button className={`chip ${scope === 'div' ? 'on' : ''}`} aria-pressed={scope === 'div'} onClick={() => choose('div')}>Minha divisão</button>
          <button className={`chip ${scope === 'all' ? 'on' : ''}`} aria-pressed={scope === 'all'} onClick={() => choose('all')}>Todas as divisões</button>
        </div>}
      </div>
      {divs.map((di) => (
        <div key={di} className="rb-div">
          {!cup && (scope === 'all' || divs.length > 1) && <h5>Divisão {di + 1}{di === prep.myDivision ? ' · a sua' : ''}</h5>}
          <ul className="rb-list">
            {byDiv.get(di)!.map((r) => (
              <li key={r.key} className={`rb-row ${r.mine ? 'me' : ''} ${r.fresh ? 'fresh' : ''}`}>
                <span className={`rb-team home ${r.fresh === 'home' ? 'scored' : ''}`}>{name(r.home)}</span>
                <b className="rb-score">{r.hs} × {r.as}{r.pens && <small className="pens">pên. {r.pens[0]}-{r.pens[1]}</small>}</b>
                <span className={`rb-team ${r.fresh === 'away' ? 'scored' : ''}`}>{name(r.away)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
