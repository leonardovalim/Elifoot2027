import type { Rng } from '../../core/rng';
import { WEIGHTS } from './lineup';
import type { AttrKey, Attributes, Club, Player, Position } from './types';

// Clubes e atletas 100% fictícios (GDD 1.8).
const FIRST = ['João','Pedro','Lucas','Mateus','Gabriel','Rafael','Bruno','Diego','Felipe','Thiago','Caio','Vitor','Igor','André','Daniel','Rodrigo','Leandro','Marcelo','Fábio','Renan','Otávio','Hugo','Davi','Enzo','Kauã','Murilo','Samuel','Wesley','Alan','Breno','Cristian','Danilo','Everton','Gustavo','Henrique','Ítalo','Juan','Kleber','Luan','Nícolas','Paulo','Ramon','Sandro','Tiago','Ulisses','Valdir','Wagner','Yuri'];
const LAST = ['Silva','Souza','Costa','Santos','Oliveira','Pereira','Lima','Carvalho','Ferreira','Rodrigues','Almeida','Nascimento','Araújo','Ribeiro','Gomes','Martins','Rocha','Barbosa','Moura','Teixeira','Cardoso','Correia','Dias','Freitas','Mendes','Nunes','Pinto','Ramos','Vieira','Campos','Batista','Farias','Monteiro','Peixoto','Queiroz','Rezende','Siqueira','Tavares','Xavier','Brandão','Assis','Bezerra','Coelho','Duarte','Esteves','Fontes','Godoy','Macedo'];
const NICK = ['Zé','Didi','Tico','Neném','Biro','Pelado','Juninho','Fumaça','Toninho','Guga','Nenê','Bebeto','Careca','Dudu','Lelê'];
const CITIES = ['Vila Serena','Porto Alto','Campo Belo','Rio Claro','Serra Azul','Santa Aurora','Nova Esperança','Pedra Branca','Boa Vista','Lagoa Seca','Monte Verde','Três Rios','Vale do Sol','Ribeirão Fundo','Bela Vista','São Bento','Alto Paraíso','Mar Grande','Ouro Fino','Cachoeira','Forte do Norte','Jardim','Pontal','Marambaia','Itapuã','Areia Branca','Águas Claras','Cruzeiro do Leste','Palmeiral','Bonfim','Colinas','Três Pontas','Barra Funda','Pinheiral','Riacho Fundo','Planalto','Céu Azul','Estrela','Ventania','Maré Alta','Itaúna','Pirapora','Serrinha','Ponte Nova','Campina','Juazeiro','Remanso','Cajazeiras'];
const PREFIX = ['Atlético','Esporte Clube','União','Sport','Real','Associação','Grêmio','Operário','Ferroviário','Comercial'];
const COLORS: [string, string][] = [
  ['#c8323c','#ffffff'],['#2f5fbf','#ffffff'],['#2e8b4a','#ffffff'],['#222222','#ffffff'],
  ['#e8b62c','#222222'],['#7a3fa0','#ffffff'],['#e5762a','#222222'],['#1f8f99','#ffffff'],
  ['#b8326e','#ffffff'],['#6b4a32','#f6e7b0'],['#2b3a8f','#e8b62c'],['#ffffff','#c8323c'],
];

const uid = (prefix: string, rng: Rng) =>
  `${prefix}${rng.int(0, 2 ** 31).toString(36)}${rng.int(0, 2 ** 31).toString(36)}`;
const clamp = (v: number) => Math.max(1, Math.min(99, Math.round(v)));

export function playerName(rng: Rng): string {
  return rng.chance(0.08) ? `${rng.pick(NICK)} ${rng.pick(LAST)}` : `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

const ATTRS: AttrKey[] = ['pace','strength','stamina','passing','finishing','firstTouch','tackling','decisions','positioning','concentration','goalkeeping'];

export function generatePlayer(rng: Rng, position: Position, level: number, age?: number, contractYear = 2027): Player {
  const a = age ?? rng.int(17, 34);
  const ageFactor = a < 23 ? -6 + (a - 17) : a > 31 ? -(a - 31) * 1.5 : 0;
  const base = level + ageFactor + rng.gaussian() * 5;
  const relevant = WEIGHTS[position];
  const attrs = {} as Attributes;
  for (const k of ATTRS) {
    const w = relevant[k] ?? 0;
    // atributos da posição ficam perto do nível; os demais, bem abaixo
    const offset = k === 'goalkeeping' && position !== 'GK' ? -45 : w > 0 ? 4 + w * 10 : -12;
    attrs[k] = clamp(base + offset + rng.gaussian() * 7);
  }
  // físicos caem com a idade
  if (a > 30) { attrs.pace = clamp(attrs.pace - (a - 30) * 2); attrs.stamina = clamp(attrs.stamina - (a - 30) * 1.5); }
  const p: Player = {
    id: uid('p', rng),
    name: playerName(rng),
    age: a,
    position,
    attrs,
    potential: 0,
    condition: rng.int(85, 100),
    aggression: clamp(50 + rng.gaussian() * 18),
    wage: 0,
    contractUntil: contractYear + rng.int(0, 3),
    suspended: 0,
    stats: { apps: 0, goals: 0, ratingSum: 0 },
  };
  const ovr = positionRating(p);
  const growth = a < 24 ? (24 - a) * rng.int(1, 3) : 0;
  p.potential = clamp(ovr + growth);
  p.wage = wageFor(p);
  return p;
}

function positionRating(p: Player) {
  let r = 0;
  for (const [k, w] of Object.entries(WEIGHTS[p.position])) r += p.attrs[k as AttrKey] * w!;
  return r;
}

export function playerValue(p: Player): number {
  const best = positionRating(p);
  const ageMult = p.age <= 23 ? 1.4 : p.age <= 28 ? 1.15 : p.age <= 31 ? 0.85 : 0.5;
  const potBonus = p.age <= 23 ? 1 + Math.max(0, p.potential - best) / 60 : 1;
  return Math.round((best ** 3 * 4 * ageMult * potBonus) / 1000) * 1000;
}

/** Salário mensal. */
export function wageFor(p: Player): number {
  return Math.max(2000, Math.round(playerValue(p) / 100 / 100) * 100);
}

const SQUAD: Position[] = ['GK','GK','DF','DF','DF','DF','DF','DF','DF','MF','MF','MF','MF','MF','MF','MF','FW','FW','FW','FW'];

export function generateClub(rng: Rng, city: string, level: number, colors: [string, string]): Club {
  const prefix = rng.pick(PREFIX);
  const name = `${prefix} ${city}`;
  const words = city.split(' ').filter((w) => w.length > 2);
  const short = (prefix[0]! + words.map((w) => w[0]).join('')).slice(0, 3).toUpperCase();
  return {
    id: uid('c', rng),
    name,
    short,
    city,
    founded: rng.int(1900, 1985),
    colors,
    players: SQUAD.map((pos) => generatePlayer(rng, pos, level)),
    formation: '4-4-2',
    style: 'balanced',
    budget: Math.round((level ** 3 * 8) / 10000) * 10000,
    reputation: Math.max(5, Math.min(95, Math.round((level - 35) * 1.6 + rng.gaussian() * 4))),
    fans: Math.round(level ** 2 * 3.2),
    stadium: Math.round((level ** 2 * 4.5) / 1000) * 1000 + 3000,
    stadiumName: `Estádio ${rng.chance(0.5) ? 'Municipal de' : 'do'} ${city}`,
    ticketPrice: Math.round(level / 3),
    trainingCenter: Math.max(1, Math.min(5, Math.round((level - 30) / 10))),
    titles: [],
  };
}

export const DIVISIONS = 4;
export const PER_DIVISION = 12;
export const divisionLevel = (d: number) => 72 - d * 9;

export function generateWorld(rng: Rng): Club[][] {
  const names = rng.shuffle(CITIES).slice(0, DIVISIONS * PER_DIVISION);
  const result: Club[][] = [];
  for (let d = 0; d < DIVISIONS; d++) {
    const clubs: Club[] = [];
    for (let i = 0; i < PER_DIVISION; i++) {
      const level = divisionLevel(d) + rng.gaussian() * 3;
      clubs.push(generateClub(rng, names[d * PER_DIVISION + i]!, level, rng.pick(COLORS)));
    }
    result.push(clubs);
  }
  ensureNovaIguacu(result);
  return result;
}

/** Clube fixo de todo mundo gerado (conquista secreta "Laranja da Baixada"). */
export const NOVA_IGUACU = 'Nova Iguaçu';

/**
 * Um dos 48 clubes vira o Nova Iguaçu: a vaga sai dos ids já gerados, sem consumir o RNG,
 * então o resto do mundo fica idêntico para a mesma seed.
 */
function ensureNovaIguacu(world: Club[][]) {
  const all = world.flat();
  const slot = all.reduce((h, c) => (h * 31 + c.id.charCodeAt(c.id.length - 1)) >>> 0, 7) % all.length;
  const club = all[slot]!;
  club.name = NOVA_IGUACU;
  club.city = NOVA_IGUACU;
  club.short = 'NIG';
  club.colors = ['#f07a1a', '#ffffff'];
}

export const FIRST_NAMES = FIRST;
