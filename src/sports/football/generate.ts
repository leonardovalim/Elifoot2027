import type { Rng } from '../../core/rng';
import type { Club, Player, Position } from './types';

// Clubes e jogadores 100% fictícios.
const FIRST = ['João','Pedro','Lucas','Mateus','Gabriel','Rafael','Bruno','Diego','Felipe','Thiago','Caio','Vitor','Igor','André','Daniel','Rodrigo','Leandro','Marcelo','Fábio','Renan','Otávio','Hugo','Davi','Enzo','Kauã','Murilo','Samuel','Wesley','Alan','Breno','Cristian','Danilo','Everton','Gustavo','Henrique','Ítalo','Juan','Kleber','Luan','Nícolas'];
const LAST = ['Silva','Souza','Costa','Santos','Oliveira','Pereira','Lima','Carvalho','Ferreira','Rodrigues','Almeida','Nascimento','Araújo','Ribeiro','Gomes','Martins','Rocha','Barbosa','Moura','Teixeira','Cardoso','Correia','Dias','Freitas','Mendes','Nunes','Pinto','Ramos','Vieira','Campos','Batista','Farias','Monteiro','Peixoto','Queiroz','Rezende','Siqueira','Tavares','Xavier','Brandão'];
const CITIES = ['Vila Serena','Porto Alto','Campo Belo','Rio Claro','Serra Azul','Santa Aurora','Nova Esperança','Pedra Branca','Boa Vista','Lagoa Seca','Monte Verde','Três Rios','Vale do Sol','Ribeirão Preto','Bela Vista','São Bento','Alto Paraíso','Mar Grande','Ouro Fino','Cachoeira','Fortaleza do Norte','Jardim','Pontal','Marambaia','Itapuã','Areia Branca','Águas Claras','Cruzeiro do Leste','Palmeiral','Bonfim','Colinas','Três Pontas','Barra Funda','Pinheiral','Riacho Fundo','Planalto','Céu Azul','Estrela','Ventania','Maré Alta','Itaúna','Pirapora','Serrinha','Ponte Nova','Campina','Juazeiro','Remanso','Cajazeiras'];
const SUFFIX = ['FC','EC','AC','SC','Atlético','Esporte Clube','União','Sport','Futebol Clube','Real'];
const COLORS: [string, string][] = [
  ['#c62828','#ffffff'],['#1565c0','#ffffff'],['#2e7d32','#ffffff'],['#000000','#ffffff'],
  ['#f9a825','#000000'],['#6a1b9a','#ffffff'],['#ef6c00','#000000'],['#00838f','#ffffff'],
  ['#ad1457','#ffffff'],['#4e342e','#ffffd0'],['#283593','#f9a825'],['#ffffff','#c62828'],
];

// IDs derivados só do RNG → mesmo seed, mesmos IDs (determinismo para o online).
const uid = (prefix: string, rng: Rng) =>
  `${prefix}${rng.int(0, 2 ** 31).toString(36)}${rng.int(0, 2 ** 31).toString(36)}`;

const clamp = (v: number) => Math.max(1, Math.min(99, Math.round(v)));

export function generatePlayer(rng: Rng, position: Position, level: number, age?: number): Player {
  const a = age ?? rng.int(17, 34);
  // jovens têm teto maior; veteranos já estão no pico ou em queda
  const ageFactor = a < 23 ? -6 + (a - 17) : a > 31 ? -(a - 31) * 1.5 : 0;
  const base = level + ageFactor + rng.gaussian() * 5;
  const main = clamp(base + 8);
  const off = () => clamp(base - 18 + rng.gaussian() * 8);
  const p: Player = {
    id: uid('p', rng),
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    age: a,
    position,
    attack: position === 'FW' ? main : position === 'MF' ? clamp(base) : off(),
    defense: position === 'DF' ? main : position === 'MF' ? clamp(base - 4) : off(),
    passing: position === 'MF' ? main : clamp(base - 8 + rng.gaussian() * 6),
    goalkeeping: position === 'GK' ? main : clamp(5 + rng.next() * 10),
    aggression: clamp(50 + rng.gaussian() * 18),
    potential: 0,
    wage: 0,
    contractRounds: rng.int(20, 80),
    suspendedRounds: 0,
  };
  const growth = a < 24 ? (24 - a) * rng.int(1, 3) : 0;
  p.potential = clamp(Math.max(main, main + growth));
  p.wage = wageFor(p);
  return p;
}

export function playerValue(p: Player): number {
  const best = Math.max(p.attack, p.defense, p.passing, p.goalkeeping);
  const ageMult = p.age <= 23 ? 1.4 : p.age <= 28 ? 1.15 : p.age <= 31 ? 0.85 : 0.5;
  return Math.round((best ** 3 * 4 * ageMult) / 1000) * 1000;
}

export function wageFor(p: Player): number {
  return Math.max(500, Math.round(playerValue(p) / 165 / 100) * 100);
}

const SQUAD: Position[] = ['GK','GK','DF','DF','DF','DF','DF','DF','MF','MF','MF','MF','MF','MF','FW','FW','FW','FW'];

export function generateClub(rng: Rng, name: string, level: number, colors: [string, string]): Club {
  const short = name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return {
    id: uid('c', rng),
    name,
    short,
    colors,
    players: SQUAD.map((pos) => generatePlayer(rng, pos, level)),
    formation: '4-4-2',
    style: 'balanced',
    budget: Math.round((level ** 3 * 8) / 1000) * 1000,
    fans: Math.round(level ** 2 * 3.2),
    stadium: Math.round((level ** 2 * 4.5) / 1000) * 1000 + 3000,
    ticketPrice: Math.round(level / 3),
  };
}

/** 4 divisões x 12 clubes, nível decrescente por divisão. */
export function generateWorld(rng: Rng, divisions = 4, perDivision = 12): Club[][] {
  const names = rng.shuffle(CITIES).slice(0, divisions * perDivision);
  const result: Club[][] = [];
  for (let d = 0; d < divisions; d++) {
    const base = 72 - d * 9;
    const clubs: Club[] = [];
    for (let i = 0; i < perDivision; i++) {
      const city = names[d * perDivision + i]!;
      const level = base + rng.gaussian() * 3;
      clubs.push(generateClub(rng, `${city} ${rng.pick(SUFFIX)}`, level, rng.pick(COLORS)));
    }
    result.push(clubs);
  }
  return result;
}
