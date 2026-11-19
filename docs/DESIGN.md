# Design

## Princípios

1. **Motor determinístico.** Toda aleatoriedade vem de `Rng` com seed. Mesma seed + mesmas decisões = mesmo resultado. Isso permite que, no online, o servidor simule a rodada (resultado oficial, anti-trapaça) e o cliente apenas reproduza a animação.
2. **Core agnóstico de esporte.** Temporada, divisões, tabela, finanças e mercado não sabem que esporte estão rodando. Cada esporte implementa `HeadToHeadSport` (futebol, vôlei, basquete…) ou, na fase 3, `RaceSport` (F1…).
3. **Balanceamento é testado, não opinado.** `tests/balance.test.ts` roda milhares de partidas e falha se o futebol ficar irreal ou se surgir tática dominante.

## Motor de futebol

A cada minuto:
1. **Posse**: decidida pela força do meio-campo (com bônus de mando).
2. **Chance**: o time com a bola finaliza com probabilidade proporcional a `ataque / (ataque + defesa adversária)`, modulada pelo estilo dos dois times.
3. **Finalização**: finalizador sorteado (atacantes pesam mais), conversão por `ataque do finalizador × goleiro`.
4. **Disciplina**: amarelos ponderados por agressividade; quem já tem amarelo joga com cautela; 2º amarelo/vermelho remove o jogador e recalcula setores.

### Lições do Elifoot 98 (estudo de engenharia reversa)

| Problema no clássico | Nossa decisão |
|---|---|
| Força única por jogador | 4 atributos (ataque, defesa, passe, goleiro) + agressividade + potencial |
| Sem posse de bola → 5-0-5 dominante | Posse vem do meio-campo; empilhar atacantes custa a bola |
| Evolução ±1 por rodada (volátil) | Evolução lenta, guiada por idade, minutos jogados e potencial |
| Tática sem trade-off | Estilo ofensivo cria mais chances **e** expõe a defesa |

### Métricas atuais (times equivalentes, 3.000 jogos)

| Métrica | Valor | Referência real |
|---|---|---|
| Gols/jogo | ~2,7 | 2,5–2,8 |
| Vitória mandante / empate | ~42% / ~26% | 43–46% / 25–28% |
| Amarelos / vermelhos por jogo | ~3,2 / ~0,15 | 3–4 / 0,1–0,2 |
| Spread de pts/jogo entre formações | < 0,35 | — |

## Economia

Receita por rodada = bilheteria (mandante; demanda elástica ao preço do ingresso, limitada pelo estádio) + cota de TV por divisão. Despesa = folha salarial. Calibrada para ficar perto do equilíbrio: elite com sobra moderada, divisões inferiores no aperto — subir de divisão é também um objetivo financeiro.

## Referências e propriedade intelectual

- **desvendando-elifoot-98** (engenharia reversa): usado só para estudar mecânicas. **Nenhum código descompilado é portado** — seria obra derivada de software proprietário.
- **elifoot98web** (emulação via js-dos): referência apenas de UX (PWA, salas com código). **Não usamos o pacote `.jsdos`** (contém o executável original e Windows 3.1).
- Nome, clubes e jogadores são fictícios. "Elifoot2027" é codinome interno — o produto precisa de nome próprio antes de qualquer lançamento público (marca registrada).

## Roadmap

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 1 ✅ | Core + futebol single-player | Temporadas completas, balanceamento verde |
| 2 | **Online**: Supabase (auth, Postgres), ligas privadas com código de convite, rodadas agendadas (cron) simuladas no servidor, placar ao vivo via Realtime | 2+ amigos jogando uma temporada assíncrona |
| 3 | 2º esporte de formato diferente (F1 → `RaceSport`) | Core reaproveitado sem fork |
| 4 | Vôlei + outros 4 esportes, priorizados por demanda | — |

### Backlog da fase 1 (melhorias)
- Escalação manual (hoje é automática por posição)
- IA dos clubes comprando/vendendo (hoje só reage às suas ofertas)
- Copa paralela ao campeonato (mata-mata)
- Lesões e cansaço
- Demissão por mau desempenho / propostas de outros clubes
