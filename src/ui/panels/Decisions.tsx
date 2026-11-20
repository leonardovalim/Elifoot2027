import { myClubId, type Career } from '../../game/career';
import { moraleLevel, moraleOf, type Decision, type DecisionChoice, type MoraleLevel } from '../../game/market';
import { playerValue, wageFor } from '../../sports/football/generate';
import { overall, pickLineup, ratingAt, statusOf, type SquadStatus } from '../../sports/football/lineup';
import type { Club, Player, Position } from '../../sports/football/types';
import { Badge, Bar, Modal, POS_LABEL, money } from '../util';

export const MORALE_FACE: Record<MoraleLevel, string> = { feliz: '😄', satisfeito: '🙂', insatisfeito: '😕', revoltado: '😠' };
export const MORALE_LABEL: Record<MoraleLevel, string> = { feliz: 'Feliz', satisfeito: 'Satisfeito', insatisfeito: 'Insatisfeito', revoltado: 'Revoltado' };

/** Satisfação do atleta: rosto + barra + rótulo. */
export function Morale({ p, compact }: { p: Player; compact?: boolean }) {
  const m = moraleOf(p);
  const lvl = moraleLevel(m);
  if (compact) return <span className="morale-face" title={`${MORALE_LABEL[lvl]} (${m})`} aria-label={MORALE_LABEL[lvl]}>{MORALE_FACE[lvl]}</span>;
  return (
    <div className="morale">
      <span className="morale-face" aria-hidden="true">{MORALE_FACE[lvl]}</span>
      <Bar value={m} />
      <b>{MORALE_LABEL[lvl]}</b>
    </div>
  );
}

const ROLE_LABEL: Record<SquadStatus, string> = { xi: 'Titular', bench: 'Reserva', out: 'Fora da relação' };
const ORD = (n: number) => `${n}º`;
const nf1 = (v: number) => v.toFixed(1).replace('.', ',');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Tudo o que pesa na decisão sobre um atleta, calculado a partir do elenco atual. */
export function athleteContext(club: Club, p: Player) {
  const role = statusOf(club)[p.id] ?? 'out';
  const lineup = pickLineup(club);
  // posição em que ele joga hoje (pode ser improvisado)
  let playsAt: Position = p.position;
  if (lineup.GK.id === p.id) playsAt = 'GK';
  else if (lineup.DF.some((x) => x.id === p.id)) playsAt = 'DF';
  else if (lineup.MF.some((x) => x.id === p.id)) playsAt = 'MF';
  else if (lineup.FW.some((x) => x.id === p.id)) playsAt = 'FW';
  const samePos = club.players.filter((x) => x.position === p.position).sort((a, b) => overall(b) - overall(a));
  const rank = samePos.findIndex((x) => x.id === p.id) + 1;
  const others = club.players.filter((x) => x.id !== p.id && !x.leaving)
    .sort((a, b) => ratingAt(b, playsAt) - ratingAt(a, playsAt));
  // substituto: o melhor da posição que hoje não é titular nessa função (ou o melhor restante)
  const starterIds = new Set([lineup.GK, ...lineup.DF, ...lineup.MF, ...lineup.FW].map((x) => x.id));
  const sub = role === 'xi' ? others.find((x) => !starterIds.has(x.id)) : undefined;
  const subGap = sub ? Math.round(ratingAt(sub, playsAt)) - overall(p) : 0;
  const wages = [...club.players].sort((a, b) => b.wage - a.wage);
  const wageRank = wages.findIndex((x) => x.id === p.id) + 1;
  const payroll = club.players.reduce((a, x) => a + x.wage, 0);
  const avg = p.stats.apps ? p.stats.ratingSum / p.stats.apps : 0;
  const prospect = p.age <= 21 && p.potential - overall(p) >= 8;

  let read: string;
  if (role === 'xi' && rank === 1) read = `Peça-chave: titular e o melhor ${POS_LABEL[p.position]} do elenco.`;
  else if (role === 'xi') read = `Titular.`;
  else if (role === 'bench') read = 'Reserva: entra quando alguém cansa ou é suspenso.';
  else read = 'Não está sendo usado: fica fora da relação.';
  if (sub) read += subGap <= -6 ? ` Se sair, o time perde força: ${sub.name} assume (${subGap}).` : ` Se sair, ${sub.name} assume sem grande perda (${subGap >= 0 ? '+' : ''}${subGap}).`;
  if (prospect) read += ` Jovem com potencial para chegar a ~${p.potential}.`;

  return { role, playsAt, rank, depth: samePos.length, sub, subGap, wageRank, wageShare: payroll ? p.wage / payroll : 0, avg, prospect, read };
}

/** Bloco com o retrato do atleta para a decisão. */
function AthleteCard({ club, p }: { club: Club; p: Player }) {
  const ctx = athleteContext(club, p);
  return (
    <div className="athlete-ctx">
      <div className="ctx-top">
        <b className="ctx-name">{p.name}</b>
        <span className={`role-pill ${ctx.role}`}>{ROLE_LABEL[ctx.role]}</span>
        {ctx.playsAt !== p.position && <span className="tag warn">joga de {POS_LABEL[ctx.playsAt]}</span>}
        {ctx.prospect && <span className="tag good">joia</span>}
      </div>
      <span className="hint">{POS_LABEL[p.position]} · {p.age} anos · habilidade <b>{overall(p)}</b> · potencial ~{p.potential}</span>
      <p className="ctx-read">{ctx.read}</p>
      <dl className="ctx-grid">
        <div><dt>Temporada</dt><dd>{plural(p.stats.apps, 'jogo', 'jogos')} · {plural(p.stats.goals, 'gol', 'gols')}{p.stats.apps ? ` · nota ${nf1(ctx.avg)}` : ''}</dd></div>
        <div><dt>Na posição</dt><dd>{ORD(ctx.rank)} de {ctx.depth} {POS_LABEL[p.position]}</dd></div>
        <div><dt>Salário</dt><dd>{money(p.wage)} · {ORD(ctx.wageRank)} maior ({Math.round(ctx.wageShare * 100)}% da folha)</dd></div>
        <div><dt>Contrato</dt><dd>até {p.contractUntil}</dd></div>
        <div className="wide"><dt>Satisfação</dt><dd><Morale p={p} /></dd></div>
      </dl>
    </div>
  );
}

const TITLE: Record<Decision['kind'], string> = { bid: 'Proposta por atleta', raise: 'Pedido de aumento', renewal: 'Renovação de contrato' };

/** Janela de decisão do mercado vivo. Sem botão de fechar: o tempo fica parado até a escolha. */
export function DecisionModal({ career, decision: d, onChoose }: { career: Career; decision: Decision; onChoose: (choice: DecisionChoice) => void }) {
  const club = career.clubs[myClubId(career)]!;
  const p = club.players.find((x) => x.id === d.playerId);
  if (!p) return null;
  const payroll = club.players.reduce((a, x) => a + x.wage, 0);
  const extra = d.wage - p.wage;

  const who = <AthleteCard club={club} p={p} />;

  const payrollLine = extra > 0 && (
    <p className="hint">Folha mensal: {money(payroll)} → <b>{money(payroll + extra)}</b> · caixa {money(club.budget)}</p>
  );

  if (d.kind === 'bid') {
    const buyer = career.clubs[d.clubId]!;
    return (
      <Modal title={TITLE.bid}>
        <div className="decision">
          <div className="decision-head">
            <Badge club={buyer} size="lg" />
            <p><b>{buyer.name}</b> oferece <b>{money(d.fee)}</b> por {p.name} e um salário de <b>{money(d.wage)}/mês</b> (hoje ele ganha {money(p.wage)}).</p>
          </div>
          {who}
          <dl className="kv">
            <dt>Valor de mercado</dt><dd>{money(playerValue(p))}</dd>
            <dt>Oferta</dt><dd className={d.fee >= playerValue(p) ? 'ok' : ''}>{money(d.fee)} ({Math.round((d.fee / playerValue(p)) * 100)}% do valor)</dd>
          </dl>
          <p className="hint">Cobrir a oferta: ele fica e passa a ganhar o mesmo salário oferecido. Recusar uma proposta com salário bem maior deixa o atleta chateado.</p>
          <div className="decision-actions">
            <button className="btn primary" onClick={() => onChoose('accept')}>Vender por {money(d.fee)}</button>
            <button className="btn" onClick={() => onChoose('cover')}>Cobrir salário ({money(d.wage)}/mês)</button>
            <button className="btn ghost" onClick={() => onChoose('refuse')}>Recusar</button>
          </div>
          {extra > 0 && <p className="hint">Se cobrir, a folha mensal vai de {money(payroll)} para <b>{money(payroll + extra)}</b>.</p>}
        </div>
      </Modal>
    );
  }

  if (d.kind === 'raise') {
    const reason = wageFor(p) > p.wage * 1.1
      ? 'Ele acha que ganha abaixo do que vale hoje.'
      : moraleOf(p) < 45 ? 'Ele anda insatisfeito no clube.' : 'Ele vem fazendo uma boa temporada.';
    return (
      <Modal title={TITLE.raise}>
        <div className="decision">
          <p><b>{p.name}</b> pede aumento: de {money(p.wage)} para <b>{money(d.wage)}/mês</b>. {reason}</p>
          {who}
          {payrollLine}
          <div className="decision-actions">
            <button className="btn primary" onClick={() => onChoose('accept')}>Dar aumento</button>
            <button className="btn ghost" onClick={() => onChoose('refuse')}>Negar (ele fica insatisfeito)</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={TITLE.renewal}>
      <div className="decision">
        <p>O contrato de <b>{p.name}</b> termina no fim da temporada. Ele aceita renovar por <b>{d.years} {d.years === 1 ? 'ano' : 'anos'}</b> ganhando <b>{money(d.wage)}/mês</b> (hoje: {money(p.wage)}).</p>
        {who}
        {payrollLine}
        <div className="decision-actions">
          <button className="btn primary" onClick={() => onChoose('accept')}>Renovar até {career.season.year + d.years}</button>
          <button className="btn ghost" onClick={() => onChoose('release')}>Deixar sair no fim da temporada</button>
        </div>
      </div>
    </Modal>
  );
}
