import { useEffect, useReducer, useRef, useState } from 'react';
import { formatDate } from '../../core/calendar';
import type { Rng } from '../../core/rng';
import { clubStrength, lastAttendance, liveRng, myClubId, type Career, type PreparedRound } from '../../game/career';
import { changeFormation, changeStyle, stepMinute, substitute, toOutcome, type FootballOutcome, type SideState } from '../../sports/football/engine';
import { FORMATIONS, overall } from '../../sports/football/lineup';
import { isNarrated, narrate } from '../../sports/football/narration';
import type { Formation, Side, Style, TeamStats } from '../../sports/football/types';
import { Badge, Bar, POS_LABEL, STYLE_LABEL } from '../util';

interface Props {
  career: Career;
  prep: PreparedRound;
  onDone: (prep: PreparedRound, outcome: FootballOutcome) => void;
}

type Stage = 'pre' | 'live' | 'post';
const SPEEDS = [{ label: '▶', ms: 380 }, { label: '▶▶', ms: 140 }, { label: '▶▶▶', ms: 40 }];

/** Dia de jogo: pré-jogo → partida narrada com intervenções → pós-jogo (GDD 2.4). */
export function MatchDay({ career, prep: p, onDone }: Props) {
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = liveRng(p);
  const m = p.match;
  const me = myClubId(career);
  const side: Side = m.home.clubId === me ? 'home' : 'away';
  const [stage, setStage] = useState<Stage>('pre');
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const [subOut, setSubOut] = useState('');
  const [subIn, setSubIn] = useState('');
  const outcome = useRef<FootballOutcome | null>(null);

  useEffect(() => {
    if (stage !== 'live' || !running) return;
    const t = setInterval(() => {
      const before = m.events.length;
      stepMinute(m, rng.current!);
      // pausa automática em gol do adversário ou expulsão nossa: momento de decidir
      const fresh = m.events.slice(before);
      if (fresh.some((e) => (e.type === 'goal' && e.side !== side) || (e.type === 'red' && e.side === side))) setRunning(false);
      if (m.minute === m.firstHalfEnd) setRunning(false);
      if (m.finished) { outcome.current = toOutcome(m); setRunning(false); setStage('post'); }
      tick();
    }, SPEEDS[speed]!.ms);
    return () => clearInterval(t);
  }, [stage, running, speed, m, side]);

  const home = career.clubs[m.home.clubId]!;
  const away = career.clubs[m.away.clubId]!;

  const simulateToEnd = () => {
    while (!m.finished) stepMinute(m, rng.current!);
    outcome.current = toOutcome(m);
    setStage('post');
  };

  if (stage === 'pre') {
    return (
      <div className="match">
        <p className="kicker">Rodada {p.round + 1} · {formatDate(career.date)} · {home.stadiumName}</p>
        <div className="scoreboard">
          <TeamHead club={home} sub={`${m.home.formation} · ${STYLE_LABEL[m.home.style]}`} />
          <div className="score idle">×</div>
          <TeamHead club={away} sub={`${m.away.formation} · ${STYLE_LABEL[m.away.style]}`} right />
        </div>
        <div className="compare">
          <Compare label="Força do time" a={clubStrength(home)} b={clubStrength(away)} />
          <Compare label="Condição média" a={avgCond(m.home)} b={avgCond(m.away)} />
        </div>
        <p className="hint center">Público esperado: {lastAttendance(home, away).toLocaleString('pt-BR')} torcedores</p>
        <div className="row center">
          <button className="btn primary" onClick={() => { setStage('live'); setRunning(true); }}>▶ Assistir (narrado)</button>
          <button className="btn" onClick={simulateToEnd}>⏭ Simular resultado</button>
        </div>
      </div>
    );
  }

  if (stage === 'post' && outcome.current) {
    const o = outcome.current;
    const motmSide = m[o.motm.side];
    const motm = [motmSide.GK, ...motmSide.DF, ...motmSide.MF, ...motmSide.FW, ...Object.values(career.clubs[motmSide.clubId]!.players)]
      .find((x) => x.id === o.motm.playerId);
    const others = p.others.filter((x) => x.divisionIndex === p.myDivision);
    return (
      <div className="match">
        <p className="kicker">Fim de jogo</p>
        <div className="scoreboard">
          <TeamHead club={home} />
          <div className="score">{o.homeScore} × {o.awayScore}</div>
          <TeamHead club={away} right />
        </div>
        <div className="two-col">
          <section>
            <h4>Gols</h4>
            <ul className="list">
              {o.events.filter((e) => e.type === 'goal').map((e, i) => (
                <li key={i}>⚽ {e.minute}' <b>{'playerName' in e ? e.playerName : ''}</b> <span className="hint">({m[e.type === 'goal' ? e.side : 'home'].short})</span></li>
              ))}
              {o.homeScore + o.awayScore === 0 && <li className="hint">Sem gols.</li>}
            </ul>
            <StatsBars a={o.stats.home} b={o.stats.away} possession={o.possession} />
          </section>
          <section>
            {motm && (
              <div className="motm">
                <span className="kicker">Destaque da partida</span>
                <b>{motm.name}</b>
                <span className="hint">{POS_LABEL[motm.position]} · {m[o.motm.side].short}</span>
                <span className="rating">{o.motm.rating.toFixed(1)}</span>
              </div>
            )}
            <h4>Outros jogos da divisão</h4>
            <ul className="list">
              {others.map((x, i) => (
                <li key={i}>{career.clubs[x.home]!.name} <b>{x.outcome.homeScore} × {x.outcome.awayScore}</b> {career.clubs[x.away]!.name}</li>
              ))}
            </ul>
          </section>
        </div>
        <div className="row center">
          <button className="btn primary" onClick={() => onDone(p, o)}>Continuar ›</button>
        </div>
      </div>
    );
  }

  // ao vivo
  const mine = m[side];
  const onPitch = [mine.GK, ...mine.DF, ...mine.MF, ...mine.FW];
  const feed = m.events.filter(isNarrated).slice().reverse();
  const minuteLabel = m.minute > 90 ? `90+${m.minute - 90}` : m.minute > 45 && m.minute <= m.firstHalfEnd ? `45+${m.minute - 45}` : `${m.minute}`;
  return (
    <div className="match live">
      <div className="scoreboard">
        <TeamHead club={home} />
        <div className="score">{m.home.goals} × {m.away.goals}<span className="clock">{minuteLabel}'</span></div>
        <TeamHead club={away} right />
      </div>
      <div className="controls">
        <button className="btn" onClick={() => setRunning(!running)}>{running ? '⏸ Pausar' : '▶ Continuar'}</button>
        {SPEEDS.map((s, i) => <button key={i} className={`btn sm ${speed === i ? 'on' : ''}`} onClick={() => setSpeed(i)}>{s.label}</button>)}
        <button className="btn" onClick={simulateToEnd}>⏭ Até o fim</button>
      </div>
      <div className="live-grid">
        <section className="feed">
          {feed.length === 0 && <p className="hint">A bola vai rolar…</p>}
          {feed.map((e, i) => (
            <div key={i} className={`ev ${e.type} ${'side' in e && e.side === side ? 'mine' : ''}`}>
              <span className="min">{e.minute}'</span>
              <span>{narrate(e)}</span>
            </div>
          ))}
        </section>
        <section>
          <StatsBars a={m.home.stats} b={m.away.stats} possession={possessionOf(m.home.stats, m.away.stats)} />
          <h4>Intervenções {running && <span className="hint">(pause para decidir)</span>}</h4>
          <div className="chips">
            {(Object.keys(STYLE_LABEL) as Style[]).map((s) => (
              <button key={s} className={`chip ${mine.style === s ? 'on' : ''}`} onClick={() => { changeStyle(m, side, s); tick(); }}>{STYLE_LABEL[s]}</button>
            ))}
            <select value={mine.formation} onChange={(e) => { changeFormation(m, side, e.target.value as Formation); tick(); }}>
              {Object.keys(FORMATIONS).map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="sub-row">
            <select value={subOut} onChange={(e) => setSubOut(e.target.value)}>
              <option value="">Sai…</option>
              {onPitch.map((x) => <option key={x.id} value={x.id}>{POS_LABEL[x.position]} {x.name} ({Math.round(mine.condition[x.id]!)}%)</option>)}
            </select>
            <select value={subIn} onChange={(e) => setSubIn(e.target.value)}>
              <option value="">Entra…</option>
              {mine.bench.map((x) => <option key={x.id} value={x.id}>{POS_LABEL[x.position]} {x.name} ({overall(x)})</option>)}
            </select>
            <button className="btn sm" disabled={!subOut || !subIn || mine.subsLeft <= 0} onClick={() => {
              const err = substitute(m, side, subOut, subIn);
              if (!err) { setSubOut(''); setSubIn(''); tick(); } else alert(err);
            }}>Trocar ({mine.subsLeft})</button>
          </div>
          <h4>Condição física</h4>
          <div className="cond-list">
            {onPitch.map((x) => (
              <div key={x.id} className="attr"><span className={`pos ${x.position}`}>{POS_LABEL[x.position]}</span><span className="nm">{x.name}</span><Bar value={mine.condition[x.id]!} /></div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const avgCond = (s: SideState) => {
  const xs = [s.GK, ...s.DF, ...s.MF, ...s.FW];
  return xs.reduce((a, p) => a + (s.condition[p.id] ?? 100), 0) / xs.length;
};
const possessionOf = (a: TeamStats, b: TeamStats) => (a.possessionMinutes + b.possessionMinutes ? a.possessionMinutes / (a.possessionMinutes + b.possessionMinutes) : 0.5);

function TeamHead({ club, sub, right }: { club: Career['clubs'][string]; sub?: string; right?: boolean }) {
  return (
    <div className={`team ${right ? 'right' : ''}`}>
      <Badge club={club} size="lg" />
      <div><b>{club.name}</b>{sub && <span className="hint">{sub}</span>}</div>
    </div>
  );
}

function Compare({ label, a, b }: { label: string; a: number; b: number }) {
  const pa = (a / (a + b)) * 100;
  return (
    <div className="compare-row">
      <b>{Math.round(a)}</b>
      <div className="dual"><span className="l" style={{ width: `${pa}%` }} /><span className="r" style={{ width: `${100 - pa}%` }} /></div>
      <b>{Math.round(b)}</b>
      <span className="label">{label}</span>
    </div>
  );
}

function StatsBars({ a, b, possession }: { a: TeamStats; b: TeamStats; possession: number }) {
  const rows: [string, number, number][] = [
    ['Posse', Math.round(possession * 100), 100 - Math.round(possession * 100)],
    ['Finalizações', a.shots, b.shots],
    ['No alvo', a.onTarget, b.onTarget],
    ['Escanteios', a.corners, b.corners],
    ['Faltas', a.fouls, b.fouls],
  ];
  return (
    <div className="stats">
      {rows.map(([label, x, y]) => (
        <div key={label} className="compare-row">
          <b>{x}{label === 'Posse' ? '%' : ''}</b>
          <div className="dual"><span className="l" style={{ width: `${x + y ? (x / (x + y)) * 100 : 50}%` }} /><span className="r" style={{ width: `${x + y ? (y / (x + y)) * 100 : 50}%` }} /></div>
          <b>{y}{label === 'Posse' ? '%' : ''}</b>
          <span className="label">{label}</span>
        </div>
      ))}
    </div>
  );
}
