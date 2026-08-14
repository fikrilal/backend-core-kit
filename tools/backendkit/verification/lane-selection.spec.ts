import { selectVerificationLanes } from './lane-selection';

describe('verification lane selection', () => {
  it('routes low risk to fast and medium/high risk to full', () => {
    expect(
      selectVerificationLanes(classification('low', ['docs/README.md']), impacts()).lanes,
    ).toEqual(['fast']);
    expect(
      selectVerificationLanes(classification('medium', ['libs/features/users/me.ts']), impacts())
        .lanes,
    ).toEqual(['full']);
    expect(
      selectVerificationLanes(classification('high', ['tools/backendkit/cli.ts']), impacts()).lanes,
    ).toEqual(['full']);
  });

  it('adds runtime for declared impact or runtime-sensitive paths', () => {
    expect(
      selectVerificationLanes(
        classification('medium', ['docs/plan.md']),
        impacts({ database: true }),
      ),
    ).toMatchObject({ lanes: ['full', 'runtime'], runtimeReasons: ['impact.database'] });
    expect(
      selectVerificationLanes(
        classification('high', ['prisma/migrations/001/migration.sql']),
        impacts(),
      ),
    ).toMatchObject({ lanes: ['full', 'runtime'], runtimeReasons: ['path.database-schema'] });
  });

  it('does not infer runtime merely from high harness risk', () => {
    expect(
      selectVerificationLanes(
        classification('high', ['tools/backendkit/task/task-state.ts']),
        impacts(),
      ),
    ).toMatchObject({ lanes: ['full'], runtimeReasons: [] });
  });

  it('maps every declared runtime impact to a stable sorted reason', () => {
    expect(
      selectVerificationLanes(
        classification('medium', ['docs/plan.md']),
        impacts({
          api: true,
          database: true,
          auth: true,
          queue: true,
          environment: true,
          externalIntegrations: true,
        }),
      ).runtimeReasons,
    ).toEqual([
      'impact.api',
      'impact.auth',
      'impact.database',
      'impact.environment',
      'impact.external-integrations',
      'impact.queue',
    ]);
  });

  it.each([
    ['prisma/schema.prisma', 'path.database-schema'],
    ['prisma/migrations/001/migration.sql', 'path.database-schema'],
    ['libs/platform/db/client.ts', 'path.runtime-platform'],
    ['libs/platform/redis/client.ts', 'path.runtime-platform'],
    ['libs/platform/queue/producer.ts', 'path.runtime-platform'],
    ['libs/platform/storage/object.ts', 'path.runtime-platform'],
    ['apps/worker/src/main.ts', 'path.worker'],
    ['libs/features/users/delete.processor.ts', 'path.worker'],
    ['libs/features/users/delete.worker.js', 'path.worker'],
    ['libs/features/users/users.controller.ts', 'path.critical-http'],
    ['test/auth/auth-core.e2e-spec.ts', 'path.critical-http'],
    ['test/idempotency.int-spec.ts', 'path.critical-http'],
    ['libs/platform/email/resend.ts', 'path.external-adapter'],
    ['libs/platform/push/firebase.ts', 'path.external-adapter'],
    ['libs/platform/otel/tracing.ts', 'path.external-adapter'],
  ])('maps runtime-sensitive path %s to %s', (path, reason) => {
    expect(
      selectVerificationLanes(classification('medium', [path]), impacts()).runtimeReasons,
    ).toEqual([reason]);
  });

  it('deduplicates and sorts reasons from multiple paths', () => {
    expect(
      selectVerificationLanes(
        classification('medium', [
          'libs/platform/storage/a.ts',
          'libs/platform/db/b.ts',
          'apps/worker/src/main.ts',
        ]),
        impacts({ auth: true }),
      ).runtimeReasons,
    ).toEqual(['impact.auth', 'path.runtime-platform', 'path.worker']);
  });

  it.each([
    'prisma/schema.prisma.backup',
    'libs/features/platform/db/client.ts',
    'apps/api/src/fake.worker.ts.backup',
    'libs/features/users/users.controller.ts.backup',
    'contest/auth-core.e2e-spec.ts',
    'libs/platform/emailish/resend.ts',
  ])('does not select runtime for near-miss path %s', (path) => {
    expect(selectVerificationLanes(classification('medium', [path]), impacts())).toMatchObject({
      lanes: ['full'],
      runtimeReasons: [],
    });
  });
});

function classification(effectiveRisk: 'low' | 'medium' | 'high', paths: ReadonlyArray<string>) {
  return { effectiveRisk, pathRisk: effectiveRisk, paths, reasons: [] };
}

function impacts(
  overrides: Partial<{
    api: boolean;
    database: boolean;
    auth: boolean;
    queue: boolean;
    environment: boolean;
    observability: boolean;
    externalIntegrations: boolean;
    harness: boolean;
  }> = {},
) {
  return {
    api: false,
    database: false,
    auth: false,
    queue: false,
    environment: false,
    observability: false,
    externalIntegrations: false,
    harness: false,
    ...overrides,
  };
}
