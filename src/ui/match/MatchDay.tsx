import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { formatDate } from '../../core/calendar';
import type { Rng } from '../../core/rng';
import { clubStrength, lastAttendance, liveRng, myClubId, myShootout, type Career, type PreparedRound } from '../../game/career';
import { changeFormation, changeStyle, stepMinute, substitute, toOutcome, type FootballOutcome, type SideState } from '../../sports/football/engine';
import { FORMATIONS, overall } from '../../sports/football/lineup';
import { isNarrated, narrate } from '../../sports/football/narration';
import type { Formation, Side, Style, TeamStats } from '../../sports/football/types';
import { track } from '../analytics';
import { play, SoundToggle } from '../sound';
import { RoundBoard } from './RoundBoard';
import { Flag } from '../flag';
import { Badge, Bar, POS_LABEL, STYLE_LABEL, matchColors, type SideColor } from '../util';

interface Props {
  career: Career;
  prep: PreparedRound;
  onDone: (prep: PreparedRound, outcome: FootballOutcome, info: MatchPlayInfo) => void;
}

/** Como o jogador acompanhou a partida (para as conquistas). */
export interface MatchPlayInfo {
  /** Assistiu narrada até o apito final, sem pular. */
  watched: boolean;
  /** Pulou direto para o resultado ("Simular resultado"). */
  simulated: boolean;
  /** Substituições feitas pelo jogador. */
  subs: number;
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
  const [subErr, setSubErr] = useState('');
  const outcome = useRef<FootballOutcome | null>(null);
  const playInfo = useRef<MatchPlayInfo>({ watched: false, simulated: false, subs: 0 });

  useEffect(() => {
    if (stage !== 'live' || !running) return;
    const t = setInterval(() => {
      const before = m.events.length;
      stepMinute(m, rng.current!);
      // pausa automática em gol do adversário ou expulsão nossa: momento de decidir
      const fresh = m.events.slice(before);
      for (const e of fresh) {
        if (e.type === 'goal') play(e.side === side ? 'goalFor' : 'goalAgainst');
        else if (e.type === 'red') play('card');
        else if (e.type === 'injury' && e.side === side) play('injury');
        else if (e.type === 'half') play('halfTime');
      }
      if (m.finished) play('fullTime');
      // pausa em gol do adversário, expulsão ou lesão nossa: momento de decidir
      if (fresh.some((e) => (e.type === 'goal' && e.side !== side) || ((e.type === 'red' || e.type === 'injury') && e.side === side))) setRunning(false);
      if (m.minute === m.firstHalfEnd) setRunning(false);
      if (m.finished) { outcome.current = toOutcome(m); playInfo.current.watched = true; setRunning(false); setStage('post'); }
      tick();
    }, SPEEDS[speed]!.ms);
    return () => clearInterval(t);
  }, [stage, running, speed, m, side]);

  const home = career.clubs[m.home.clubId]!;
  const away = career.clubs[m.away.clubId]!;
  const colors = matchColors(home, away);
  // seu time sempre à esquerda, adversário à direita (independe de mando de campo)
  const L: Side = side;
  const R: Side = side === 'home' ? 'away' : 'home';
  const clubOf = { home, away };
  const venue = side === 'home' ? 'em casa' : 'fora';
  const barColors = { '--l': colors[L].bg, '--r': colors[R].bg } as CSSProperties;

  const competition = p.cupLabel ?? `Rodada ${p.round + 1}`;

  const simulateToEnd = () => {
    if (stage === 'pre') playInfo.current.simulated = true;
    while (!m.finished) stepMinute(m, rng.current!);
    outcome.current = toOutcome(m);
    play('fullTime');
    setStage('post');
  };

  if (stage === 'pre') {
    return (
      <div className="match">
        <p className="kicker">{competition} · {formatDate(career.date)} · {home.stadiumName} ({venue})</p>
        {p.cup !== undefined && <p className="hint center cup-note">Mata-mata: se empatar, a vaga sai nos pênaltis.</p>}
        <div className="scoreboard">
          <TeamHead club={clubOf[L]} color={colors[L]} mine sub={`${m[L].formation} · ${STYLE_LABEL[m[L].style]}`} />
          <div className="score idle">×</div>
          <TeamHead club={clubOf[R]} color={colors[R]} mine={false} sub={`${m[R].formation} · ${STYLE_LABEL[m[R].style]}`} right />
        </div>
        <div className="compare" style={barColors}>
          <Compare label="Força do time" a={clubStrength(clubOf[L])} b={clubStrength(clubOf[R])} />
          <Compare label="Condição média" a={avgCond(m[L])} b={avgCond(m[R])} />
        </div>
        <p className="hint center">Público esperado: {lastAttendance(home, away).toLocaleString('pt-BR')} torcedores</p>
        <div className="row center">
          <button className="btn primary" onClick={() => { play('whistle'); setStage('live'); setRunning(true); track('match_started', { mode: 'watch' }); }}>▶ Assistir (narrado)</button>
          <button className="btn" onClick={() => { track('match_started', { mode: 'simulate' }); simulateToEnd(); }}>⏭ Simular resultado</button>
        </div>
      </div>
    );
  }

  if (stage === 'post' && outcome.current) {
    const o = outcome.current;
    const sh = myShootout(p, o);
    const won = sh ? (side === 'home' ? sh.home > sh.away : sh.away > sh.home) : null;
    const motmSide = m[o.motm.side];
    const motm = [motmSide.GK, ...motmSide.DF, ...motmSide.MF, ...motmSide.FW, ...Object.values(career.clubs[motmSide.clubId]!.players)]
      .find((x) => x.id === o.motm.playerId);
    return (
      <div className="match">
        <p className="kicker">Fim de jogo · {competition}</p>
        <div className="scoreboard">
          <TeamHead club={clubOf[L]} color={colors[L]} mine />
          <div className="score">{goalsOf(o, L)} × {goalsOf(o, R)}{sh && <span className="clock">pên. {L === 'home' ? sh.home : sh.away} × {L === 'home' ? sh.away : sh.home}</span>}</div>
          <TeamHead club={clubOf[R]} color={colors[R]} mine={false} right />
        </div>
        {sh && (
          <section className={`shootout ${won ? 'won' : 'lost'}`} aria-label="Disputa de pênaltis">
            <h4>{won ? 'Classificado nos pênaltis!' : 'Eliminado nos pênaltis'}</h4>
            <ol className="kicks">
              {sh.kicks.map((k, i) => (
                <li key={i} className={`${k.side === side ? 'mine' : ''} ${k.scored ? 'in' : 'out'}`}>
                  <SideTag color={colors[k.side]} label={m[k.side].short} /> {k.name} <b>{k.scored ? '⚽' : '✕'}</b>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="two-col">
          <section>
            <h4>Gols</h4>
            <ul className="list">
              {o.events.filter((e) => e.type === 'goal').map((e, i) => (
                <li key={i}>⚽ {e.minute}' {e.type === 'goal' && <SideTag color={colors[e.side]} label={m[e.side].short} />} <b>{'playerName' in e ? e.playerName : ''}</b></li>
              ))}
              {o.homeScore + o.awayScore === 0 && <li className="hint">Sem gols.</li>}
            </ul>
            <StatsBars style={barColors} a={o.stats[L]} b={o.stats[R]} possession={L === 'home' ? o.possession : 1 - o.possession} />
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
            <RoundBoard career={career} prep={p} minute={m.minute} final myPens={sh ? [sh.home, sh.away] : undefined} />
          </section>
        </div>
        <div className="row center">
          <button className="btn primary" onClick={() => onDone(p, o, playInfo.current)}>Continuar ›</button>
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
        <TeamHead club={clubOf[L]} color={colors[L]} mine />
        <div className="score">{m[L].goals} × {m[R].goals}<span className="clock">{minuteLabel}'</span></div>
        <TeamHead club={clubOf[R]} color={colors[R]} mine={false} right />
      </div>
      <div className="controls">
        <button className="btn" onClick={() => setRunning(!running)}>{running ? '⏸ Pausar' : '▶ Continuar'}</button>
        {SPEEDS.map((s, i) => <button key={i} className={`btn sm ${speed === i ? 'on' : ''}`} onClick={() => setSpeed(i)}>{s.label}</button>)}
        <button className="btn" onClick={simulateToEnd}>⏭ Até o fim</button>
        <SoundToggle />
      </div>
      <div className="live-grid">
        <div className="live-main">
        <section className="feed">
          {feed.length === 0 && <p className="hint">Bola rolando.</p>}
          {feed.map((e, i) => {
            const s = 'side' in e ? e.side : null;
            return (
              <div key={i} className={`ev ev-${e.type} ${s === side ? 'mine' : ''}`} style={s ? ({ '--side': colors[s].bg } as CSSProperties) : undefined}>
                <span className="min">{e.minute}'</span>
                {s ? <SideTag color={colors[s]} label={m[s].short} /> : null}
                <span className="txt">{narrate(e)}</span>
              </div>
            );
          })}
        </section>
        <RoundBoard career={career} prep={p} minute={m.minute} final={false} />
        </div>
        <section>
          <StatsBars style={barColors} a={m[L].stats} b={m[R].stats} possession={possessionOf(m[L].stats, m[R].stats)} />
          <h4>Intervenções</h4>
          <div className="chips">
            {(Object.keys(STYLE_LABEL) as Style[]).map((s) => (
              <button key={s} className={`chip ${mine.style === s ? 'on' : ''}`} onClick={() => { if (mine.style !== s) track('match_intervention', { type: 'style', value: s, minute: m.minute }); changeStyle(m, side, s); tick(); }}>{STYLE_LABEL[s]}</button>
            ))}
            <select value={mine.formation} onChange={(e) => { track('match_intervention', { type: 'formation', value: e.target.value, minute: m.minute }); changeFormation(m, side, e.target.value as Formation); tick(); }}>
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
              if (!err) { track('match_intervention', { type: 'substitution', minute: m.minute }); playInfo.current.subs++; }
              if (!err) { setSubOut(''); setSubIn(''); setSubErr(''); tick(); } else setSubErr(err);
            }}>Trocar ({mine.subsLeft})</button>
          </div>
          {subErr && <p className="sub-error" role="alert">{subErr}</p>}
          <h4>Condição física · {m[side].short}</h4>
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
const goalsOf = (o: FootballOutcome, s: Side) => (s === 'home' ? o.homeScore : o.awayScore);
const possessionOf = (a: TeamStats, b: TeamStats) => (a.possessionMinutes + b.possessionMinutes ? a.possessionMinutes / (a.possessionMinutes + b.possessionMinutes) : 0.5);

function TeamHead({ club, sub, right, color, mine }: { club: Career['clubs'][string]; sub?: string; right?: boolean; color: SideColor; mine: boolean }) {
  return (
    <div className={`team ${right ? 'right' : ''}`} style={{ '--side': color.bg } as CSSProperties}>
      <Badge club={club} size="lg" />
      <div>
        <b>{club.country && <Flag country={club.country} />}{club.name}</b>
        <span className="team-id"><SideTag color={color} label={club.short} />{mine && <span className="you">seu time</span>}</span>
        {sub && <span className="hint">{sub}</span>}
      </div>
    </div>
  );
}

/** Etiqueta com a cor do lado na partida: identifica o time de cada lance. */
function SideTag({ color, label }: { color: SideColor; label: string }) {
  return <span className="side-tag" style={{ background: color.bg, color: color.fg }}>{label}</span>;
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

function StatsBars({ a, b, possession, style }: { a: TeamStats; b: TeamStats; possession: number; style?: CSSProperties }) {
  const rows: [string, number, number][] = [
    ['Posse', Math.round(possession * 100), 100 - Math.round(possession * 100)],
    ['Finalizações', a.shots, b.shots],
    ['No alvo', a.onTarget, b.onTarget],
    ['Escanteios', a.corners, b.corners],
    ['Faltas', a.fouls, b.fouls],
  ];
  return (
    <div className="stats" style={style}>
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
