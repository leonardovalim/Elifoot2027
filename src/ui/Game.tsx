import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PHASE_LABEL, formatDate } from '../core/calendar';
import { OBJECTIVE_LABEL } from '../core/entrepreneur';
import { divisionStandings } from '../core/season';
import {
  acceptOffer,
  activeBond,
  advanceDay,
  closeSeason,
  completeRound,
  decide,
  divisionOf,
  isMatchDay,
  myClubId,
  pendingDecision,
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
import { MatchDay } from './match/MatchDay';
import { DecisionModal } from './panels/Decisions';
import { CareerPanel, FinancePanel, MarketPanel, SquadPanel, TablePanel, type Act } from './panels/Panels';
import { CtScene, type SceneGain } from './scene/CtScene';
import { track } from './analytics';
import { saveCareer } from './storage';
import { Badge, Bar, Modal, money, moneyShort } from './util';

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
  const [autoSim, setAutoSim] = useState(false);
  const [gains, setGains] = useState<{ list: SceneGain[]; key: string }>({ list: [], key: '' });
  const [toast, setToast] = useState<string | null>(null);
  const resumeSpeed = useRef(1);

  const save = useCallback(() => saveCareer(ref.current), []);
  const decision = pendingDecision(c);
  const blocking = !!menu || !!prep || c.phase === 'encerramento' || c.unemployed || !!summary || !!decision;
  const running = speed > 0 && !blocking;

  const pause = () => { if (speed > 0) resumeSpeed.current = speed; setSpeed(0); };

  // depois de uma partida o tempo volta na velocidade mais lenta, para dar tempo de mexer no elenco antes do próximo jogo
  const slowDownAfterMatch = () => {
    resumeSpeed.current = 1;
    setSpeed((s) => (s > 1 ? 1 : s));
  };

  const act: Act = (fn) => {
    const err = fn(ref.current);
    if (typeof err === 'string') setToast(err);
    save();
    force();
  };

  // relógio do jogo
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const career = ref.current;
      if (isMatchDay(career)) {
        if (autoSim) { simulateRound(career); track('match_simulated', { mode: 'auto' }); slowDownAfterMatch(); save(); force(); return; }
        setPrep(prepareRound(career));
        return;
      }
      const r = advanceDay(career);
      if (r.gains.length) setGains({ list: r.gains.map((g) => ({ playerId: g.playerId, text: `+1 ${ATTR_SHORT[g.attr]}` })), key: r.date });
      if (r.date.endsWith('-01')) save();
      force();
    }, SPEEDS[speed]);
    return () => clearInterval(t);
  }, [running, speed, autoSim, save]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !blocking) {
        e.preventDefault();
        setSpeed((s) => (s > 0 ? (resumeSpeed.current = s, 0) : resumeSpeed.current || 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocking]);

  const me = myClubId(c);
  const club = me ? c.clubs[me] : undefined;
  const bond = activeBond(c);

  const onMatchDone = (p: PreparedRound, o: FootballOutcome) => {
    const home = p.match.home.clubId === myClubId(ref.current);
    const gf = home ? o.homeScore : o.awayScore, ga = home ? o.awayScore : o.homeScore;
    track('match_finished', { round: p.round + 1, season: ref.current.season.year, result: gf > ga ? 'win' : gf < ga ? 'loss' : 'draw', goals_for: gf, goals_against: ga, home });
    completeRound(ref.current, p, o);
    setPrep(null);
    slowDownAfterMatch();
    save();
    force();
  };

  const endSeason = () => {
    const s = closeSeason(ref.current);
    track('season_completed', { seasons_played: ref.current.entrepreneur.history.length, position: s.position, division: s.division + 1, objective: s.objective, achieved: s.achieved, fired: s.fired, promoted: s.promoted, relegated: s.relegated });
    setSummary(s);
    save();
    force();
  };

  // ------------------------------------------------ sem clube (demitido)
  if (!club || !bond) {
    const accept = (o: Career['offers'][number]) => { track('offer_accepted', { unemployed: ref.current.unemployed }); acceptOffer(ref.current, o); setSummary(null); save(); force(); };
    return (
      <div className="game">
        {summary ? (
          // acabou de ser demitido: mostra o balanço da temporada antes das propostas
          <Modal title={`Balanço ${c.season.year - 1}`}>
            <SummaryView s={summary} />
            <p>A diretoria decidiu não renovar.</p>
            <h4>Propostas recebidas</h4>
            <OfferList career={c} onAccept={accept} />
            <button className="btn ghost" onClick={onReset}>Encerrar carreira</button>
          </Modal>
        ) : (
          <Modal title="Você está sem clube">
            <h4>Propostas recebidas</h4>
            <OfferList career={c} onAccept={accept} />
            <button className="btn ghost" onClick={onReset}>Encerrar carreira</button>
          </Modal>
        )}
      </div>
    );
  }

  const d = divisionOf(c, me);
  const table = divisionStandings(c.season.divisions[d]!, football.points);
  const pos = table.findIndex((r) => r.teamId === me) + 1;
  const nextDate = c.roundDates[c.season.round];
  const nextFixture = c.phase !== 'encerramento' ? c.season.divisions[d]!.rounds[c.season.round]?.find((f) => f.home === me || f.away === me) : undefined;
  const opp = nextFixture ? c.clubs[nextFixture.home === me ? nextFixture.away : nextFixture.home]! : undefined;
  const daysTo = nextDate ? Math.round((Date.parse(nextDate) - Date.parse(c.date)) / 86400000) : 0;

  return (
    <div className="game">
      <header className="hud" aria-label="Resumo da carreira">
        <div className="hud-club">
          <Badge club={club} size="lg" />
          <div>
            <b>{club.name}</b>
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
        </div>
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
                      <span className="hint">{nextFixture.home === me ? 'Em casa' : 'Fora'} · {nextDate && formatDate(nextDate)}</span>
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
            </div>
          </section>
          <section className="window news">
            <header className="window-title"><span>Notícias</span></header>
            <ul className="window-body feed">
              {c.news.slice(0, 14).map((n, i) => (
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
        <Modal title={MENUS.find((x) => x.id === menu)!.label} onClose={() => setMenu(null)} wide>
          {menu === 'elenco' && <SquadPanel career={c} act={act} />}
          {menu === 'mercado' && <MarketPanel career={c} act={act} />}
          {menu === 'tabela' && <TablePanel career={c} />}
          {menu === 'financas' && <FinancePanel career={c} act={act} />}
          {menu === 'carreira' && <CareerPanel career={c} onReset={onReset} />}
        </Modal>
      )}

      {prep && (
        <Modal title="Dia de jogo" wide className="match-window">
          <MatchDay career={c} prep={prep} onDone={onMatchDone} />
        </Modal>
      )}

      {c.phase === 'encerramento' && !summary && (
        <SeasonEndModal career={c} onClose={endSeason} />
      )}

      {summary && (
        <Modal title={`Balanço ${c.season.year - 1}`}>
          <SummaryView s={summary} />
          {/* demitido não chega aqui: o retorno "sem clube" acima mostra o balanço com as propostas */}
          {c.offers.length > 0 && (
            <>
              <h4>Propostas recebidas</h4>
              <OfferList career={c} onAccept={(o) => { track('offer_accepted', { unemployed: ref.current.unemployed }); acceptOffer(ref.current, o); setSummary(null); save(); force(); }} />
            </>
          )}
          <p className="objective">🎯 Novo objetivo: {OBJECTIVE_LABEL[activeBond(c)!.objective]}</p>
          <button className="btn primary" onClick={() => { ref.current.offers = []; setSummary(null); save(); force(); }}>
            {c.offers.length ? 'Ficar no clube' : 'Seguir para a nova temporada'} ›
          </button>
        </Modal>
      )}

      {decision && !menu && !prep && !summary && c.phase !== 'encerramento' && (
        <DecisionModal career={c} decision={decision} onChoose={(choice) => {
          track('market_decision', { kind: decision.kind, choice });
          act((career) => decide(career, decision.id, choice));
        }} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SeasonEndModal({ career, onClose }: { career: Career; onClose: () => void }) {
  const s = seasonSummary(career);
  return (
    <Modal title={`Fim da temporada ${career.season.year}`}>
      <SummaryView s={s} />
      <button className="btn primary" onClick={onClose}>Ver premiação e balanço ›</button>
    </Modal>
  );
}

function SummaryView({ s }: { s: SeasonSummary }) {
  return (
    <div className="summary">
      <div className="big-pos">{s.position}º</div>
      <p>na Divisão {s.division + 1}{s.promoted ? ' · 🎉 ACESSO!' : ''}{s.relegated ? ' · rebaixado' : ''}</p>
      <p className={s.achieved ? 'ok' : 'neg'}>🎯 {OBJECTIVE_LABEL[s.objective]}: {s.achieved ? 'cumprido!' : 'não cumprido'}</p>
      <dl className="kv">
        <dt>Premiação</dt><dd>{money(s.prize)}</dd>
        <dt>Reputação</dt><dd>{s.reputationDelta >= 0 ? '+' : ''}{s.reputationDelta}</dd>
      </dl>
    </div>
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

