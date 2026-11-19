import { useMemo, useState } from 'react';
import { OBJECTIVE_LABEL, netWorth } from '../../core/entrepreneur';
import { divisionStandings } from '../../core/season';
import {
  activeBond,
  buyPlayer,
  divisionOf,
  financialState,
  marketListings,
  myClubId,
  sellPlayer,
  type Career,
} from '../../game/career';
import { ATTR_SHORT } from '../../sports/football/development';
import { football } from '../../sports/football/engine';
import { playerValue } from '../../sports/football/generate';
import { FORMATIONS, overall, pickLineup, starters } from '../../sports/football/lineup';
import type { AttrKey, Formation, Player, Style } from '../../sports/football/types';
import { Bar, ClubName, POS_LABEL, STYLE_LABEL, money, moneyShort } from '../util';

export type Act = (fn: (c: Career) => string | null | void) => void;

const POS_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 } as const;
const ATTR_GROUPS: { label: string; keys: AttrKey[] }[] = [
  { label: 'Físico', keys: ['pace', 'strength', 'stamina'] },
  { label: 'Técnico', keys: ['passing', 'finishing', 'firstTouch', 'tackling'] },
  { label: 'Mental', keys: ['decisions', 'positioning', 'concentration'] },
];

// ---------------------------------------------------------------- Elenco + tática

export function SquadPanel({ career, act }: { career: Career; act: Act }) {
  const club = career.clubs[myClubId(career)]!;
  const [sel, setSel] = useState<string | null>(null);
  const lineup = pickLineup(club);
  const xi = new Set(starters(lineup).map((p) => p.id));
  const bench = new Set(lineup.bench.map((p) => p.id));
  const players = [...club.players].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || overall(b) - overall(a));
  const selected = club.players.find((p) => p.id === sel);

  return (
    <div className="squad">
      <div className="toolbar">
        <label>Formação
          <select value={club.formation} onChange={(e) => act((c) => { c.clubs[myClubId(c)]!.formation = e.target.value as Formation; })}>
            {Object.keys(FORMATIONS).map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label>Postura
          <select value={club.style} onChange={(e) => act((c) => { c.clubs[myClubId(c)]!.style = e.target.value as Style; })}>
            {(Object.keys(STYLE_LABEL) as Style[]).map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={career.autoSubs} onChange={(e) => act((c) => { c.autoSubs = e.target.checked; })} />
          Auxiliar faz substituições
        </label>
      </div>
      <p className="legend-inline">★ titular · • banco</p>
      <div className="split">
        <div className="scroll">
          <table className="grid-table">
            <thead><tr><th></th><th>Pos</th><th>Atleta</th><th>Id</th><th>Hab</th><th>Cond.</th><th>Jg</th><th>Gols</th><th>Nota</th></tr></thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className={`${sel === p.id ? 'sel' : ''} ${xi.has(p.id) ? 'xi' : ''}`} onClick={() => setSel(p.id)}>
                  <td>{xi.has(p.id) ? '★' : bench.has(p.id) ? '·' : ''}</td>
                  <td><span className={`pos ${p.position}`}>{POS_LABEL[p.position]}</span></td>
                  <td className="name">
                    {p.name}
                    {p.suspended > 0 && <span className="tag bad">susp.</span>}
                    {p.age <= 21 && p.potential - overall(p) >= 8 && <span className="tag good">joia</span>}
                  </td>
                  <td>{p.age}</td>
                  <td><b>{overall(p)}</b></td>
                  <td className="cond"><Bar value={p.condition} /></td>
                  <td>{p.stats.apps}</td>
                  <td>{p.stats.goals}</td>
                  <td>{p.stats.apps ? (p.stats.ratingSum / p.stats.apps).toFixed(1) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="card">
          {selected ? <PlayerCard p={selected} onSell={() => {
            if (confirm(`Vender ${selected.name} por ~${money(Math.round(playerValue(selected) * 0.85))}?`)) { act((c) => sellPlayer(c, selected.id)); setSel(null); }
          }} /> : <p className="hint">Selecione um atleta.</p>}
        </aside>
      </div>
    </div>
  );
}

function PlayerCard({ p, onSell }: { p: Player; onSell?: () => void }) {
  return (
    <div className="player-card">
      <h3>{p.name}</h3>
      <p className="hint">{POS_LABEL[p.position]} · {p.age} anos · habilidade <b>{overall(p)}</b> · potencial ~{p.potential}</p>
      {ATTR_GROUPS.map((g) => (
        <div key={g.label} className="attr-group">
          <span className="attr-title">{g.label}</span>
          {g.keys.map((k) => (
            <div key={k} className="attr"><span>{ATTR_SHORT[k]}</span><Bar value={p.attrs[k]} max={99} tone="accent" /><b>{p.attrs[k]}</b></div>
          ))}
        </div>
      ))}
      {p.position === 'GK' && <div className="attr"><span>GOL</span><Bar value={p.attrs.goalkeeping} max={99} tone="accent" /><b>{p.attrs.goalkeeping}</b></div>}
      <dl className="kv">
        <dt>Condição</dt><dd>{Math.round(p.condition)}%</dd>
        <dt>Salário</dt><dd>{money(p.wage)}/mês</dd>
        <dt>Valor</dt><dd>{money(playerValue(p))}</dd>
        <dt>Contrato</dt><dd>até {p.contractUntil}</dd>
      </dl>
      {onSell && <button className="btn danger" onClick={onSell}>Vender</button>}
    </div>
  );
}

// ---------------------------------------------------------------- Mercado

export function MarketPanel({ career, act }: { career: Career; act: Act }) {
  const [pos, setPos] = useState<'ALL' | Player['position']>('ALL');
  const club = career.clubs[myClubId(career)]!;
  const monthKey = career.date.slice(0, 7);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const listings = useMemo(() => marketListings(career, 60), [monthKey, career.clubs[myClubId(career)]!.players.length]);
  const shown = listings.filter((l) => pos === 'ALL' || l.player.position === pos).filter((l) => career.clubs[l.clubId]?.players.some((p) => p.id === l.player.id));
  return (
    <div>
      <div className="toolbar">
        <div className="chips">
          {(['ALL', 'GK', 'DF', 'MF', 'FW'] as const).map((p) => (
            <button key={p} className={`chip ${pos === p ? 'on' : ''}`} onClick={() => setPos(p)}>{p === 'ALL' ? 'Todos' : POS_LABEL[p]}</button>
          ))}
        </div>
        <span className="hint">Caixa {money(club.budget)} · elenco {club.players.length}/28</span>
      </div>
      <div className="scroll tall">
        <table className="grid-table">
          <thead><tr><th>Pos</th><th>Atleta</th><th>Id</th><th>Hab</th><th>Clube</th><th>Salário</th><th>Preço</th><th></th></tr></thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.player.id}>
                <td><span className={`pos ${l.player.position}`}>{POS_LABEL[l.player.position]}</span></td>
                <td className="name">{l.player.name}</td>
                <td>{l.player.age}</td>
                <td><b>{overall(l.player)}</b></td>
                <td className="hint">{career.clubs[l.clubId]?.name}</td>
                <td>{moneyShort(l.player.wage)}</td>
                <td>{moneyShort(l.price)}</td>
                <td><button className="btn sm" disabled={club.budget < l.price} onClick={() => act((c) => buyPlayer(c, l.player.id, l.clubId))}>Contratar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Tabela

export function TablePanel({ career }: { career: Career }) {
  const me = myClubId(career);
  const [d, setD] = useState(Math.max(0, divisionOf(career, me)));
  const rows = divisionStandings(career.season.divisions[d]!, football.points);
  const last = career.season.divisions.length - 1;
  return (
    <div>
      <div className="chips">
        {career.season.divisions.map((_, i) => (
          <button key={i} className={`chip ${i === d ? 'on' : ''}`} onClick={() => setD(i)}>Divisão {i + 1}</button>
        ))}
      </div>
      <div className="scroll tall">
        <table className="grid-table">
          <thead><tr><th>#</th><th>Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.teamId} className={`${r.teamId === me ? 'me' : ''} ${i < 2 && d > 0 ? 'up' : ''} ${i >= rows.length - 2 && d < last ? 'down' : ''}`}>
                <td>{i + 1}</td>
                <td><ClubName club={career.clubs[r.teamId]!} /></td>
                <td><b>{r.points}</b></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
                <td>{r.scoreFor - r.scoreAgainst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint"><span className="legend up" /> acesso · <span className="legend down" /> rebaixamento</p>
      {career.awards.length > 0 && (
        <>
          <h4>Galeria de campeões</h4>
          <ul className="list">
            {career.awards.slice(0, 8).map((a, i) => (
              <li key={i}>{a.year} · Div {a.division}: <b>{a.championName}</b>{a.topScorer && <span className="hint"> · artilheiro {a.topScorer.name} ({a.topScorer.goals})</span>}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Finanças

export function FinancePanel({ career, act }: { career: Career; act: Act }) {
  const club = career.clubs[myClubId(career)]!;
  const wages = club.players.reduce((a, p) => a + p.wage, 0);
  const l = career.ledger;
  const income = l.gate + l.tv + l.prizes + l.sales;
  const expense = l.wages + l.purchases + l.management;
  const state = financialState(club);
  return (
    <div className="two-col">
      <section>
        <h4>Organização · {club.name}</h4>
        <div className={`state ${state}`}>{{ estavel: 'Estável', atencao: 'Atenção', critica: 'Crítica' }[state]}</div>
        <dl className="kv">
          <dt>Caixa</dt><dd className={club.budget < 0 ? 'neg' : ''}>{money(club.budget)}</dd>
          <dt>Folha mensal</dt><dd>{money(wages)}</dd>
          <dt>Torcida</dt><dd>{club.fans.toLocaleString('pt-BR')}</dd>
          <dt>Estádio</dt><dd>{club.stadium.toLocaleString('pt-BR')} lugares</dd>
          <dt>Ingresso</dt>
          <dd className="row">
            <button className="btn sm" onClick={() => act((c) => { const x = c.clubs[myClubId(c)]!; x.ticketPrice = Math.max(1, x.ticketPrice - 1); })}>−</button>
            <b>{money(club.ticketPrice)}</b>
            <button className="btn sm" onClick={() => act((c) => { c.clubs[myClubId(c)]!.ticketPrice += 1; })}>+</button>
          </dd>
        </dl>

      </section>
      <section>
        <h4>Temporada {career.season.year}</h4>
        <table className="grid-table compact">
          <tbody>
            <tr><td>Bilheteria</td><td className="pos-n">{money(l.gate)}</td></tr>
            <tr><td>Cotas de TV</td><td className="pos-n">{money(l.tv)}</td></tr>
            <tr><td>Premiações</td><td className="pos-n">{money(l.prizes)}</td></tr>
            <tr><td>Venda de atletas</td><td className="pos-n">{money(l.sales)}</td></tr>
            <tr><td>Salários</td><td className="neg">{money(-l.wages)}</td></tr>
            <tr><td>Contratações</td><td className="neg">{money(-l.purchases)}</td></tr>
            <tr><td>Gestão (seu salário)</td><td className="neg">{money(-l.management)}</td></tr>
            <tr className="total"><td>Resultado</td><td className={income - expense < 0 ? 'neg' : 'pos-n'}>{money(income - expense)}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Carreira

export function CareerPanel({ career, onReset }: { career: Career; onReset: () => void }) {
  const e = career.entrepreneur;
  const bond = activeBond(career);
  const club = bond ? career.clubs[bond.orgId] : undefined;
  const worth = netWorth(e, () => 0);
  return (
    <div className="two-col">
      <section>
        <h4>{e.name}</h4>
        <p className="hint">Futebol</p>
        <div className="meter"><span>Reputação</span><Bar value={e.reputation} tone="accent" /><b>{Math.round(e.reputation)}</b></div>
        <div className="meter"><span>Experiência</span><Bar value={e.experience} tone="accent" /><b>{Math.round(e.experience)}</b></div>
        <dl className="kv">
          <dt>Patrimônio</dt><dd>{money(worth)}</dd>
          {bond && club && <><dt>Vínculo</dt><dd>Contratado · {club.name}</dd><dt>Salário</dt><dd>{money(bond.monthlySalary)}/mês</dd><dt>Objetivo</dt><dd>{OBJECTIVE_LABEL[bond.objective]}</dd></>}
        </dl>
        <button className="btn danger ghost" onClick={onReset}>Apagar save e recomeçar</button>
      </section>
      <section>
        <h4>Trajetória</h4>
        {e.history.length === 0 ? <p className="hint">Nenhuma temporada concluída.</p> : (
          <ul className="list">
            {e.history.map((h, i) => (
              <li key={i}>{h.year} · {h.orgName} · {h.position}º na Div {h.division} · <span className={h.achieved ? 'ok' : 'neg'}>{h.achieved ? 'objetivo cumprido' : 'objetivo não cumprido'}</span></li>
            ))}
          </ul>
        )}
        {club && club.titles.length > 0 && (<><h4>Títulos do clube</h4><ul className="list">{club.titles.map((t, i) => <li key={i}>🏆 {t.competition} {t.year}</li>)}</ul></>)}
      </section>
    </div>
  );
}
