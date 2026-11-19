import type { MatchEvent } from './types';

/**
 * Narração em texto (GDD 2.4). Só traduz eventos que o motor produziu — nunca
 * inventa lances. Variações escolhidas por hash do evento (não consome o RNG
 * da simulação, preservando o determinismo).
 */
const T = {
  goal: [
    'GOOOL! {p} balança a rede!',
    'É gol! {p} não perdoa!',
    'GOL! {p} finaliza com categoria!',
    'Gol de {p}! A torcida explode!',
  ],
  save: ['{p} bate firme e {k} faz defesaça!', 'Chute de {p}, {k} espalma!', '{p} finaliza no canto, mas {k} segura.'],
  post: ['Na trave! {p} quase marca!', 'Bola no poste! Que chance de {p}!'],
  bar: ['No travessão! {p} acerta a barra!', 'Uhhh! {p} carimba o travessão!'],
  miss: ['{p} chuta para fora.', '{p} isola a bola.'],
  yellow: ['Cartão amarelo para {p}.', '{p} é advertido com o amarelo.'],
  red: ['EXPULSO! {p} recebe o vermelho!', 'Vermelho para {p}! Time com um a menos.'],
} as const;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function narrate(e: MatchEvent): string {
  switch (e.type) {
    case 'half': return 'Fim do primeiro tempo.';
    case 'end': return 'Fim de jogo!';
    case 'tactic': return e.text;
    case 'sub': return `Substituição: sai ${e.playerName}${e.reason === 'cansaço' ? ' (cansado)' : ''}, entra ${e.inName}.`;
    case 'goal': {
      const list = T.goal;
      const base = list[hash(e.playerId + e.minute) % list.length]!.replace('{p}', e.playerName);
      return e.assistName ? `${base} Passe de ${e.assistName}.` : base;
    }
    case 'save': {
      const list = T.save;
      return list[hash(e.playerId + e.minute) % list.length]!.replace('{p}', e.playerName).replace('{k}', e.keeperName);
    }
    default: {
      const list = T[e.type];
      return list[hash(e.playerId + e.minute) % list.length]!.replace('{p}', e.playerName);
    }
  }
}

/** Eventos que merecem narração (GDD: narrar só o relevante). */
export const isNarrated = (e: MatchEvent) => e.type !== 'miss';
