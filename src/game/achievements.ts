/**
 * Conquistas: 50 desbloqueios secretos que ficam com o JOGADOR para sempre (não com a carreira).
 * Cada uma coloca um objeto na cena do CT (`ui/scene/legacy.ts`).
 *
 * Este módulo é puro: recebe fatos do jogo e devolve os ids recém-desbloqueados.
 * Salvar e anunciar (banner) fica em `ui/achievements.tsx`.
 */
import type { Career, SeasonSummary } from './career';
import { divisionOf, lastAttendance, myClubId } from './career';
import type { FootballOutcome } from '../sports/football/engine';
import { overall } from '../sports/football/lineup';
import { temperament } from '../sports/football/temperament';
import { NOVA_IGUACU } from '../sports/football/generate';
import type { Player, Side } from '../sports/football/types';

export type Tier = 'bronze' | 'prata' | 'ouro' | 'lendaria';
export type Zone = 'ceu' | 'predio' | 'campo' | 'entrada';

export interface AchievementDef {
  id: string;
  n: number;
  tier: Tier;
  name: string;
  how: string;
  element: string;
  zone: Zone;
}

const A = (n: number, id: string, tier: Tier, name: string, how: string, element: string, zone: Zone): AchievementDef => ({ n, id, tier, name, how, element, zone });

export const ACHIEVEMENTS: AchievementDef[] = [
  // bronze: primeiros passos
  A(1, 'primeiro-apito', 'bronze', 'Primeiro apito', 'Jogar a primeira partida', 'Bandeirinhas de escanteio', 'campo'),
  A(2, 'primeira-vitoria', 'bronze', 'Primeira vitória', 'Vencer uma partida', 'Faixa "VAMOS!" na beira do campo', 'campo'),
  A(3, 'ouvido-colado', 'bronze', 'Ouvido colado', 'Assistir a uma partida narrada até o fim', 'Rádio antigo no banco', 'campo'),
  A(4, 'mao-na-massa', 'bronze', 'Mão na massa', 'Fazer uma substituição durante a partida', 'Placa de substituição', 'campo'),
  A(5, 'prancheta', 'bronze', 'Prancheta', 'Assumir a escalação no lugar do auxiliar', 'Prancheta tática no banco', 'campo'),
  A(6, 'reforco', 'bronze', 'Reforço', 'Contratar um atleta', 'Van do clube', 'entrada'),
  A(7, 'negocio-fechado', 'bronze', 'Negócio fechado', 'Vender um atleta', 'Cifrão em neon no telhado', 'predio'),
  A(8, 'daqui-ninguem-sai', 'bronze', 'Daqui ninguém sai', 'Cobrir a oferta por um atleta', 'Cadeado dourado no portão', 'entrada'),
  A(9, 'caneta-na-mao', 'bronze', 'Caneta na mão', 'Renovar um contrato', 'Bebedouro azul', 'campo'),
  A(10, 'muralha', 'bronze', 'Muralha', 'Vencer sem sofrer gol', 'Bonecos de barreira de treino', 'campo'),
  A(11, 'de-virada', 'bronze', 'De virada', 'Vencer depois de estar perdendo', 'Torcedor com bumbo', 'campo'),
  A(12, 'jogo-limpo', 'bronze', 'Jogo limpo', 'Terminar uma partida sem nenhum cartão', 'Bandeira "Fair Play"', 'campo'),
  A(13, 'na-raca', 'bronze', 'Na raça', 'Vencer com 3 ou mais raçudos em campo', 'Pneus de treino de agilidade', 'campo'),
  A(14, 'joia-lapidada', 'bronze', 'Joia lapidada', 'Pôr uma joia em campo', 'Gol pequeno de treino da base', 'campo'),
  A(15, 'classico-do-sofa', 'bronze', 'Clássico do sofá', 'Simular 10 partidas sem assistir', 'Sofá na beira do campo', 'campo'),
  A(16, 'relogio-suico', 'bronze', 'Relógio suíço', 'Avançar um mês inteiro sem pausar', 'Relógio na fachada', 'predio'),
  A(17, 'no-azul', 'bronze', 'No azul', 'Fechar 6 meses seguidos com o caixa positivo', 'Cofre na entrada', 'entrada'),
  A(18, 'licao-de-casa', 'bronze', 'Lição de casa', 'Ler todos os assuntos da ajuda', 'Quadro-negro com tática', 'predio'),
  A(19, 'casa-cheia', 'bronze', 'Casa cheia', 'Lotar o estádio num jogo em casa', 'Fila de torcedores', 'entrada'),
  A(20, 'folego', 'bronze', 'Fôlego', 'Jogar 30 partidas', 'Escada de agilidade', 'campo'),
  // prata: carreira sólida
  A(21, 'missao-cumprida', 'prata', 'Missão cumprida', 'Cumprir o objetivo da diretoria', 'Bandeira do clube no mastro', 'entrada'),
  A(22, 'subiu', 'prata', 'Subiu!', 'Conquistar um acesso', 'Balões nas cores do clube', 'ceu'),
  A(23, 'atropelo', 'prata', 'Atropelo', 'Vencer por 5 gols ou mais de diferença', 'Placar "5x0" no telhado', 'predio'),
  A(24, 'invicto', 'prata', 'Invicto', 'Passar 10 jogos seguidos sem perder', 'Escudo pintado no gramado', 'campo'),
  A(25, 'chuteira-de-ouro', 'prata', 'Chuteira de ouro', 'Ter o artilheiro da divisão', 'Chuteira dourada na vitrine', 'predio'),
  A(26, 'prata-da-casa', 'prata', 'Prata da casa', 'Pôr em campo um atleta revelado na base', 'Rede da base com o escudo', 'campo'),
  A(27, 'venda-milionaria', 'prata', 'Venda milionária', 'Vender um atleta por 2 milhões ou mais', 'Carro esportivo', 'entrada'),
  A(28, 'sangue-novo', 'prata', 'Sangue novo', 'Ter um elenco com média de idade até 23 anos', 'Bicicletário', 'entrada'),
  A(29, 'cofre-cheio', 'prata', 'Cofre cheio', 'Terminar a temporada com o caixa acima da folha anual', 'Fonte com moedas', 'entrada'),
  A(30, 'nome-limpo', 'prata', 'Nome limpo', 'Quitar um empréstimo antes do prazo', 'Plantinha na janela', 'predio'),
  A(31, 'volta-por-cima', 'prata', 'Volta por cima', 'Ser demitido e cumprir o objetivo no clube seguinte', 'Fênix pintada no muro', 'predio'),
  A(32, 'casamento', 'prata', 'Casamento', 'Ficar 3 temporadas seguidas no mesmo clube', 'Placa de homenagem', 'entrada'),
  A(33, 'temporada-sem-vermelho', 'prata', 'Temporada sem vermelho', 'Uma temporada inteira sem nenhuma expulsão', 'Pomba branca no telhado', 'predio'),
  A(34, 'narrador-de-plantao', 'prata', 'Narrador de plantão', 'Assistir a 50 partidas narradas', 'Antena de TV', 'predio'),
  A(35, 'mestre-das-trocas', 'prata', 'Mestre das trocas', 'Fazer 100 substituições', 'Banco de reservas coberto', 'campo'),
  // ouro: feitos raros
  A(36, 'campeao', 'ouro', 'Campeão', 'Ganhar o título de qualquer divisão', 'Taça na vitrine', 'predio'),
  A(37, 'escalada', 'ouro', 'Escalada', 'Ir da Divisão 4 à Divisão 1 na mesma carreira', 'Pódio de 3 degraus', 'campo'),
  A(38, 'elite', 'ouro', 'Elite', 'Ganhar o título da Divisão 1', 'Dirigível com o escudo', 'ceu'),
  A(39, 'bicampeao', 'ouro', 'Bicampeão', 'Ganhar 2 títulos seguidos', 'Segunda taça e estrela dourada', 'predio'),
  A(40, 'temporada-perfeita', 'ouro', 'Temporada perfeita', 'Ser campeão sem perder nenhum jogo', 'Estátua dourada do técnico', 'entrada'),
  A(41, 'magnata', 'ouro', 'Magnata', 'Ter 10 milhões de patrimônio pessoal', 'Helicóptero no telhado', 'predio'),
  A(42, 'lenda-viva', 'ouro', 'Lenda viva', 'Chegar a 90 de reputação', 'Mural com o seu retrato', 'predio'),
  A(43, 'centenario', 'ouro', 'Centenário', 'Vencer 100 partidas', 'Fogos de artifício', 'ceu'),
  A(44, 'salvador', 'ouro', 'Salvador', 'Escapar do rebaixamento estando em último ao fim do turno', 'Ferradura da sorte no portão', 'entrada'),
  A(45, 'ct-de-primeiro-mundo', 'ouro', 'CT de primeiro mundo', 'Cumprir o objetivo dirigindo um clube com estrutura 5 estrelas', 'Piscina de recuperação', 'entrada'),
  // lendárias: para poucos
  A(46, 'tetra', 'lendaria', 'Tetra', 'Ganhar 4 títulos da Divisão 1', 'Calçada da fama', 'entrada'),
  A(47, 'uma-decada', 'lendaria', 'Uma década', 'Jogar 10 temporadas na mesma carreira', 'Árvore grande', 'entrada'),
  A(48, 'invencivel-na-elite', 'lendaria', 'Invencível na elite', 'Passar uma temporada inteira invicto na Divisão 1', 'Avião com faixa no céu', 'ceu'),
  A(49, 'do-po-ao-topo', 'lendaria', 'Do pó ao topo', 'Começar na Divisão 4 e ser campeão da Divisão 1 em até 5 temporadas', 'Obelisco monumental', 'entrada'),
  A(50, 'colecionador', 'lendaria', 'Colecionador', 'Desbloquear todas as outras conquistas', 'Disco voador', 'ceu'),
  // secreta especial: o Nova Iguaçu existe em todo mundo gerado
  A(51, 'laranja-da-baixada', 'lendaria', 'Laranja da Baixada', 'Receber uma proposta do Nova Iguaçu', 'Caixote de laranjas', 'campo'),
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const TIER_LABEL: Record<Tier, string> = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', lendaria: 'Lendária' };

export const HELP_TOPIC_COUNT = 8;

export interface AchState {
  v: 1;
  /** id → data real (ISO) do desbloqueio. */
  unlocked: Record<string, string>;
  matches: number;
  wins: number;
  watched: number;
  simulated: number;
  subs: number;
  unbeaten: number;
  monthsBlue: number;
  helpTopics: string[];
  /** Fatos da temporada em curso (zerados quando o ano muda). */
  season: { year: number; reds: number; lastAtTurn: boolean };
  /** Foi demitido na última temporada avaliada (para "Volta por cima"). */
  firedLast: boolean;
}

export function emptyAch(): AchState {
  return { v: 1, unlocked: {}, matches: 0, wins: 0, watched: 0, simulated: 0, subs: 0, unbeaten: 0, monthsBlue: 0, helpTopics: [], season: { year: 0, reds: 0, lastAtTurn: false }, firedLast: false };
}

/** Normaliza o que veio do armazenamento (campos novos ausentes em saves antigos). */
export function normalizeAch(raw: unknown): AchState {
  const base = emptyAch();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AchState>;
  return { ...base, ...r, unlocked: { ...(r.unlocked ?? {}) }, helpTopics: [...(r.helpTopics ?? [])], season: { ...base.season, ...(r.season ?? {}) } };
}

/** Desbloqueia e devolve os ids novos (inclui "Colecionador" ao completar as outras 49). */
function unlockAll(s: AchState, ids: string[], now: string): string[] {
  const fresh: string[] = [];
  for (const id of ids) {
    if (!ACHIEVEMENT_BY_ID[id] || s.unlocked[id]) continue;
    s.unlocked[id] = now;
    fresh.push(id);
  }
  const others = ACHIEVEMENTS.filter((a) => a.id !== 'colecionador');
  if (!s.unlocked.colecionador && others.every((a) => s.unlocked[a.id])) {
    s.unlocked.colecionador = now;
    fresh.push('colecionador');
  }
  return fresh;
}

const isProspect = (p: Player) => p.age <= 21 && p.potential - overall(p) >= 8;

function rollSeason(s: AchState, year: number) {
  if (s.season.year !== year) s.season = { year, reds: 0, lastAtTurn: false };
}

// ---------------------------------------------------------------- partida

export interface MatchFacts {
  /** Carreira DEPOIS de `completeRound`. */
  career: Career;
  outcome: FootballOutcome;
  side: Side;
  homeId: string;
  awayId: string;
  /** Assistiu narrada até o fim (sem "Até o fim"). */
  watched: boolean;
  /** Simulada sem assistir (automático ou "Simular resultado"). */
  simulated: boolean;
  /** Substituições feitas por você nesta partida. */
  subs: number;
  /** Ano da temporada em que a partida foi jogada. */
  year: number;
}

export function onMatch(s: AchState, f: MatchFacts, now = new Date().toISOString()): string[] {
  rollSeason(s, f.year);
  const o = f.outcome;
  const gf = f.side === 'home' ? o.homeScore : o.awayScore;
  const ga = f.side === 'home' ? o.awayScore : o.homeScore;
  const won = gf > ga, lost = gf < ga;
  const club = f.career.clubs[myClubId(f.career)];
  const played = (club?.players ?? []).filter((p) => o.played[f.side].includes(p.id));
  const myCards = o.events.filter((e) => (e.type === 'yellow' || e.type === 'red') && e.side === f.side);
  const myReds = myCards.filter((e) => e.type === 'red').length;

  s.matches++;
  if (won) s.wins++;
  if (f.watched) s.watched++;
  if (f.simulated) s.simulated++;
  s.subs += f.subs;
  s.unbeaten = lost ? 0 : s.unbeaten + 1;
  s.season.reds += myReds;

  // virada: em algum momento esteve atrás no placar
  let mine = 0, theirs = 0, behind = false;
  for (const e of o.events) {
    if (e.type !== 'goal') continue;
    if (e.side === f.side) mine++; else theirs++;
    if (mine < theirs) behind = true;
  }

  // fim do turno (rodada 11 de 22): em último?
  const c = f.career;
  if (c.season.round === Math.floor(c.roundDates.length / 2) && club) {
    const d = divisionOf(c, club.id);
    const table = c.season.divisions[d]!;
    const pts = (id: string) => standing(c, d, id);
    const last = [...table.teamIds].sort((a, b) => pts(a) - pts(b))[0];
    if (last === club.id) s.season.lastAtTurn = true;
  }

  const ids: string[] = ['primeiro-apito'];
  if (won) ids.push('primeira-vitoria');
  if (f.watched) ids.push('ouvido-colado');
  if (s.subs >= 1) ids.push('mao-na-massa');
  if (won && ga === 0) ids.push('muralha');
  if (won && behind) ids.push('de-virada');
  if (myCards.length === 0) ids.push('jogo-limpo');
  if (won && played.filter((p) => temperament(p) === 'racudo').length >= 3) ids.push('na-raca');
  if (played.some(isProspect)) ids.push('joia-lapidada');
  if (played.some((p) => p.fromYouth)) ids.push('prata-da-casa');
  if (s.simulated >= 10) ids.push('classico-do-sofa');
  if (s.matches >= 30) ids.push('folego');
  if (won && gf - ga >= 5) ids.push('atropelo');
  if (s.unbeaten >= 10) ids.push('invicto');
  if (s.watched >= 50) ids.push('narrador-de-plantao');
  if (s.subs >= 100) ids.push('mestre-das-trocas');
  if (s.wins >= 100) ids.push('centenario');
  if (f.side === 'home' && club) {
    const home = f.career.clubs[f.homeId], away = f.career.clubs[f.awayId];
    if (home && away && lastAttendance(home, away) >= home.stadium) ids.push('casa-cheia');
  }
  return unlockAll(s, ids, now);
}

/** Pontos de um clube na tabela atual (soma dos resultados). */
function standing(c: Career, d: number, id: string): number {
  let pts = 0;
  for (const round of c.season.divisions[d]!.results) {
    for (const r of round) {
      if (r.home !== id && r.away !== id) continue;
      const mine = r.home === id ? r.homeScore : r.awayScore;
      const theirs = r.home === id ? r.awayScore : r.homeScore;
      pts += mine > theirs ? 3 : mine === theirs ? 1 : 0;
    }
  }
  return pts;
}

// ---------------------------------------------------------------- temporada

/** Fatos colhidos ANTES de `closeSeason` (depois a tabela é substituída pela nova temporada). */
export interface SeasonFacts {
  summary: SeasonSummary;
  year: number;
  lost: number;
  /** Artilheiro da divisão é do seu clube. */
  topScorerMine: boolean;
  budgetAfterPrize: number;
  payrollYear: number;
  trainingCenter: number;
}

export function seasonFacts(c: Career, summary: SeasonSummary): SeasonFacts {
  const me = myClubId(c);
  const d = divisionOf(c, me);
  const div = c.season.divisions[d]!;
  let lost = 0;
  for (const round of div.results) {
    for (const r of round) {
      if (r.home !== me && r.away !== me) continue;
      const mine = r.home === me ? r.homeScore : r.awayScore;
      const theirs = r.home === me ? r.awayScore : r.homeScore;
      if (mine < theirs) lost++;
    }
  }
  const all = div.teamIds.flatMap((id) => (c.clubs[id]?.players ?? []).map((p) => ({ club: id, goals: p.stats.goals })));
  const best = all.reduce((a, b) => (b.goals > a.goals ? b : a), { club: '', goals: 0 });
  const club = c.clubs[me]!;
  return {
    summary,
    year: c.season.year,
    lost,
    topScorerMine: best.goals > 0 && best.club === me,
    budgetAfterPrize: club.budget + summary.prize,
    payrollYear: club.players.reduce((a, p) => a + p.wage, 0) * 12,
    trainingCenter: club.trainingCenter,
  };
}

/** `after` = carreira depois de `closeSeason` (histórico já inclui a temporada). */
export function onSeasonEnd(s: AchState, f: SeasonFacts, after: Career, now = new Date().toISOString()): string[] {
  const { summary: m } = f;
  const ids: string[] = [];
  const title = m.position === 1;
  const top = m.division === 0;
  if (m.achieved) ids.push('missao-cumprida');
  if (m.promoted) ids.push('subiu');
  if (f.topScorerMine) ids.push('chuteira-de-ouro');
  if (f.budgetAfterPrize > f.payrollYear) ids.push('cofre-cheio');
  if (title) ids.push('campeao');
  if (m.achieved && f.trainingCenter >= 5) ids.push('ct-de-primeiro-mundo');
  if (title && top) ids.push('elite');
  if (title && f.lost === 0) ids.push('temporada-perfeita');
  if (top && f.lost === 0) ids.push('invencivel-na-elite');
  if (s.season.year === f.year && s.season.reds === 0 && s.matches > 0) ids.push('temporada-sem-vermelho');
  if (s.season.year === f.year && s.season.lastAtTurn && !m.relegated && m.division < 3) ids.push('salvador');
  if (s.firedLast && m.achieved && !m.fired) ids.push('volta-por-cima');
  s.firedLast = m.fired ? true : m.achieved ? false : s.firedLast;

  const h = after.entrepreneur.history; // mais recente primeiro
  if (h.length >= 2 && h[0]!.position === 1 && h[1]!.position === 1) ids.push('bicampeao');
  if (h.filter((x) => x.position === 1 && x.division === 1).length >= 4) ids.push('tetra');
  if (h.length >= 10) ids.push('uma-decada');
  if (h.length >= 3 && h[0]!.orgName === h[1]!.orgName && h[1]!.orgName === h[2]!.orgName) ids.push('casamento');
  const startedBottom = h.length > 0 && h[h.length - 1]!.division === 4;
  const nowTop = h.some((x) => x.division === 1) || (!after.unemployed && divisionOf(after, myClubId(after)) === 0);
  if (h.some((x) => x.division === 4) && nowTop) ids.push('escalada');
  if (startedBottom) {
    const oldestFirst = [...h].reverse();
    const i = oldestFirst.findIndex((x) => x.position === 1 && x.division === 1);
    if (i >= 0 && i < 5) ids.push('do-po-ao-topo');
  }
  return unlockAll(s, [...ids, ...stateIds(after)], now);
}

// ---------------------------------------------------------------- estado geral

/** Conquistas que dependem só do estado atual da carreira. */
function stateIds(c: Career): string[] {
  const ids: string[] = [];
  const e = c.entrepreneur;
  if (c.offers.some((o) => c.clubs[o.clubId]?.name === NOVA_IGUACU)) ids.push('laranja-da-baixada');
  if (e.cash >= 10_000_000) ids.push('magnata');
  if (e.reputation >= 90) ids.push('lenda-viva');
  const club = c.clubs[myClubId(c)];
  if (club && !c.unemployed) {
    if (club.players.length >= 16 && club.players.reduce((a, p) => a + p.age, 0) / club.players.length <= 23) ids.push('sangue-novo');
  }
  return ids;
}

export function checkState(s: AchState, c: Career, now = new Date().toISOString()): string[] {
  return unlockAll(s, stateIds(c), now);
}

// ---------------------------------------------------------------- ações do jogador

export interface ActionSnapshot {
  clubId: string;
  players: string[];
  sales: number;
  loanMonthsLeft: number;
  manualLineup: boolean;
}

export function snapshotForActions(c: Career): ActionSnapshot {
  const club = c.clubs[myClubId(c)];
  return {
    clubId: club?.id ?? '',
    players: club?.players.map((p) => p.id) ?? [],
    sales: c.ledger.sales,
    loanMonthsLeft: c.loan?.monthsLeft ?? 0,
    manualLineup: !!club?.lineup,
  };
}

/** Compara antes/depois de uma ação (comprar, vender, escalar, quitar, decidir). */
export function onAction(s: AchState, before: ActionSnapshot, c: Career, decision?: { kind: string; choice: string }, now = new Date().toISOString()): string[] {
  const ids: string[] = [];
  const club = c.clubs[myClubId(c)];
  if (club && club.id === before.clubId) {
    const had = new Set(before.players);
    if (club.players.some((p) => !had.has(p.id) && p.joinedOn === c.date)) ids.push('reforco');
    if (!before.manualLineup && club.lineup) ids.push('prancheta');
  }
  const sold = c.ledger.sales - before.sales;
  if (sold > 0) ids.push('negocio-fechado');
  if (sold >= 2_000_000) ids.push('venda-milionaria');
  if (before.loanMonthsLeft > 0 && !c.loan && club?.id === before.clubId) ids.push('nome-limpo');
  if (decision?.kind === 'bid' && decision.choice === 'cover') ids.push('daqui-ninguem-sai');
  if (decision?.kind === 'renewal' && decision.choice === 'accept') ids.push('caneta-na-mao');
  return unlockAll(s, [...ids, ...stateIds(c)], now);
}

// ---------------------------------------------------------------- tempo e ajuda

/** Virada de mês. `clean` = o mês inteiro passou sem pausa manual. */
export function onMonth(s: AchState, c: Career, clean: boolean, now = new Date().toISOString()): string[] {
  const club = c.clubs[myClubId(c)];
  s.monthsBlue = club && club.budget >= 0 ? s.monthsBlue + 1 : 0;
  const ids: string[] = [];
  if (clean) ids.push('relogio-suico');
  if (s.monthsBlue >= 6) ids.push('no-azul');
  return unlockAll(s, [...ids, ...stateIds(c)], now);
}

export function onHelpTopic(s: AchState, topic: string, now = new Date().toISOString()): string[] {
  if (!s.helpTopics.includes(topic)) s.helpTopics.push(topic);
  return unlockAll(s, s.helpTopics.length >= HELP_TOPIC_COUNT ? ['licao-de-casa'] : [], now);
}
