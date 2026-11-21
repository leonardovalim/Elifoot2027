"""Playtest com IA: um modelo local (Ollama, com visão) joga o Mestres do Esporte como um jogador humano.

Use pelo `npm run qa:ia` (qa/ai-playtest/run.mjs), que prepara o ambiente, sobe o jogo e gera o relatório.
Requer browser-use 0.13 (modo de ações: o modelo escolhe "clicar no elemento N"). A 1.0 exige que o
modelo escreva código Python, e modelos pequenos como o gemma4 8B não dão conta.

    python play.py <url> <passos> <modelo> <pasta-de-saída> [--headless]
"""
import asyncio, json, os, sys, time

from browser_use import Agent, BrowserProfile, ChatOllama

URL, STEPS, MODEL, OUT = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
HEADLESS = "--headless" in sys.argv
OLLAMA = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")

TASK = f"""
Você é um testador de QA de um jogo web de gerenciamento de futebol em {URL}. Jogue como um jogador de verdade:

1. Clique em "Nova carreira", digite um nome, escolha um desafio e assuma um clube.
2. Abra cada menu de baixo (Elenco, Mercado, Tabela, Finanças, Carreira) e use algo em cada um:
   - Elenco: toque num atleta e mande ele para o banco ou escale outro.
   - Mercado: contrate um atleta que caiba no caixa.
   - Finanças: mude o preço do ingresso.
3. Toque no botão "?" e leia a ajuda.
4. Avance o tempo (botões ▶ no topo) e jogue pelo menos 3 partidas: assista uma narrada e simule as outras.
   Responda as janelas que aparecerem (propostas, renovações, aumentos).
5. Continue jogando até a rodada 6 ou mais.

Durante o teste, anote SÓ problemas que você VIU na tela: texto cortado ou sobreposto, botão que não responde,
número estranho (NaN, negativo sem sentido), tela travada, algo confuso de entender.
NÃO comente sobre suas próprias dificuldades de clicar ou sobre seletores.

No final responda em português:
- O que você conseguiu fazer (lista curta).
- Problemas encontrados: para cada um, a tela, o que você fez e o que viu.
- Se não achou problemas, diga isso.
"""


async def main():
    llm = ChatOllama(model=MODEL, host=OLLAMA, timeout=300, ollama_options={"num_ctx": 65536, "temperature": 0.3})
    agent = Agent(task=TASK, llm=llm, browser_profile=BrowserProfile(headless=HEADLESS, viewport={"width": 1366, "height": 900}),
                  use_vision=True, max_actions_per_step=3, use_thinking=False, max_failures=6, llm_timeout=240, step_timeout=400)
    t0 = time.time()
    history = await agent.run(max_steps=STEPS)
    out = {
        "model": MODEL,
        "url": URL,
        "minutes": round((time.time() - t0) / 60, 1),
        "steps": history.number_of_steps(),
        "done": history.is_done(),
        "final": history.final_result(),
        "errors": [str(e)[:300] for e in history.errors() if e][:30],
    }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "result.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


asyncio.run(main())
