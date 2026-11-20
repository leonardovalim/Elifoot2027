import { useState } from 'react';
import type { Career, PreparedRound } from '../../game/career';
import type { MatchEvent } from '../../sports/football/types';

type Scope = 'div' | 'all';
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
export function RoundBoard({ career, prep, minute, final }: { career: Career; prep: PreparedRound; minute: number; final: boolean }) {
  const [scope, setScope] = useState<Scope>(lastScope);
  const choose = (s: Scope) => { lastScope = s; setScope(s); };
  const m = prep.match;

  const byDiv = new Map<number, Row[]>();
  const push = (di: number, r: Row) => { if (!byDiv.has(di)) byDiv.set(di, []); byDiv.get(di)!.push(r); };
  const mineScore = scoreAt(m.events, m.minute, final);
  push(prep.myDivision, { key: 'me', home: m.home.clubId, away: m.away.clubId, ...mineScore, hs: m.home.goals, as: m.away.goals, mine: true });
  for (const x of prep.others) {
    if (scope === 'div' && x.divisionIndex !== prep.myDivision) continue;
    push(x.divisionIndex, { key: `${x.home}-${x.away}`, home: x.home, away: x.away, ...scoreAt(x.outcome.events, minute, final), mine: false });
  }
  // a sua divisão primeiro, depois as outras em ordem
  const divs = [...byDiv.keys()].sort((a, b) => Number(b === prep.myDivision) - Number(a === prep.myDivision) || a - b);
  const name = (id: string) => career.clubs[id]?.name ?? id;

  return (
    <section className="round-board" aria-label="Jogos da rodada">
      <div className="rb-head">
        <h4>Rodada {prep.round + 1}{final ? ' · resultados' : ' · ao vivo'}</h4>
        <div className="chips" role="group" aria-label="Quais jogos mostrar">
          <button className={`chip ${scope === 'div' ? 'on' : ''}`} aria-pressed={scope === 'div'} onClick={() => choose('div')}>Minha divisão</button>
          <button className={`chip ${scope === 'all' ? 'on' : ''}`} aria-pressed={scope === 'all'} onClick={() => choose('all')}>Todas as divisões</button>
        </div>
      </div>
      {divs.map((di) => (
        <div key={di} className="rb-div">
          {(scope === 'all' || divs.length > 1) && <h5>Divisão {di + 1}{di === prep.myDivision ? ' · a sua' : ''}</h5>}
          <ul className="rb-list">
            {byDiv.get(di)!.map((r) => (
              <li key={r.key} className={`rb-row ${r.mine ? 'me' : ''} ${r.fresh ? 'fresh' : ''}`}>
                <span className={`rb-team home ${r.fresh === 'home' ? 'scored' : ''}`}>{name(r.home)}</span>
                <b className="rb-score">{r.hs} × {r.as}</b>
                <span className={`rb-team ${r.fresh === 'away' ? 'scored' : ''}`}>{name(r.away)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
