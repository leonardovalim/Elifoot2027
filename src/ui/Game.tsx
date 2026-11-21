import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PHASE_LABEL, formatDate } from '../core/calendar';
import { OBJECTIVE_LABEL, PRESSURE_LABEL } from '../core/entrepreneur';
import { divisionStandings } from '../core/season';
import {
  acceptOffer,
  activeBond,
  goalDone,
  activeIndex,
  advanceDay,
  closeSeasonAll,
  completeRound,
  isMultiplayer,
  managerCount,
  managerNeedingAttention,
  managerState,
  nextQueuedMatch,
  switchManager,
  visibleNews,
  decide,
  divisionOf,
  isMatchDay,
  nextCupMatch,
  myClubId,
  pendingDecision,
  resolveMidSeason,
  MID_SEASON,
  type MidOffer,
  prepareRound,
  seasonSummary,
  simulateRound,
  type Career,
  type News,
  type PreparedRound,
  type SeasonSummary,
} from '../game/career';
import { ATTR_SHORT } from '../sports/football/development';
import { football, type FootballOutcome } from '../sports/football/engine';
import { MatchDay, type MatchPlayInfo } from './match/MatchDay';
import { DecisionModal } from './panels/Decisions';
import { CareerPanel, FinancePanel, MarketPanel, SquadPanel, TablePanel, type Act } from './panels/Panels';
import { CtScene, type SceneGain } from './scene/CtScene';
import { track } from './analytics';
import { play, playJingle, SoundToggle, useMusic } from './sound';
import { saveCareer } from './storage';
import { openHelp } from './help';
import { achieve, playMinutes, setAchievementColors, startPlayClock, useUnlocked } from './achievements';
import { checkState, onAction, onMatch, onMonth, onSeasonEnd, seasonFacts, snapshotForActions } from '../game/achievements';
import type { RoundRecord } from '../game/career';
import { Badge, Bar, Modal, money, moneyShort } from './util';
import { cupName, stageName } from '../game/cup';

type Menu = 'elenco' | 'mercado' | 'tabela' | 'financas' | 'carreira';
const MENUS: { id: Menu; label: string; icon: string }[] = [
  { id: 'elenco', label: 'Elenco', icon: '👥' },
  { id: 'mercado', label: 'Mercado', icon: '🔁' },
  { id: 'tabela', label: 'Tabela', icon: '🏆' },
  { id: 'financas', label: 'Finanças', icon: '💰' },
  { id: 'carreira', label: 'Carreira', icon: '👤' },
];
/** ms por dia em cada velocidade. 0 = pausado. */
const SPEEDS = [0, 420, 170, 45];
const NEWS_ICON: Record<News['kind'], string> = { info: '📣', good: '⭐', bad: '⚠️', match: '⚽', money: '💰', training: '💪' };

export function Game({ initial, onReset }: { initial: Career; onReset: () => void }) {
  const ref = useRef<Career>(initial);
  const c = ref.current;
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [speed, setSpeed] = useState(0);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [prep, setPrep] = useState<PreparedRound | null>(null);
  const [summary, setSummary] = useState<SeasonSummary | null>(null);
  /** Multijogador: balanços que ainda faltam mostrar (um por técnico). */
  const [summaryQueue, setSummaryQueue] = useState<{ manager: number; s: SeasonSummary }[]>([]);
  /** Multijogador: tela de "passe o aparelho" para o técnico indicado. */
  const [handoff, setHandoff] = useState<number | null>(null);
  const [autoSim, setAutoSim] = useState(false);
  const [gains, setGains] = useState<{ list: SceneGain[]; key: string }>({ list: [], key: '' });
  const [toast, setToast] = useState<string | null>(null);
  const resumeSpeed = useRef(1);

  const save = useCallback(() => saveCareer(ref.current), []);
  const decision = pendingDecision(c);
  const midOpen = !!c.midSeason?.open && !c.unemployed;
  const blocking = !!menu || !!prep || c.phase === 'encerramento' || c.unemployed || !!summary || !!decision || midOpen || handoff !== null;
  const multi = isMultiplayer(c);

  /** Passa a vez para o técnico `i` (mostra a tela de troca se mudou de pessoa). */
  const giveTurn = (i: number) => {
    if (!multi || i === activeIndex(ref.current)) return;
    switchManager(ref.current, i);
    setHandoff(i);
    setMenu(null);
    save();
  };

  // multijogador: outro técnico tem decisão, janela ou emprego esperando → a vez passa para ele
  const needs = multi && !prep && !summary && handoff === null && !menu && c.phase !== 'encerramento' ? managerNeedingAttention(c) : -1;
  useEffect(() => {
    if (needs >= 0 && needs !== activeIndex(ref.current)) { setSpeed(0); giveTurn(needs); force(); }
  }, [needs]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = speed > 0 && !blocking;

  const pause = () => { if (speed > 0) resumeSpeed.current = speed; setSpeed(0); month.current.clean = false; };

  // depois de uma partida o tempo volta na velocidade mais lenta, para dar tempo de mexer no elenco antes do próximo jogo
  const slowDownAfterMatch = () => {
    resumeSpeed.current = 1;
    setSpeed((s) => (s > 1 ? 1 : s));
  };

  const doAct = (fn: Parameters<Act>[0], decided?: { kind: string; choice: string }) => {
    const snap = snapshotForActions(ref.current);
    const err = fn(ref.current);
    if (typeof err === 'string') setToast(err);
    else achieve((s) => onAction(s, snap, ref.current, decided));
    save();
    force();
  };
  const act: Act = (fn) => doAct(fn);

  // conquistas de partida (assistida ou automática)
  const matchAchievements = (r: RoundRecord, year: number, info: MatchPlayInfo) => {
    const career = ref.current;
    const me = myClubId(career);
    const m = r.matches.find((x) => x.home === me || x.away === me);
    if (!m) return;
    achieve((s) => onMatch(s, { career, outcome: m.outcome, side: m.home === me ? 'home' : 'away', homeId: m.home, awayId: m.away, year, ...info }));
  };

  // "Relógio suíço": o mês inteiro passou sem pausa manual
  const month = useRef({ tracking: false, clean: false });
  const unlocked = useUnlocked();
  useEffect(() => { achieve((s) => checkState(s, ref.current)); }, []);

  // relógio do jogo
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const career = ref.current;
      if (isMatchDay(career)) {
        if (autoSim) {
          const year = career.season.year;
          const r = simulateRound(career);
          track('match_simulated', { mode: 'auto' });
          matchAchievements(r, year, { watched: false, simulated: true, subs: 0 });
          slowDownAfterMatch(); save(); force(); return;
        }
        const p = prepareRound(career);
        if (p.manager !== undefined) giveTurn(p.manager);
        setPrep(p);
        return;
      }
      const r = advanceDay(career);
      if (r.gains.length) setGains({ list: r.gains.map((g) => ({ playerId: g.playerId, text: `+1 ${ATTR_SHORT[g.attr]}` })), key: r.date });
      if (r.date.endsWith('-01')) {
        const clean = month.current.tracking && month.current.clean;
        achieve((s) => onMonth(s, career, clean));
        month.current = { tracking: true, clean: true };
        save();
      }
      force();
    }, SPEEDS[speed]);
    return () => clearInterval(t);
  }, [running, speed, autoSim, save]);

  // o jogo parou para o jogador decidir algo: avisa com som
  const decisionId = decision?.id;
  const seasonEnding = c.phase === 'encerramento';
  useEffect(() => { if (decisionId) play('alert'); }, [decisionId]);
  useEffect(() => { if (prep) play('alert'); }, [prep]);
  useEffect(() => { if (seasonEnding) play('alert'); }, [seasonEnding]);
  useEffect(() => { if (midOpen) play('alert'); }, [midOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !blocking) {
        e.preventDefault();
        setSpeed((s) => (s > 0 ? (resumeSpeed.current = s, month.current.clean = false, 0) : resumeSpeed.current || 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocking]);

  const me = myClubId(c);
  const club = me ? c.clubs[me] : undefined;
  const bond = activeBond(c);
  // a miniatura da conquista sai nas cores do clube, como o objeto aparece no CT
  useEffect(() => startPlayClock(), []);
  useEffect(() => { if (club) setAchievementColors(club.colors); }, [club?.colors[0], club?.colors[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  // trilha do CT; com o Dia de jogo aberto, quem decide é a partida
  useMusic(prep ? undefined : 'hub');

  /** Fecha o balanço da vez; se faltar o de outro técnico, a vez passa para ele. */
  const nextSummary = () => {
    const [head, ...rest] = summaryQueue;
    setSummaryQueue(rest);
    if (head) { giveTurn(head.manager); setSummary(head.s); } else setSummary(null);
    save();
    force();
  };

  const handoffModal = handoff !== null && (
    <Modal title="Troca de técnico" className="handoff">
      <p className="handoff-name">Vez de <b>{managerState(c, handoff).entrepreneur.name}</b></p>
      {club && <p className="hint center"><Badge club={club} size="lg" /> {club.name}</p>}
      <p className="hint center">Passe o aparelho. Quem estava jogando não precisa ver as decisões do outro.</p>
      <div className="modal-cta"><button className="btn primary big" autoFocus onClick={() => setHandoff(null)}>Sou eu, continuar ›</button></div>
    </Modal>
  );

  const onMatchDone = (p: PreparedRound, o: FootballOutcome, info: MatchPlayInfo) => {
    // multijogador: ainda há partida de outro técnico nesta rodada
    const next = nextQueuedMatch(p, o);
    if (next) {
      giveTurn(next.manager!);
      setPrep(next);
      force();
      return;
    }
    const home = p.match.home.clubId === myClubId(ref.current);
    const gf = home ? o.homeScore : o.awayScore, ga = home ? o.awayScore : o.homeScore;
    track('match_finished', { round: p.round + 1, season: ref.current.season.year, result: gf > ga ? 'win' : gf < ga ? 'loss' : 'draw', goals_for: gf, goals_against: ga, home });
    const year = ref.current.season.year;
    const r = completeRound(ref.current, p, o);
    matchAchievements(r, year, info);
    setPrep(null);
    slowDownAfterMatch();
    save();
    force();
  };

  const endSeason = () => {
    const facts = seasonFacts(ref.current, seasonSummary(ref.current));
    const me = activeIndex(ref.current);
    const all = closeSeasonAll(ref.current);
    const s = all[me] ?? all.find(Boolean)!;
    achieve((st) => onSeasonEnd(st, facts, ref.current));
    // os outros técnicos veem o balanço deles em seguida
    setSummaryQueue(all.map((x, i) => ({ manager: i, s: x })).filter((x) => x.s && x.manager !== me));
    track('season_completed', { seasons_played: ref.current.entrepreneur.history.length, position: s.position, division: s.division + 1, objective: s.objective, achieved: s.achieved, fired: s.fired, promoted: s.promoted, relegated: s.relegated, pressure: s.pressure, side_goals: s.goals.length, side_goals_done: s.goals.filter((g) => g.done).length, play_minutes: playMinutes() });
    setSummary(s);
    save();
    force();
  };

  // ------------------------------------------------ sem clube (demitido)
  if (!club || !bond) {
    const accept = (o: Career['offers'][number]) => {
      track('offer_accepted', { unemployed: ref.current.unemployed });
      const err = acceptOffer(ref.current, o);
      if (err) { setToast(err); return; }
      nextSummary();
    };
    return (
      <div className="game">
        {handoff !== null ? null : summary ? (
          // acabou de ser demitido: mostra o balanço da temporada antes das propostas
          <Modal title={multi ? `Balanço ${c.season.year - 1} · ${c.entrepreneur.name}` : `Balanço ${c.season.year - 1}`}>
            <SummaryView s={summary} />
            <p>
              {summary.broke
                ? <>A diretoria decidiu não renovar: <b className="neg">a temporada terminou com o caixa negativo</b>{summary.achieved ? ', mesmo com o objetivo cumprido' : ''}.</>
                : 'A diretoria decidiu não renovar.'}
            </p>
            <h4>Propostas recebidas</h4>
            <OfferList career={c} onAccept={accept} />
            <div className="modal-cta"><button className="btn ghost" onClick={onReset}>Encerrar carreira</button></div>
          </Modal>
        ) : (
          <Modal title={multi ? `${c.entrepreneur.name}, você está sem clube` : 'Você está sem clube'}>
            <h4>Propostas recebidas</h4>
            <OfferList career={c} onAccept={accept} />
            <div className="modal-cta"><button className="btn ghost" onClick={onReset}>Encerrar carreira</button></div>
          </Modal>
        )}
        {handoffModal}
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  const d = divisionOf(c, me);
  const table = divisionStandings(c.season.divisions[d]!, football.points);
  const pos = table.findIndex((r) => r.teamId === me) + 1;
  const leagueDate = c.roundDates[c.season.round];
  const leagueFixture = c.phase !== 'encerramento' ? c.season.divisions[d]!.rounds[c.season.round]?.find((f) => f.home === me || f.away === me) : undefined;
  // a copa entra no lugar quando o jogo dela vem antes
  const nextCup = nextCupMatch(c);
  const cupTie = nextCup?.tie;
  const cupDate = nextCup?.date;
  const isCupNext = !!cupDate && (!leagueFixture || !leagueDate || cupDate < leagueDate);
  const nextDate = isCupNext ? cupDate : leagueDate;
  const nextFixture = isCupNext ? cupTie : leagueFixture;
  const opp = nextFixture ? c.clubs[nextFixture.home === me ? nextFixture.away : nextFixture.home]! : undefined;
  const daysTo = nextDate ? Math.round((Date.parse(nextDate) - Date.parse(c.date)) / 86400000) : 0;

  return (
    <div className="game">
      <header className="hud" aria-label="Resumo da carreira">
        <div className="hud-club">
          <Badge club={club} size="lg" />
          <div>
            <b>{club.name}</b>
            {multi && <span className="hud-manager">Técnico: <b>{c.entrepreneur.name}</b> ({activeIndex(c) + 1}/{managerCount(c)})</span>}
            <span>Div. {d + 1} · {(table[pos - 1]?.played ?? 0) > 0 ? `${pos}º lugar` : 'sem jogos'}</span>
          </div>
        </div>
        <div className="hud-date">
          <span className="hud-kicker">Agora</span>
          <b>{formatDate(c.date)}</b>
          <span>{PHASE_LABEL[c.phase]} {c.season.year}</span>
        </div>
        <div className="hud-resources" aria-label="Recursos da carreira">
          <div className="hud-money">
            <span className="lbl">Caixa do clube</span>
            <b className={club.budget < 0 ? 'neg' : ''}>{moneyShort(club.budget)}</b>
          </div>
          <div className="hud-money">
            <span className="lbl">Seu patrimônio</span>
            <b>{moneyShort(c.entrepreneur.cash)}</b>
          </div>
          <div className="hud-rep">
            <span className="lbl">Reputação</span>
            <Bar value={c.entrepreneur.reputation} tone="accent" />
          </div>
        </div>
        <div className="speed" role="group" aria-label="Velocidade do tempo">
          <span className="speed-label">Tempo</span>
          {['⏸', '▶', '▶▶', '▶▶▶'].map((s, i) => (
            <button key={i} className={`btn sm ${speed === i ? 'on' : ''}`} aria-label={i === 0 ? 'Pausar' : `Velocidade ${i}`} aria-pressed={speed === i} disabled={blocking && i > 0} onClick={() => { if (i === 0) pause(); else { setSpeed(i); track('time_speed', { speed: i }); } }} title={i === 0 ? 'Pausar (espaço)' : `Velocidade ${i}`}>{s}</button>
          ))}
          <SoundToggle />
        </div>
        {multi && (
          <button className="btn sm pass-turn" disabled={!!prep || c.phase === 'encerramento'} onClick={() => { pause(); giveTurn((activeIndex(c) + 1) % managerCount(c)); force(); }}
            title="Passar a vez para o próximo técnico">
            Vez de {managerState(c, (activeIndex(c) + 1) % managerCount(c)).entrepreneur.name} ›
          </button>
        )}
        <button className="btn sm help-btn" aria-label="Ajuda: como jogar" title="Como jogar" onClick={() => { pause(); openHelp(); }}>?</button>
      </header>

      <main className="stage" aria-label="Visão geral da carreira">
        <div className="scene-wrap">
          <CtScene
            players={club.players.map((p) => ({ id: p.id, label: p.name }))}
            colors={club.colors}
            trainingCenter={club.trainingCenter}
            gains={gains.list}
            gainsKey={gains.key}
            paused={!running}
            legacy={unlocked}
          />
          {!running && !blocking && (
            <button className="paused-badge" onClick={() => setSpeed(resumeSpeed.current || 1)}>⏸ Pausado · continuar ▶</button>
          )}
        </div>

        <aside className="side">
          <section className="window next-window">
            <header className="window-title"><span>Próximo jogo</span></header>
            <div className="window-body">
              {opp && nextFixture ? (
                <>
                  <div className="next">
                    <Badge club={opp} size="lg" />
                    <div>
                      <b>{opp.name}</b>
                      <span className="hint">{isCupNext && nextCup && <>{cupName(nextCup.cup)} · {stageName(nextCup.cup, nextCup.cup.round)}<br /></>}{nextFixture.home === me ? 'Em casa' : 'Fora'} · {nextDate && formatDate(nextDate)}</span>
                    </div>
                  </div>
                  <p className="countdown">{daysTo <= 0 ? 'É HOJE!' : daysTo === 1 ? 'Amanhã' : `em ${daysTo} dias`}</p>
                </>
              ) : <p className="hint">Sem jogos agendados.</p>}
              <label className="check sim-toggle"><input type="checkbox" checked={autoSim} onChange={(e) => setAutoSim(e.target.checked)} /> Simular jogos automaticamente</label>
            </div>
          </section>
          <section className="window objective-window">
            <header className="window-title"><span>Objetivo</span></header>
            <div className="window-body">
              <p className="objective">🎯 {OBJECTIVE_LABEL[bond.objective]}</p>
              <div className="objective-meta">
                <span className="hint">Rodada {Math.min(c.season.round, c.roundDates.length)}/{c.roundDates.length}</span>
                <b>{table[pos - 1]?.points ?? 0} pts</b>
              </div>
              <Bar value={c.season.round} max={c.roundDates.length} tone="accent" />
              <p className={`pressure p${bond.pressure ?? 0}`}>Cobrança da diretoria: <b>{PRESSURE_LABEL[bond.pressure ?? 0]}</b></p>
              {(bond.goals ?? []).length > 0 && (
                <ul className="side-goals">
                  {bond.goals!.map((g) => {
                    const done = goalDone(c, g);
                    return <li key={g.kind} className={done ? 'done' : ''}><span>{done ? '✓' : '○'}</span>{g.label}</li>;
                  })}
                </ul>
              )}
            </div>
          </section>
          <section className="window news">
            <header className="window-title"><span>Notícias</span></header>
            <ul className="window-body feed">
              {visibleNews(c).slice(0, 30).map((n, i) => (
                <li key={i} className={n.kind}><span className="ico">{NEWS_ICON[n.kind]}</span><span>{n.text}<em>{n.date.slice(8, 10)}/{n.date.slice(5, 7)}</em></span></li>
              ))}
            </ul>
          </section>
        </aside>
      </main>

      <nav className="dock">
        {MENUS.map((m) => (
          <button key={m.id} className={`dock-btn ${menu === m.id ? 'active' : ''}`} aria-current={menu === m.id ? 'page' : undefined} onClick={() => { pause(); setMenu(m.id); track('menu_opened', { menu: m.id }); }}>
            <span className="ico">{m.icon}</span>{m.label}
          </button>
        ))}
      </nav>

      {menu && (
        <Modal title={MENUS.find((x) => x.id === menu)!.label} onClose={() => setMenu(null)} wide className={`menu-${menu}`}>
          {menu === 'elenco' && <SquadPanel career={c} act={act} />}
          {menu === 'mercado' && <MarketPanel career={c} act={act} />}
          {menu === 'tabela' && <TablePanel career={c} />}
          {menu === 'financas' && <FinancePanel career={c} act={act} />}
          {menu === 'carreira' && <CareerPanel career={c} onReset={onReset} />}
        </Modal>
      )}

      {prep && handoff === null && (
        <Modal title={multi ? `Dia de jogo · ${c.entrepreneur.name}` : 'Dia de jogo'} wide className="match-window">
          <MatchDay key={`${prep.manager ?? 0}-${prep.match.home.clubId}`} career={c} prep={prep} onDone={onMatchDone} />
        </Modal>
      )}

      {c.phase === 'encerramento' && !summary && (
        <SeasonEndModal career={c} onClose={endSeason} />
      )}

      {summary && handoff === null && (
        <Modal title={multi ? `Balanço ${c.season.year - 1} · ${c.entrepreneur.name}` : `Balanço ${c.season.year - 1}`}>
          <SummaryView s={summary} />
          {/* demitido não chega aqui: o retorno "sem clube" acima mostra o balanço com as propostas */}
          {c.offers.length > 0 && (
            <>
              <h4>Propostas recebidas</h4>
              <OfferList career={c} onAccept={(o) => {
                track('offer_accepted', { unemployed: ref.current.unemployed });
                const err = acceptOffer(ref.current, o);
                if (err) { setToast(err); return; }
                nextSummary();
              }} />
            </>
          )}
          <p className="objective">🎯 Novo objetivo: {OBJECTIVE_LABEL[activeBond(c)!.objective]}</p>
          <p className={`pressure p${activeBond(c)!.pressure ?? 0}`}>Cobrança da diretoria: <b>{PRESSURE_LABEL[activeBond(c)!.pressure ?? 0]}</b>{(activeBond(c)!.pressure ?? 0) > 0 ? ' · depois do que você entregou, a meta subiu' : ''}</p>
          <div className="modal-cta">
            <button className="btn primary" onClick={() => { ref.current.offers = []; nextSummary(); }}>
              {c.offers.length ? 'Ficar no clube' : 'Seguir para a nova temporada'} ›
            </button>
          </div>
        </Modal>
      )}

      {handoffModal}

      {midOpen && !menu && !prep && !summary && handoff === null && (
        <MidSeasonModal career={c} onChoose={(clubId) => {
          track('midseason_offer', { choice: clubId ? c.midSeason!.offers.find((o) => o.clubId === clubId)!.reason : 'ficar' });
          doAct((career) => resolveMidSeason(career, clubId));
        }} />
      )}

      {decision && !menu && !prep && !summary && !midOpen && handoff === null && c.phase !== 'encerramento' && (
        <DecisionModal career={c} decision={decision} onChoose={(choice) => {
          track('market_decision', { kind: decision.kind, choice });
          if (decision.kind === 'bid' && choice === 'accept') play('money'); // vendeu o atleta
          doAct((career) => decide(career, decision.id, choice), { kind: decision.kind, choice });
        }} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SeasonEndModal({ career, onClose }: { career: Career; onClose: () => void }) {
  const s = seasonSummary(career);
  // vinheta do fim da temporada: título > acesso > rebaixamento (temporada comum: sem vinheta)
  useEffect(() => {
    const j = s.position === 1 ? 'title' : s.promoted ? 'promotion' : s.relegated ? 'relegation' : null;
    if (j) playJingle(j, 0.4);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={`Fim da temporada ${career.season.year}`}>
      <SummaryView s={s} />
      <div className="modal-cta"><button className="btn primary" onClick={onClose}>Ver premiação e balanço ›</button></div>
    </Modal>
  );
}

function SummaryView({ s }: { s: SeasonSummary }) {
  return (
    <div className="summary">
      <div className="big-pos">{s.position}º</div>
      <p>na Divisão {s.division + 1}{s.promoted ? ' · 🎉 ACESSO!' : ''}{s.relegated ? ' · rebaixado' : ''}</p>
      <p className={s.achieved ? 'ok' : 'neg'}>🎯 {OBJECTIVE_LABEL[s.objective]}: {s.achieved ? 'cumprido!' : 'não cumprido'}</p>
      {s.goals.length > 0 && (
        <ul className="side-goals">
          {s.goals.map((g) => <li key={g.label} className={g.done ? 'done' : ''}><span>{g.done ? '✓' : '✗'}</span>{g.label}</li>)}
        </ul>
      )}
      <dl className="kv">
        <dt>Premiação</dt><dd>{money(s.prize)}</dd>
        <dt>Reputação</dt><dd>{s.reputationDelta >= 0 ? '+' : ''}{s.reputationDelta}</dd>
      </dl>
    </div>
  );
}

/** Janela do meio do campeonato: convites por mérito ou crise, com o custo de sair à vista. */
function MidSeasonModal({ career, onChoose }: { career: Career; onChoose: (clubId: string | null) => void }) {
  const w = career.midSeason!;
  const mine = career.clubs[myClubId(career)]!;
  const fine = Math.min(career.entrepreneur.cash, (activeBond(career)?.monthlySalary ?? 0) * MID_SEASON.fineSalaries);
  const why = (o: MidOffer) => o.reason === 'merito'
    ? 'Gostou do seu turno e quer você para o returno.'
    : `Está em ${o.clubPosition}º, ameaçado de rebaixamento: quer você para salvar a temporada.`;
  return (
    <Modal title="Janela do meio do campeonato">
      <p>Fim do 1º turno: o <b>{mine.name}</b> está em <b>{w.position}º</b> na Divisão {divisionOf(career, mine.id) + 1}. {w.offers.length === 1 ? 'Um clube quer' : 'Clubes querem'} você agora.</p>
      <div className="offers small">
        {w.offers.map((o) => {
          const club = career.clubs[o.clubId]!;
          return (
            <div key={o.clubId} className={`offer mid-${o.reason}`}>
              {/* o cartão de proposta é um grid de 4 linhas (cabeçalho, dados, objetivo, botão): o motivo fica no cabeçalho */}
              <div className="offer-head"><Badge club={club} /><div><span className="offer-name">{club.name}</span><span className="hint">Divisão {divisionOf(career, club.id) + 1} · {o.clubPosition}º</span><span className="mid-why">{o.reason === 'merito' ? '⭐' : '🚨'} {why(o)}</span></div></div>
              <dl className="kv"><dt>Reputação</dt><dd>{club.reputation}/100</dd><dt>Salário</dt><dd>{money(o.monthlySalary)}/mês</dd></dl>
              <div className="objective">🎯 {OBJECTIVE_LABEL[o.objective]}</div>
              <button className="btn primary" onClick={() => onChoose(o.clubId)}>Aceitar</button>
            </div>
          );
        })}
      </div>
      <p className="hint">Sair agora custa <b>{money(fine)}</b> de multa rescisória (do seu patrimônio) e <b>−{MID_SEASON.leaveReputation}</b> de reputação. O objetivo do clube novo vale para a temporada inteira dele.</p>
      <button className="btn mid-stay" onClick={() => onChoose(null)}>Ficar no {mine.name} <span className="hint">(+{MID_SEASON.stayReputation} de reputação)</span></button>
    </Modal>
  );
}

function OfferList({ career, onAccept }: { career: Career; onAccept: (o: Career['offers'][number]) => void }) {
  return (
    <div className="offers small">
      {career.offers.map((o) => {
        const club = career.clubs[o.clubId]!;
        return (
          <div key={o.clubId} className="offer">
            <div className="offer-head"><Badge club={club} /><div><span className="offer-name">{club.name}</span><span className="hint">Divisão {divisionOf(career, club.id) + 1}</span></div></div>
            <dl className="kv"><dt>Reputação</dt><dd>{club.reputation}/100</dd><dt>Salário</dt><dd>{money(o.monthlySalary)}/mês</dd></dl>
            <div className="objective">🎯 {OBJECTIVE_LABEL[o.objective]}</div>
            <button className="btn primary" onClick={() => onAccept(o)}>Aceitar</button>
          </div>
        );
      })}
    </div>
  );
}

