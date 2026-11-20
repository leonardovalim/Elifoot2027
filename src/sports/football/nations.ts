import type { Rng } from '../../core/rng';
import type { Player } from './types';

/**
 * Nacionalidades (Elifoot 98 tinha bandeirinha em cada atleta). A liga é brasileira:
 * a maioria é do Brasil, uns 8% vêm de fora; os clubes estrangeiros da competição
 * continental têm elenco do próprio país. Tudo fictício.
 */
export type Country = 'BRA' | 'ARG' | 'URU' | 'PAR' | 'CHI' | 'COL' | 'PER' | 'EQU' | 'POR';

export const COUNTRY_NAME: Record<Country, string> = {
  BRA: 'Brasil', ARG: 'Argentina', URU: 'Uruguai', PAR: 'Paraguai', CHI: 'Chile',
  COL: 'Colômbia', PER: 'Peru', EQU: 'Equador', POR: 'Portugal',
};

export const nationalityOf = (p: Pick<Player, 'nationality'>): Country => p.nationality ?? 'BRA';
export const isForeigner = (p: Pick<Player, 'nationality'>) => nationalityOf(p) !== 'BRA';

const HISP_FIRST = ['Matías', 'Facundo', 'Nicolás', 'Santiago', 'Agustín', 'Lautaro', 'Gonzalo', 'Joaquín', 'Federico', 'Emiliano', 'Rodrigo', 'Sebastián', 'Martín', 'Franco', 'Ignacio', 'Diego', 'Cristian', 'Julián', 'Esteban', 'Mauricio', 'Andrés', 'Camilo', 'Luis', 'Jorge', 'Óscar', 'Hernán', 'Walter', 'Maximiliano'];
const HISP_LAST = ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Pérez', 'Gómez', 'Sánchez', 'Romero', 'Sosa', 'Torres', 'Álvarez', 'Ruiz', 'Ramírez', 'Flores', 'Benítez', 'Acosta', 'Medina', 'Herrera', 'Suárez', 'Aguirre', 'Giménez', 'Cabrera', 'Ríos', 'Vargas', 'Castro', 'Morales', 'Ortiz', 'Cáceres', 'Villalba'];
const POR_FIRST = ['Tiago', 'Rui', 'Nuno', 'Bernardo', 'Gonçalo', 'Duarte', 'Afonso', 'Tomás', 'Vasco', 'Simão', 'Diogo', 'Ricardo'];
const POR_LAST = ['Fonseca', 'Magalhães', 'Sequeira', 'Antunes', 'Lopes', 'Moreira', 'Carneiro', 'Gaspar', 'Neves', 'Pacheco', 'Sobral', 'Valente'];

/** Estrangeiros na liga brasileira: de onde costumam vir (pesos). */
const IMPORT_WEIGHTS: [Country, number][] = [['ARG', 30], ['URU', 20], ['PAR', 15], ['COL', 12], ['CHI', 8], ['POR', 8], ['PER', 4], ['EQU', 3]];
export const FOREIGN_SHARE = 0.08;

/** Hash estável de texto (FNV-1a): decide nacionalidade sem gastar o RNG do mundo. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const pickBy = <T,>(xs: readonly T[], h: number) => xs[h % xs.length]!;

export function nameFor(country: Country, h: number): string {
  if (country === 'POR') return `${pickBy(POR_FIRST, h)} ${pickBy(POR_LAST, h >>> 7)}`;
  return `${pickBy(HISP_FIRST, h)} ${pickBy(HISP_LAST, h >>> 7)}`;
}

/**
 * Atleta gerado para clube brasileiro: ~8% viram estrangeiros (com nome do país).
 * Usa o id como semente, então o resto do mundo sai igual.
 */
export function maybeImport(p: Player) {
  const h = hash(p.id);
  if ((h % 1000) / 1000 >= FOREIGN_SHARE) return;
  const total = IMPORT_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  let r = (h >>> 10) % total;
  const country = IMPORT_WEIGHTS.find(([, w]) => (r -= w) < 0)![0];
  p.nationality = country;
  p.name = nameFor(country, hash(p.id + country));
}

/** Atleta de clube estrangeiro: nacionalidade e nome do país do clube. */
export function naturalize(p: Player, country: Country, rng: Rng) {
  p.nationality = country;
  p.name = nameFor(country, rng.int(0, 2 ** 30));
}

// ---------------------------------------------------------------- clubes estrangeiros

export const FOREIGN_CLUBS: { country: Country; cities: string[]; prefixes: string[] }[] = [
  { country: 'ARG', cities: ['San Ramón', 'Villa Alta', 'Las Lomas'], prefixes: ['Club Atlético', 'Racing', 'Deportivo', 'Sportivo'] },
  { country: 'URU', cities: ['Piedras Blancas', 'Cerro Chico'], prefixes: ['Club', 'Defensor'] },
  { country: 'PAR', cities: ['Itá Verá'], prefixes: ['Sportivo'] },
  { country: 'CHI', cities: ['Valle Hondo', 'Puerto Frío'], prefixes: ['Club Deportivo', 'Unión'] },
  { country: 'COL', cities: ['Santa Clara', 'Río Verde'], prefixes: ['Atlético', 'Independiente'] },
  { country: 'PER', cities: ['Costa Azul'], prefixes: ['Sporting'] },
  { country: 'EQU', cities: ['Guayacán'], prefixes: ['Liga Deportiva'] },
];

// ---------------------------------------------------------------- bandeiras

/** Bandeira em faixas (SVG pixelado; emoji de bandeira não aparece no Windows). */
export interface FlagSpec { dir: 'h' | 'v'; bands: [string, number][]; extra?: 'bra' | 'chi' | 'uru' }

export const FLAGS: Record<Country, FlagSpec> = {
  BRA: { dir: 'h', bands: [['#1e9e4a', 1]], extra: 'bra' },
  ARG: { dir: 'h', bands: [['#74acdf', 1], ['#ffffff', 1], ['#74acdf', 1]] },
  URU: { dir: 'h', bands: [['#ffffff', 1], ['#2f6bd1', 1], ['#ffffff', 1], ['#2f6bd1', 1], ['#ffffff', 1]], extra: 'uru' },
  PAR: { dir: 'h', bands: [['#d52b1e', 1], ['#ffffff', 1], ['#0038a8', 1]] },
  CHI: { dir: 'h', bands: [['#ffffff', 1], ['#d52b1e', 1]], extra: 'chi' },
  COL: { dir: 'h', bands: [['#fcd116', 2], ['#003893', 1], ['#ce1126', 1]] },
  PER: { dir: 'v', bands: [['#d91023', 1], ['#ffffff', 1], ['#d91023', 1]] },
  EQU: { dir: 'h', bands: [['#ffdd00', 2], ['#034ea2', 1], ['#ed1c24', 1]] },
  POR: { dir: 'v', bands: [['#006600', 2], ['#ff0000', 3]] },
};
