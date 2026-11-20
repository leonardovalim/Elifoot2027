export type Position = 'GK' | 'DF' | 'MF' | 'FW';

/** GDD 3.2 — atributos 1–99 em três grupos + goleiro. */
export interface Attributes {
  // físicos
  pace: number;
  strength: number;
  stamina: number;
  // técnicos
  passing: number;
  finishing: number;
  firstTouch: number;
  tackling: number;
  // mentais
  decisions: number;
  positioning: number;
  concentration: number;
  // específico
  goalkeeping: number;
}

export type AttrKey = keyof Attributes;

export interface SeasonStats {
  apps: number;
  goals: number;
  ratingSum: number;
}

export interface Player {
  id: string;
  name: string;
  age: number;
  position: Position;
  attrs: Attributes;
  potential: number;
  /** Condição física 0–100. Cai com jogos, recupera com descanso. */
  condition: number;
  /** Agressividade 1–99: mais desarmes, mais cartões. */
  aggression: number;
  /** Salário mensal. */
  wage: number;
  contractUntil: number;
  suspended: number;
  stats: SeasonStats;
  /** Data de chegada ao clube atual (contratações) — mostra o selo "novo". */
  joinedOn?: string;
  /** Satisfação 0–100 (ausente = 70). Só é acompanhada no clube do jogador. */
  morale?: number;
  /** Último pedido de aumento (data), para não repetir toda hora. */
  raiseAskedOn?: string;
  /** Temporada em que já pediu renovação. */
  renewalAsked?: number;
  /** Não renovou: deixa o clube ao fim da temporada. */
  leaving?: boolean;
  /** Ídolo preso ao clube: nunca sai (sem mercado, propostas, venda, saída ou aposentadoria). */
  clubLocked?: boolean;
}

export type Formation = '4-4-2' | '4-3-3' | '3-5-2' | '5-3-2' | '4-5-1' | '3-4-3' | '5-4-1';
export type Style = 'defensive' | 'balanced' | 'attacking';

export interface Club {
  id: string;
  name: string;
  short: string;
  city: string;
  founded: number;
  colors: [string, string];
  players: Player[];
  formation: Formation;
  style: Style;
  /** Caixa da organização — separado do patrimônio do empreendedor (GDD 2.7). */
  budget: number;
  /** Reputação 0–100. */
  reputation: number;
  fans: number;
  stadium: number;
  stadiumName: string;
  ticketPrice: number;
  /** Nível do centro de treinamento 1–5: acelera evolução. */
  trainingCenter: number;
  titles: { year: number; competition: string }[];
  /** Escalação escolhida pelo jogador (ids). Ausente = auxiliar escala automaticamente. */
  lineup?: { xi: string[]; bench: string[] };
}

export type Side = 'home' | 'away';

export type MatchEvent =
  | { minute: number; type: 'goal'; side: Side; playerId: string; playerName: string; assistName?: string }
  | { minute: number; type: 'save'; side: Side; playerId: string; playerName: string; keeperName: string }
  | { minute: number; type: 'post' | 'bar' | 'miss'; side: Side; playerId: string; playerName: string }
  | { minute: number; type: 'yellow' | 'red'; side: Side; playerId: string; playerName: string }
  | { minute: number; type: 'sub'; side: Side; playerId: string; playerName: string; inName: string; inId: string; reason: 'cansaço' | 'tática' }
  | { minute: number; type: 'tactic'; side: Side; text: string }
  | { minute: number; type: 'half' | 'end' };

export interface TeamStats {
  shots: number;
  onTarget: number;
  corners: number;
  fouls: number;
  possessionMinutes: number;
}
