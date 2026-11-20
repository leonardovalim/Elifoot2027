import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { temperament } from '../sports/football/temperament';
import type { Player } from '../sports/football/types';
import { track } from './analytics';
import { Modal } from './util';
import { achieve } from './achievements';
import { onHelpTopic } from '../game/achievements';

/**
 * Ajuda do jogo ("Como jogar"). Abre pelo botão "?" do topo, pelo "Como jogar"
 * da tela inicial ou tocando num selo de atleta (vai direto à explicação dele).
 * O `<HelpHost />` fica uma vez na raiz do app, como o `<ConfirmHost />`.
 */
export type HelpTopic = 'jogo' | 'tempo' | 'partida' | 'elenco' | 'mercado' | 'financas' | 'temporada' | 'selos';
export type TagKind = 'novo' | 'susp' | 'posicao' | 'joia' | 'fim-contrato' | 'sai' | 'titular' | 'racudo' | 'fairplay';

type Request = { topic: HelpTopic; tag?: TagKind };
let show: ((r: Request) => void) | null = null;

export function openHelp(topic: HelpTopic = 'jogo', tag?: TagKind) {
  show?.({ topic, tag });
  track('help_opened', { topic, tag: tag ?? '' });
}

const TOPICS: { id: HelpTopic; label: string }[] = [
  { id: 'jogo', label: 'O jogo' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'partida', label: 'Partida' },
  { id: 'elenco', label: 'Elenco' },
  { id: 'mercado', label: 'Mercado' },
  { id: 'financas', label: 'Finanças' },
  { id: 'temporada', label: 'Temporada' },
  { id: 'selos', label: 'Selos' },
];

/** Classe visual de cada selo (a mesma usada nas tabelas). */
const TAG_CLASS: Record<TagKind, string> = {
  novo: 'new', susp: 'bad', posicao: 'warn', joia: 'good', 'fim-contrato': 'warn', sai: 'bad', titular: 'good', racudo: 'racudo', fairplay: 'fairplay',
};

/** Selo de atleta que explica a si mesmo: tocar abre a ajuda no verbete dele. */
export function Tag({ kind, children, title }: { kind: TagKind; children: ReactNode; title?: string }) {
  const open = (e: MouseEvent | KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); openHelp('selos', kind); };
  return (
    <span
      className={`tag ${TAG_CLASS[kind]} tag-help`}
      role="button"
      tabIndex={0}
      data-hitslop="6"
      title={title ?? 'O que é isso?'}
      aria-label={`${typeof children === 'string' ? children : kind}: o que é isso?`}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(e); }}
    >{children}</span>
  );
}

/** Selo de perfil disciplinar: raçudo ou fair play (a maioria dos atletas não tem). */
export function TemperamentTag({ p }: { p: Pick<Player, 'aggression'> }) {
  const t = temperament(p);
  if (t === 'racudo') return <Tag kind="racudo">raçudo</Tag>;
  if (t === 'fairplay') return <Tag kind="fairplay">fair play</Tag>;
  return null;
}

/** Selo só para mostrar dentro da própria ajuda (não clicável). */
const T = ({ kind, children }: { kind: TagKind; children: ReactNode }) => <span className={`tag ${TAG_CLASS[kind]}`}>{children}</span>;

const SELOS: { kind: TagKind; tag: ReactNode; text: ReactNode }[] = [
  { kind: 'racudo', tag: <T kind="racudo">raçudo</T>, text: <>Chega junto. <b>Desarma mais</b> (deixa a defesa mais forte), mas <b>comete mais faltas e leva mais cartões</b>, e expulsão dá suspensão no jogo seguinte. Um time com muitos raçudos faz quase o dobro de faltas de um time fair play.</> },
  { kind: 'fairplay', tag: <T kind="fairplay">fair play</T>, text: <>Joga limpo. <b>Raramente leva cartão</b> e quase nunca é expulso, mas <b>desarma um pouco menos</b>. Bom para quem não quer perder titulares por suspensão.</> },
  { kind: 'joia', tag: <T kind="joia">joia</T>, text: <>Jovem (até 21 anos) com <b>potencial pelo menos 8 pontos acima</b> da habilidade atual. Evolui com treino e jogos; vale dar minutos e segurar quando chegar proposta.</> },
  { kind: 'novo', tag: <T kind="novo">novo</T>, text: <>Contratado há menos de 30 dias.</> },
  { kind: 'fim-contrato', tag: <T kind="fim-contrato">fim contr.</T>, text: <>O contrato <b>termina no fim desta temporada</b>. A partir de agosto ele pede renovação, com um salário que sobe se estiver insatisfeito: você renova ou deixa sair.</> },
  { kind: 'sai', tag: <T kind="sai">sai</T>, text: <>Você não renovou: ele <b>sai de graça no fim da temporada</b>. Até lá continua jogando.</> },
  { kind: 'susp', tag: <T kind="susp">susp.</T>, text: <>Foi expulso e <b>está suspenso no próximo jogo</b>. O banco repõe automaticamente.</> },
  { kind: 'posicao', tag: <T kind="posicao">de MEI</T>, text: <>Está <b>escalado fora da posição de origem</b> (no exemplo, jogando de meia). Rende menos que na posição dele.</> },
  { kind: 'titular', tag: <T kind="titular">titular</T>, text: <>No mercado: se você contratar, ele <b>seria o melhor da posição</b> no seu elenco.</> },
];

function Content({ topic, tag }: { topic: HelpTopic; tag?: TagKind }) {
  switch (topic) {
    case 'jogo':
      return (
        <>
          <p>Você é um <b>empreendedor esportivo</b> contratado para dirigir um clube de futebol. A cada temporada a diretoria define um <b>objetivo</b>: conquistar o título, conquistar o acesso, terminar no meio da tabela ou evitar o rebaixamento.</p>
          <ul>
            <li><b>Cumpriu o objetivo:</b> bônus de 3 salários no seu patrimônio, mais reputação e propostas de outros clubes.</li>
            <li><b>Ficou muito abaixo</b> (4 posições pior que o esperado) <b>ou foi rebaixado:</b> demissão.</li>
            <li><b>Terminou a temporada com o caixa negativo:</b> demissão, mesmo cumprindo o objetivo.</li>
          </ul>
          <p>Reputação abre portas: quanto maior, melhores os clubes que chamam você. Demitido, você escolhe entre as propostas que chegarem.</p>
          <p className="hint">Seu <b>patrimônio</b> (salário e bônus) é seu; o <b>caixa do clube</b> é do clube. Um não paga as contas do outro.</p>
          <p><b>Conquistas:</b> são 51, todas secretas. Cada uma coloca um objeto novo no seu CT e fica com você para sempre, mesmo começando outra carreira. Veja as suas em <b>Carreira</b>.</p>
        </>
      );
    case 'tempo':
      return (
        <>
          <p>O tempo corre <b>um dia por vez</b>. Use os botões do topo: <b>⏸</b> pausa, <b>▶ ▶▶ ▶▶▶</b> são as velocidades. A <b>barra de espaço</b> pausa e continua.</p>
          <p>O jogo <b>pausa sozinho</b> no dia de jogo, quando chega uma decisão (proposta, aumento, renovação), ao abrir um menu e no fim da temporada.</p>
          <ul>
            <li><b>Janeiro:</b> pré-temporada.</li>
            <li><b>Fevereiro a novembro:</b> uma rodada a cada duas semanas, aos domingos.</li>
            <li><b>Dia 1º de cada mês:</b> salários, cota de TV, patrocínio e parcela de empréstimo.</li>
          </ul>
          <p>Marque <b>“Simular jogos automaticamente”</b> para pular as partidas e só ver os resultados.</p>
        </>
      );
    case 'partida':
      return (
        <>
          <p>No dia de jogo você escolhe <b>assistir (narrado)</b> ou <b>simular o resultado</b>. O placar é o mesmo nos dois casos se você não mexer em nada.</p>
          <ul>
            <li><b>Posse de bola</b> vem do meio-campo: empilhar atacantes custa a bola.</li>
            <li><b>Postura</b>: Ofensivo cria mais chances e também sofre mais; Defensivo se protege e cansa menos.</li>
            <li><b>Cansaço</b> derruba o rendimento ao longo do jogo. Até <b>5 substituições</b>; o auxiliar troca os cansados se você deixar.</li>
            <li>A partida <b>pausa sozinha</b> no intervalo, quando você sofre um gol ou tem um expulso: é a hora de mexer.</li>
          </ul>
        </>
      );
    case 'elenco':
      return (
        <>
          <p>Em <b>Elenco</b> você escolhe a <b>formação</b> e a <b>postura</b>. Enquanto você não mexe, o <b>auxiliar escala</b> os melhores em forma. Mude qualquer atleta (titular, banco ou fora) para assumir a escalação.</p>
          <ul>
            <li><b>Hab</b> é a habilidade na posição; <b>Cond.</b> é a condição física, que cai com os jogos e volta com descanso.</li>
            <li>Atletas <b>evoluem</b> com o treino diário (jovens e com potencial evoluem mais; um CT melhor ajuda) e com boas atuações.</li>
            <li><b>Sat.</b> é a satisfação: cai se ele fica de fora sendo bom, se ganha mal ou se você recusa propostas boas para ele.</li>
          </ul>
          <p>Toque nos <b>selos</b> ao lado dos nomes para saber o que significam.</p>
        </>
      );
    case 'mercado':
      return (
        <>
          <p>Em <b>Mercado</b> aparecem atletas de outros clubes; a lista muda todo mês. A coluna <b>vs. seu</b> compara com o seu melhor na posição.</p>
          <ul>
            <li><b>Comprar</b> custa o preço pedido (um pouco acima do valor de mercado). <b>Vender</b> direto rende cerca de 85% do valor; esperar uma proposta costuma render mais.</li>
            <li><b>Proposta por atleta:</b> vender, <b>cobrir o salário</b> (ele fica e passa a ganhar o oferecido) ou recusar (ele fica chateado).</li>
            <li><b>Pedido de aumento:</b> negar tira satisfação.</li>
            <li><b>Renovação:</b> a partir de agosto, quem está em fim de contrato pede renovação (atleta insatisfeito pede mais). Quem você deixar sair vai embora de graça no fim da temporada.</li>
          </ul>
        </>
      );
    case 'financas':
      return (
        <>
          <p><b>Receitas:</b> cota de TV e patrocínio (por divisão), bilheteria nos jogos em casa e premiação no fim da temporada. <b>Despesas:</b> folha salarial, seu salário e parcela de empréstimo.</p>
          <ul>
            <li>O <b>preço do ingresso</b> muda o público: caro demais esvazia o estádio.</li>
            <li><b>Empréstimo:</b> um por vez; 6 meses (8% de juros) ou 12 meses (18%). Quitar antes dá 5% de desconto.</li>
            <li><b>Caixa negativo:</b> cada mês no vermelho custa 1 de reputação, e <b>terminar a temporada no vermelho dá demissão</b>.</li>
          </ul>
          <p className="hint">O painel mostra a previsão de um mês típico, com e sem jogo em casa.</p>
        </>
      );
    case 'temporada':
      return (
        <>
          <p>São <b>4 divisões de 12 clubes</b>, em pontos corridos (22 rodadas, turno e returno).</p>
          <ul>
            <li>Os <b>2 primeiros sobem</b> e os <b>2 últimos caem</b>.</li>
            <li>Os <b>3 primeiros</b> de cada divisão recebem premiação.</li>
            <li>No <b>balanço</b> você vê a posição, o objetivo, a reputação e as propostas. Aceitar uma proposta troca de clube; o empréstimo em aberto fica com o clube antigo.</li>
          </ul>
        </>
      );
    case 'selos':
      return (
        <>
          <p>Os selos ao lado do nome do atleta resumem algo importante sobre ele. <b>Toque em um selo</b> em qualquer tela para voltar aqui.</p>
          <dl className="help-tags">
            {SELOS.map((s) => (
              <div key={s.kind} id={`help-tag-${s.kind}`} className={tag === s.kind ? 'hl' : ''}>
                <dt>{s.tag}</dt>
                <dd>{s.text}</dd>
              </div>
            ))}
          </dl>
          <p className="hint">Na escalação: <span className="st xi">TIT</span> titular, <span className="st bench">RES</span> reserva, <span className="st out">–</span> fora da relação.</p>
        </>
      );
  }
}

export function HelpHost() {
  const [req, setReq] = useState<Request | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    show = (r) => setReq(r);
    return () => { show = null; };
  }, []);

  // cada assunto lido conta para a conquista "Lição de casa"
  useEffect(() => { if (req) achieve((s) => onHelpTopic(s, req.topic)); }, [req?.topic]); // eslint-disable-line react-hooks/exhaustive-deps

  // aberto a partir de um selo: rola até o verbete dele
  useEffect(() => {
    if (!req?.tag) return;
    document.getElementById(`help-tag-${req.tag}`)?.scrollIntoView({ block: 'center' });
  }, [req]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setReq(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req]);

  if (!req) return null;
  return (
    <Modal title="Como jogar" onClose={() => setReq(null)} wide className="help-window">
      <nav className="help-nav" aria-label="Assuntos da ajuda">
        {TOPICS.map((t) => (
          <button key={t.id} className={`chip ${req.topic === t.id ? 'on' : ''}`} aria-pressed={req.topic === t.id} onClick={() => setReq({ topic: t.id })}>{t.label}</button>
        ))}
      </nav>
      <div className="help-body" ref={body}>
        <Content topic={req.topic} tag={req.tag} />
      </div>
    </Modal>
  );
}
