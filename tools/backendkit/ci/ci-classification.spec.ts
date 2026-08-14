import { CiClassificationService, writeCiClassification } from './ci-classification';

describe('CiClassificationService', () => {
  it('raises risk from changed plan authority and selects declared runtime impact', async () => {
    const planPath = 'docs/exec-plans/completed/high-runtime.md';
    const service = new CiClassificationService('/repo', {
      diffs: { changedPaths: async () => ['docs/note.md', planPath] },
      plans: { read: async (path) => (path === planPath ? planSource('high', true) : undefined) },
    });

    const result = await service.classify('a'.repeat(40), 'b'.repeat(40));

    expect(result.classification.effectiveRisk).toBe('high');
    expect(result.runtimeRequired).toBe(true);
    expect(result.runtimeReasons).toContain('impact.auth');
  });

  it('selects runtime from conservative changed paths without a plan', async () => {
    const service = new CiClassificationService('/repo', {
      diffs: { changedPaths: async () => ['libs/platform/redis/redis.service.ts'] },
      plans: { read: async () => undefined },
    });

    const result = await service.classify('a'.repeat(40), 'b'.repeat(40));

    expect(result.classification.effectiveRisk).toBe('medium');
    expect(result.runtimeRequired).toBe(true);
    expect(result.runtimeReasons).toContain('path.runtime-platform');
  });

  it('keeps narrow documentation changes low risk without runtime', async () => {
    const service = new CiClassificationService('/repo', {
      diffs: { changedPaths: async () => ['docs/guide/example.md'] },
      plans: { read: async () => undefined },
    });
    const writes: string[] = [];

    const result = await service.classify('a'.repeat(40), 'b'.repeat(40));
    writeCiClassification({ write: (value) => writes.push(value) }, result);

    expect(result.classification.effectiveRisk).toBe('low');
    expect(result.runtimeRequired).toBe(false);
    expect(writes.join('')).toBe('effective_risk=low\nruntime_required=false\n');
  });

  it('fails closed on invalid changed V2 plan metadata', async () => {
    const planPath = 'docs/exec-plans/active/invalid.md';
    const service = new CiClassificationService('/repo', {
      diffs: { changedPaths: async () => [planPath] },
      plans: { read: async () => '**Plan version:** 2\n' },
    });

    await expect(service.classify('a'.repeat(40), 'b'.repeat(40))).rejects.toThrow(
      'exactly one non-empty',
    );
  });
});

function planSource(risk: 'low' | 'medium' | 'high', authImpact: boolean): string {
  return `# CI plan

**Plan version:** 2
**Task ID:** ci-classification-task
**Status:** completed
**Owner:** Fixture
**Risk:** ${risk}
**Authority:** local verification only
**Allowed paths:** docs/
**Allowed actions:** edit, verify
**Maximum risk:** ${risk}
**Repair limit:** 1
**Task timeout:** 30m

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: ${authImpact ? 'yes' : 'no'}
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: no
`;
}
