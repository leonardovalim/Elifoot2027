import { useEffect, useMemo, useRef, useState } from 'react';
import { OBJECTIVE_LABEL } from '../core/entrepreneur';
import {
  CHALLENGES,
  challengeOptions,
  clubStrength,
  divisionOf,
  myClubId,
  MAX_MANAGERS,
  newWorld,
  startCareer,
  startMultiCareer,
  type Career,
  type ChallengeType,
  type NewManager,
} from '../game/career';
import { Game } from './Game';
import { clearCareer, loadCareer, saveCareer } from './storage';
import { track } from './analytics';
import emblemUrl from '../assets/intro/emblema.png';
import { IntroScene } from './scene/IntroScene';
import { loadVotes, saveVote } from './interest';
import { nextWizardStep, previousWizardStep, type WizardStep } from './createWizard';
import { Badge, Modal, Stars, money } from './util';
import { askConfirm } from './confirm';

const INTRO_KEY = 'mestres-do-esporte.intro-seen';
function hasSeenIntro(): boolean {
  try { return sessionStorage.getItem(INTRO_KEY) === '1'; } catch { return false; }
}
function markIntroSeen() {
  try { sessionStorage.setItem(INTRO_KEY, '1'); } catch { /* sem storage: a abertura repete */ }
}

type Screen = 'title' | 'create' | 'create-multi' | 'game';

const SPORTS = [
  { id: 'futebol', name: 'Futebol', icon: '⚽', ready: true, pitch: '' },
  { id: 'basquete', name: 'Basquete', icon: '🏀', ready: false, pitch: 'Franquias, draft, rotação de elenco e teto salarial.' },
  { id: 'volei', name: 'Vôlei', icon: '🏐', ready: false, pitch: 'Clubes, fundamentos, posições e competições nacionais.' },
  { id: 'tenis', name: 'Tênis', icon: '🎾', ready: false, pitch: 'Carreira de um atleta: ranking, calendário e preparação.' },
  { id: 'auto', name: 'Automobilismo', icon: '🏎️', ready: false, pitch: 'Equipe, pilotos, carros, engenharia e estratégia de corrida.' },
  { id: 'mma', name: 'MMA', icon: '🥊', ready: false, pitch: 'Academia, lutadores, categorias de peso e eventos.' },
];
type Sport = (typeof SPORTS)[number];
const VOTE_LABEL = ['', 'Pouco', 'Talvez', 'Gostaria', 'Muito', 'Quero já!'];

export function App() {
  const [career, setCareer] = useState<Career | null>(() => loadCareer());
  const [screen, setScreen] = useState<Screen>('title');
  const [introSeen] = useState(hasSeenIntro);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { track('$pageview', { screen }); }, [screen]);
  useEffect(() => { track('app_opened', { has_save: !!career }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (screen === 'game' && career) {
    return (
      <Game
        initial={career}
        onReset={async () => {
          const ok = await askConfirm({
            title: 'Encerrar carreira',
            body: <><p>O save desta carreira será apagado e você volta para a tela inicial.</p><p className="hint">Isso não pode ser desfeito.</p></>,
            confirmLabel: 'Apagar e sair',
            cancelLabel: 'Continuar jogando',
            danger: true,
          });
          if (!ok) return;
          clearCareer();
          setCareer(null);
          setScreen('title');
        }}
      />
    );
  }

  if (screen === 'create' || screen === 'create-multi') {
    return (
      <Create
        multi={screen === 'create-multi'}
        onBack={() => setScreen('title')}
        onStart={(c) => { saveCareer(c); setCareer(c); setScreen('game'); }}
      />
    );
  }

  return (
    <div className={`title-screen ${revealed ? 'revealed' : ''}`}>
      <IntroScene skip={introSeen} onReveal={() => { setRevealed(true); markIntroSeen(); }} />
      {!revealed && <p className="skip-hint">toque para pular</p>}
      <div className="logo">
        <img className="emblem" src={emblemUrl} alt="" width={96} height={96} />
        <h1>MESTRES<br />DO ESPORTE</h1>
        <p>Construa seu legado.</p>
      </div>
      <div className="menu">
        {career && <button className="btn primary big" onClick={() => setScreen('game')}>Continuar carreira</button>}
        <button className={`btn big ${career ? '' : 'primary'}`} onClick={async () => {
          if (await confirmReplace(career)) setScreen('create');
        }}>Nova carreira</button>
        <button className="btn big" onClick={async () => {
          if (await confirmReplace(career)) setScreen('create-multi');
        }}>Multijogador local</button>
      </div>
      <p className="hint foot">Versão de testes</p>
    </div>
  );
}

/** Já existe carreira salva: confirma antes de apagar para começar outra. */
async function confirmReplace(career: Career | null): Promise<boolean> {
  if (!career) return true;
  const club = career.clubs[myClubId(career)];
  return askConfirm({
    title: 'Nova carreira',
    body: <><p>Você já tem uma carreira salva{club ? <> com o <b>{club.name}</b></> : null}, temporada {career.season.year}.</p><p>Começar outra apaga essa de vez.</p></>,
    confirmLabel: 'Apagar e começar outra',
    cancelLabel: 'Manter a atual',
    danger: true,
  });
}

function Create({ onBack, onStart, multi }: { onBack: () => void; onStart: (c: Career) => void; multi: boolean }) {
  // multijogador: cada técnico passa pelo mesmo assistente; os escolhidos ficam aqui
  const [picked, setPicked] = useState<NewManager[]>([]);
  /** Quantos técnicos vão jogar (escolhido antes de tudo; null = ainda não escolheu). */
  const [total, setTotal] = useState<number | null>(null);
  const choosingCount = multi && total === null;
  const [seed, setSeed] = useState(() => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const [name, setName] = useState('');
  const [type, setType] = useState<ChallengeType | null>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [nameError, setNameError] = useState(false);
  const [challengeError, setChallengeError] = useState(false);
  const [votes, setVotes] = useState(loadVotes);
  const [voting, setVoting] = useState<Sport | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const world = useMemo(() => newWorld(seed), [seed]);
  const options = useMemo(() => (type ? challengeOptions(world, type, multi ? 8 : 4) : []), [world, type, multi]);
  const takenBy = (clubId: string) => picked.find((x) => x.clubId === clubId)?.name;
  const startAll = (list: NewManager[]) => {
    track('career_created', { multiplayer: list.length });
    onStart(startMultiCareer(seed, list));
  };
  const nextStep = () => {
    const next = nextWizardStep(step, { name, hasChallenge: !!type });
    if (next === step) {
      if (step === 1) { setNameError(true); nameRef.current?.focus(); }
      if (step === 2) setChallengeError(true);
      return;
    }
    setNameError(false);
    setChallengeError(false);
    setStep(next);
  };
  const previousStep = () => { setChallengeError(false); setStep(previousWizardStep(step)); };
  const chooseChallenge = (t: ChallengeType) => { setType(t); setChallengeError(false); };

  return (
    <div className="create">
      <header className="create-head">
        <button className="btn ghost" onClick={step !== 1 ? previousStep : multi && !choosingCount && picked.length === 0 ? () => setTotal(null) : onBack}>‹ {step === 1 ? 'Voltar' : 'Anterior'}</button>
        <div>
          <h2>{!multi ? 'Nova carreira' : choosingCount ? 'Multijogador local' : `Multijogador · técnico ${picked.length + 1} de ${total}`}</h2>
        </div>
        {!choosingCount && <nav className="wizard-progress" aria-label="Etapas da nova carreira">
          {(['Você', 'Desafio', 'Oportunidades'] as const).map((label, i) => {
            const target = (i + 1) as WizardStep;
            const available = target <= step || (target === 2 && !!name.trim()) || (target === 3 && !!name.trim() && !!type);
            return <button key={label} className={`wizard-step ${step === target ? 'on' : ''}`} aria-current={step === target ? 'step' : undefined} disabled={!available} onClick={() => setStep(target)}><b>{target}</b><span>{label}</span></button>;
          })}
        </nav>}
      </header>

      {choosingCount && (
        <section className="window wizard-card mp-count" aria-label="Quantos técnicos">
          <header className="window-title"><span>Quantos técnicos vão jogar?</span></header>
          <div className="window-body">
            <p className="hint">Todos jogam no mesmo aparelho, revezando a vez: cada um escolhe nome, desafio e clube, cuida do próprio clube e joga a própria partida.</p>
            <div className="mp-count-options" role="group" aria-label="Número de técnicos">
              {Array.from({ length: MAX_MANAGERS - 1 }, (_, i) => i + 2).map((n) => (
                <button key={n} className="challenge" onClick={() => { setTotal(n); setPicked((p) => p.slice(0, n)); }}>
                  <b>{n} técnicos</b>
                  <span>{n === 2 ? 'Um contra o outro.' : n === 3 ? 'Três clubes na disputa.' : 'O máximo: casa cheia.'}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {multi && !choosingCount && (
        <section className="window wizard-card mp-roster" aria-label="Técnicos escolhidos">
          <header className="window-title">
            <span>Técnicos · {picked.length} de {total}</span>
            <button className="btn sm ghost" onClick={() => setTotal(null)}>Mudar quantidade</button>
          </header>
          <div className="window-body">
            {picked.length === 0
              ? <p className="hint">Comece pelo técnico 1. Depois do último, o jogo começa sozinho.</p>
              : (
                <ul className="mp-list">
                  {picked.map((x, i) => (
                    <li key={x.clubId}>
                      <Badge club={world.clubs[x.clubId]!} size="sm" />
                      <b>{x.name}</b> · {world.clubs[x.clubId]!.name}
                      <button className="btn sm ghost" aria-label={`Tirar ${x.name}`} onClick={() => setPicked(picked.filter((_, j) => j !== i))}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </section>
      )}

      {step === 1 && !choosingCount && <section className="window wizard-card">
        <header className="window-title"><span>1/3 · Seu perfil</span></header>
        <div className="window-body">
          <label className="field">{multi ? `Nome do técnico ${picked.length + 1}` : 'Seu nome'}
            <input ref={nameRef} value={name} maxLength={24} autoFocus autoComplete="name" aria-invalid={nameError}
              onChange={(e) => { setName(e.target.value); setNameError(false); }} />
            {nameError && <span className="field-error">Digite seu nome para continuar.</span>}
          </label>
          <div className="sports-label"><span>Modalidade</span></div>
          <div className="sports">
            {SPORTS.map((s) => (
              <button key={s.id} className={`sport ${s.ready ? 'on' : 'off'}`} onClick={() => { if (!s.ready) { setVoting(s); track('sport_interest_opened', { sport: s.id }); } }}
                aria-label={s.ready ? s.name : `${s.name}, em breve. Votar interesse`}>
                <span className="ico">{s.icon}</span>{s.name}
                {!s.ready && (votes[s.id] ? <span className="voted">{'★'.repeat(votes[s.id]!)}</span> : <span className="soon">em breve</span>)}
              </button>
            ))}
          </div>
          <div className="wizard-actions"><button className="btn primary" onClick={nextStep}>Escolher desafio ›</button></div>
        </div>
      </section>}

      {step === 2 && !choosingCount && <section className="window wizard-card">
        <header className="window-title"><span>2/3 · Escolha seu desafio</span></header>
        <div className="window-body">
          <div className="challenges">
          {(Object.keys(CHALLENGES) as ChallengeType[]).map((t) => (
            <button key={t} className={`challenge ${type === t ? 'on' : ''}`} onClick={() => chooseChallenge(t)} aria-pressed={type === t}>
              <b>{CHALLENGES[t].title}</b>
              <span>{CHALLENGES[t].text}</span>
            </button>
          ))}
          </div>
          {challengeError && <p className="field-error">Escolha um desafio para ver as oportunidades.</p>}
          <div className="wizard-actions"><button className="btn ghost" onClick={previousStep}>‹ Voltar</button><button className="btn primary" onClick={nextStep}>Ver oportunidades ›</button></div>
        </div>
      </section>}

      {step === 3 && type && !choosingCount && (
        <section className="window wizard-card offer-step">
          <header className="window-title">
            <span>3/3 · Oportunidades</span>
            {picked.length === 0 && <button className="btn sm ghost" onClick={() => setSeed((seed * 1103515245 + 12345) >>> 0)}>↻ outro universo</button>}
          </header>
          <div className="window-body">
            <div className="offers">
            {options.map((o) => {
              const club = world.clubs[o.clubId]!;
              const taken = takenBy(o.clubId);
              return (
                <div key={o.clubId} className={`offer ${taken ? 'taken' : ''}`}>
                  <div className="offer-head"><Badge club={club} size="lg" /><div><span className="offer-name">{club.name}</span><span className="hint"><span className="nw">Divisão {divisionOf(world, club.id) + 1}</span> · <span className="nw">desde {club.founded}</span></span></div></div>
                  <dl className="kv">
                    <dt>Orçamento</dt><dd>{money(club.budget)}</dd>
                    <dt>Reputação</dt><dd>{club.reputation}/100</dd>
                    <dt>Força do elenco</dt><dd>{Math.round(clubStrength(club))}</dd>
                    <dt>Estrutura</dt><dd><Stars n={club.trainingCenter} /></dd>
                    <dt>Seu salário</dt><dd>{money(o.monthlySalary)}/mês</dd>
                  </dl>
                  <div className="objective">🎯 {OBJECTIVE_LABEL[o.objective]}</div>
                  <button className="btn primary" disabled={!!taken} onClick={() => {
                    if (!name.trim()) { setNameError(true); setStep(1); nameRef.current?.focus(); return; }
                    if (multi) {
                      const list = [...picked, { name: name.trim(), type, clubId: o.clubId }];
                      if (list.length >= (total ?? MAX_MANAGERS)) { startAll(list); return; }
                      setPicked(list);
                      setName(''); setType(null); setStep(1);
                      return;
                    }
                    track('career_created', { challenge: type, division: divisionOf(world, club.id) + 1, objective: o.objective, club_reputation: club.reputation });
                    onStart(startCareer(seed, name.trim(), type, o.clubId));
                  }}>
                    {taken ? `Clube de ${taken}` : !multi ? 'Assumir o desafio' : picked.length + 1 >= (total ?? MAX_MANAGERS) ? 'Escolher e começar' : 'Escolher este clube'}
                  </button>
                </div>
              );
            })}
            </div>
            <div className="wizard-actions"><button className="btn ghost" onClick={previousStep}>‹ Trocar desafio</button></div>
          </div>
        </section>
      )}

      {voting && (
        <Modal title={`${voting.icon} ${voting.name} · em breve`} onClose={() => setVoting(null)}>
          <p>{voting.pitch}</p>
          <p><b>Quanto você quer gerenciar {voting.name.toLowerCase() === 'mma' ? 'MMA' : voting.name.toLowerCase()} no Mestres do Esporte?</b></p>
          <div className="vote" role="radiogroup" aria-label="Interesse de 1 a 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={votes[voting.id] === n} aria-label={`${n} — ${VOTE_LABEL[n]}`}
                className={(votes[voting.id] ?? 0) >= n ? 'on' : ''}
                onClick={() => setVotes(saveVote(voting.id, n))}>★</button>
            ))}
          </div>
          <div className="vote-scale"><span>Pouco</span><span>Quero já!</span></div>
          {votes[voting.id] ? (
            <p className="center ok"><b>{VOTE_LABEL[votes[voting.id]!]}</b>, voto registrado. As modalidades mais votadas chegam primeiro.</p>
          ) : <p className="center hint">As modalidades mais votadas chegam primeiro.</p>}
          <div className="row center"><button className="btn primary" onClick={() => setVoting(null)}>{votes[voting.id] ? 'Fechar' : 'Agora não'}</button></div>
        </Modal>
      )}
    </div>
  );
}
