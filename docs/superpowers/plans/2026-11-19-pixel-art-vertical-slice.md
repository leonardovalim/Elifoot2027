# Pixel Art Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevar a apresentação do MVP publicado como um jogo de gestão em pixel art, refinando o CT, a hierarquia da carreira, o dock e o comportamento mobile sem remover o onboarding ou alterar as mecânicas.

**Architecture:** Manter a renderização procedural do CT em canvas 240×135 e separar apenas a descrição textual/semântica do estado da cena em um helper puro testável. Ajustar a composição da carreira em React e CSS existente, usando as mesmas janelas, bordas duras e paleta, com mudanças incrementais e sem novas dependências.

**Tech Stack:** React 18, TypeScript, Vite, CSS existente, Canvas 2D procedural, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-pixel-art-vertical-slice-design.md`

## Status de execução

- [x] Fatia visual do CT, HUD, carreira, onboarding e dock implementada.
- [x] Wizard de onboarding com validação de nome/desafio implementado.
- [x] Layout mobile validado em viewport de 390 px.
- [x] Textos de apoio reduzidos; nenhuma menção a “MVP” aparece na interface.
- [x] Typecheck, build e suíte completa validados: 6 arquivos / 32 testes passando.
- [ ] Próxima etapa: levar a experiência para PWA/mobile nativo e ampliar QA em dispositivos reais.

## Global Constraints

- preservar o fluxo publicado: título → nova carreira → nome → modalidade → desafio → oportunidade → carreira;
- nenhum estado de jogo ou mecânica existente é removido;
- manter canvas 240×135 com `image-rendering: pixelated`;
- manter paleta navy/noite, papel creme, tomato, mustard, green/sky;
- usar Nunito para leitura e pixel font apenas em logo, numerais ou micro-acento;
- controles devem ter pelo menos 44 px de área útil no mobile;
- não adicionar autenticação, backend, nova dependência ou asset raster externo.

## Review Focus

- Canvas pausado: a cena deve ficar congelada e a camada textual deve explicar o estado sem depender da animação.
- Elenco vazio ou com poucos jogadores: o CT deve continuar desenhando prédio, campo, objetos e treinador sem depender de atores.
- Viewport de 390 px: HUD, cena e dock não podem criar overflow horizontal.
- Onboarding sem desafio/nome: oportunidades só aparecem após desafio e o erro do nome continua focando o campo.
- Contraste e foco: botões, item ativo do dock e controles de velocidade precisam permanecer distinguíveis em teclado e toque.

---

### Task 1: Semântica testável do palco

**Files:**
- Create: `src/ui/scene/scenePresentation.ts`
- Create: `tests/scenePresentation.test.ts`
- Modify: `src/ui/scene/CtScene.tsx`

**Interfaces:**
- Produces `scenePresentation(trainingCenter: number, paused: boolean, playerCount: number): { label: string; detail: string }` for the canvas label and adjacent scene status.

- [x] **Step 1: Write the failing tests** for paused/running labels, CT level clamping and zero-player fallback.
- [x] **Step 2: Run `npm test -- tests/scenePresentation.test.ts`** and confirm the failure is caused by the missing helper.
- [x] **Step 3: Implement the minimal pure helper** and use it in `CtScene` for `aria-label` plus a visually sutil `.scene-status` text node.
- [x] **Step 4: Run the focused test and then the full suite**; confirm both pass.

### Task 2: CT pixel art em camadas

**Files:**
- Modify: `src/ui/scene/CtScene.tsx`
- Modify: `src/ui/scene/sprites.ts`

**Interfaces:**
- Consumes `scenePresentation` from Task 1.
- Keeps `CtScene` props and sprite exports compatible with the existing `Game` caller.

- [x] **Step 1: Write/extend a pure scene test** covering the stable copy used for the CT state before changing canvas code.
- [x] **Step 2: Run the focused test and observe the expected missing behavior.**
- [x] **Step 3: Add deterministic scene layers:** horizon silhouette, CT entrance/details, light pools, bench/rack, cones/balls and a more readable pitch treatment, while keeping the current 240×135 coordinate system.
- [x] **Step 4: Add one restrained player/coach visual variation** using the existing hash-derived look so silhouettes remain legible and deterministic.
- [x] **Step 5: Run focused tests and `npm run build`.**

### Task 3: Hierarquia da tela de carreira

**Files:**
- Modify: `src/ui/Game.tsx`
- Modify: `src/ui/styles.css`

**Interfaces:**
- Keeps all existing career actions, callbacks, modal components and menu IDs unchanged.

- [x] **Step 1: Add semantic labels/status text** around HUD groups, next match, objective progress and speed controls without changing the underlying values.
- [x] **Step 2: Refine CSS composition** so the CT is the visual stage, “Próximo jogo” is the secondary decision panel, and objective/news read as compact context.
- [x] **Step 3: Add active/hover/focus states** to dock buttons and explicit paused/simulation states; preserve hard pixel borders and the existing palette.
- [x] **Step 4: Run `npm run typecheck` and the full test suite.**

### Task 4: Onboarding e mobile

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/styles.css`

**Interfaces:**
- Keeps `Create` props and `onStart` contract unchanged.

- [x] **Step 1: Add a testable DOM-independent helper only if a new onboarding transition rule is introduced; otherwise keep this task CSS/markup-only.**
- [x] **Step 2: Refine step headers, selected states and the opportunity section so the existing flow reads as one game setup sequence.**
- [x] **Step 3: Tune the 900 px and 560 px breakpoints:** compact HUD groups, preserve scene aspect ratio, prevent horizontal overflow, and make dock controls touch-friendly.
- [x] **Step 4: Run `npm run build` and manually validate the flow at desktop and approximately 390 px.**

### Task 5: Verification and handoff

**Files:**
- Verify: `src/ui/scene/CtScene.tsx`, `src/ui/scene/sprites.ts`, `src/ui/Game.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`

- [x] **Step 1: Run `npm test` and record the complete result.**
- [x] **Step 2: Run `npm run build` and record the exit code.**
- [x] **Step 3: Inspect the local browser at the title screen, onboarding, game screen and mobile-width viewport.**
- [x] **Step 4: Check `git diff` for unintended engine/data changes and report any remaining limitation explicitly.**

## Próximas etapas — outras plataformas e ambientes

- [ ] **PWA:** manifest, ícones, service worker e instalação offline.
- [ ] **Persistência:** migrar o save do `localStorage` para IndexedDB e suportar múltiplas carreiras.
- [ ] **Mobile nativo:** escolher entre wrapper web (Capacitor) e cliente nativo, mantendo o core determinístico compartilhado.
- [ ] **Adaptação mobile:** safe areas, teclado/gestos, navegação por toque e testes em iOS/Android reais.
- [ ] **QA cross-browser:** Chrome, Safari, Firefox, viewport 390/430/768/1280 e modo paisagem.
- [ ] **CI:** typecheck, testes, build e preview automatizados no GitHub Actions.
- [ ] **Conteúdo:** estádio em dia de jogo, clima/estações, copa, lesões e upgrades de estrutura.
