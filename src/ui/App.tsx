import { useMemo, useState } from 'react';
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
import { Badge, Stars, money } from './util';

type Screen = 'title' | 'create' | 'game';

const SPORTS = [
  { id: 'futebol', name: 'Futebol', icon: '⚽', ready: true },
  { id: 'basquete', name: 'Basquete', icon: '🏀', ready: false },
  { id: 'volei', name: 'Vôlei', icon: '🏐', ready: false },
  { id: 'tenis', name: 'Tênis', icon: '🎾', ready: false },
  { id: 'auto', name: 'Automobilismo', icon: '🏎️', ready: false },
  { id: 'mma', name: 'MMA', icon: '🥊', ready: false },
];

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
      <p className="hint foot">Protótipo · Fase 1 · Futebol</p>
    </div>
  );
}

function Create({ onBack, onStart }: { onBack: () => void; onStart: (c: Career) => void }) {
  const [seed, setSeed] = useState(() => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const [name, setName] = useState('');
  const [type, setType] = useState<ChallengeType | null>(null);
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
            <input value={name} maxLength={24} autoFocus autoComplete="name" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="sports">
            {SPORTS.map((s) => (
              <div key={s.id} className={`sport ${s.ready ? 'on' : 'off'}`}>
                <span className="ico">{s.icon}</span>{s.name}{!s.ready && <span className="soon">em breve</span>}
              </div>
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
                  <div className="offer-head"><Badge club={club} size="lg" /><div><b>{club.name}</b><span className="hint">{club.city} · Divisão {divisionOf(world, club.id) + 1} · fundado em {club.founded}</span></div></div>
                  <dl className="kv">
                    <dt>Orçamento</dt><dd>{money(club.budget)}</dd>
                    <dt>Reputação</dt><dd>{club.reputation}/100</dd>
                    <dt>Elenco</dt><dd>força {Math.round(clubStrength(club))}</dd>
                    <dt>Estrutura</dt><dd><Stars n={club.trainingCenter} /></dd>
                    <dt>Seu salário</dt><dd>{money(o.monthlySalary)}/mês</dd>
                  </dl>
                  <div className="objective">🎯 {OBJECTIVE_LABEL[o.objective]}</div>
                  <button className="btn primary" disabled={!name.trim()} onClick={() => onStart(startCareer(seed, name.trim(), type, o.clubId))}>
                    Assumir o desafio
                  </button>
                </div>
              );
            })}
          </div>
          {!name.trim() && <p className="hint pad">Preencha seu nome para assumir um desafio.</p>}
        </section>
      )}
    </div>
  );
}
