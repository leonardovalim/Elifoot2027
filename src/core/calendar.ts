/** Datas como 'YYYY-MM-DD' (UTC) — serializáveis e determinísticas. */
export type IsoDate = string;

const toDate = (d: IsoDate) => new Date(d + 'T00:00:00Z');
const fmt = (d: Date): IsoDate => d.toISOString().slice(0, 10);

export function addDays(d: IsoDate, n: number): IsoDate {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}

export const yearOf = (d: IsoDate) => Number(d.slice(0, 4));
export const monthOf = (d: IsoDate) => Number(d.slice(5, 7));
export const dayOf = (d: IsoDate) => Number(d.slice(8, 10));
export const weekday = (d: IsoDate) => toDate(d).getUTCDay();

/** Primeiro domingo em/após a data. */
export function nextSunday(d: IsoDate): IsoDate {
  const w = weekday(d);
  return addDays(d, w === 0 ? 0 : 7 - w);
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function formatDate(d: IsoDate): string {
  return `${DIAS[weekday(d)]} ${dayOf(d)} ${MESES[monthOf(d) - 1]} ${yearOf(d)}`;
}

export type Phase = 'pre-temporada' | 'temporada' | 'encerramento' | 'entressafra';

export const PHASE_LABEL: Record<Phase, string> = {
  'pre-temporada': 'Pré-temporada',
  temporada: 'Temporada',
  encerramento: 'Encerramento',
  entressafra: 'Entressafra',
};
