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
import { NOVA_IGUACU_ID } from '../sports/football/generate';
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
  A(4, 'mao-na-massa', 'bronze', 'Mão na massa', 'Fazer 50 substituições durante as partidas', 'Placa de substituição', 'campo'),
  A(5, 'prancheta', 'bronze', 'Prancheta', 'Assumir a escalação no lugar do auxiliar', 'Prancheta tática no banco', 'campo'),
  A(6, 'reforco', 'bronze', 'Reforço', 'Contratar um atleta', 'Van do clube', 'entrada'),
  A(7, 'negocio-fechado', 'bronze', 'Negócio fechado', 'Vender 10 atletas', 'Cifrão em neon no telhado', 'predio'),
  A(8, 'daqui-ninguem-sai', 'bronze', 'Daqui ninguém sai', 'Cobrir 3 ofertas pelos seus atletas', 'Cadeado dourado no portão', 'entrada'),
  A(9, 'caneta-na-mao', 'bronze', 'Caneta na mão', 'Renovar 15 contratos', 'Bebedouro azul', 'campo'),
  A(10, 'muralha', 'bronze', 'Muralha', 'Vencer 50 jogos sem sofrer gol', 'Bonecos de barreira de treino', 'campo'),
  A(11, 'de-virada', 'bronze', 'De virada', 'Vencer 30 jogos depois de estar perdendo', 'Torcedor com bumbo', 'campo'),
  A(12, 'jogo-limpo', 'bronze', 'Jogo limpo', 'Terminar 75 partidas sem nenhum cartão', 'Bandeira "Fair Play"', 'campo'),
  A(13, 'na-raca', 'bronze', 'Na raça', 'Vencer com 3 ou mais raçudos em campo', 'Pneus de treino de agilidade', 'campo'),
  A(14, 'joia-lapidada', 'bronze', 'Joia lapidada', 'Pôr em campo 20 joias diferentes', 'Gol pequeno de treino da base', 'campo'),
  A(15, 'classico-do-sofa', 'bronze', 'Clássico do sofá', 'Simular 250 partidas sem assistir', 'Sofá na beira do campo', 'campo'),
  A(16, 'relogio-suico', 'bronze', 'Relógio suíço', 'Avançar 6 meses seguidos sem pausar', 'Relógio na fachada', 'predio'),
  A(17, 'no-azul', 'bronze', 'No azul', 'Fechar 60 meses seguidos com o caixa positivo', 'Cofre na entrada', 'entrada'),
  A(18, 'licao-de-casa', 'bronze', 'Lição de casa', 'Ler todos os assuntos da ajuda', 'Quadro-negro com tática', 'predio'),
  A(19, 'casa-cheia', 'bronze', 'Casa cheia', 'Lotar o estádio em 15 jogos em casa', 'Fila de torcedores', 'entrada'),
  A(20, 'folego', 'bronze', 'Fôlego', 'Jogar 500 partidas', 'Escada de agilidade', 'campo'),
  // prata: carreira sólida
  A(21, 'missao-cumprida', 'prata', 'Missão cumprida', 'Cumprir 10 objetivos da diretoria', 'Bandeira do clube no mastro', 'entrada'),
  A(22, 'subiu', 'prata', 'Subiu!', 'Conquistar 3 acessos', 'Balões nas cores do clube', 'ceu'),
  A(23, 'atropelo', 'prata', 'Atropelo', 'Vencer 3 jogos por 5 gols ou mais de diferença', 'Placar "5x0" no telhado', 'predio'),
  A(24, 'invicto', 'prata', 'Invicto', 'Passar 15 jogos seguidos sem perder', 'Escudo pintado no gramado', 'campo'),
  A(25, 'chuteira-de-ouro', 'prata', 'Chuteira de ouro', 'Ter o artilheiro da divisão em 5 temporadas', 'Chuteira dourada na vitrine', 'predio'),
  A(26, 'prata-da-casa', 'prata', 'Prata da casa', 'Pôr em campo 15 atletas revelados na base', 'Rede da base com o escudo', 'campo'),
  A(27, 'venda-milionaria', 'prata', 'Venda milionária', 'Vender um atleta por 5 milhões ou mais', 'Carro esportivo', 'entrada'),
  A(28, 'sangue-novo', 'prata', 'Sangue novo', 'Ter um elenco com média de idade até 23 anos', 'Bicicletário', 'entrada'),
  A(29, 'cofre-cheio', 'prata', 'Cofre cheio', 'Terminar 5 temporadas com o caixa acima da folha anual', 'Fonte com moedas', 'entrada'),
  A(30, 'nome-limpo', 'prata', 'Nome limpo', 'Quitar um empréstimo antes do prazo', 'Plantinha na janela', 'predio'),
  A(31, 'volta-por-cima', 'prata', 'Volta por cima', 'Ser demitido e cumprir o objetivo no clube seguinte', 'Fênix pintada no muro', 'predio'),
  A(32, 'casamento', 'prata', 'Casamento', 'Ficar 5 temporadas seguidas no mesmo clube', 'Placa de homenagem', 'entrada'),
  A(33, 'temporada-sem-vermelho', 'prata', 'Temporada sem vermelho', 'Fechar 3 temporadas sem nenhuma expulsão', 'Pomba branca no telhado', 'predio'),
  A(34, 'narrador-de-plantao', 'prata', 'Narrador de plantão', 'Assistir a 300 partidas narradas', 'Antena de TV', 'predio'),
  A(35, 'mestre-das-trocas', 'prata', 'Mestre das trocas', 'Fazer 1.000 substituições', 'Banco de reservas coberto', 'campo'),
  // ouro: feitos raros
  A(36, 'campeao', 'ouro', 'Campeão', 'Ganhar 5 títulos de divisão', 'Taça na vitrine', 'predio'),
  A(37, 'escalada', 'ouro', 'Escalada', 'Ir da Divisão 4 à Divisão 1 na mesma carreira', 'Pódio de 3 degraus', 'campo'),
  A(38, 'elite', 'ouro', 'Elite', 'Ganhar o título da Divisão 1', 'Dirigível com o escudo', 'ceu'),
  A(39, 'bicampeao', 'ouro', 'Bicampeão', 'Ganhar 2 títulos seguidos', 'Segunda taça e estrela dourada', 'predio'),
  A(40, 'temporada-perfeita', 'ouro', 'Temporada perfeita', 'Ser campeão sem perder nenhum jogo', 'Estátua dourada do técnico', 'entrada'),
  A(41, 'magnata', 'ouro', 'Magnata', 'Ter 10 milhões de patrimônio pessoal', 'Helicóptero no telhado', 'predio'),
  A(42, 'lenda-viva', 'ouro', 'Lenda viva', 'Fechar 5 temporadas com reputação 90 ou mais', 'Mural com o seu retrato', 'predio'),
  A(43, 'centenario', 'ouro', 'Meio milhar', 'Vencer 500 partidas', 'Fogos de artifício', 'ceu'),
  A(44, 'salvador', 'ouro', 'Salvador', 'Escapar do rebaixamento estando em último ao fim do turno', 'Ferradura da sorte no portão', 'entrada'),
  A(45, 'ct-de-primeiro-mundo', 'ouro', 'CT de primeiro mundo', 'Cumprir o objetivo dirigindo um clube com estrutura 5 estrelas', 'Piscina de recuperação', 'entrada'),
  // lendárias: para poucos
  A(46, 'tetra', 'lendaria', 'Tetra', 'Ganhar 4 títulos da Divisão 1', 'Calçada da fama', 'entrada'),
  A(47, 'uma-decada', 'lendaria', 'Uma década', 'Ficar 10 temporadas seguidas no mesmo clube', 'Árvore grande', 'entrada'),
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
  /** Contadores acumulados (vitórias sem sofrer gol, viradas, títulos...). */
  n: Record<string, number>;
  /** Conjuntos de ids já contados (joias e crias da base que entraram em campo). */
  seen: Record<string, string[]>;
  /** Minutos jogados com o jogo aberto e ativo — calibra o ritmo das conquistas no PostHog. */
  playMinutes: number;
}

export function emptyAch(): AchState {
  return {
    v: 1, unlocked: {}, matches: 0, wins: 0, watched: 0, simulated: 0, subs: 0, unbeaten: 0, monthsBlue: 0, helpTopics: [],
    season: { year: 0, reds: 0, lastAtTurn: false }, firedLast: false, n: {}, seen: {}, playMinutes: 0,
  };
}

/** Normaliza o que veio do armazenamento (campos novos ausentes em saves antigos). */
export function normalizeAch(raw: unknown): AchState {
  const base = emptyAch();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AchState>;
  return {
    ...base, ...r,
    unlocked: { ...(r.unlocked ?? {}) }, helpTopics: [...(r.helpTopics ?? [])], season: { ...base.season, ...(r.season ?? {}) },
    n: { ...(r.n ?? {}) }, seen: Object.fromEntries(Object.entries(r.seen ?? {}).map(([k, v]) => [k, [...v]])),
  };
}

/**
 * Metas numéricas: fonte única para destravar e para mostrar o progresso.
 * Calibradas para ~15 min por temporada (ver docs/DESIGN.md, "Ritmo das conquistas").
 */
const COUNT: Record<string, { goal: number; read: (s: AchState) => number }> = {
  'mao-na-massa': { goal: 50, read: (s) => s.subs },
  'negocio-fechado': { goal: 10, read: (s) => s.n.sold ?? 0 },
  'daqui-ninguem-sai': { goal: 3, read: (s) => s.n.covers ?? 0 },
  'caneta-na-mao': { goal: 15, read: (s) => s.n.renewals ?? 0 },
  muralha: { goal: 50, read: (s) => s.n.cleanWins ?? 0 },
  'de-virada': { goal: 30, read: (s) => s.n.comebacks ?? 0 },
  'jogo-limpo': { goal: 75, read: (s) => s.n.cardless ?? 0 },
  'joia-lapidada': { goal: 20, read: (s) => s.seen.jewels?.length ?? 0 },
  'classico-do-sofa': { goal: 250, read: (s) => s.simulated },
  'relogio-suico': { goal: 6, read: (s) => s.n.cleanMonths ?? 0 },
  'no-azul': { goal: 60, read: (s) => s.monthsBlue },
  'casa-cheia': { goal: 15, read: (s) => s.n.sellouts ?? 0 },
  folego: { goal: 500, read: (s) => s.matches },
  'missao-cumprida': { goal: 10, read: (s) => s.n.objectives ?? 0 },
  subiu: { goal: 3, read: (s) => s.n.promotions ?? 0 },
  atropelo: { goal: 3, read: (s) => s.n.bigWins ?? 0 },
  invicto: { goal: 15, read: (s) => s.unbeaten },
  'chuteira-de-ouro': { goal: 5, read: (s) => s.n.topScorers ?? 0 },
  'prata-da-casa': { goal: 15, read: (s) => s.seen.youth?.length ?? 0 },
  'cofre-cheio': { goal: 5, read: (s) => s.n.richSeasons ?? 0 },
  'temporada-sem-vermelho': { goal: 3, read: (s) => s.n.redlessSeasons ?? 0 },
  'narrador-de-plantao': { goal: 300, read: (s) => s.watched },
  'mestre-das-trocas': { goal: 1000, read: (s) => s.subs },
  campeao: { goal: 5, read: (s) => s.n.titles ?? 0 },
  'lenda-viva': { goal: 5, read: (s) => s.n.rep90Seasons ?? 0 },
  centenario: { goal: 500, read: (s) => s.wins },
  'casamento': { goal: 5, read: (s) => s.n.sameClub ?? 0 },
  'uma-decada': { goal: 10, read: (s) => s.n.sameClub ?? 0 },
};

/** Progresso de uma conquista numérica (para mostrar as que estão perto de sair). */
export function progressOf(s: AchState, id: string): { cur: number; goal: number } | null {
  const c = COUNT[id];
  return c ? { cur: Math.min(c.goal, c.read(s)), goal: c.goal } : null;
}

/** Ids numéricos cuja meta já foi alcançada. */
const reached = (s: AchState) => Object.entries(COUNT).filter(([, c]) => c.read(s) >= c.goal).map(([id]) => id);

const inc = (s: AchState, key: string, by = 1) => { s.n[key] = (s.n[key] ?? 0) + by; };
const see = (s: AchState, key: string, ids: string[]) => {
  const set = new Set(s.seen[key] ?? []);
  for (const id of ids) set.add(id);
  s.seen[key] = [...set];
};

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
  if (won && ga === 0) inc(s, 'cleanWins');
  if (won && behind) inc(s, 'comebacks');
  if (myCards.length === 0) inc(s, 'cardless');
  if (won && gf - ga >= 5) inc(s, 'bigWins');
  see(s, 'jewels', played.filter(isProspect).map((p) => p.id));
  see(s, 'youth', played.filter((p) => p.fromYouth).map((p) => p.id));

  // fim do turno (rodada 11 de 22): em último?
  const c = f.career;
  if (c.season.round === Math.floor(c.roundDates.length / 2) && club) {
    const d = divisionOf(c, club.id);
    const table = c.season.divisions[d]!;
    const pts = (id: string) => standing(c, d, id);
    const last = [...table.teamIds].sort((a, b) => pts(a) - pts(b))[0];
    if (last === club.id) s.season.lastAtTurn = true;
  }
  if (f.side === 'home' && club) {
    const home = f.career.clubs[f.homeId], away = f.career.clubs[f.awayId];
    if (home && away && lastAttendance(home, away) >= home.stadium) inc(s, 'sellouts');
  }

  // a primeira hora tem poucas e rápidas; o resto vem de contadores (COUNT)
  const ids: string[] = ['primeiro-apito'];
  if (won) ids.push('primeira-vitoria');
  if (f.watched) ids.push('ouvido-colado');
  if (won && played.filter((p) => temperament(p) === 'racudo').length >= 3) ids.push('na-raca');
  return unlockAll(s, [...ids, ...reached(s)], now);
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
  if (m.achieved) inc(s, 'objectives');
  if (m.promoted) inc(s, 'promotions');
  if (f.topScorerMine) inc(s, 'topScorers');
  if (f.budgetAfterPrize > f.payrollYear) inc(s, 'richSeasons');
  if (title) inc(s, 'titles');
  if (s.season.year === f.year && s.season.reds === 0 && s.matches > 0) inc(s, 'redlessSeasons');
  if (after.entrepreneur.reputation >= 90) inc(s, 'rep90Seasons');
  if (m.achieved && f.trainingCenter >= 5) ids.push('ct-de-primeiro-mundo');
  if (title && top) ids.push('elite');
  if (title && f.lost === 0) ids.push('temporada-perfeita');
  if (top && f.lost === 0) ids.push('invencivel-na-elite');
  if (s.season.year === f.year && s.season.lastAtTurn && !m.relegated && m.division < 3) ids.push('salvador');
  if (s.firedLast && m.achieved && !m.fired) ids.push('volta-por-cima');
  s.firedLast = m.fired ? true : m.achieved ? false : s.firedLast;

  const h = after.entrepreneur.history; // mais recente primeiro
  let same = 0;
  while (same < h.length && h[same]!.orgName === h[0]!.orgName) same++;
  s.n.sameClub = m.fired ? 0 : same;
  if (h.length >= 2 && h[0]!.position === 1 && h[1]!.position === 1) ids.push('bicampeao');
  if (h.filter((x) => x.position === 1 && x.division === 1).length >= 4) ids.push('tetra');
  const startedBottom = h.length > 0 && h[h.length - 1]!.division === 4;
  const nowTop = h.some((x) => x.division === 1) || (!after.unemployed && divisionOf(after, myClubId(after)) === 0);
  if (h.some((x) => x.division === 4) && nowTop) ids.push('escalada');
  if (startedBottom) {
    const oldestFirst = [...h].reverse();
    const i = oldestFirst.findIndex((x) => x.position === 1 && x.division === 1);
    if (i >= 0 && i < 5) ids.push('do-po-ao-topo');
  }
  return unlockAll(s, [...ids, ...stateIds(after), ...reached(s)], now);
}

// ---------------------------------------------------------------- estado geral

/** Conquistas que dependem só do estado atual da carreira. */
function stateIds(c: Career): string[] {
  const ids: string[] = [];
  const e = c.entrepreneur;
  if (c.offers.some((o) => o.clubId === NOVA_IGUACU_ID)) ids.push('laranja-da-baixada');
  if (e.cash >= 10_000_000) ids.push('magnata');
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
  if (sold > 0) {
    const now2 = new Set(club?.players.map((p) => p.id) ?? []);
    inc(s, 'sold', Math.max(1, before.players.filter((id) => !now2.has(id)).length));
  }
  if (sold >= 5_000_000) ids.push('venda-milionaria');
  if (before.loanMonthsLeft > 0 && !c.loan && club?.id === before.clubId) ids.push('nome-limpo');
  if (decision?.kind === 'bid' && decision.choice === 'cover') inc(s, 'covers');
  if (decision?.kind === 'renewal' && decision.choice === 'accept') inc(s, 'renewals');
  return unlockAll(s, [...ids, ...stateIds(c), ...reached(s)], now);
}

// ---------------------------------------------------------------- tempo e ajuda

/** Virada de mês. `clean` = o mês inteiro passou sem pausa manual. */
export function onMonth(s: AchState, c: Career, clean: boolean, now = new Date().toISOString()): string[] {
  const club = c.clubs[myClubId(c)];
  s.monthsBlue = club && club.budget >= 0 ? s.monthsBlue + 1 : 0;
  s.n.cleanMonths = clean ? (s.n.cleanMonths ?? 0) + 1 : 0;
  return unlockAll(s, [...stateIds(c), ...reached(s)], now);
}

export function onHelpTopic(s: AchState, topic: string, now = new Date().toISOString()): string[] {
  if (!s.helpTopics.includes(topic)) s.helpTopics.push(topic);
  return unlockAll(s, s.helpTopics.length >= HELP_TOPIC_COUNT ? ['licao-de-casa'] : [], now);
}
