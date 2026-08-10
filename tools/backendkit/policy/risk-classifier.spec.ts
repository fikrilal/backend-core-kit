import { classifyPath, classifyRisk } from './risk-classifier';

describe('backend risk classifier', () => {
  it.each([
    ['libs/features/auth/password.ts', 'high', 'high.auth'],
    ['test/auth/login.e2e-spec.ts', 'high', 'high.auth'],
    ['prisma/migrations/001/migration.sql', 'high', 'high.persistence'],
    ['tools/backendkit/cli.ts', 'high', 'high.harness'],
    ['libs/features/users/me.ts', 'medium', 'medium.application'],
    ['docs/guide/example.md', 'low', 'low.docs'],
    ['unrecognized/file.xyz', 'medium', 'medium.unknown'],
  ])('classifies %s conservatively', (path, risk, ruleId) => {
    expect(classifyPath(path)).toMatchObject({ risk, ruleId });
  });

  it('raises declared risk but never lowers path risk', () => {
    expect(classifyRisk(['docs/README.md'], 'high').effectiveRisk).toBe('high');
    expect(classifyRisk(['libs/features/auth/password.ts'], 'low').effectiveRisk).toBe('high');
  });

  it('uses declared risk when no task-owned paths exist', () => {
    expect(classifyRisk([], 'medium')).toMatchObject({ pathRisk: 'low', effectiveRisk: 'medium' });
  });
});
