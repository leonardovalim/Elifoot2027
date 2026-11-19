# Elifoot2027 *(codinome)*

Jogo de gestão esportiva multi-esporte, online. Começa pelo futebol; vôlei, F1 e outros entram como plugins sobre o mesmo core.

> Projeto original. Inspirado no gênero dos managers clássicos, mas com motor, dados e assets próprios — ver [docs/DESIGN.md](docs/DESIGN.md#referências-e-propriedade-intelectual).

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 18 testes: liga, carreira, determinismo e balanceamento
npm run balance    # só os testes de balanceamento (rode após mexer em TUNING)
npm run build
```

## Estrutura

```
src/
  core/              genérico, não sabe qual esporte é
    rng.ts           RNG determinístico com seed (base do online)
    sport.ts         contrato que cada esporte implementa
    league.ts        turno/returno, tabela
    season.ts        temporada, divisões, acesso/rebaixamento
  sports/
    football/        plugin do futebol
      engine.ts      motor de partida minuto a minuto + TUNING
      lineup.ts      formações, escalação, rating por posição
      generate.ts    mundo fictício (clubes, jogadores), valores e salários
      development.ts evolução, aposentadoria, juniores
  game/career.ts     carreira single-player: rodadas, finanças, mercado
  ui/                React (PWA-ready), save em localStorage
tests/               liga, carreira, balanceamento
```

## Status

**Fase 1 — single-player de futebol** ✅ jogável
- 4 divisões × 12 clubes, turno e returno, 2 sobem / 2 descem
- Partida ao vivo minuto a minuto com posse de bola, cartões, suspensão
- 7 formações × 3 estilos, sem tática dominante (validado por simulação)
- Elenco, mercado (compra/venda), bilheteria, cota de TV, salários
- Evolução de jogadores, aposentadoria, juniores; save automático

Próximas fases em [docs/DESIGN.md](docs/DESIGN.md#roadmap).
