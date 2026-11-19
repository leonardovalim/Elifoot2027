# Mestres do Esporte — direção visual da fatia vertical

## Contexto

O MVP já tem a estrutura certa de jogo: onboarding com nome/modalidade/desafio, contratação da primeira oportunidade, tela de carreira, calendário, treino, partidas e menus. A próxima rodada não deve trocar essa identidade por uma landing page ou dashboard corporativo. Ela deve elevar a apresentação do jogo publicado, preservando o fluxo e o ritmo inspirados em simuladores de gestão em pixel art.

## Objetivo

Refinar a primeira tela jogável — do onboarding até a carreira — como uma fatia vertical coesa:

- mais personalidade e profundidade na arte pixel art do CT;
- hierarquia de leitura mais clara no HUD e nos painéis;
- sensação de jogo contínuo, com estados de pausa, velocidade e próximo evento compreensíveis;
- layout responsivo que continue sendo um jogo em telas pequenas e prepare o caminho para um app mobile nativo;
- preservação integral das regras, dados, modalidades, desafios e mecânicas existentes.

## Não objetivos

- reescrever o motor de carreira;
- adicionar autenticação, backend ou novas telas de produto;
- trocar a estética por uma UI flat, SaaS, editorial ou de landing page;
- copiar assets, sprites ou layouts de Game Dev Story;
- trocar a arte procedural por imagens raster difíceis de adaptar ao mobile.

## Princípios de design

1. **Jogo antes de produto:** cada bloco deve comunicar estado, decisão ou progresso da carreira.
2. **Pixel art própria:** formas pequenas, contorno duro, paleta restrita e detalhes com intenção.
3. **Uma hierarquia por tela:** o CT é o palco; o painel do próximo jogo é a decisão imediata; objetivo e notícias são contexto.
4. **Densidade controlada:** reduzir ruído visual sem aumentar espaços vazios ou transformar tudo em cards soltos.
5. **Mobile desde o layout:** áreas clicáveis confortáveis, dock persistente, canvas 16:9 e leitura por camadas.
6. **Movimento com propósito:** animações curtas sinalizam vida e feedback, sem distrair da simulação.

## Direção escolhida

### Fatia vertical completa

Trabalhar em conjunto o palco pixel art, o HUD, os painéis da carreira, o dock e os pontos de transição do onboarding. A meta é que uma sessão curta — criar carreira, escolher desafio, contratar oportunidade e observar o primeiro ciclo — pareça parte do mesmo jogo do início ao fim.

### Esboço de composição

```text
[ clube / data / caixa / patrimônio / velocidade ]

[ centro de treinamento pixel art ] [ próximo jogo ]
                                  [ objetivo       ]
                                  [ notícias       ]

[ elenco ] [ mercado ] [ tabela ] [ finanças ] [ carreira ]
```

## Escopo visual

### 1. Centro de treinamento

- manter o canvas 240×135 e o `image-rendering: pixelated` para preservar nitidez;
- organizar o cenário em camadas: céu, horizonte, prédio, campo, objetos de treino e atores;
- criar marcos visuais que diferenciem o CT de um campo genérico: entrada/prédio, iluminação, banco ou rack de bolas, cones, placa e área de treino;
- reservar contraste e animação para o evento atual: treino, descanso, contratação ou avanço de dia;
- ampliar variedade de poses/cores dos atores sem perder a silhueta legível;
- manter a paleta noturna/campo atual como base, com acentos de amarelo, vermelho e azul para estados.

### 2. HUD

- agrupar identidade do clube e data à esquerda;
- agrupar caixa do clube, patrimônio e reputação como leitura financeira/progressão;
- tornar o controle de velocidade um controle de simulação explícito, com estado pausado visível;
- reduzir a competição entre métricas: o jogador deve saber primeiro “onde estou”, “o que vai acontecer” e “quanto posso gastar”.

### 3. Painéis de carreira

- dar mais peso ao painel “Próximo jogo” como decisão imediata;
- transformar “Objetivo” em progresso de temporada, não em um cartão decorativo;
- manter “Notícias” como feed vivo, com timestamp/evento e altura compacta;
- preservar títulos e vocabulário existentes, ajustando apenas hierarquia, agrupamento e estados.

### 4. Dock

- manter a navegação inferior como metáfora de menu de jogo;
- reforçar item ativo, foco por teclado e feedback de toque;
- aumentar área mínima de toque sem aumentar excessivamente a altura visual;
- manter rótulos curtos e ícones com silhuetas reconhecíveis.

### 5. Onboarding

- preservar nome, modalidade, desafio e oportunidade como etapas do jogo;
- melhorar a indicação de etapa e o foco após escolher um desafio;
- garantir que as oportunidades apareçam sem parecer uma nova tela desconectada;
- manter “em breve” para modalidades ainda indisponíveis, sem simular funcionalidades inexistentes.

## Tokens visuais

- **Paleta:** navy/noite para o mundo, papel creme para janelas, tomato para cabeçalhos e alertas, mustard para ação principal, green/sky para o CT.
- **Bordas:** contornos pixelados de 2–3 px, sem sombras suaves ou gradientes de produto.
- **Tipografia:** Nunito para leitura e acessibilidade; pixel font apenas em logo, numerais ou micro-acento quando melhorar o sabor de jogo.
- **Ritmo:** espaçamento em múltiplos de 4 px; controles com pelo menos 44 px de área útil no mobile.
- **Estados:** ação principal amarela; seleção/ativo em azul ou amarelo; alerta/pausa em vermelho; informação de treino em verde.

## Critérios de aceitação

- o fluxo publicado continua funcionando: título → nova carreira → nome → modalidade → desafio → oportunidade → carreira;
- nenhum estado de jogo ou mecânica existente é removido;
- a tela de carreira é reconhecível como jogo de gestão pixel art, não como dashboard ou landing page;
- o CT tem pelo menos três camadas ambientais e marcos de treino visíveis em um screenshot parado;
- o painel do próximo jogo é o foco visual secundário após o CT;
- pausa, velocidade e próximo evento são entendidos sem depender de tooltip;
- em viewport de aproximadamente 390 px, o conteúdo não exige zoom horizontal e o dock continua utilizável;
- `npm run build` passa e os testes existentes permanecem verdes.

## Fora desta rodada

Upgrade de CT/estádio, clima, copa, lesões, comissão técnica, PWA instalável e novos eventos de escolha permanecem no backlog do produto. Esta rodada prepara o espaço visual para eles sem implementá-los.
