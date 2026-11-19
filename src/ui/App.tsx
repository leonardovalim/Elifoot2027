import { useMemo, useRef, useState } from 'react';
import { OBJECTIVE_LABEL } from '../core/entrepreneur';
import {
  CHALLENGES,
  challengeOptions,
  clubStrength,
  divisionOf,
  newWorld,
  startCareer,
  type Career,
  type ChallengeType,
} from '../game/career';
import { Game } from './Game';
import { clearCareer, loadCareer, saveCareer } from './storage';
import { loadVotes, saveVote } from './interest';
import { Badge, Modal, Stars, money } from './util';

type Screen = 'title' | 'create' | 'game';

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

  if (screen === 'game' && career) {
    return (
      <Game
        initial={career}
        onReset={() => {
          if (!confirm('Apagar o save e voltar ao início?')) return;
          clearCareer();
          setCareer(null);
          setScreen('title');
        }}
      />
    );
  }

  if (screen === 'create') {
    return (
      <Create
        onBack={() => setScreen('title')}
        onStart={(c) => { saveCareer(c); setCareer(c); setScreen('game'); }}
      />
    );
  }

  return (
    <div className="title-screen">
      <div className="logo">
        <span className="trophy">🏆</span>
        <h1>MESTRES<br />DO ESPORTE</h1>
        <p>Construa seu legado.</p>
      </div>
      <div className="menu">
        {career && <button className="btn primary big" onClick={() => setScreen('game')}>Continuar carreira</button>}
        <button className={`btn big ${career ? '' : 'primary'}`} onClick={() => {
          if (career && !confirm('Começar uma nova carreira apaga a atual. Continuar?')) return;
          setScreen('create');
        }}>Nova carreira</button>
      </div>
      <p className="hint foot">Versão de testes</p>
    </div>
  );
}

function Create({ onBack, onStart }: { onBack: () => void; onStart: (c: Career) => void }) {
  const [seed, setSeed] = useState(() => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const [name, setName] = useState('');
  const [type, setType] = useState<ChallengeType | null>(null);
  const [nameError, setNameError] = useState(false);
  const [votes, setVotes] = useState(loadVotes);
  const [voting, setVoting] = useState<Sport | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const world = useMemo(() => newWorld(seed), [seed]);
  const options = useMemo(() => (type ? challengeOptions(world, type) : []), [world, type]);

  return (
    <div className="create">
      <header className="create-head">
        <button className="btn ghost" onClick={onBack}>‹ Voltar</button>
        <h2>Nova carreira</h2>
      </header>

      <section className="window">
        <header className="window-title"><span>1 · Empreendedor</span></header>
        <div className="window-body">
          <label className="field">Seu nome
            <input ref={nameRef} value={name} maxLength={24} autoFocus autoComplete="name" aria-invalid={nameError}
              onChange={(e) => { setName(e.target.value); setNameError(false); }} />
            {nameError && <span className="field-error">Digite seu nome para assumir o desafio.</span>}
          </label>
          <div className="sports">
            {SPORTS.map((s) => (
              <button key={s.id} className={`sport ${s.ready ? 'on' : 'off'}`} onClick={() => !s.ready && setVoting(s)}
                aria-label={s.ready ? s.name : `${s.name}, em breve. Votar interesse`}>
                <span className="ico">{s.icon}</span>{s.name}
                {!s.ready && (votes[s.id] ? <span className="voted">{'★'.repeat(votes[s.id]!)}</span> : <span className="soon">em breve</span>)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="window">
        <header className="window-title"><span>2 · Escolha seu desafio</span></header>
        <div className="window-body challenges">
          {(Object.keys(CHALLENGES) as ChallengeType[]).map((t) => (
            <button key={t} className={`challenge ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>
              <b>{CHALLENGES[t].title}</b>
              <span>{CHALLENGES[t].text}</span>
            </button>
          ))}
        </div>
      </section>

      {type && (
        <section className="window">
          <header className="window-title">
            <span>3 · Oportunidades</span>
            <button className="btn sm ghost" onClick={() => setSeed((seed * 1103515245 + 12345) >>> 0)}>↻ outro universo</button>
          </header>
          <div className="window-body offers">
            {options.map((o) => {
              const club = world.clubs[o.clubId]!;
              return (
                <div key={o.clubId} className="offer">
                  <div className="offer-head"><Badge club={club} size="lg" /><div><span className="offer-name">{club.name}</span><span className="hint"><span className="nw">Divisão {divisionOf(world, club.id) + 1}</span> · <span className="nw">desde {club.founded}</span></span></div></div>
                  <dl className="kv">
                    <dt>Orçamento</dt><dd>{money(club.budget)}</dd>
                    <dt>Reputação</dt><dd>{club.reputation}/100</dd>
                    <dt>Força do elenco</dt><dd>{Math.round(clubStrength(club))}</dd>
                    <dt>Estrutura</dt><dd><Stars n={club.trainingCenter} /></dd>
                    <dt>Seu salário</dt><dd>{money(o.monthlySalary)}/mês</dd>
                  </dl>
                  <div className="objective">🎯 {OBJECTIVE_LABEL[o.objective]}</div>
                  <button className="btn primary" onClick={() => {
                    if (!name.trim()) { setNameError(true); nameRef.current?.focus(); nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
                    onStart(startCareer(seed, name.trim(), type, o.clubId));
                  }}>
                    Assumir o desafio
                  </button>
                </div>
              );
            })}
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
