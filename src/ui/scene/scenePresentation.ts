export interface ScenePresentation {
  label: string;
  detail: string;
}

export function scenePresentation(trainingCenter: number, paused: boolean, playerCount: number): ScenePresentation {
  const level = Math.max(0, Math.min(5, Math.round(trainingCenter)));
  const squad = Math.max(0, Math.round(playerCount));
  const detail = squad === 0
    ? `Elenco em montagem · estrutura ${level}/5`
    : `${squad} atleta${squad === 1 ? '' : 's'} no CT · estrutura ${level}/5`;

  return {
    label: `Centro de treinamento · ${paused ? 'pausado' : 'treino em andamento'}`,
    detail,
  };
}
