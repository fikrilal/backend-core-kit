import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export type OracleEvidence = Readonly<{
  kind: 'integration' | 'e2e';
  path: string;
}>;

export type HighRiskOracle = Readonly<{
  id: string;
  acceptance: string;
  evidence: ReadonlyArray<OracleEvidence>;
}>;

export const highRiskOracles: ReadonlyArray<HighRiskOracle> = [
  {
    id: 'auth.refresh-rotation',
    acceptance: 'Refresh rotation rejects replay and preserves the documented session contract.',
    evidence: [{ kind: 'e2e', path: 'test/auth/auth-core.e2e-spec.ts' }],
  },
  {
    id: 'auth.account-deletion',
    acceptance:
      'Account deletion request, cancellation, and finalization remain authenticated and observable.',
    evidence: [
      { kind: 'e2e', path: 'test/auth/auth-account-deletion.e2e-spec.ts' },
      { kind: 'integration', path: 'test/queue-smoke.int-spec.ts' },
    ],
  },
  {
    id: 'rbac.last-admin',
    acceptance: 'Concurrent role changes cannot remove the final active administrator.',
    evidence: [{ kind: 'integration', path: 'test/admin-last-admin.int-spec.ts' }],
  },
  {
    id: 'http.idempotent-write',
    acceptance:
      'A repeated idempotent write returns the stored outcome without applying the mutation twice.',
    evidence: [{ kind: 'integration', path: 'test/idempotency.int-spec.ts' }],
  },
  {
    id: 'security.rate-limits',
    acceptance:
      'Independent abuse-protection buckets enforce their configured limits against real Redis.',
    evidence: [{ kind: 'integration', path: 'test/rate-limiters.int-spec.ts' }],
  },
  {
    id: 'queue.retry-and-finalization',
    acceptance: 'Critical worker jobs retry deterministically and finalize account state once.',
    evidence: [{ kind: 'integration', path: 'test/queue-smoke.int-spec.ts' }],
  },
];

export async function validateHighRiskOracles(
  root: string,
  oracles: ReadonlyArray<HighRiskOracle> = highRiskOracles,
): Promise<void> {
  if (oracles.length === 0) throw new Error('High-risk oracle registry must not be empty.');
  const ids = new Set<string>();
  for (const oracle of oracles) {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(oracle.id) || ids.has(oracle.id)) {
      throw new Error(`High-risk oracle identity is invalid or duplicated: '${oracle.id}'.`);
    }
    ids.add(oracle.id);
    if (oracle.acceptance.trim() !== oracle.acceptance || oracle.acceptance.length < 20) {
      throw new Error(`High-risk oracle '${oracle.id}' needs observable acceptance text.`);
    }
    if (oracle.evidence.length === 0) {
      throw new Error(`High-risk oracle '${oracle.id}' needs independent runtime evidence.`);
    }
    for (const evidence of oracle.evidence) {
      const expectedSuffix = evidence.kind === 'integration' ? '.int-spec.ts' : '.e2e-spec.ts';
      if (!evidence.path.startsWith('test/') || !evidence.path.endsWith(expectedSuffix)) {
        throw new Error(`High-risk oracle '${oracle.id}' has invalid ${evidence.kind} evidence.`);
      }
      const info = await stat(resolve(root, evidence.path));
      if (!info.isFile()) throw new Error(`Oracle evidence is not a file: '${evidence.path}'.`);
    }
  }
}
