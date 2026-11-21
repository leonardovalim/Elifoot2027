# Design: decisões, métricas e backlog

Produto: **Mestres do Esporte: Construa seu legado.** Fonte da visão: *Visão do Produto v1.2 + GDD v0.3* (escrito ainda com o nome de trabalho "Universo Esportivo"). Este arquivo registra **como** o código implementa a visão e o que ainda falta.

## Princípios técnicos

1. **Motor determinístico.** Toda aleatoriedade vem de `Rng` com seed, e o estado do RNG é salvo junto com a carreira. Mesma seed + mesmas decisões = mesmo resultado. Testes garantem que (a) duas carreiras com a mesma seed são idênticas e (b) assistir à partida ao vivo e simulá-la dão o mesmo placar.
2. **Core agnóstico de esporte.** `core/` não importa nada de `sports/`. Cada modalidade implementa `HeadToHeadSport` (ou, na fase 3, `RaceSport`).
3. **Empreendedor ≠ organização (GDD 2.7).** `Entrepreneur.cash` é patrimônio pessoal, e `Club.budget` é o caixa da organização. Dinheiro só passa de um para o outro por operações explícitas (hoje, salário e bônus; depois, aporte, dividendos e empréstimos).
4. **Balanceamento é testado, não opinado.** `tests/balance.test.ts` roda milhares de partidas e falha se o futebol ficar irreal ou se surgir tática dominante.

## Mapeamento GDD → código

| GDD | Implementação | Status |
|---|---|---|
| 1.6 Escolha do desafio | `CHALLENGES`, `challengeOptions`, `boardObjective` | ✅ |
| 1.7 Mundo por ciclos | `advanceDay`, fases pré-temporada → temporada → encerramento → entressafra | ✅ |
| 2.2 Empreendedor | `core/entrepreneur.ts` | ✅ básico |
| 2.3 Delegação | "Auxiliar troca cansados" (substituições automáticas) | 🟡 mínimo |
| 2.4 Partida narrada + intervenções | `engine.ts` incremental + `narration.ts` + `MatchDay.tsx` | ✅ |
| 2.6 Propriedade híbrida | Tipos `Bond` (`contratado`/`socio`/`proprietario`, `share`) | 🟡 só contratado |
| 2.8 Finanças da organização | `Ledger`, `financialState` | ✅ simplificado |
| 2.11 Progressão (reputação, experiência) | Avaliação no fim da temporada, propostas por reputação | ✅ |
| 3.2 Atributos físicos/técnicos/mentais | `Attributes` (11), `WEIGHTS` por posição | ✅ |
| 3.3 Banco, substituições, suspensões | ✅ (lesões: pendente) | 🟡 |
| 3.5 Campeonatos | Pontos corridos, acesso/queda, campeões, artilharia | ✅ (copa: pendente) |
| GD-04 Avançar sem acompanhar | "Simular meus jogos sem assistir" + velocidade 3 | ✅ |
| GD-10 IA com as mesmas regras | IA respeita o caixa ao comprar atletas | 🟡 IA ainda não contrata ativamente |

## Ritmo (inspiração na Game Dev Story)

- **1 dia por tick**: ▶ 420ms, ▶▶ 170ms, ▶▶▶ 45ms. Espaço pausa.
- **Pausa automática** em: dia de jogo, fim de temporada, demissão/propostas, abertura de qualquer menu.
- **Na partida**: pausa automática no intervalo, em gol sofrido e em expulsão sofrida (momentos de decisão).
- **Calendário**: rodadas quinzenais aos domingos (fev–nov), salários e cotas no dia 1º, treino diário.

## Motor de futebol

A cada minuto:
1. **Cansaço**: a condição cai conforme a resistência e a postura (ofensiva cansa mais). O rendimento é multiplicado por `0,7 + 0,3 × condição`.
2. **Posse**: decidida pela força do meio-campo, com bônus de mando.
3. **Chance**: o time com a bola finaliza com probabilidade proporcional a `ataque / (ataque + defesa adversária)`, modulada pela postura dos dois times.
4. **Finalização**: o finalizador é sorteado (atacantes pesam mais); a conversão compara a finalização dele com o goleiro. Há assistência em ~70% dos gols.
5. **Disciplina**: o ritmo de faltas e cartões do time cresce com a agressividade média da linha (`foulRate`: média 50 → 1,0; só raçudos ~1,25; só fair play ~0,75). Quem recebe o cartão é sorteado pela agressividade, e quem já tem amarelo joga com cautela. A agressividade também dá até ±5% no desarme (`aggressionTackle`).
6. **Notas**: começam em 6,0 e sobem ou descem com gols, assistências, defesas, cartões e o resultado. O destaque da partida é a maior nota.

### Lições do Elifoot 98 (estudo de engenharia reversa)

| Problema no clássico | Nossa decisão |
|---|---|
| Força única por jogador | 11 atributos e um peso por posição |
| Sem posse de bola → 5-0-5 dominante | Posse vem do meio-campo; empilhar atacantes custa a bola |
| Evolução ±1 por rodada (volátil) | Treino diário com ganhos raros, guiado por idade, potencial e nível do CT |
| Sem cansaço | Condição física dentro e entre partidas, e rodízio de elenco |

### Calibração "com sabor de Elifoot" (a partir da engenharia reversa)

O estudo `desvendando-elifoot-98` documenta fórmulas, mas **não** os pesos da tabela de desfechos (as imagens do repositório mostram só os textos "GOLO", "Defendeu" e "Ao poste"). Por isso só usamos como meta de calibração o que está escrito; nenhum código foi portado.

| Documentado no Elifoot 98 | No Mestres do Esporte |
|---|---|
| Chance do mandante `Random(6000)` × visitante `Random(7000)` | `homeChanceBoost = 7000/6000` multiplica a probabilidade de chance do mandante |
| "Lance de sorte" independente da força: `Random(180)` em casa (0,55%/min), `Random(270)` fora (0,37%/min) | `luckyHome = 1/180`, `luckyAway = 1/270`: finalização extra que ignora a força, a fonte das zebras |
| 5 desfechos: gol, defesa, poste, barra e fora | Os 5 existem, com narração própria (poste 1,8%, barra 1,2% e defesa 35% dos chutes que não viram gol) |
| Evolução ±1 pela avaliação da partida | Nota ≥ 7,3 → 50% de chance de +1 num atributo da posição, com notícia; nota ≤ 5 → 15% de chance de −1 |
| Goleiro evolui mais devagar (sorteio extra de 50%) | Goleiro evolui na metade do ritmo (treino e atuação) |
| Jogador só evolui dentro de ±5 do nível do time | Acima de nível do time + 5, o ritmo cai para 40% (fator suave, não trava) |
| Mitos confirmados: agressividade não desarma, torcida é só financeira, não existe moral | **Revisto (nov/2026):** a agressividade agora desarma um pouco (±5%) e aumenta as faltas e os cartões do time, para o selo **raçudo** (≥ 70) ser uma troca e não só desvantagem; **fair play** (≤ 30) é o oposto. O público continua afetando só a bilheteria. |
| Bônus de +3 por titular da mesma nacionalidade | **Não adotado**: o mundo é fictício e o bônus era arbitrário |
| Sem posse de bola → 5-0-5 dominante | **Corrigido**: a posse vem do meio-campo |

### Métricas atuais (times equivalentes, 2.000 jogos)

| Métrica | Valor | Referência |
|---|---|---|
| Gols/jogo | ~2,8 | futebol real 2,5–2,8; o Elifoot era goleador |
| Vitória mandante / empate | ~44% / ~24% | Elifoot: "mando de campo gigante" |
| Zebra (time 15 pts mais fraco vence fora) | ~16% | lances de sorte do Elifoot |
| Amarelos / vermelhos por jogo | ~3,1 / ~0,13 | 3–4 / 0,1–0,2 |
| Raçudo × fair play (linhas inteiras, mesmo nível) | amarelos 2,1 × 1,1 · vermelhos 0,11 × 0,03 · faltas 9,7 × 4,7 · gols sofridos 1,42 × 1,42 · pts/jogo 1,40 × 1,35 | troca, sem perfil dominante (`tests/balance.test.ts`) |
| Spread de pts/jogo entre formações | < 0,35 | sem dominante |
| Nível médio por divisão em 5 temporadas | +2 a +3 | sem inflação (`tests/drift.test.ts`) |

## Economia

- Mensal: folha salarial (valor ÷ 100), cota de TV por divisão (170k, 85k, 42k e 19k), patrocínio por divisão (20k, 26k, 26k e 22k) e salário do empreendedor.
- Por jogo em casa: bilheteria = público × ingresso, com público elástico ao preço e limitado pelo estádio.
- Fim de temporada: premiação por posição.
- Mercado: preço pedido = valor × 1,15; venda direta = valor × 0,85. Caixa inicial = nível³ × 8.
- Calibração (6 seeds, ano completo com entressafra, sem nenhuma ação): saldo anual sobre a folha anual, mediana de 21% (div. 4) a 28% (div. 1); os 10% piores ficam entre +3% e +14%. Clubes com folha acima da mediana ainda sobram 15–22%. A folga paga um reforço por temporada nas divisões de baixo; gastar além disso leva ao vermelho.
- Antes (TV sem patrocínio, salário = valor ÷ 90): divisões 2–4 fechavam entre −9% e +4%, sem espaço para contratar nem dar aumento.
- O painel de finanças mostra a previsão de um mês típico (com e sem jogo em casa).
- **Empréstimo**: um por vez, até 4 meses de receita típica; 6 meses com 8% de juros totais ou 12 meses com 18%. Parcela fixa no dia 1; quitar antes dá 5% de desconto no saldo. Ao trocar de clube, o saldo restante fica com o clube antigo.
- **Caixa negativo**: cada mês fechado no vermelho custa 1 de reputação e gera cobrança da diretoria; terminar a temporada com o caixa negativo (mesmo somando a premiação) dá demissão.
- Teste `tests/economy.test.ts`: clube da divisão 4 sem mexer em nada nunca fica negativo na 1ª temporada.

## Mercado vivo

Módulo `src/game/market.ts`. Cada evento vira uma decisão pendente e a interface pausa o tempo até a resposta.

- **Propostas da IA** (pré-temporada e temporada): ~1,6% por dia (3% se houver atleta revoltado), uma por vez. Taxa entre 90% e 145% do valor e salário 25–70% acima. Opções: vender, cobrir o salário (ele fica ganhando o oferecido) ou recusar (satisfação cai, mais se o salário oferecido era bem maior ou o clube é maior).
- **Pedido de aumento**: checado nos dias 1 e 15 (40%), para quem está mal pago (valor de mercado pede 10% a mais), insatisfeito e acima da mediana, ou em boa fase (média 6,8+ em 5+ jogos). Intervalo mínimo de 120 dias. Negar tira 20 de satisfação.
- **Renovação**: a partir de agosto, até 2 por mês (em novembro, todos os que faltam). O salário pedido sobe com a insatisfação (×1,05 / ×1,2 / ×1,45). Quem é liberado vai a leilão no fim da temporada e rende 25% a 45% do valor (sem lance, sai de graça); quem nunca foi consultado renova automaticamente.
- **Satisfação** (0–100, padrão 70): +3 por jogo disputado, −5 para quem está entre os 13 melhores e fica de fora, −1 para os demais; −3 por mês se mal pago; volta 10% por mês para perto de 60. Por enquanto afeta só as negociações.
- Medição (5 seeds × 3 desafios, recusando tudo): 0–15 propostas, 0–4 aumentos e 1–6 renovações por temporada.

## Ajuda e selos

- **Como jogar** (`ui/help.tsx`): botão **?** no topo do jogo e **Como jogar** na tela inicial. Assuntos: o jogo, tempo, partida, elenco, mercado, finanças, temporada e selos.
- **Selos clicáveis**: tocar em qualquer selo de atleta (raçudo, fair play, joia, novo, fim contr., sai, susp., fora de posição, titular) abre a ajuda direto na explicação dele. A área de toque é ampliada por CSS sem mudar o visual.
- Os textos da ajuda descrevem regras reais do código; ao mudar uma regra, revise o verbete correspondente.

## Janela do meio do campeonato

- Abre ao fim da rodada 11 (`openMidSeasonWindow`), com RNG próprio derivado da seed e do ano: não altera a sequência do resto da simulação.
- **Mérito**: entre os 3 primeiros, um clube de reputação maior (até reputação do jogador + 25, mesma divisão ou acima) convida; salário +15%.
- **Crise**: 30% de chance de um clube nas 2 últimas posições (divisões 1–3) convidar para "evitar o rebaixamento"; salário +25%.
- **Aceitar**: multa de 2 salários do patrimônio (até o que houver) e −3 de reputação; o objetivo do clube novo vale para a temporada inteira dele. **Recusar**: +2 de reputação.
- Medido (30 seeds por desafio, sem interferência): abre em ~1/3 das carreiras de "começar de baixo" e "pressão" e ~2/3 em "crescimento" (times médios terminam o turno no topo com mais frequência).

## Conquistas e legado no CT

- **51 conquistas secretas** (`game/achievements.ts`): 20 bronze, 15 prata, 10 ouro e 6 lendárias. A 51ª, **Laranja da Baixada**, é receber proposta do **Nova Iguaçu** (`NOVA_IGUACU_ID`, o clube mais forte da 1ª divisão em todo mundo gerado; exige reputação alta). São do **jogador**, não da carreira: ficam em `localStorage` (`mestres-do-esporte.conquistas`) e sobrevivem a apagar o save ou começar outra carreira.
- **Cada conquista põe um objeto no CT** (`ui/scene/legacy.ts`), em pixel art nas cores do clube atual. Zonas: céu (balões, dirigível, avião, fogos, disco voador), telhado/fachada do CT, **sala de troféus** (anexo que só aparece com o primeiro troféu), gramado, beira do campo e **pátio de entrada** (faixa de 18 px abaixo do campo, por isso o canvas passou de 240×135 para 240×153).
- **Banner estilo Xbox** (`ui/achievements.tsx`): fila, um por vez (~4,6 s), acima do menu de baixo. A coleção fica no painel **Carreira** (só as desbloqueadas + contador; as outras são secretas).
- Regras puras e testadas (`tests/achievements.test.ts`, `tests/legacy.test.ts`); os ganchos ficam no `Game.tsx` (partida, fim de temporada, ações/decisões, virada de mês) e na ajuda ("Lição de casa").
- Atletas vindos da base ganharam `fromYouth` (para "Prata da casa").
- "CT de primeiro mundo" exige **cumprir o objetivo** num clube 5 estrelas (no desafio "Administrar a pressão" o clube já começa com 5).

## Referências e propriedade intelectual

- **desvendando-elifoot-98** (engenharia reversa): usado só para estudar mecânicas. **Nenhum código descompilado é portado.**
- **elifoot98web**: referência apenas de UX (PWA, salas com código). **Não usamos o pacote `.jsdos`.**
- **Game Dev Story (Kairosoft)**: inspiração de ritmo e de gênero. **Nenhum asset, sprite ou layout copiado.** A arte é pixel art própria, gerada em código (`ui/scene/sprites.ts`).
- O mundo é 100% fictício (GDD 1.8).

## Backlog priorizado

**Entrega 2: mundo vivo**
- [ ] Comissão técnica (treinador, diretor, preparador, coordenador) com atributos, salário e evolução. Delegação em 2 níveis.
- [x] IA adversária contratando de outros clubes da IA pela posição mais carente, respeitando o próprio caixa (~20 negociações por temporada, listadas no Mercado)
- [ ] IA demitindo técnico
- [x] Copa Mestres: mata-mata em jogo único com os 48 clubes (6 fases nas quartas-feiras entre rodadas), mando do clube de divisão mais baixa, pênaltis no empate, prêmio por fase ($30k → $1,2M); não conta na artilharia
- [x] Pênaltis na partida: por falta de zagueiro na área ou depois de zagueiro expulso (1 em 3, regra do Elifoot 98, conforme a engenharia reversa do rustfoot98); ~1 a cada 3,7 jogos, cobrado no minuto seguinte pelo melhor finalizador contra o goleiro (~76% de conversão), com pausa na partida do jogador. Conversão dos lances normais caiu de 0,205 para 0,192 para a média de gols seguir realista
- [x] Prorrogação de 30 minutos no mata-mata empatado (como no Elifoot 98), antes dos pênaltis
- [x] Taça Continental: os 4 primeiros da Divisão 1 contra 12 clubes estrangeiros fictícios (oitavas à final), prêmios de $150k a $2,5M
- [x] Nacionalidades: ~8% de estrangeiros na liga (nome do país e bandeirinha), clubes estrangeiros com elenco do próprio país
- [x] Lesões: ~1,3 por time por temporada (mais chance com cansaço), fora de 1 a 6 rodadas (média 2,7); substituição forçada automática, pausa e som na partida do jogador; as férias curam
- [x] Upgrade de estrutura (CT, estádio) com custo, o "escritório maior" da Game Dev Story: obra paga na hora; estádio +15% dos lugares a $150 o lugar (90 dias), CT nível 2–5 por $200k/$400k/$800k/$1,5M (60 dias)
- [x] Torcida viva: +0,6% por vitória, +0,1% por empate, −0,4% por derrota; campeão +12%, acesso +7%, rebaixamento −10%. Estádios novos nascem com ~70–80% de ocupação, então crescer enche a casa e pede ampliação
- [x] Artilharia da temporada por divisão (aba Tabela)
- [ ] Patrocínio simples

**Entrega 3: polimento da experiência**
- [ ] Escalação manual (travar titulares)
- [ ] Mais variedade de cenas: estádio no dia de jogo, clima e estação do ano
- [x] Proposta por atleta, pedido de aumento e renovação de contrato (mercado vivo)
- [ ] Satisfação influenciar o desempenho em campo
- [ ] Outros eventos com escolha (crise, oportunidade)
- [ ] PWA instalável

**Multijogador local** (feito): 2 a 4 técnicos no mesmo aparelho, cada um com nome, desafio e clube próprios. Caixa, patrimônio, decisões, empréstimo, balanço e notícias são de cada um; o mundo é compartilhado. A vez passa pelo botão "Vez de X" ou sozinha quando outro técnico tem decisão, janela ou emprego esperando (tela de "passe o aparelho"). No dia de jogo cada técnico joga a sua partida em seguida; confronto entre dois humanos é comandado pelo mandante. A IA não compra nem vende atletas de clube humano.

**Fase 2: online**, backend leve e **sem Supabase** (decisão do produto)
- Fase 1 continua 100% local (save no navegador). Próximo passo local: trocar o `localStorage` por IndexedDB, para ter vários saves e passar do limite de ~5 MB.
- Para o online, a recomendação é **PocketBase**: um binário só, SQLite embutido, auth e realtime prontos, rodando numa VM pequena (Fly.io ou Railway). Alternativa serverless: **Turso** (SQLite/libSQL gerenciado) + funções na Vercel.
- O motor determinístico roda no servidor (Node) para as rodadas agendadas, e o cliente só reproduz.

## Analytics (PostHog)

`src/ui/analytics.ts` envia eventos direto para a API de captura (sem SDK, para não pesar no bundle). O envio fica ativo só com `VITE_POSTHOG_KEY` configurada com a chave **pública** `phc_…` (variável de ambiente na Vercel). Chaves `phs_` e `phx_` são secretas e nunca entram no cliente. Todos os eventos levam `app = mestres-do-esporte` e `app_version`.

| Evento | Propriedades | Pergunta que responde |
|---|---|---|
| `app_opened`, `$pageview` | `has_save`, `screen` | Quantos chegam e quantos voltam |
| `career_created` | `challenge`, `division`, `objective`, `club_reputation` | Onboarding funciona? Qual desafio atrai? |
| `match_started` | `mode` (watch / simulate) | Partida narrada engaja ou é pulada? |
| `match_simulated` | `mode: auto` | Quem já joga no "piloto automático" |
| `match_intervention` | `type`, `value`, `minute` | As intervenções são usadas? |
| `match_finished` | `round`, `season`, `result`, `goals_for`, `goals_against`, `home` | Profundidade da sessão |
| `season_completed` | `seasons_played`, `position`, `achieved`, `fired`, `promoted`… | Critério do MVP: 3 temporadas |
| `offer_accepted` | `unemployed` | Mobilidade de carreira |
| `lineup_changed` | `to` (xi/bench/out) | Quantos assumem a escalação em vez do auxiliar |
| `player_bought` | `position`, `overall`, `price` | Uso do mercado depois da comparação |
| `time_speed`, `menu_opened` | `speed`, `menu` | Ritmo preferido e menus mais usados |
| `sport_interest_opened`, `sport_interest` | `sport`, `stars` | Ordem do roadmap de modalidades |

**Funil principal do MVP:** `app_opened → career_created → match_finished (1ª) → season_completed (1ª) → season_completed (3ª)`.
