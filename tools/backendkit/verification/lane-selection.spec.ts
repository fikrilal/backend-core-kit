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
