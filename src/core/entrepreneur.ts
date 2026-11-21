/**
 * Empreendedor esportivo (GDD 2.2, 2.6, 2.7, 2.11).
 * Agnóstico de esporte: a mesma pessoa pode, no futuro, ter carreiras em
 * modalidades diferentes. Patrimônio pessoal é SEPARADO do caixa das organizações.
 */
export type BondType = 'contratado' | 'socio' | 'proprietario';

export interface Bond {
  orgId: string;
  sport: string;
  type: BondType;
  /** Participação societária 0–1 (0 para contratado). */
  share: number;
  /** Salário mensal pago pela organização ao empreendedor (se contratado). */
  monthlySalary: number;
  since: string;
  objective: SeasonObjective;
  /**
   * Cobrança da diretoria: −1 (tolerante) a +2 (máxima). Sobe quando você cumpre a meta
   * (depois de um título vai ao máximo) e desce quando falha. Sobe a meta da temporada seguinte.
   */
  pressure?: number;
  /** Metas secundárias da temporada: dão bônus, nunca demitem. */
  goals?: SideGoal[];
}

export interface SideGoal {
  kind: string;
  label: string;
  /** Alvo numérico; `dir` diz se é para chegar a ele ('max') ou não passar dele ('min'). */
  target: number;
  dir: 'max' | 'min';
}

export const PRESSURE_LABEL: Record<number, string> = { [-1]: 'Tolerante', 0: 'Normal', 1: 'Alta', 2: 'Máxima' };

export type SeasonObjective = 'titulo' | 'acesso' | 'meio' | 'permanencia';

export const OBJECTIVE_LABEL: Record<SeasonObjective, string> = {
  titulo: 'Conquistar o título',
  acesso: 'Conquistar o acesso',
  meio: 'Terminar no meio da tabela',
  permanencia: 'Evitar o rebaixamento',
};

export interface Entrepreneur {
  name: string;
  /** Patrimônio pessoal: dinheiro disponível. */
  cash: number;
  /** 0–100, reconhecimento do mercado. */
  reputation: number;
  /** 0–100, acumulada por temporadas, crises e negociações. */
  experience: number;
  bonds: Bond[];
  history: CareerEntry[];
}

export interface CareerEntry {
  year: number;
  orgName: string;
  division: number;
  position: number;
  objective: SeasonObjective;
  achieved: boolean;
}

export function netWorth(e: Entrepreneur, orgValue: (orgId: string) => number): number {
  return e.cash + e.bonds.reduce((a, b) => a + b.share * orgValue(b.orgId), 0);
}

/** Avalia se o objetivo foi cumprido dado posição final, nº de times e nº de vagas de acesso/queda. */
export function objectiveAchieved(obj: SeasonObjective, pos: number, teams: number, isTopDivision: boolean, isBottomDivision: boolean, swap = 2): boolean {
  switch (obj) {
    case 'titulo': return pos === 1;
    case 'acesso': return isTopDivision ? pos <= 3 : pos <= swap;
    case 'meio': return pos <= Math.ceil(teams / 2) + 1;
    case 'permanencia': return isBottomDivision ? pos <= teams - 2 : pos <= teams - swap;
  }
}
