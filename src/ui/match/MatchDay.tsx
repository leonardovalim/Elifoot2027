import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { formatDate } from '../../core/calendar';
import type { Rng } from '../../core/rng';
import { clubStrength, lastAttendance, liveRng, myClubId, myShootout, type Career, type PreparedRound } from '../../game/career';
import { changeFormation, changeStyle, minuteLabel, stepMinute, substitute, toOutcome, type FootballOutcome, type SideState } from '../../sports/football/engine';
import { FORMATIONS, overall } from '../../sports/football/lineup';
import { isNarrated, narrate } from '../../sports/football/narration';
import type { Formation, Side, Style, TeamStats } from '../../sports/football/types';
import { track } from '../analytics';
import { cheer, play, playJingle, setCrowd, SoundToggle, startCrowd, stopCrowd, useMusic, useSoundOn } from '../sound';
import { crowdLevels, crowdReaction, CUE_PRIORITY, type CrowdCue } from '../crowd';
import { RoundBoard, type Scope } from './RoundBoard';
import { Flag } from '../flag';
import { Badge, Bar, Fold, POS_LABEL, STYLE_LABEL, matchColors, type SideColor } from '../util';

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
type View = 'lances' | Scope;
/** Aba lembrada entre partidas enquanto o jogo está aberto. */
let lastView: View = 'lances';
const SPEEDS = [{ label: '▶', ms: 380 }, { label: '▶▶', ms: 140 }, { label: '▶▶▶', ms: 40 }];

/** Dia de jogo: pré-jogo → partida narrada com intervenções → pós-jogo (GDD 2.4). */
export function MatchDay({ career, prep: p, onDone }: Props) {
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = liveRng(p);
  const m = p.match;
  const me = myClubId(career);
  const side: Side = m.home.clubId === me ? 'home' : 'away';
  const attendance = lastAttendance(career.clubs[m.home.clubId]!, career.clubs[m.away.clubId]!);
  const [stage, setStage] = useState<Stage>('pre');
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const [subOut, setSubOut] = useState('');
  const [subIn, setSubIn] = useState('');
  const [subErr, setSubErr] = useState('');
  const [view, setViewState] = useState<View>(lastView);
  const setView = (v: View) => { lastView = v; setViewState(v); };
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
        else if (e.type === 'half' || e.type === 'extra') play('halfTime');
        else if (e.type === 'penalty') play('whistle');
      }
      if (m.finished) play('fullTime');
      // torcida da casa: a reação mais forte do minuto e o volume das camadas
      const cues = fresh.map((e) => crowdReaction(e, m)).filter((c): c is CrowdCue => c !== null);
      if (cues.length) cheer(cues.reduce((a, b) => (CUE_PRIORITY[b] > CUE_PRIORITY[a] ? b : a)));
      setCrowd(crowdLevels(m, attendance));
      // pausa em gol do adversário, expulsão ou lesão nossa: momento de decidir
      // pausa também em pênalti (a favor ou contra) e no começo da prorrogação
      if (fresh.some((e) => (e.type === 'goal' && e.side !== side) || ((e.type === 'red' || e.type === 'injury') && e.side === side) || e.type === 'penalty' || e.type === 'extra')) setRunning(false);
      if (m.minute === m.firstHalfEnd) setRunning(false);
      if (m.finished) { outcome.current = toOutcome(m); playInfo.current.watched = true; setRunning(false); setStage('post'); }
      tick();
    }, SPEEDS[speed]!.ms);
    return () => clearInterval(t);
  }, [stage, running, speed, m, side, attendance]);

  // torcida só na partida assistida; no pós-jogo as camadas somem e a festa/vaia termina sozinha
  const soundOn = useSoundOn();
  useEffect(() => {
    if (stage !== 'live' || !soundOn) return;
    startCrowd(crowdLevels(m, attendance));
    return () => stopCrowd();
  }, [stage, soundOn, m, attendance]);

  // trilha: tensão no pré-jogo; na partida, só a torcida; no apito final, a vinheta do resultado
  useMusic(stage === 'pre' ? 'prematch' : null);
  useEffect(() => {
    if (stage !== 'post' || !outcome.current) return;
    const o = outcome.current;
    const sh = myShootout(p, o);
    const mineG = side === 'home' ? o.homeScore : o.awayScore, theirG = side === 'home' ? o.awayScore : o.homeScore;
    const res = sh ? ((side === 'home' ? sh.home > sh.away : sh.away > sh.home) ? 'win' : 'loss') : mineG > theirG ? 'win' : mineG < theirG ? 'loss' : 'draw';
    playJingle(res, 1.1); // depois do apito final
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const myGoals = goalsOf(o, L), theirGoals = goalsOf(o, R);
    // pênaltis decidem o mata-mata; senão vale o placar
    const result: 'win' | 'draw' | 'loss' = sh ? (won ? 'win' : 'loss') : myGoals > theirGoals ? 'win' : myGoals < theirGoals ? 'loss' : 'draw';
    const RESULT_LABEL = sh
      ? { win: 'Classificado nos pênaltis', loss: 'Eliminado nos pênaltis', draw: '' }
      : { win: 'Vitória', draw: 'Empate', loss: 'Derrota' };
    const goals = o.events.filter((e): e is Extract<typeof e, { type: 'goal' }> => e.type === 'goal');
    const scorers = (s: Side) => goals.filter((e) => e.side === s);
    const possession = L === 'home' ? o.possession : 1 - o.possession;
    return (
      <div className="match post">
        <p className="kicker">Fim de jogo · {competition}</p>
        <p className={`result-chip ${result}`}>{RESULT_LABEL[result]}</p>
        <div className="scoreboard">
          <TeamHead club={clubOf[L]} color={colors[L]} mine />
          <div className="score">{myGoals} × {theirGoals}{sh && <span className="clock">pên. {L === 'home' ? sh.home : sh.away} × {L === 'home' ? sh.away : sh.home}</span>}</div>
          <TeamHead club={clubOf[R]} color={colors[R]} mine={false} right />
        </div>
        {/* gols embaixo de cada time, como no placar da TV */}
        {goals.length > 0 && (
          <div className="post-scorers">
            {[L, R].map((s) => (
              <ul key={s} className={s === R ? 'right' : ''} aria-label={`Gols do ${m[s].short}`}>
                {scorers(s).map((e, i) => <li key={i}>⚽ <b>{e.playerName}</b> {e.minute}'{e.penalty && <span className="hint"> (pên.)</span>}</li>)}
              </ul>
            ))}
          </div>
        )}
        {sh && (
          <section className={`shootout ${won ? 'won' : 'lost'}`} aria-label="Disputa de pênaltis">
            <ol className="kicks">
              {sh.kicks.map((k, i) => (
                <li key={i} className={`${k.side === side ? 'mine' : ''} ${k.scored ? 'in' : 'out'}`}>
                  <SideTag color={colors[k.side]} label={m[k.side].short} /> {k.name} <b>{k.scored ? '⚽' : '✕'}</b>
                </li>
              ))}
            </ol>
          </section>
        )}
        {motm && (
          <div className="motm-strip">
            <span className="kicker">⭐ Destaque</span>
            <b>{motm.name}</b>
            <span className="hint">{POS_LABEL[motm.position]} · {m[o.motm.side].short}</span>
            <span className="rating">{o.motm.rating.toFixed(1)}</span>
          </div>
        )}
        <section className="post-stats" aria-label="Estatísticas">
          <h4>Estatísticas</h4>
          <TvStats style={barColors} a={o.stats[L]} b={o.stats[R]} possession={possession} />
        </section>
        <Fold title="Outros jogos da rodada" className="fold-board">
          <RoundBoard career={career} prep={p} minute={m.minute} final myPens={sh ? [sh.home, sh.away] : undefined} />
        </Fold>
        <div className="modal-cta">
          <button className="btn primary" onClick={() => onDone(p, o, playInfo.current)}>Continuar ›</button>
        </div>
      </div>
    );
  }

  // ao vivo
  const mine = m[side];
  const onPitch = [mine.GK, ...mine.DF, ...mine.MF, ...mine.FW];
  const feed = m.events.filter(isNarrated).slice().reverse();
  const clock = minuteLabel(m);
  return (
    <div className="match live">
      <div className="scoreboard">
        <TeamHead club={clubOf[L]} color={colors[L]} mine />
        <div className="score">{m[L].goals} × {m[R].goals}<span className="clock">{clock}'{m.extraStart !== undefined && m.minute > m.extraStart ? ' · prorrogação' : ''}</span></div>
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
        <div className="tabs" role="tablist" aria-label="O que acompanhar">
          {(p.cup !== undefined
            ? [['lances', 'Lance a lance', 'Lances'], ['div', 'Outros jogos', 'Outros jogos']] as const
            : [['lances', 'Lance a lance', 'Lances'], ['div', 'Minha divisão', 'Divisão'], ['all', 'Todas as divisões', 'Todas']] as const
          ).map(([id, label, short]) => (
            <button key={id} role="tab" aria-selected={view === id} aria-label={label} className={`tab ${view === id ? 'on' : ''}`} onClick={() => setView(id)}>
              <span className="tab-full">{label}</span><span className="tab-short" aria-hidden="true">{short}</span>
            </button>
          ))}
        </div>
        {view === 'lances' ? <section className="feed" role="tabpanel" aria-label="Lance a lance">
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
        </section> : (
          <div className="board-panel" role="tabpanel">
            <RoundBoard career={career} prep={p} minute={m.minute} final={false} scope={view} />
          </div>
        )}
        </div>
        <section className="side-panel">
          {/* recolhido por padrão: o resumo mostra a situação atual sem ocupar a tela */}
          <details className="iv card">
            <summary>
              <h4>Intervenções</h4>
              <span className="iv-now">{STYLE_LABEL[mine.style]} · {mine.formation} · {mine.subsLeft} {mine.subsLeft === 1 ? 'troca' : 'trocas'}</span>
            </summary>
            <div className="iv-body">
            <div className="iv-block">
              <span className="iv-label">Postura</span>
              <div className="seg" role="group" aria-label="Postura do time">
                {(Object.keys(STYLE_LABEL) as Style[]).map((s) => (
                  <button key={s} aria-pressed={mine.style === s} className={mine.style === s ? 'on' : ''} onClick={() => { if (mine.style !== s) track('match_intervention', { type: 'style', value: s, minute: m.minute }); changeStyle(m, side, s); tick(); }}>{STYLE_LABEL[s]}</button>
                ))}
              </div>
            </div>
            <label className="iv-block">
              <span className="iv-label">Formação</span>
              <select value={mine.formation} onChange={(e) => { track('match_intervention', { type: 'formation', value: e.target.value, minute: m.minute }); changeFormation(m, side, e.target.value as Formation); tick(); }}>
                {Object.keys(FORMATIONS).map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <div className="iv-block">
              <span className="iv-label">Substituição <em>{mine.subsLeft} {mine.subsLeft === 1 ? 'restante' : 'restantes'}</em></span>
              <div className="iv-sub">
                <select aria-label="Quem sai" value={subOut} onChange={(e) => setSubOut(e.target.value)}>
                  <option value="">Sai…</option>
                  {onPitch.map((x) => <option key={x.id} value={x.id}>{POS_LABEL[x.position]} {x.name} ({Math.round(mine.condition[x.id]!)}%)</option>)}
                </select>
                <select aria-label="Quem entra" value={subIn} onChange={(e) => setSubIn(e.target.value)}>
                  <option value="">Entra…</option>
                  {mine.bench.map((x) => <option key={x.id} value={x.id}>{POS_LABEL[x.position]} {x.name} ({overall(x)})</option>)}
                </select>
              </div>
              <button className="btn iv-go" disabled={!subOut || !subIn || mine.subsLeft <= 0} onClick={() => {
                const err = substitute(m, side, subOut, subIn);
                if (!err) { track('match_intervention', { type: 'substitution', minute: m.minute }); playInfo.current.subs++; }
                if (!err) { setSubOut(''); setSubIn(''); setSubErr(''); tick(); } else setSubErr(err);
              }}>⇄ Trocar</button>
              {subErr && <p className="sub-error" role="alert">{subErr}</p>}
            </div>
            </div>
          </details>
          <Fold title="Estatísticas" open summary={statsLine(m[L].stats, m[R].stats, possessionOf(m[L].stats, m[R].stats))}>
            <TvStats style={barColors} a={m[L].stats} b={m[R].stats} possession={possessionOf(m[L].stats, m[R].stats)} />
          </Fold>
          <Fold title={`Condição física · ${m[side].short}`} summary={tiredLine(onPitch.map((x) => ({ name: x.name, cond: mine.condition[x.id]! })))}>
            <div className="cond-list">
              {onPitch.map((x) => (
                <div key={x.id} className="attr"><span className={`pos ${x.position}`}>{POS_LABEL[x.position]}</span><span className="nm">{x.name}</span><Bar value={mine.condition[x.id]!} /></div>
              ))}
            </div>
          </Fold>
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

/** Resumo das estatísticas no cabeçalho recolhido: posse e finalizações (seu time primeiro). */
function statsLine(a: TeamStats, b: TeamStats, possession: number) {
  const pa = Math.round(possession * 100);
  return `posse ${pa}% · chutes ${a.shots}×${b.shots}`;
}

/** Quem está mais cansado, para decidir a troca sem abrir a lista. */
function tiredLine(list: { name: string; cond: number }[]) {
  const t = [...list].sort((x, y) => x.cond - y.cond)[0];
  return t ? `mais cansado: ${t.name.split(' ')[0]} ${Math.round(t.cond)}%` : '';
}

/**
 * Estatísticas no formato de TV: uma linha por número, barras espelhadas
 * saindo do centro (seu time à esquerda), o rótulo no meio.
 */
function TvStats({ a, b, possession, style }: { a: TeamStats; b: TeamStats; possession: number; style?: CSSProperties }) {
  const rows: [string, number, number, string][] = [
    ['Posse', Math.round(possession * 100), 100 - Math.round(possession * 100), '%'],
    ['Finalizações', a.shots, b.shots, ''],
    ['No alvo', a.onTarget, b.onTarget, ''],
    ['Escanteios', a.corners, b.corners, ''],
    ['Faltas', a.fouls, b.fouls, ''],
  ];
  return (
    <div className="tv-stats" style={style}>
      {rows.map(([label, x, y, unit]) => {
        const total = x + y;
        const px = total ? (x / total) * 100 : 50, py = total ? (y / total) * 100 : 50;
        return (
          <div key={label} className="tv-row">
            <b className={x > y ? 'lead' : ''}>{x}{unit}</b>
            <span className="tv-bar l"><i style={{ width: `${px}%` }} /></span>
            <span className="tv-label">{label}</span>
            <span className="tv-bar r"><i style={{ width: `${py}%` }} /></span>
            <b className={y > x ? 'lead' : ''}>{y}{unit}</b>
          </div>
        );
      })}
    </div>
  );
}

