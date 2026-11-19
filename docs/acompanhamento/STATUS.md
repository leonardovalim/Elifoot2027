# Status de desenvolvimento

Atualizado em 19/11/2026.

## Entregue nesta rodada

- [x] CT em pixel art com camadas de cenário, iluminação, objetos e variação determinística de jogadores.
- [x] HUD reorganizado para destacar recursos, tempo, próximo jogo e objetivo.
- [x] Dock com estado ativo, foco de teclado e controles mais confortáveis no mobile.
- [x] Onboarding preservado e reorganizado em wizard: nome → modalidade → desafio → oportunidade.
- [x] Validação de nome e desafio antes de avançar.
- [x] Textos de apoio reduzidos, sem linguagem corporativa e sem mencionar “MVP” para quem joga.
- [x] Layout validado em desktop e viewport de 390 px.
- [x] Typecheck, build e suíte completa: 6 arquivos / 32 testes passando.

## Próximas frentes

### Web instalável

- [ ] Criar manifest e ícones.
- [ ] Adicionar service worker e comportamento offline básico.
- [ ] Validar instalação como PWA em Chrome e Safari.

### Dados e continuidade

- [ ] Migrar o save de `localStorage` para IndexedDB.
- [ ] Permitir mais de uma carreira salva.
- [ ] Definir exportação/importação de save.

### Mobile nativo

- [ ] Escolher entre Capacitor e cliente nativo com core compartilhado.
- [ ] Preservar as regras determinísticas do jogo em um módulo compartilhado.
- [ ] Adaptar safe areas, gestos, teclado e navegação por toque.
- [ ] Validar em iOS e Android reais.

### Qualidade e publicação

- [ ] QA em Chrome, Safari e Firefox.
- [ ] Testar 390, 430, 768 e 1280 px, incluindo paisagem.
- [ ] Configurar GitHub Actions para typecheck, testes, build e preview.
- [ ] Revisar acessibilidade de foco, contraste e leitura do canvas.

### Conteúdo de jogo

- [ ] Estádio em dia de jogo.
- [ ] Clima e estações.
- [ ] Copa/torneio.
- [ ] Lesões.
- [ ] Upgrades de estrutura.

## Como validar localmente

```bash
npm install
npm run dev
```

Servidor usado nesta rodada: `http://127.0.0.1:5173/`.

Comandos de verificação:

```bash
npm run typecheck
npm test
npm run build
```
