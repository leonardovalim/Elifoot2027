export type WizardStep = 1 | 2 | 3;

export function nextWizardStep(step: WizardStep, input: { name: string; hasChallenge: boolean }): WizardStep {
  if (step === 1 && !input.name.trim()) return 1;
  if (step === 2 && !input.hasChallenge) return 2;
  return step === 3 ? 3 : (step + 1) as WizardStep;
}

export function previousWizardStep(step: WizardStep): WizardStep {
  return step === 1 ? 1 : (step - 1) as WizardStep;
}
