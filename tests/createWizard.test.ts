import { describe, expect, it } from 'vitest';
import { nextWizardStep, previousWizardStep } from '../src/ui/createWizard';

describe('create wizard navigation', () => {
  it('does not leave the name step without a name', () => {
    expect(nextWizardStep(1, { name: '  ', hasChallenge: false })).toBe(1);
    expect(nextWizardStep(1, { name: 'Léo', hasChallenge: false })).toBe(2);
  });

  it('does not show opportunities before a challenge is selected', () => {
    expect(nextWizardStep(2, { name: 'Léo', hasChallenge: false })).toBe(2);
    expect(nextWizardStep(2, { name: 'Léo', hasChallenge: true })).toBe(3);
  });

  it('moves back one step without going before the first step', () => {
    expect(previousWizardStep(3)).toBe(2);
    expect(previousWizardStep(1)).toBe(1);
  });
});
