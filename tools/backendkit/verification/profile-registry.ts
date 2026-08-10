export type VerificationProfileId = 'fast' | 'full' | 'runtime' | 'ci';

export type NpmVerificationStep = Readonly<{
  kind: 'npm';
  id: string;
  title: string;
  script: string;
  timeoutMs?: number;
}>;

export type NestedVerificationProfile = Readonly<{
  kind: 'profile';
  profile: VerificationProfileId;
}>;

export type VerificationProfileStep = NpmVerificationStep | NestedVerificationProfile;

export type VerificationProfile = Readonly<{
  id: VerificationProfileId;
  description: string;
  steps: ReadonlyArray<VerificationProfileStep>;
}>;

export type VerificationProfileRegistry = Readonly<
  Record<VerificationProfileId, VerificationProfile>
>;

export const verificationProfiles: VerificationProfileRegistry = {
  fast: {
    id: 'fast',
    description: 'Deterministic static checks and unit tests',
    steps: [
      {
        kind: 'npm',
        id: 'knowledge',
        title: 'Knowledge lifecycle',
        script: 'verify:knowledge',
      },
      { kind: 'npm', id: 'format', title: 'Format check', script: 'format:check' },
      { kind: 'npm', id: 'lint', title: 'Lint', script: 'lint' },
      { kind: 'npm', id: 'types', title: 'Typecheck', script: 'typecheck' },
      {
        kind: 'npm',
        id: 'environment',
        title: 'Environment example schema',
        script: 'verify:env',
      },
      {
        kind: 'npm',
        id: 'dependencies',
        title: 'Dependency boundaries',
        script: 'deps:check',
      },
      { kind: 'npm', id: 'unit', title: 'Unit tests', script: 'test' },
      {
        kind: 'npm',
        id: 'openapi-snapshot',
        title: 'OpenAPI snapshot gate',
        script: 'openapi:check',
      },
      {
        kind: 'npm',
        id: 'openapi-lint',
        title: 'OpenAPI Spectral lint',
        script: 'openapi:lint',
      },
    ],
  },
  full: {
    id: 'full',
    description: 'Complete non-Docker CI-equivalent verification',
    steps: [
      {
        kind: 'npm',
        id: 'knowledge',
        title: 'Knowledge lifecycle',
        script: 'verify:knowledge',
      },
      {
        kind: 'npm',
        id: 'prisma',
        title: 'Prisma schema and generation drift',
        script: 'verify:prisma',
      },
      { kind: 'npm', id: 'format', title: 'Format check', script: 'format:check' },
      { kind: 'npm', id: 'lint', title: 'Lint', script: 'lint' },
      { kind: 'npm', id: 'types', title: 'Typecheck', script: 'typecheck' },
      {
        kind: 'npm',
        id: 'environment',
        title: 'Environment example schema',
        script: 'verify:env',
      },
      {
        kind: 'npm',
        id: 'project-map',
        title: 'Project map drift',
        script: 'verify:project-map',
      },
      {
        kind: 'npm',
        id: 'oracles',
        title: 'High-risk acceptance oracles',
        script: 'verify:oracles',
      },
      {
        kind: 'npm',
        id: 'operating-evidence',
        title: 'Operating evidence ledger',
        script: 'verify:evidence',
      },
      {
        kind: 'npm',
        id: 'dependencies',
        title: 'Dependency boundaries',
        script: 'deps:check',
      },
      {
        kind: 'npm',
        id: 'scaffold',
        title: 'Scaffold smoke',
        script: 'scaffold:smoke',
      },
      {
        kind: 'npm',
        id: 'architecture',
        title: 'Architecture smell scan',
        script: 'smells:arch:ci',
      },
      {
        kind: 'npm',
        id: 'duplication',
        title: 'Duplication self-review report',
        script: 'duplication:report',
      },
      {
        kind: 'npm',
        id: 'coverage',
        title: 'Unit tests with coverage',
        script: 'test:coverage',
      },
      {
        kind: 'npm',
        id: 'openapi-snapshot',
        title: 'OpenAPI snapshot gate',
        script: 'openapi:check',
      },
      {
        kind: 'npm',
        id: 'openapi-lint',
        title: 'OpenAPI Spectral lint',
        script: 'openapi:lint',
      },
      {
        kind: 'npm',
        id: 'gate-honesty',
        title: 'Gate honesty',
        script: 'verify:gates',
      },
      {
        kind: 'npm',
        id: 'dependency-audit',
        title: 'Runtime dependency vulnerability audit',
        script: 'audit:prod',
      },
    ],
  },
  runtime: {
    id: 'runtime',
    description: 'Docker-backed migration, integration, and E2E verification',
    steps: [
      {
        kind: 'npm',
        id: 'runtime',
        title: 'Docker-backed runtime verification',
        script: 'harness:runtime',
      },
    ],
  },
  ci: {
    id: 'ci',
    description: 'Full clean-checkout verification including runtime dependencies',
    steps: [
      { kind: 'profile', profile: 'full' },
      { kind: 'profile', profile: 'runtime' },
    ],
  },
};

export function parseVerificationProfileId(value: string): VerificationProfileId | undefined {
  switch (value) {
    case 'fast':
    case 'full':
    case 'runtime':
    case 'ci':
      return value;
    default:
      return undefined;
  }
}

export function expandVerificationProfile(
  profileId: VerificationProfileId,
  registry: VerificationProfileRegistry = verificationProfiles,
): ReadonlyArray<NpmVerificationStep> {
  return expand(profileId, registry, []);
}

function expand(
  profileId: VerificationProfileId,
  registry: VerificationProfileRegistry,
  ancestors: ReadonlyArray<VerificationProfileId>,
): ReadonlyArray<NpmVerificationStep> {
  if (ancestors.includes(profileId)) {
    throw new Error(`Verification profile cycle: ${[...ancestors, profileId].join(' -> ')}`);
  }

  const profile = registry[profileId];
  const nextAncestors = [...ancestors, profileId];
  const expanded: NpmVerificationStep[] = [];

  for (const step of profile.steps) {
    if (step.kind === 'npm') {
      expanded.push(step);
      continue;
    }
    expanded.push(...expand(step.profile, registry, nextAncestors));
  }

  return expanded;
}
