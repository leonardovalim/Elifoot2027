export type TrainingBoard = 'basic' | 'pro' | 'elite';

export interface SceneDetails {
  level: number;
  litWindows: number;
  lightPools: number;
  coneCount: number;
  board: TrainingBoard;
}

export function sceneDetails(trainingCenter: number): SceneDetails {
  const level = Math.max(0, Math.min(5, Math.round(trainingCenter)));
  return {
    level,
    litWindows: level + 1,
    lightPools: Math.max(1, Math.min(3, Math.ceil(level / 2))),
    coneCount: 2 + Math.ceil(level * 0.8),
    board: level >= 5 ? 'elite' : level >= 3 ? 'pro' : 'basic',
  };
}
