export type Position = 'GK' | 'DF' | 'MF' | 'FW';

export interface Player {
  id: string;
  name: string;
  age: number;
  position: Position;
  /** Atributos 1–99. Diferente do Elifoot 98 (força única), cada setor usa um atributo. */
  attack: number;
  defense: number;
  passing: number;
  goalkeeping: number;
  /** Agressividade 1–99: mais desarmes, mais cartões. */
  aggression: number;
  /** Potencial máximo; jovens evoluem em direção a ele. */
  potential: number;
  wage: number;
  contractRounds: number;
  suspendedRounds: number;
}

export type Formation = '4-4-2' | '4-3-3' | '3-5-2' | '5-3-2' | '4-5-1' | '3-4-3' | '5-4-1';
export type Style = 'defensive' | 'balanced' | 'attacking';

export interface Club {
  id: string;
  name: string;
  short: string;
  colors: [string, string];
  players: Player[];
  formation: Formation;
  style: Style;
  budget: number;
  fans: number;
  stadium: number;
  ticketPrice: number;
}

export type MatchEvent =
  | { minute: number; type: 'goal'; side: 'home' | 'away'; playerId: string; playerName: string }
  | { minute: number; type: 'save' | 'miss' | 'post'; side: 'home' | 'away'; playerName: string }
  | { minute: number; type: 'yellow' | 'red'; side: 'home' | 'away'; playerId: string; playerName: string };
