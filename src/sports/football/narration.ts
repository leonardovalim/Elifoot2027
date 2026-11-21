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
  penaltyFoul: ['PÊNALTI! {f} derruba dentro da área.', 'Pênalti marcado! {f} chega atrasado na área.', 'O juiz aponta a marca da cal: falta de {f}!'],
  penaltyRed: ['E a falta da expulsão de {f} foi dentro da área: PÊNALTI!', 'Pênalti! O lance que expulsou {f} foi na área.'],
  penaltyGoal: ['GOL de pênalti! {p} bate firme e não dá chance.', 'É GOL! {p} cobra no canto, goleiro para um lado e bola para o outro.'],
  penaltySave: ['{k} DEFENDE O PÊNALTI de {p}!', 'Pegou! {k} voa e defende a cobrança de {p}!'],
  injury: ['{p} sente a lesão e pede para sair.', 'Lesão! {p} cai no gramado e não tem condição de seguir.', '{p} sai de maca. Preocupação no banco.'],
} as const;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function narrate(e: MatchEvent): string {
  switch (e.type) {
    case 'half': return 'Fim do primeiro tempo.';
    case 'extra': return 'Empate no tempo normal: vai para a prorrogação!';
    case 'penalty': {
      const list = e.reason === 'expulsão' ? T.penaltyRed : T.penaltyFoul;
      const base = list[hash(e.playerId + e.minute) % list.length]!.replace('{f}', e.foulerName);
      return `${base} ${e.playerName} vai para a cobrança.`;
    }
    case 'end': return 'Fim de jogo!';
    case 'tactic': return e.text;
    case 'sub': return `Substituição: sai ${e.playerName}${e.reason === 'cansaço' ? ' (cansado)' : e.reason === 'lesão' ? ' (lesionado)' : ''}, entra ${e.inName}.`;
    case 'injury': {
      const list = T.injury;
      const base = list[hash(e.playerId + e.minute) % list.length]!.replace('{p}', e.playerName);
      return `${base} Fora por ${e.rounds} ${e.rounds === 1 ? 'rodada' : 'rodadas'}.`;
    }
    case 'goal': {
      if (e.penalty) return T.penaltyGoal[hash(e.playerId + e.minute) % T.penaltyGoal.length]!.replace('{p}', e.playerName);
      const list = T.goal;
      const base = list[hash(e.playerId + e.minute) % list.length]!.replace('{p}', e.playerName);
      return e.assistName ? `${base} Passe de ${e.assistName}.` : base;
    }
    case 'save': {
      if (e.penalty) return T.penaltySave[hash(e.playerId + e.minute) % T.penaltySave.length]!.replace('{p}', e.playerName).replace('{k}', e.keeperName);
      const list = T.save;
      return list[hash(e.playerId + e.minute) % list.length]!.replace('{p}', e.playerName).replace('{k}', e.keeperName);
    }
    default: {
      if ('penalty' in e && e.penalty) return e.type === 'miss' ? `${e.playerName} manda o pênalti para fora!` : `${e.playerName} cobra e acerta ${e.type === 'post' ? 'a trave' : 'o travessão'}! Pênalti perdido.`;
      const list = T[e.type];
      return list[hash(e.playerId + e.minute) % list.length]!.replace('{p}', e.playerName);
    }
  }
}

/** Eventos que merecem narração (GDD: narrar só o relevante). */
export const isNarrated = (e: MatchEvent) => e.type !== 'miss' || !!e.penalty;
