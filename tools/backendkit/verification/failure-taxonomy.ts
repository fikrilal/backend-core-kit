import type { NpmVerificationStep, VerificationProfileId } from './profile-registry';

export type VerificationFailureDescriptor = Readonly<{
  code: string;
  remediation: string;
  repairable: boolean;
}>;

const descriptors: Readonly<Record<string, VerificationFailureDescriptor>> = {
  knowledge: descriptor('preflight.knowledge', 'Fix V2 plan lifecycle or knowledge-link errors.'),
  prisma: descriptor('verify.prisma', 'Fix Prisma schema or generated-client drift.'),
  format: descriptor(
    'verify.format',
    'Run the repository formatter and review the resulting diff.',
  ),
  lint: descriptor('verify.lint', 'Resolve the reported lint violations without disabling rules.'),
  types: descriptor('verify.types', 'Resolve strict TypeScript errors without unsafe assertions.'),
  environment: descriptor(
    'verify.environment',
    'Align environment schema and example documentation.',
  ),
  'project-map': descriptor(
    'verify.project-map',
    'Repair documented paths or repository knowledge links.',
  ),
  dependencies: descriptor('verify.boundaries', 'Restore the documented dependency direction.'),
  scaffold: descriptor('verify.scaffold', 'Fix scaffold output or its architecture contract.'),
  architecture: descriptor(
    'verify.architecture',
    'Fix new architecture findings; do not rewrite the baseline.',
  ),
  duplication: descriptor('verify.duplication', 'Review newly introduced actionable duplication.'),
  unit: descriptor('verify.unit', 'Repair the failing unit behavior.'),
  coverage: descriptor('verify.unit', 'Repair the failing unit or coverage run.'),
  'openapi-snapshot': descriptor(
    'verify.openapi',
    'Regenerate and review the OpenAPI snapshot if intended.',
  ),
  'openapi-lint': descriptor('verify.openapi', 'Fix the OpenAPI contract lint finding.'),
  'gate-honesty': descriptor('verify.gates', 'Restore the expected-failure guardrail behavior.'),
  'dependency-audit': descriptor(
    'verify.security',
    'Review and remediate the production dependency finding.',
  ),
  runtime: descriptor(
    'runtime.verification',
    'Inspect migration, integration, E2E, and dependency diagnostics.',
  ),
};

export function describeVerificationFailure(
  profile: VerificationProfileId,
  step: NpmVerificationStep,
): VerificationFailureDescriptor {
  if (profile === 'runtime') return descriptors.runtime ?? terminalFallback();
  return descriptors[step.id] ?? terminalFallback();
}

function descriptor(code: string, remediation: string): VerificationFailureDescriptor {
  return { code, remediation, repairable: true };
}

function terminalFallback(): VerificationFailureDescriptor {
  return {
    code: 'harness.unknown-step',
    remediation: 'Escalate because the failed verification step has no registered taxonomy.',
    repairable: false,
  };
}
