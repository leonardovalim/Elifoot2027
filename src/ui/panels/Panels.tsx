import { useEffect, useMemo, useRef, useState } from 'react';
import { OBJECTIVE_LABEL, netWorth } from '../../core/entrepreneur';
import { divisionStandings } from '../../core/season';
import {
  activeBond,
  buyPlayer,
  divisionOf,
  financialState,
  marketListings,
  myClubId,
  isNewSigning,
  sellPlayer,
  type Career,
  type Listing,
} from '../../game/career';
import { ATTR_SHORT } from '../../sports/football/development';
import { football } from '../../sports/football/engine';
import { playerValue } from '../../sports/football/generate';
import { FORMATIONS, applyMove, overall, pickLineup, planMove, statusOf, type SquadStatus } from '../../sports/football/lineup';
import type { AttrKey, Club, Formation, Player, Style } from '../../sports/football/types';
import { track } from '../analytics';
import { Bar, ClubName, POS_LABEL, STYLE_LABEL, money, moneyShort } from '../util';

export type Act = (fn: (c: Career) => string | null | void) => void;

const POS_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 } as const;
const ATTR_GROUPS: { label: string; keys: AttrKey[] }[] = [
  { label: 'Físico', keys: ['pace', 'strength', 'stamina'] },
  { label: 'Técnico', keys: ['passing', 'finishing', 'firstTouch', 'tackling'] },
  { label: 'Mental', keys: ['decisions', 'positioning', 'concentration'] },
];

// ---------------------------------------------------------------- Elenco + tática

/** No celular o cartão fica acima da lista: ao selecionar, rola até ele. */
function useRevealOnMobile(dep: string | null) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (dep && window.matchMedia?.('(max-width: 760px)').matches) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [dep]);
  return ref;
}

const STATUS_LABEL: Record<SquadStatus, string> = { xi: 'Titular', bench: 'Banco', out: 'Fora' };

export function SquadPanel({ career, act }: { career: Career; act: Act }) {
  const club = career.clubs[myClubId(career)]!;
  const [sel, setSel] = useState<string | null>(null);
  const lineup = pickLineup(club);
  const status = statusOf(club);
  const slot = new Map<string, Player['position']>();
  lineup.DF.forEach((p) => slot.set(p.id, 'DF'));
  lineup.MF.forEach((p) => slot.set(p.id, 'MF'));
  lineup.FW.forEach((p) => slot.set(p.id, 'FW'));
  slot.set(lineup.GK.id, 'GK');
  const players = [...club.players].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || overall(b) - overall(a));
  const selected = club.players.find((p) => p.id === sel);
  const cardRef = useRevealOnMobile(sel);
  const move = (id: string, to: SquadStatus) => act((c) => { applyMove(c.clubs[myClubId(c)]!, id, to); track('lineup_changed', { to }); });

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
      <div className="lineup-mode">
        {club.lineup
          ? <><span>Escalação <b>sua</b> · suspensos e negociados são repostos pelo banco.</span><button className="btn sm ghost" onClick={() => act((c) => { delete c.clubs[myClubId(c)]!.lineup; })}>Auxiliar escala</button></>
          : <span>Escalação do <b>auxiliar</b> (melhores em forma). Mude qualquer atleta para assumir.</span>}
      </div>
      <div className="split">
        <div className="scroll">
          <table className="grid-table">
            <thead><tr><th>Rel.</th><th>Pos</th><th>Atleta</th><th>Id</th><th>Hab</th><th>Cond.</th><th>Jg</th><th>Gols</th><th>Nota</th></tr></thead>
            <tbody>
              {players.map((p) => {
                const st = status[p.id]!;
                const playsAt = slot.get(p.id);
                return (
                  <tr key={p.id} className={`${sel === p.id ? 'sel' : ''} ${st}`} onClick={() => setSel(p.id)}>
                    <td><span className={`st ${st}`}>{st === 'xi' ? 'TIT' : st === 'bench' ? 'RES' : '–'}</span></td>
                    <td><span className={`pos ${p.position}`}>{POS_LABEL[p.position]}</span></td>
                    <td className="name">
                      {p.name}
                      {isNewSigning(p, career.date) && <span className="tag new">novo</span>}
                      {p.suspended > 0 && <span className="tag bad">susp.</span>}
                      {playsAt && playsAt !== p.position && <span className="tag warn">de {POS_LABEL[playsAt]}</span>}
                      {p.age <= 21 && p.potential - overall(p) >= 8 && <span className="tag good">joia</span>}
                    </td>
                    <td>{p.age}</td>
                    <td><b>{overall(p)}</b></td>
                    <td className="cond"><Bar value={p.condition} /></td>
                    <td>{p.stats.apps}</td>
                    <td>{p.stats.goals}</td>
                    <td>{p.stats.apps ? (p.stats.ratingSum / p.stats.apps).toFixed(1) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <aside className="card" ref={cardRef}>
          {selected ? (
            <>
              <LineupActions club={club} p={selected} current={status[selected.id]!} onMove={move} />
              <PlayerCard p={selected} isNew={isNewSigning(selected, career.date)} onSell={() => {
                if (confirm(`Vender ${selected.name} por ~${money(Math.round(playerValue(selected) * 0.85))}?`)) { act((c) => sellPlayer(c, selected.id)); setSel(null); }
              }} />
            </>
          ) : <p className="hint">Selecione um atleta para ver atributos e mudar a escalação.</p>}
        </aside>
      </div>
    </div>
  );
}

function LineupActions({ club, p, current, onMove }: { club: Club; p: Player; current: SquadStatus; onMove: (id: string, to: SquadStatus) => void }) {
  const options = (['xi', 'bench', 'out'] as SquadStatus[]).filter((s) => s !== current);
  return (
    <div className="lineup-actions">
      <span className="attr-title">{STATUS_LABEL[current]}</span>
      {options.map((to) => {
        const plan = planMove(club, p.id, to);
        const label = to === 'xi' ? 'Escalar como titular' : to === 'bench' ? 'Mandar para o banco' : 'Tirar da relação';
        const swap = plan?.swapWith
          ? to === 'xi' ? `sai ${plan.swapWith.name}` : current === 'xi' ? `entra ${plan.swapWith.name}` : `sai do banco ${plan.swapWith.name}`
          : '';
        return (
          <button key={to} className={`btn sm ${to === 'xi' ? 'primary' : ''}`} disabled={!plan} onClick={() => onMove(p.id, to)}>
            {label}{swap && <span className="swap">{swap}</span>}
          </button>
        );
      })}
      {p.suspended > 0 && <span className="hint">Suspenso no próximo jogo.</span>}
    </div>
  );
}

function PlayerCard({ p, onSell, isNew }: { p: Player; onSell?: () => void; isNew?: boolean }) {
  return (
    <div className="player-card">
      <h3>{p.name}{isNew && <span className="tag new">novo</span>}</h3>
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

const ORDINAL = ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º'];

export function MarketPanel({ career, act }: { career: Career; act: Act }) {
  const [pos, setPos] = useState<'ALL' | Player['position']>('ALL');
  const [sel, setSel] = useState<string | null>(null);
  const [bought, setBought] = useState<string | null>(null);
  const club = career.clubs[myClubId(career)]!;
  const monthKey = career.date.slice(0, 7);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const listings = useMemo(() => marketListings(career, 60), [monthKey, career.clubs[myClubId(career)]!.players.length]);
  const shown = listings.filter((l) => pos === 'ALL' || l.player.position === pos).filter((l) => career.clubs[l.clubId]?.players.some((p) => p.id === l.player.id));
  const bestMine = (position: Player['position']) => Math.max(0, ...club.players.filter((p) => p.position === position).map(overall));
  const selected = shown.find((l) => l.player.id === sel);
  const cardRef = useRevealOnMobile(sel);

  const buy = (l: Listing) => act((c) => {
    const err = buyPlayer(c, l.player.id, l.clubId);
    if (!err) { setBought(l.player.name); setSel(null); track('player_bought', { position: l.player.position, overall: overall(l.player), price: l.price }); }
    return err;
  });

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
      <div className="split market-split">
        <div className="scroll tall">
          <table className="grid-table">
            <thead><tr><th>Pos</th><th>Atleta</th><th>Id</th><th>Hab</th><th title="Diferença para o seu melhor atleta da posição">vs. seu</th><th>Clube</th><th>Salário</th><th>Preço</th></tr></thead>
            <tbody>
              {shown.map((l) => {
                const d = overall(l.player) - bestMine(l.player.position);
                return (
                  <tr key={l.player.id} className={sel === l.player.id ? 'sel' : ''} onClick={() => { setSel(l.player.id); setBought(null); }}>
                    <td><span className={`pos ${l.player.position}`}>{POS_LABEL[l.player.position]}</span></td>
                    <td className="name">{l.player.name}</td>
                    <td>{l.player.age}</td>
                    <td><b>{overall(l.player)}</b></td>
                    <td className={d > 0 ? 'up-n' : d < 0 ? 'down-n' : 'hint'}>{d > 0 ? `+${d}` : d}</td>
                    <td className="hint">{career.clubs[l.clubId]?.name}</td>
                    <td>{moneyShort(l.player.wage)}</td>
                    <td className={club.budget < l.price ? 'neg' : ''}>{moneyShort(l.price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <aside className="card" ref={cardRef}>
          {selected
            ? <CompareCard key={selected.player.id} listing={selected} club={club} career={career} onBuy={() => buy(selected)} />
            : bought
              ? <p className="ok-msg"><b>{bought}</b> chegou. Ele aparece no elenco com o selo <span className="tag new">novo</span>.</p>
              : <p className="hint">Selecione um atleta para ver os atributos lado a lado com os seus.</p>}
        </aside>
      </div>
    </div>
  );
}

function CompareCard({ listing: l, club, career, onBuy }: { listing: Listing; club: Club; career: Career; onBuy: () => void }) {
  const p = l.player;
  const mine = club.players.filter((x) => x.position === p.position).sort((a, b) => overall(b) - overall(a));
  const [otherId, setOtherId] = useState<string>('');
  const other = mine.find((x) => x.id === otherId) ?? mine[0];
  const rank = mine.filter((x) => overall(x) > overall(p)).length;
  const keys: AttrKey[] = [...ATTR_GROUPS.flatMap((g) => g.keys), ...(p.position === 'GK' ? (['goalkeeping'] as AttrKey[]) : [])];
  const wagesNow = club.players.reduce((a, x) => a + x.wage, 0);
  const cantPay = club.budget < l.price;
  const full = club.players.length >= 28;

  return (
    <div className="player-card compare-card">
      <h3>{p.name}</h3>
      <p className="hint">{POS_LABEL[p.position]} · {p.age} anos · {career.clubs[l.clubId]?.name} · potencial ~{p.potential}</p>
      <p className="verdict">
        Hab <b>{overall(p)}</b> · seria o <b>{ORDINAL[rank] ?? `${rank + 1}º`}</b> {POS_LABEL[p.position]} do elenco
        {rank === 0 && mine.length > 0 && <span className="tag good">titular</span>}
      </p>
      {mine.length > 0 && other && (
        <label className="vs">Comparar com
          <select value={other.id} onChange={(e) => setOtherId(e.target.value)}>
            {mine.map((x) => <option key={x.id} value={x.id}>{x.name} ({overall(x)})</option>)}
          </select>
        </label>
      )}
      <div className="cmp head"><span /><span>{p.name.split(' ')[0]}</span><b /><span>{other ? other.name.split(' ')[0] : '—'}</span></div>
      {keys.map((k) => {
        const a = p.attrs[k], b = other?.attrs[k] ?? 0, d = a - b;
        return (
          <div key={k} className="cmp">
            <span>{ATTR_SHORT[k]}</span>
            <Bar value={a} max={99} tone="accent" />
            <b>{a}</b>
            <span className="hint">{other ? b : ''}</span>
            <span className={d > 0 ? 'up-n' : d < 0 ? 'down-n' : 'hint'}>{other ? (d > 0 ? `+${d}` : d === 0 ? '=' : d) : ''}</span>
          </div>
        );
      })}
      <dl className="kv">
        <dt>Preço</dt><dd className={cantPay ? 'neg' : ''}>{money(l.price)}</dd>
        <dt>Salário</dt><dd>{money(p.wage)}/mês {other && <span className="hint">(seu: {money(other.wage)})</span>}</dd>
        <dt>Folha</dt><dd>{money(wagesNow)} → {money(wagesNow + p.wage)}</dd>
        <dt>Contrato</dt><dd>até {p.contractUntil}</dd>
      </dl>
      <button className="btn primary" disabled={cantPay || full} onClick={onBuy}>
        {full ? 'Elenco cheio (28)' : cantPay ? 'Caixa insuficiente' : `Contratar por ${moneyShort(l.price)}`}
      </button>
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
