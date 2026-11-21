import { useEffect, useMemo, useRef, useState } from 'react';
import { OBJECTIVE_LABEL, netWorth } from '../../core/entrepreneur';
import { divisionStandings } from '../../core/season';
import {
  activeBond,
  buyPlayer,
  divisionOf,
  financialState,
  LOAN_TERMS,
  loanLimit,
  loanPayoff,
  loanQuote,
  marketListings,
  monthlyForecast,
  payOffLoan,
  takeLoan,
  myClubId,
  isNewSigning,
  sellPlayer,
  type Career,
  type Listing,
  ctQuote,
  stadiumQuote,
  stadiumUse,
  startWork,
} from '../../game/career';
import { ATTR_SHORT } from '../../sports/football/development';
import { football } from '../../sports/football/engine';
import { playerValue } from '../../sports/football/generate';
import { FORMATIONS, applyMove, overall, pickLineup, planMove, statusOf, type SquadStatus } from '../../sports/football/lineup';
import type { AttrKey, Club, Formation, Player, Style } from '../../sports/football/types';
import { expiresThisSeason } from '../../game/market';
import { track } from '../analytics';
import { Morale } from './Decisions';
import { askConfirm } from '../confirm';
import { Tag, TemperamentTag } from '../help';
import { temperament } from '../../sports/football/temperament';
import { AchievementsSection } from '../achievements';
import { CupPanel } from './CupPanel';
import { ForeignFlag } from '../flag';
import { COUNTRY_NAME, nationalityOf } from '../../sports/football/nations';
import { CONTINENTAL_NAME, CUP_NAME } from '../../game/cup';
import { Bar, ClubName, Fold, POS_LABEL, STYLE_LABEL, Stars, money, moneyShort } from '../util';

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

/** true enquanto a media query casar (acompanha giro de tela e redimensionamento). */
function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

const STATUS_LABEL: Record<SquadStatus, string> = { xi: 'Titular', bench: 'Banco', out: 'Fora' };
const ST_SHORT: Record<SquadStatus, string> = { xi: 'TIT', bench: 'RES', out: '–' };

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
  // celular: lista em cartões (sem rolagem lateral); ações e ficha abrem embaixo do atleta
  const narrow = useMedia('(max-width: 760px)');
  const openRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (narrow && sel) openRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [narrow, sel]);
  const squadTags = (p: Player, playsAt?: Player['position']) => [
    p.clubLocked && <Tag key="idolo" kind="idolo">ídolo</Tag>,
    isNewSigning(p, career.date) && <Tag key="novo" kind="novo">novo</Tag>,
    p.suspended > 0 && <Tag key="susp" kind="susp">susp.</Tag>,
    (p.injured ?? 0) > 0 && <Tag key="lesao" kind="lesao" title={`Lesionado: fora por ${p.injured} ${p.injured === 1 ? 'rodada' : 'rodadas'}`}>✚ {p.injured}r</Tag>,
    playsAt && playsAt !== p.position && <Tag key="pos" kind="posicao">de {POS_LABEL[playsAt]}</Tag>,
    isProspect(p) && <Tag key="joia" kind="joia">joia</Tag>,
    temperament(p) && <TemperamentTag key="temp" p={p} />,
    p.leaving ? <Tag key="sai" kind="sai">sai</Tag> : expiresThisSeason(p, career.season.year) && <Tag key="fim" kind="fim-contrato" title="Contrato termina no fim da temporada">fim contr.</Tag>,
  ].filter(Boolean);
  const detail = (p: Player) => (
    <>
      <LineupActions club={club} p={p} current={status[p.id]!} onMove={move} />
      <PlayerCard p={p} year={career.season.year} isNew={isNewSigning(p, career.date)} compact={narrow} onSell={() => {
        void askConfirm({
          title: 'Vender atleta',
          body: <><p>Vender <b>{p.name}</b> por cerca de <b>{money(Math.round(playerValue(p) * 0.85))}</b>?</p><p className="hint">O clube que pagar mais leva na hora. Para negociar com calma, espere uma proposta chegar.</p></>,
          confirmLabel: 'Vender',
          danger: true,
        }).then((ok) => { if (ok) { act((c) => sellPlayer(c, p.id)); setSel(null); } });
      }} />
    </>
  );

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
      {narrow ? (
        <ul className="market-list squad-list">
          {players.map((p) => {
            const st = status[p.id]!;
            const open = sel === p.id;
            const tags = squadTags(p, slot.get(p.id));
            return (
              <li key={p.id} className={`${open ? 'open' : ''} ${st}`} ref={open ? openRef : undefined}>
                <button className="mrow srow" aria-expanded={open} onClick={() => setSel(open ? null : p.id)}>
                  <span className={`st ${st}`}>{ST_SHORT[st]}</span>
                  <span className={`pos ${p.position}`}>{POS_LABEL[p.position]}</span>
                  <span className="mrow-main">
                    <span className="mrow-name"><ForeignFlag p={p} />{p.name}</span>
                    <span className="mrow-sub">{p.age} anos · cond. {Math.round(p.condition)}% · {p.stats.apps} jg{p.stats.goals ? ` · ${p.stats.goals} gol${p.stats.goals > 1 ? 's' : ''}` : ''}</span>
                    {tags.length > 0 && <span className="mrow-tags">{tags}</span>}
                  </span>
                  <span className="mrow-num"><b>{overall(p)}</b><Morale p={p} compact /></span>
                </button>
                {open && <div className="mrow-detail">{detail(p)}</div>}
              </li>
            );
          })}
        </ul>
      ) : (
      <div className="split">
        <div className="scroll">
          <table className="grid-table">
            <thead><tr><th>Rel.</th><th>Pos</th><th>Atleta</th><th>Id</th><th>Hab</th><th>Cond.</th><th title="Satisfação">Sat.</th><th>Jg</th><th>Gols</th><th>Nota</th></tr></thead>
            <tbody>
              {players.map((p) => {
                const st = status[p.id]!;
                return (
                  <tr key={p.id} className={`${sel === p.id ? 'sel' : ''} ${st}`} onClick={() => setSel(p.id)}>
                    <td><span className={`st ${st}`}>{ST_SHORT[st]}</span></td>
                    <td><span className={`pos ${p.position}`}>{POS_LABEL[p.position]}</span></td>
                    <td className="name">
                      <span className="nm"><ForeignFlag p={p} />{p.name}</span>
                      {squadTags(p, slot.get(p.id))}
                    </td>
                    <td>{p.age}</td>
                    <td><b>{overall(p)}</b></td>
                    <td className="cond"><Bar value={p.condition} /></td>
                    <td className="sat"><Morale p={p} compact /></td>
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
          {selected ? detail(selected) : <p className="hint">Selecione um atleta para ver atributos e mudar a escalação.</p>}
        </aside>
      </div>
      )}
    </div>
  );
}

function LineupActions({ club, p, current, onMove }: { club: Club; p: Player; current: SquadStatus; onMove: (id: string, to: SquadStatus) => void }) {
  // lesionado ou suspenso não entra na relação: não há o que escalar
  const blocked = p.suspended > 0 || (p.injured ?? 0) > 0;
  const options = blocked ? [] : (['xi', 'bench', 'out'] as SquadStatus[]).filter((s) => s !== current);
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
      {(p.injured ?? 0) > 0 && <span className="hint injury-note">✚ Lesionado: fora por mais {p.injured} {p.injured === 1 ? 'rodada' : 'rodadas'}.</span>}
    </div>
  );
}

function PlayerCard({ p, onSell, isNew, year, compact }: { p: Player; onSell?: () => void; isNew?: boolean; year?: number; compact?: boolean }) {
  const attrs = (
    <>
      {ATTR_GROUPS.map((g) => (
        <div key={g.label} className="attr-group">
          <span className="attr-title">{g.label}</span>
          {g.keys.map((k) => (
            <div key={k} className="attr"><span>{ATTR_SHORT[k]}</span><Bar value={p.attrs[k]} max={99} tone="accent" /><b>{p.attrs[k]}</b></div>
          ))}
        </div>
      ))}
      {p.position === 'GK' && <div className="attr"><span>GOL</span><Bar value={p.attrs.goalkeeping} max={99} tone="accent" /><b>{p.attrs.goalkeeping}</b></div>}
    </>
  );
  const avg = (keys: AttrKey[]) => Math.round(keys.reduce((a, k) => a + p.attrs[k], 0) / keys.length);
  return (
    <div className={`player-card ${compact ? 'compact' : ''}`}>
      {/* no celular o nome já está na linha do cartão */}
      {!compact && <h3><ForeignFlag p={p} />{p.name}{p.clubLocked && <Tag kind="idolo">ídolo</Tag>}{isNew && <Tag kind="novo">novo</Tag>}<TemperamentTag p={p} /></h3>}
      <p className="hint">{POS_LABEL[p.position]} · {p.age} anos · {COUNTRY_NAME[nationalityOf(p)]} · habilidade <b>{overall(p)}</b> · potencial ~{p.potential}</p>
      {year !== undefined && <div className="attr-group"><span className="attr-title">Satisfação</span><Morale p={p} /></div>}
      {compact ? (
        // celular: os 11 atributos ficam recolhidos; o resumo mostra a média de cada grupo
        <details className="attr-details">
          <summary>
            <span className="attr-title">Atributos</span>
            <span className="attr-avgs">{ATTR_GROUPS.map((g) => <span key={g.label}>{g.label} <b>{avg(g.keys)}</b></span>)}</span>
          </summary>
          {attrs}
        </details>
      ) : attrs}
      <dl className="kv">
        {!compact && <><dt>Condição</dt><dd>{Math.round(p.condition)}%</dd></>}
        <dt>Salário</dt><dd>{money(p.wage)}/mês</dd>
        <dt>Valor</dt><dd>{money(playerValue(p))}</dd>
        <dt>Contrato</dt><dd>até {p.contractUntil}{year !== undefined && (p.leaving ? ' · sai no fim da temporada' : expiresThisSeason(p, year) ? ' · termina nesta temporada' : '')}</dd>
      </dl>
      {p.clubLocked
        ? <p className="hint idol-note">⭐ Ídolo do clube: não sai por dinheiro nenhum.</p>
        : onSell && <button className="btn danger" onClick={onSell}>Vender</button>}
    </div>
  );
}

// ---------------------------------------------------------------- Mercado

const ORDINAL = ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º'];

type AgeBand = 'ALL' | 'young' | 'prime' | 'vet';
type MarketSort = 'overall' | 'price' | 'age' | 'value';
interface MarketFilters { pos: 'ALL' | Player['position']; afford: boolean; upgrade: boolean; prospects: boolean; age: AgeBand; sort: MarketSort }
const DEFAULT_FILTERS: MarketFilters = { pos: 'ALL', afford: false, upgrade: false, prospects: false, age: 'ALL', sort: 'overall' };
/** Filtros lembrados enquanto o jogo está aberto (reabrir o mercado não perde a busca). */
let lastFilters: MarketFilters = DEFAULT_FILTERS;
const AGE_LABEL: Record<AgeBand, string> = { ALL: 'Todas', young: 'Até 23', prime: '24 a 30', vet: '31+' };
const SORT_LABEL: Record<MarketSort, string> = { overall: 'Melhor habilidade', price: 'Menor preço', age: 'Mais jovem', value: 'Custo-benefício' };
const inAgeBand = (p: Player, band: AgeBand) => band === 'ALL' || (band === 'young' ? p.age <= 23 : band === 'prime' ? p.age >= 24 && p.age <= 30 : p.age >= 31);
const isProspect = (p: Player) => p.age <= 21 && p.potential - overall(p) >= 8;

export function MarketPanel({ career, act }: { career: Career; act: Act }) {
  const [f, setF] = useState<MarketFilters>(lastFilters);
  const set = (patch: Partial<MarketFilters>) => setF((x) => { const next = { ...x, ...patch }; lastFilters = next; return next; });
  const pos = f.pos;
  const [sel, setSel] = useState<string | null>(null);
  const [bought, setBought] = useState<string | null>(null);
  const club = career.clubs[myClubId(career)]!;
  const monthKey = career.date.slice(0, 7);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const listings = useMemo(() => marketListings(career, 120), [monthKey, career.clubs[myClubId(career)]!.players.length]);
  const bestMine = (position: Player['position']) => Math.max(0, ...club.players.filter((p) => p.position === position).map(overall));
  // titular mais fraco de cada posição: quem supera ele "reforça o time"
  const lineup = pickLineup(club);
  const weakestStarter: Record<Player['position'], number> = {
    GK: overall(lineup.GK),
    DF: Math.min(...lineup.DF.map(overall)),
    MF: Math.min(...lineup.MF.map(overall)),
    FW: Math.min(...lineup.FW.map(overall)),
  };
  const available = listings.filter((l) => career.clubs[l.clubId]?.players.some((p) => p.id === l.player.id));
  const shown = available
    .filter((l) => pos === 'ALL' || l.player.position === pos)
    .filter((l) => !f.afford || l.price <= club.budget)
    .filter((l) => !f.upgrade || overall(l.player) > weakestStarter[l.player.position])
    .filter((l) => !f.prospects || isProspect(l.player))
    .filter((l) => inAgeBand(l.player, f.age))
    .sort((a, b) => f.sort === 'price' ? a.price - b.price
      : f.sort === 'age' ? a.player.age - b.player.age || overall(b.player) - overall(a.player)
      : f.sort === 'value' ? overall(b.player) ** 3 / b.price - overall(a.player) ** 3 / a.price
      : overall(b.player) - overall(a.player));
  const filtered = f.afford || f.upgrade || f.prospects || f.age !== 'ALL' || pos !== 'ALL' || f.sort !== 'overall';
  const selected = shown.find((l) => l.player.id === sel);
  const cardRef = useRevealOnMobile(sel);
  // no celular a tabela vira lista em cartões e a ficha abre embaixo do atleta tocado
  const narrow = useMedia('(max-width: 760px)');
  const openRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (narrow && sel) openRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [narrow, sel]);

  const buy = (l: Listing) => act((c) => {
    const err = buyPlayer(c, l.player.id, l.clubId);
    if (!err) { setBought(l.player.name); setSel(null); track('player_bought', { position: l.player.position, overall: overall(l.player), price: l.price }); }
    return err;
  });

  const emptyMsg = 'Nenhum atleta com esses filtros neste mês. Tente afrouxar algum filtro; o mercado muda todo mês.';
  const boughtMsg = bought && <p className="ok-msg"><b>{bought}</b> chegou. Ele aparece no elenco com o selo <Tag kind="novo">novo</Tag>.</p>;

  return (
    <div className="market">
      <div className="toolbar">
        <div className="chips">
          {(['ALL', 'GK', 'DF', 'MF', 'FW'] as const).map((p) => (
            <button key={p} className={`chip ${pos === p ? 'on' : ''}`} onClick={() => set({ pos: p })}>{p === 'ALL' ? 'Todos' : POS_LABEL[p]}</button>
          ))}
        </div>
        <span className="hint">Caixa {money(club.budget)} · elenco {club.players.length}/28</span>
      </div>
      <div className="market-filters">
        <div className="chips">
          <button className={`chip ${f.afford ? 'on' : ''}`} aria-pressed={f.afford} onClick={() => set({ afford: !f.afford })}>💰 Cabe no caixa</button>
          <button className={`chip ${f.upgrade ? 'on' : ''}`} aria-pressed={f.upgrade} onClick={() => set({ upgrade: !f.upgrade })} title="Melhor que o seu titular mais fraco da posição">⬆ Reforça o time</button>
          <button className={`chip ${f.prospects ? 'on' : ''}`} aria-pressed={f.prospects} onClick={() => set({ prospects: !f.prospects })} title="Até 21 anos e com potencial bem acima da habilidade atual">💎 Joias</button>
        </div>
        <label>Idade
          <select value={f.age} onChange={(e) => set({ age: e.target.value as AgeBand })}>
            {(Object.keys(AGE_LABEL) as AgeBand[]).map((a) => <option key={a} value={a}>{AGE_LABEL[a]}</option>)}
          </select>
        </label>
        <label>Ordenar
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value as MarketSort })}>
            {(Object.keys(SORT_LABEL) as MarketSort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
          </select>
        </label>
        <span className="hint count">{shown.length} de {available.length} atletas</span>
        {filtered && <button className="btn sm ghost" onClick={() => set(DEFAULT_FILTERS)}>Limpar filtros</button>}
      </div>
      {narrow ? (
        <>
          {boughtMsg && <div className="card market-bought">{boughtMsg}</div>}
          <ul className="market-list">
            {shown.map((l) => {
              const p = l.player;
              const d = overall(p) - bestMine(p.position);
              const open = sel === p.id;
              return (
                <li key={p.id} className={open ? 'open' : ''} ref={open ? openRef : undefined}>
                  <button className="mrow" aria-expanded={open} onClick={() => { setSel(open ? null : p.id); setBought(null); }}>
                    <span className={`pos ${p.position}`}>{POS_LABEL[p.position]}</span>
                    <span className="mrow-main">
                      <span className="mrow-name"><ForeignFlag p={p} />{p.name}{isProspect(p) && <Tag kind="joia">joia</Tag>}<TemperamentTag p={p} /></span>
                      <span className="mrow-sub">{p.age} anos · {career.clubs[l.clubId]?.name}</span>
                    </span>
                    <span className="mrow-num" title="Habilidade e diferença para o seu melhor da posição">
                      <b>{overall(p)}</b>
                      <span className={d > 0 ? 'up-n' : d < 0 ? 'down-n' : 'hint'}>{d > 0 ? `+${d}` : d === 0 ? '=' : d}</span>
                    </span>
                    <span className="mrow-num price">
                      <b className={club.budget < l.price ? 'neg' : ''}>{moneyShort(l.price)}</b>
                      <span className="hint">{moneyShort(p.wage)}/mês</span>
                    </span>
                  </button>
                  {open && (
                    <div className="mrow-detail">
                      <CompareCard listing={l} club={club} career={career} onBuy={() => buy(l)} />
                    </div>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="hint empty-row">{emptyMsg}</li>}
          </ul>
        </>
      ) : (
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
                    <td className="name"><span className="nm"><ForeignFlag p={l.player} />{l.player.name}</span>{isProspect(l.player) && <Tag kind="joia">joia</Tag>}<TemperamentTag p={l.player} /></td>
                    <td>{l.player.age}</td>
                    <td><b>{overall(l.player)}</b></td>
                    <td className={d > 0 ? 'up-n' : d < 0 ? 'down-n' : 'hint'}>{d > 0 ? `+${d}` : d}</td>
                    <td className="hint">{career.clubs[l.clubId]?.name}</td>
                    <td>{moneyShort(l.player.wage)}</td>
                    <td className={club.budget < l.price ? 'neg' : ''}>{moneyShort(l.price)}</td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={8} className="hint empty-row">{emptyMsg}</td></tr>}
            </tbody>
          </table>
        </div>
        <aside className="card" ref={cardRef}>
          {selected
            ? <CompareCard key={selected.player.id} listing={selected} club={club} career={career} onBuy={() => buy(selected)} />
            : boughtMsg || <p className="hint">Selecione um atleta para ver os atributos lado a lado com os seus.</p>}
        </aside>
      </div>
      )}
      <AiMoves career={career} />
    </div>
  );
}

/** Negociações entre clubes da IA: o mercado se mexe mesmo sem você. */
function AiMoves({ career }: { career: Career }) {
  const list = career.transfers ?? [];
  if (!list.length) return null;
  const name = (id: string) => career.clubs[id]?.name ?? '—';
  return (
    <details className="ai-moves">
      <summary>Negociações entre clubes ({list.length})</summary>
      <ul className="list">
        {list.slice(0, 20).map((t, i) => (
          <li key={i}>
            <span className="hint">{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</span>{' '}
            <span className={`pos ${t.position}`}>{POS_LABEL[t.position]}</span> <b>{t.playerName}</b> ({t.ovr}, {t.age}a): {name(t.from)} → <b>{name(t.to)}</b> · {moneyShort(t.fee)}
          </li>
        ))}
      </ul>
    </details>
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
      <h3><ForeignFlag p={p} />{p.name}<TemperamentTag p={p} /></h3>
      <p className="hint">{POS_LABEL[p.position]} · {p.age} anos · {career.clubs[l.clubId]?.name} · potencial ~{p.potential}</p>
      <p className="verdict">
        Hab <b>{overall(p)}</b> · seria o <b>{ORDINAL[rank] ?? `${rank + 1}º`}</b> {POS_LABEL[p.position]} do elenco
        {rank === 0 && mine.length > 0 && <Tag kind="titular">titular</Tag>}
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
  const [view, setView] = useState<number | 'copa' | 'continental'>(Math.max(0, divisionOf(career, me)));
  const chips = (
    <div className="chips">
      {career.season.divisions.map((_, i) => (
        <button key={i} className={`chip ${i === view ? 'on' : ''}`} onClick={() => setView(i)}>Divisão {i + 1}</button>
      ))}
      <button className={`chip ${view === 'copa' ? 'on' : ''}`} onClick={() => setView('copa')}>🏆 {CUP_NAME}</button>
      <button className={`chip ${view === 'continental' ? 'on' : ''}`} onClick={() => setView('continental')}>🌎 {CONTINENTAL_NAME}</button>
    </div>
  );
  if (view === 'copa') return <div>{chips}<CupPanel career={career} cup={career.cup} title={CUP_NAME} /></div>;
  if (view === 'continental') return <div>{chips}<CupPanel career={career} cup={career.continental} title={CONTINENTAL_NAME} /></div>;
  const d = view;
  const rows = divisionStandings(career.season.divisions[d]!, football.points);
  const last = career.season.divisions.length - 1;
  return (
    <div>
      {chips}
      <div className="scroll tall">
        <table className="grid-table">
          <thead><tr><th>#</th><th>Clube</th><th>P</th><th>J</th><th className="hide-sm">V</th><th className="hide-sm">E</th><th className="hide-sm">D</th><th>SG</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.teamId} className={`${r.teamId === me ? 'me' : ''} ${i < 2 && d > 0 ? 'up' : ''} ${i >= rows.length - 2 && d < last ? 'down' : ''}`}>
                <td>{i + 1}</td>
                <td><ClubName club={career.clubs[r.teamId]!} /></td>
                <td><b>{r.points}</b></td><td>{r.played}</td><td className="hide-sm">{r.won}</td><td className="hide-sm">{r.drawn}</td><td className="hide-sm">{r.lost}</td>
                <td>{r.scoreFor - r.scoreAgainst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint"><span className="legend up" /> acesso · <span className="legend down" /> rebaixamento</p>
      <Scorers career={career} division={d} />
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

type FinTab = 'mes' | 'estadio' | 'temporada' | 'emprestimo';
const FIN_TABS: [FinTab, string, string][] = [
  ['mes', 'Mês típico', 'Mês'],
  ['estadio', 'Estádio e CT', 'Estádio'],
  ['temporada', 'Temporada', 'Ano'],
  ['emprestimo', 'Empréstimo', 'Banco'],
];

export function FinancePanel({ career, act }: { career: Career; act: Act }) {
  const club = career.clubs[myClubId(career)]!;
  const wages = club.players.reduce((a, p) => a + p.wage, 0);
  const l = career.ledger;
  const income = l.gate + l.tv + (l.sponsor ?? 0) + l.prizes + l.sales + (l.loanIn ?? 0);
  const expense = l.wages + l.purchases + l.management + (l.loanPaid ?? 0) + (l.works ?? 0);
  const state = financialState(club);
  const f = monthlyForecast(career);
  const result = income - expense;
  const [tab, setTab] = useState<FinTab>('mes');
  const tone = (v: number) => (v < 0 ? 'neg' : 'pos-n');
  return (
    <div className="fin">
      {/* o essencial fica sempre à vista; o detalhe vai nas abas */}
      <div className="fin-kpis">
        <div className="fin-kpi"><span>Caixa</span><b className={club.budget < 0 ? 'neg' : ''}>{money(club.budget)}</b></div>
        <div className="fin-kpi"><span>Saldo do mês</span><b className={tone(f.withGame)}>{money(f.withGame)}</b></div>
        <div className="fin-kpi"><span>Folha mensal</span><b>{money(wages)}</b></div>
        <div className={`state ${state}`}>{{ estavel: 'Estável', atencao: 'Atenção', critica: 'Crítica' }[state]}</div>
      </div>
      {(career.monthsInRed ?? 0) > 0 && (
        <p className="red-alert">⚠ {career.monthsInRed} {career.monthsInRed === 1 ? 'mês' : 'meses seguidos'} no vermelho: terminar a temporada assim dá demissão.</p>
      )}
      <div className="tabs" role="tablist" aria-label="Finanças">
        {FIN_TABS.map(([id, label, short]) => (
          <button key={id} role="tab" aria-selected={tab === id} aria-label={label} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            <span className="tab-full">{label}{id === 'emprestimo' && career.loan ? ' •' : ''}</span><span className="tab-short" aria-hidden="true">{short}</span>
          </button>
        ))}
      </div>
      <div className="board-panel fin-panel" role="tabpanel" aria-label={FIN_TABS.find((t) => t[0] === tab)![1]}>
        {tab === 'mes' && (
          <>
            <table className="grid-table compact forecast">
              <tbody>
                <tr><td>TV + patrocínio</td><td className="pos-n">{money(f.tv + f.sponsor)}</td></tr>
                <tr><td>Bilheteria <span className="hint">1 jogo em casa</span></td><td className="pos-n">{money(f.gate)}</td></tr>
                <tr><td>Folha + seu salário</td><td className="neg">{money(-(f.wages + f.management))}</td></tr>
                {f.loan > 0 && <tr><td>Parcela do empréstimo</td><td className="neg">{money(-f.loan)}</td></tr>}
                <tr className="total"><td>Saldo do mês</td><td className={tone(f.withGame)}>{money(f.withGame)}</td></tr>
              </tbody>
            </table>
            <p className="hint">Sem jogo em casa: <b className={f.withoutGame < 0 ? 'neg' : ''}>{money(f.withoutGame)}</b></p>
          </>
        )}
        {tab === 'estadio' && (
          <>
            <dl className="kv">
              <dt>Torcida</dt><dd>{club.fans.toLocaleString('pt-BR')}</dd>
              <dt>Público típico</dt><dd><Occupancy club={club} /></dd>
              <dt>Ingresso</dt>
              <dd className="row">
                <button className="btn sm" aria-label="Baixar ingresso" onClick={() => act((c) => { const x = c.clubs[myClubId(c)]!; x.ticketPrice = Math.max(1, x.ticketPrice - 1); })}>−</button>
                <b>{money(club.ticketPrice)}</b>
                <button className="btn sm" aria-label="Subir ingresso" onClick={() => act((c) => { c.clubs[myClubId(c)]!.ticketPrice += 1; })}>+</button>
              </dd>
            </dl>
            <WorksBox career={career} act={act} />
          </>
        )}
        {tab === 'temporada' && (
          <table className="grid-table compact">
            <tbody>
              <tr><td>Bilheteria</td><td className="pos-n">{money(l.gate)}</td></tr>
              <tr><td>Cotas de TV</td><td className="pos-n">{money(l.tv)}</td></tr>
              <tr><td>Patrocínio</td><td className="pos-n">{money(l.sponsor ?? 0)}</td></tr>
              <tr><td>Premiações</td><td className="pos-n">{money(l.prizes)}</td></tr>
              <tr><td>Venda de atletas</td><td className="pos-n">{money(l.sales)}</td></tr>
              {(l.loanIn ?? 0) > 0 && <tr><td>Empréstimo recebido</td><td className="pos-n">{money(l.loanIn ?? 0)}</td></tr>}
              <tr><td>Salários</td><td className="neg">{money(-l.wages)}</td></tr>
              <tr><td>Contratações</td><td className="neg">{money(-l.purchases)}</td></tr>
              {(l.works ?? 0) > 0 && <tr><td>Obras</td><td className="neg">{money(-(l.works ?? 0))}</td></tr>}
              <tr><td>Gestão (seu salário)</td><td className="neg">{money(-l.management)}</td></tr>
              {(l.loanPaid ?? 0) > 0 && <tr><td>Parcelas do empréstimo</td><td className="neg">{money(-(l.loanPaid ?? 0))}</td></tr>}
              <tr className="total"><td>Resultado {career.season.year}</td><td className={tone(result)}>{money(result)}</td></tr>
            </tbody>
          </table>
        )}
        {tab === 'emprestimo' && <LoanBox career={career} act={act} />}
      </div>
    </div>
  );
}

function Occupancy({ club }: { club: Club }) {
  const { crowd, occupancy } = stadiumUse(club);
  const pct = Math.round(occupancy * 100);
  return (
    <span className={`occupancy ${pct >= 100 ? 'full' : pct >= 85 ? 'near' : ''}`}>
      {crowd.toLocaleString('pt-BR')} · {pct >= 100 ? 'lotado' : `${pct}% de ocupação`}
    </span>
  );
}

const daysLeft = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000));

/** Obras de estrutura: ampliar o estádio e melhorar o CT. */
function WorksBox({ career, act }: { career: Career; act: Act }) {
  const club = career.clubs[myClubId(career)]!;
  const sq = stadiumQuote(club);
  const cq = ctQuote(club);
  const { occupancy } = stadiumUse(club);
  const ask = (kind: 'stadium' | 'ct') => {
    const stadium = kind === 'stadium';
    const cost = stadium ? sq.cost : cq!.cost;
    void askConfirm({
      title: stadium ? 'Ampliar estádio' : 'Melhorar CT',
      body: stadium
        ? <><p>Construir <b>{sq.seats.toLocaleString('pt-BR')} lugares</b> por <b>{money(sq.cost)}</b>. Fica pronto em {sq.days} dias.</p><p className="hint">Só rende quando a torcida enche o estádio: hoje a ocupação típica é {Math.round(occupancy * 100)}%. Vitórias, títulos e acesso aumentam a torcida.</p></>
        : <><p>Levar o CT ao <b>nível {cq!.level}</b> por <b>{money(cq!.cost)}</b>. Fica pronto em {cq!.days} dias.</p><p className="hint">CT melhor acelera a evolução nos treinos e faz subir juniores mais fortes.</p></>,
      confirmLabel: `Pagar ${moneyShort(cost)}`,
    }).then((ok) => { if (ok) { act((c) => startWork(c, kind)); track('work_started', { kind, cost }); } });
  };
  return (
    <div className="works-box">
      <div className="work-row">
        <div>
          <b>Estádio</b> <span className="hint">{club.stadium.toLocaleString('pt-BR')} lugares</span>
          {sq.busy
            ? <p className="hint">🏗 +{(sq.busy.seats ?? 0).toLocaleString('pt-BR')} lugares em obra · faltam {daysLeft(career.date, sq.busy.doneOn)} dias</p>
            : <p className="hint">+{sq.seats.toLocaleString('pt-BR')} lugares · {money(sq.cost)} · {sq.days} dias</p>}
        </div>
        {!sq.busy && <button className="btn sm" disabled={club.budget < sq.cost} onClick={() => ask('stadium')}>Ampliar</button>}
      </div>
      <div className="work-row">
        <div>
          <b>Centro de treinamento</b> <Stars n={club.trainingCenter} />
          {cq?.busy
            ? <p className="hint">🏗 nível {cq.busy.level} em obra · faltam {daysLeft(career.date, cq.busy.doneOn)} dias</p>
            : cq
              ? <p className="hint">nível {cq.level} · {money(cq.cost)} · {cq.days} dias</p>
              : <p className="hint">Nível máximo.</p>}
        </div>
        {cq && !cq.busy && <button className="btn sm" disabled={club.budget < cq.cost} onClick={() => ask('ct')}>Melhorar</button>}
      </div>
    </div>
  );
}

/** Artilharia da temporada em andamento na divisão escolhida. */
function Scorers({ career, division }: { career: Career; division: number }) {
  const me = myClubId(career);
  const list = career.season.divisions[division]!.teamIds
    .flatMap((id) => career.clubs[id]!.players.map((p) => ({ p, club: career.clubs[id]! })))
    .filter((x) => x.p.stats.goals > 0)
    .sort((a, b) => b.p.stats.goals - a.p.stats.goals || a.p.stats.apps - b.p.stats.apps)
    .slice(0, 10);
  return (
    <>
      <h4>Artilharia · Divisão {division + 1}</h4>
      {list.length === 0
        ? <p className="hint">Ninguém marcou ainda nesta temporada.</p>
        : (
          <table className="grid-table compact scorers">
            <tbody>
              {list.map(({ p, club }, i) => (
                <tr key={p.id} className={club.id === me ? 'me' : ''}>
                  <td>{i + 1}</td>
                  <td className="name">{p.name}</td>
                  <td className="hint">{club.name}</td>
                  <td><b>{p.stats.goals}</b> <span className="hint">em {p.stats.apps} j</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </>
  );
}

function LoanBox({ career, act }: { career: Career; act: Act }) {
  const club = career.clubs[myClubId(career)]!;
  const limit = loanLimit(career);
  const [share, setShare] = useState(0.5);
  const [months, setMonths] = useState<number>(LOAN_TERMS[0].months);
  const loan = career.loan;

  if (loan) {
    const payoff = loanPayoff(loan);
    return (
      <div className="loan-box">
        <dl className="kv">
          <dt>Valor</dt><dd>{money(loan.principal)} ({Math.round(loan.rate * 100)}% de juros no total)</dd>
          <dt>Parcela</dt><dd>{money(loan.installment)}/mês · faltam {loan.monthsLeft}</dd>
          <dt>Para quitar hoje</dt><dd>{money(payoff)} <span className="hint">(5% de desconto)</span></dd>
        </dl>
        <button className="btn" disabled={club.budget < payoff} onClick={() => {
          void askConfirm({
            title: 'Quitar empréstimo',
            body: <><p>Pagar <b>{money(payoff)}</b> agora e encerrar o empréstimo?</p><p className="hint">Caixa depois: {money(club.budget - payoff)}.</p></>,
            confirmLabel: `Quitar por ${moneyShort(payoff)}`,
          }).then((ok) => { if (ok) { act((c) => payOffLoan(c)); track('loan_paid_off', { amount: payoff }); } });
        }}>{club.budget < payoff ? 'Caixa insuficiente para quitar' : `Quitar agora por ${moneyShort(payoff)}`}</button>
      </div>
    );
  }

  const principal = Math.floor((limit * share) / 10000) * 10000;
  const q = loanQuote(principal, months);
  return (
    <div className="loan-box">
      <p className="hint">Até <b>{money(limit)}</b> · um por vez · parcela todo dia 1</p>
      <div className="chips">
        {[0.25, 0.5, 0.75, 1].map((s) => (
          <button key={s} className={`chip ${share === s ? 'on' : ''}`} onClick={() => setShare(s)}>{moneyShort(Math.floor((limit * s) / 10000) * 10000)}</button>
        ))}
      </div>
      <div className="chips">
        {LOAN_TERMS.map((t) => (
          <button key={t.months} className={`chip ${months === t.months ? 'on' : ''}`} onClick={() => setMonths(t.months)}>{t.months} meses · {Math.round(t.rate * 100)}% juros</button>
        ))}
      </div>
      <p className="loan-quote">{months}x de <b>{money(q.installment)}</b> · total {money(q.total)} <span className="hint">(juros {money(q.interest)})</span></p>
      <button className="btn primary" disabled={principal <= 0} onClick={() => {
        void askConfirm({
          title: 'Pegar empréstimo',
          body: <><p>Receber <b>{money(principal)}</b> agora e pagar <b>{months}x de {money(q.installment)}</b> (total {money(q.total)}).</p><p className="hint">A parcela sai do caixa todo dia 1. Terminar a temporada com o caixa negativo dá demissão.</p></>,
          confirmLabel: `Pegar ${moneyShort(principal)}`,
        }).then((ok) => { if (ok) { act((c) => takeLoan(c, principal, months)); track('loan_taken', { amount: principal, months }); } });
      }}>Pegar {moneyShort(principal)}</button>
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
        {/* cresce uma linha por temporada: vem recolhida, com o resumo no cabeçalho */}
        {e.history.length === 0
          ? <><h4>Trajetória</h4><p className="hint">Nenhuma temporada concluída.</p></>
          : (
            <Fold title="Trajetória" summary={`${e.history.length} ${e.history.length === 1 ? 'temporada' : 'temporadas'} · ${e.history.filter((h) => h.achieved).length} objetivo(s) cumprido(s)`}>
              <ul className="list">
                {e.history.map((h, i) => (
                  <li key={i}>{h.year} · {h.orgName} · {h.position}º na Div {h.division} · <span className={h.achieved ? 'ok' : 'neg'}>{h.achieved ? 'objetivo cumprido' : 'objetivo não cumprido'}</span></li>
                ))}
              </ul>
            </Fold>
          )}
        {club && club.titles.length > 0 && (
          <Fold title="Títulos do clube" summary={`🏆 ${club.titles.length}`}>
            <ul className="list">{club.titles.map((t, i) => <li key={i}>🏆 {t.competition} {t.year}</li>)}</ul>
          </Fold>
        )}
      </section>
      <AchievementsSection />
    </div>
  );
}
