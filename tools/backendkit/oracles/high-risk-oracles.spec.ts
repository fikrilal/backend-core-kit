import { highRiskOracles, validateHighRiskOracles } from './high-risk-oracles';

describe('high-risk acceptance oracles', () => {
  it('maps every scenario to existing independent runtime evidence', async () => {
    await expect(validateHighRiskOracles(process.cwd())).resolves.toBeUndefined();
    expect(highRiskOracles.length).toBeGreaterThanOrEqual(5);
  });

  it('rejects duplicate identities and unit-only evidence', async () => {
    const invalidEvidence = {
      ...highRiskOracles[0],
      evidence: [{ kind: 'e2e' as const, path: 'x.spec.ts' }],
    };
    const duplicate = highRiskOracles[0];
    if (!duplicate) throw new Error('Missing oracle fixture.');
    await expect(validateHighRiskOracles(process.cwd(), [duplicate, duplicate])).rejects.toThrow(
      'invalid or duplicated',
    );
    await expect(validateHighRiskOracles(process.cwd(), [invalidEvidence])).rejects.toThrow(
      'invalid e2e evidence',
    );
  });
});
