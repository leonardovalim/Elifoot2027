import { useEffect, useMemo, useState } from 'react';
import { divisionStandings, isSeasonOver, totalRounds } from '../core/season';
import {
  buyPlayer,
  divisionOf,
  finishSeason,
  marketListings,
  newCareer,
  playRound,
  sellPlayer,
  type Career,
  type RoundReport,
} from '../game/career';
import { football } from '../sports/football/engine';
import { playerValue } from '../sports/football/generate';
import { FORMATIONS, overall, pickLineup } from '../sports/football/lineup';
import type { Club, Formation, Player, Style } from '../sports/football/types';
import { POS_LABEL, STYLE_LABEL, money } from './format';
import { clearCareer, loadCareer, saveCareer } from './storage';

type Tab = 'rodada' | 'elenco' | 'tabela' | 'mercado' | 'clube';
const POS_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 } as const;

export function App() {
  const [career, setCareer] = useState<Career | null>(() => loadCareer());
  const [pending, setPending] = useState<Career | null>(null);

  if (!career) {
    return (
      <NewGame
        pending={pending}
        onCreate={() => setPending(newCareer((Date.now() ^ (Math.random() * 1e9)) >>> 0))}
        onPick={(clubId) => {
          if (!pending) return;
          const c = { ...pending, managerClubId: clubId };
          saveCareer(c);
          setCareer(c);
          setPending(null);
        }}
      />
    );
  }
  return (
    <Game
      career={career}
      onChange={(c) => {
        saveCareer(c);
        setCareer(c);
      }}
      onQuit={() => {
        if (confirm('Apagar o save e começar de novo?')) {
          clearCareer();
          setCareer(null);
        }
      }}
    />
  );
}

function NewGame({ pending, onCreate, onPick }: { pending: Career | null; onCreate: () => void; onPick: (id: string) => void }) {
  useEffect(() => {
    if (!pending) onCreate();
  }, [pending, onCreate]);
  if (!pending) return null;
  const last = pending.season.divisions.length - 1;
  const clubs = pending.season.divisions[last]!.teamIds.map((id) => pending.clubs[id]!);
  return (
    <div className="shell narrow">
      <header className="brand">
        <h1>ELIFOOT<span>2027</span></h1>
        <p>Codinome do projeto · gestão esportiva · futebol</p>
      </header>
      <section className="panel">
        <h2>Escolha seu clube na Divisão {last + 1}</h2>
        <p className="muted">Comece por baixo. Suba de divisão, equilibre o caixa, monte um elenco campeão.</p>
        <div className="club-grid">
          {clubs.map((c) => (
            <button key={c.id} className="club-pick" onClick={() => onPick(c.id)}>
              <Badge club={c} />
              <strong>{c.name}</strong>
              <span className="muted">Força {teamRating(c)} · {money(c.budget)}</span>
            </button>
          ))}
        </div>
        <button className="link" onClick={onCreate}>↻ Gerar outro mundo</button>
      </section>
    </div>
  );
}

function Game({ career, onChange, onQuit }: { career: Career; onChange: (c: Career) => void; onQuit: () => void }) {
  const [tab, setTab] = useState<Tab>('rodada');
  const [toast, setToast] = useState<string | null>(null);
  const me = career.clubs[career.managerClubId]!;
  const myDiv = divisionOf(career, me.id);

  const mutate = (fn: (c: Career) => string | null | void) => {
    const c = structuredClone(career);
    const err = fn(c);
    if (typeof err === 'string') {
      setToast(err);
      return;
    }
    onChange(c);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="me">
          <Badge club={me} />
          <div>
            <strong>{me.name}</strong>
            <span className="muted">
              Divisão {myDiv + 1} · Temporada {career.season.year} · Rodada {Math.min(career.season.round + 1, totalRounds(career.season))}/{totalRounds(career.season)}
            </span>
          </div>
        </div>
        <div className={`cash ${me.budget < 0 ? 'neg' : ''}`}>{money(me.budget)}</div>
      </header>
      <nav className="tabs">
        {(['rodada', 'elenco', 'tabela', 'mercado', 'clube'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'rodada' && <RoundTab career={career} mutate={mutate} />}
        {tab === 'elenco' && <SquadTab career={career} mutate={mutate} />}
        {tab === 'tabela' && <TableTab career={career} />}
        {tab === 'mercado' && <MarketTab career={career} mutate={mutate} />}
        {tab === 'clube' && <ClubTab career={career} mutate={mutate} onQuit={onQuit} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

type Mutate = (fn: (c: Career) => string | null | void) => void;

// ---------------- Rodada ----------------

function RoundTab({ career, mutate }: { career: Career; mutate: Mutate }) {
  const [live, setLive] = useState<{ report: RoundReport; minute: number } | null>(null);
  const [speed, setSpeed] = useState(70);
  const myDiv = divisionOf(career, career.managerClubId);
  const over = isSeasonOver(career.season);

  useEffect(() => {
    if (!live || live.minute >= 95) return;
    const t = setTimeout(() => setLive({ ...live, minute: live.minute + 1 }), speed);
    return () => clearTimeout(t);
  }, [live, speed]);

  const report = live?.report ?? career.lastReport;
  const minute = live ? live.minute : 95;
  const running = !!live && live.minute < 95;

  const next = !over ? career.season.divisions[myDiv]!.rounds[career.season.round]!.find(
    (f) => f.home === career.managerClubId || f.away === career.managerClubId,
  ) : undefined;
  // durante a animação mostramos o jogo em andamento — sem spoiler do resultado final
  const shown = running
    ? report!.matches.find((m) => m.home === career.managerClubId || m.away === career.managerClubId)
    : next;

  return (
    <div className="grid2">
      <section className="panel">
        {over && !running ? (
          <>
            <h2>Fim da temporada {career.season.year}</h2>
            <SeasonSummary career={career} />
            <button className="primary" onClick={() => mutate((c) => { finishSeason(c); })}>
              Iniciar temporada {career.season.year + 1} →
            </button>
          </>
        ) : (
          <>
            <h2>{running ? 'Em andamento' : 'Próximo jogo'}</h2>
            {shown && (
              <div className="fixture-big">
                <ClubName club={career.clubs[shown.home]!} />
                <span className="vs">x</span>
                <ClubName club={career.clubs[shown.away]!} />
              </div>
            )}
            <p className="muted">
              {shown?.home === career.managerClubId ? 'Em casa' : 'Fora de casa'} · {career.clubs[career.managerClubId]!.formation} ·{' '}
              {STYLE_LABEL[career.clubs[career.managerClubId]!.style]}
            </p>
            <div className="row">
              {!running && (
                <button
                  className="primary"
                  onClick={() => {
                    let rep: RoundReport | undefined;
                    mutate((c) => { rep = playRound(c); });
                    if (rep) setLive({ report: rep, minute: 0 });
                  }}
                >
                  ▶ Jogar rodada
                </button>
              )}
              {running && (
                <button onClick={() => setSpeed(speed > 20 ? 8 : 70)}>{speed > 20 ? '⏩ Acelerar' : 'Normal'}</button>
              )}
              {running && <button onClick={() => setLive({ ...live!, minute: 95 })}>⏭ Pular</button>}
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>
          {report ? `Rodada ${report.round}` : 'Resultados'}
          {running && <span className="clock">{Math.min(minute, 90)}'{minute > 90 ? `+${minute - 90}` : ''}</span>}
        </h2>
        {!report && <p className="muted">Nenhum jogo disputado ainda.</p>}
        {report && <LiveBoard career={career} report={report} minute={minute} division={myDiv} />}
        {report?.finance && !running && (
          <p className="muted small">
            Bilheteria + cotas: {money(report.finance.income)} · Salários: {money(-report.finance.wages)}
          </p>
        )}
      </section>
    </div>
  );
}

function LiveBoard({ career, report, minute, division }: { career: Career; report: RoundReport; minute: number; division: number }) {
  const [div, setDiv] = useState(division);
  const matches = report.matches.filter((m) => m.divisionIndex === div);
  const myMatch = report.matches.find((m) => m.home === career.managerClubId || m.away === career.managerClubId);
  return (
    <>
      <div className="chips">
        {career.season.divisions.map((_, i) => (
          <button key={i} className={i === div ? 'on' : ''} onClick={() => setDiv(i)}>D{i + 1}</button>
        ))}
      </div>
      <table className="board">
        <tbody>
          {matches.map((m) => {
            const goals = m.outcome.events.filter((e) => e.type === 'goal' && e.minute <= minute);
            const h = goals.filter((g) => g.side === 'home').length;
            const a = goals.filter((g) => g.side === 'away').length;
            const fresh = goals.some((g) => minute - g.minute < 3 && minute < 95);
            const mine = m === myMatch;
            return (
              <tr key={m.home} className={`${mine ? 'mine' : ''} ${fresh ? 'flash' : ''}`}>
                <td className="r">{career.clubs[m.home]!.name}</td>
                <td className="score">{h} - {a}</td>
                <td>{career.clubs[m.away]!.name}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {myMatch && div === division && (
        <div className="feed">
          <div className="poss">
            Posse: {Math.round(myMatch.outcome.possession * 100)}% x {100 - Math.round(myMatch.outcome.possession * 100)}%
          </div>
          {myMatch.outcome.events
            .filter((e) => e.minute <= minute && e.type !== 'miss')
            .slice()
            .reverse()
            .slice(0, 12)
            .map((e, i) => {
              const team = career.clubs[e.side === 'home' ? myMatch.home : myMatch.away]!;
              const icon = { goal: '⚽', save: '🧤', post: '🥅', yellow: '🟨', red: '🟥', miss: '' }[e.type];
              const txt = { goal: 'GOL de', save: 'Defesa no chute de', post: 'Na trave! Chute de', yellow: 'Amarelo para', red: 'EXPULSO:', miss: '' }[e.type];
              return (
                <div key={i} className={`ev ${e.type}`}>
                  <span className="min">{e.minute}'</span> {icon} {txt} <strong>{e.playerName}</strong> <span className="muted">({team.short})</span>
                </div>
              );
            })}
        </div>
      )}
    </>
  );
}

function SeasonSummary({ career }: { career: Career }) {
  const d = divisionOf(career, career.managerClubId);
  const table = divisionStandings(career.season.divisions[d]!, football.points);
  const pos = table.findIndex((r) => r.teamId === career.managerClubId) + 1;
  const last = career.season.divisions.length - 1;
  const msg =
    pos <= 2 && d > 0 ? '🎉 Acesso garantido!' : pos === 1 ? '🏆 Campeão!' : pos >= table.length - 1 && d < last ? '⬇ Rebaixado.' : 'Temporada encerrada.';
  return (
    <p>
      Você terminou em <strong>{pos}º</strong> na Divisão {d + 1}. {msg}
    </p>
  );
}

// ---------------- Elenco ----------------

function SquadTab({ career, mutate }: { career: Career; mutate: Mutate }) {
  const me = career.clubs[career.managerClubId]!;
  const lineup = useMemo(() => pickLineup(me), [me]);
  const starters = new Set([lineup.GK, ...lineup.DF, ...lineup.MF, ...lineup.FW].map((p) => p.id));
  const players = [...me.players].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || overall(b) - overall(a));

  return (
    <section className="panel">
      <div className="row wrap">
        <label>
          Formação{' '}
          <select value={me.formation} onChange={(e) => mutate((c) => { c.clubs[c.managerClubId]!.formation = e.target.value as Formation; })}>
            {Object.keys(FORMATIONS).map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label>
          Estilo{' '}
          <select value={me.style} onChange={(e) => mutate((c) => { c.clubs[c.managerClubId]!.style = e.target.value as Style; })}>
            {(Object.keys(STYLE_LABEL) as Style[]).map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}
          </select>
        </label>
        <span className="muted small">Titulares escolhidos automaticamente pelos melhores de cada posição.</span>
      </div>
      <div className="scroll">
        <table className="data">
          <thead>
            <tr><th></th><th>Pos</th><th>Nome</th><th>Idade</th><th>Geral</th><th>ATA</th><th>DEF</th><th>PAS</th><th>GOL</th><th>Salário</th><th>Valor</th><th></th></tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className={starters.has(p.id) ? 'starter' : ''}>
                <td>{starters.has(p.id) ? '●' : ''}</td>
                <td><span className={`pos ${p.position}`}>{POS_LABEL[p.position]}</span></td>
                <td>{p.name}{p.suspendedRounds > 0 && <span className="tag">suspenso</span>}{p.age <= 21 && p.potential - overall(p) >= 8 && <span className="tag good">promessa</span>}</td>
                <td>{p.age}</td>
                <td><strong>{overall(p)}</strong></td>
                <Attr v={p.attack} /><Attr v={p.defense} /><Attr v={p.passing} /><Attr v={p.goalkeeping} />
                <td>{money(p.wage)}</td>
                <td>{money(playerValue(p))}</td>
                <td>
                  <button className="small" onClick={() => {
                    if (confirm(`Vender ${p.name} por ~${money(Math.round(playerValue(p) * 0.85))}?`)) mutate((c) => sellPlayer(c, p.id));
                  }}>Vender</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const Attr = ({ v }: { v: number }) => <td className={v >= 75 ? 'hi' : v < 35 ? 'lo' : ''}>{v}</td>;

// ---------------- Tabela ----------------

function TableTab({ career }: { career: Career }) {
  const myDiv = divisionOf(career, career.managerClubId);
  const [d, setD] = useState(myDiv);
  const div = career.season.divisions[d]!;
  const rows = divisionStandings(div, football.points);
  const last = career.season.divisions.length - 1;
  return (
    <section className="panel">
      <div className="chips">
        {career.season.divisions.map((_, i) => (
          <button key={i} className={i === d ? 'on' : ''} onClick={() => setD(i)}>Divisão {i + 1}</button>
        ))}
      </div>
      <div className="scroll">
        <table className="data">
          <thead><tr><th>#</th><th>Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.teamId} className={`${r.teamId === career.managerClubId ? 'mine' : ''} ${i < 2 && d > 0 ? 'up' : ''} ${i >= rows.length - 2 && d < last ? 'down' : ''}`}>
                <td>{i + 1}</td>
                <td><ClubName club={career.clubs[r.teamId]!} /></td>
                <td><strong>{r.points}</strong></td>
                <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
                <td>{r.scoreFor}</td><td>{r.scoreAgainst}</td><td>{r.scoreFor - r.scoreAgainst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small"><span className="legend up" /> acesso · <span className="legend down" /> rebaixamento</p>
    </section>
  );
}

// ---------------- Mercado ----------------

function MarketTab({ career, mutate }: { career: Career; mutate: Mutate }) {
  const [pos, setPos] = useState<'ALL' | Player['position']>('ALL');
  const me = career.clubs[career.managerClubId]!;
  const listings = useMemo(() => marketListings(career, 60), [career]);
  const shown = listings.filter((l) => pos === 'ALL' || l.player.position === pos);
  return (
    <section className="panel">
      <div className="row wrap">
        <div className="chips">
          {(['ALL', 'GK', 'DF', 'MF', 'FW'] as const).map((p) => (
            <button key={p} className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>{p === 'ALL' ? 'Todos' : POS_LABEL[p]}</button>
          ))}
        </div>
        <span className="muted small">Caixa: {money(me.budget)} · Elenco: {me.players.length}/26 · lista muda a cada rodada</span>
      </div>
      <div className="scroll">
        <table className="data">
          <thead><tr><th>Pos</th><th>Nome</th><th>Idade</th><th>Geral</th><th>Clube</th><th>Salário</th><th>Preço</th><th></th></tr></thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.player.id}>
                <td><span className={`pos ${l.player.position}`}>{POS_LABEL[l.player.position]}</span></td>
                <td>{l.player.name}</td>
                <td>{l.player.age}</td>
                <td><strong>{overall(l.player)}</strong></td>
                <td className="muted">{career.clubs[l.clubId]?.name}</td>
                <td>{money(l.player.wage)}</td>
                <td>{money(l.price)}</td>
                <td><button className="small" disabled={me.budget < l.price} onClick={() => mutate((c) => buyPlayer(c, l.player.id, l.clubId))}>Comprar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------- Clube ----------------

function ClubTab({ career, mutate, onQuit }: { career: Career; mutate: Mutate; onQuit: () => void }) {
  const me = career.clubs[career.managerClubId]!;
  const wages = me.players.reduce((a, p) => a + p.wage, 0);
  return (
    <div className="grid2">
      <section className="panel">
        <h2>Finanças</h2>
        <dl className="kv">
          <dt>Caixa</dt><dd className={me.budget < 0 ? 'neg' : ''}>{money(me.budget)}</dd>
          <dt>Folha por rodada</dt><dd>{money(wages)}</dd>
          <dt>Torcida</dt><dd>{me.fans.toLocaleString('pt-BR')}</dd>
          <dt>Estádio</dt><dd>{me.stadium.toLocaleString('pt-BR')} lugares</dd>
          <dt>Ingresso</dt>
          <dd className="row">
            <button className="small" onClick={() => mutate((c) => { const x = c.clubs[c.managerClubId]!; x.ticketPrice = Math.max(1, x.ticketPrice - 1); })}>−</button>
            {money(me.ticketPrice)}
            <button className="small" onClick={() => mutate((c) => { c.clubs[c.managerClubId]!.ticketPrice += 1; })}>+</button>
          </dd>
        </dl>
        <p className="muted small">Ingresso caro aumenta receita por torcedor, mas esvazia o estádio.</p>
        <h2>Histórico</h2>
        {career.history.length === 0 ? <p className="muted">Primeira temporada.</p> : (
          <ul className="plain">{career.history.map((h) => <li key={h.year}>{h.year}: {h.position}º na Divisão {h.division}</li>)}</ul>
        )}
        <button className="link danger" onClick={onQuit}>Apagar save e recomeçar</button>
      </section>
      <section className="panel">
        <h2>Notícias</h2>
        <ul className="plain news">{career.news.slice(0, 25).map((n, i) => <li key={i}>{n}</li>)}</ul>
      </section>
    </div>
  );
}

// ---------------- util ----------------

function teamRating(c: Club) {
  const l = pickLineup(c);
  const xi = [l.GK, ...l.DF, ...l.MF, ...l.FW];
  return Math.round(xi.reduce((a, p) => a + overall(p), 0) / xi.length);
}

function Badge({ club }: { club: Club }) {
  return (
    <span className="badge" style={{ background: club.colors[0], color: club.colors[1] }}>
      {club.short}
    </span>
  );
}

function ClubName({ club }: { club: Club }) {
  return <span className="clubname"><Badge club={club} /> {club.name}</span>;
}
