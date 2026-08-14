import type { VerificationProfileId } from './profile-registry';

export type DurationBaseline = Readonly<{
  observedMs: number;
  advisoryMs: number;
}>;

export const durationBaselines: Readonly<Record<VerificationProfileId, DurationBaseline>> = {
  fast: { observedMs: 60_000, advisoryMs: 120_000 },
  full: { observedMs: 135_000, advisoryMs: 240_000 },
  runtime: { observedMs: 32_000, advisoryMs: 120_000 },
  ci: { observedMs: 167_000, advisoryMs: 360_000 },
};

export function durationAdvisory(
  profile: VerificationProfileId,
  durationMs: number,
): string | undefined {
  const baseline = durationBaselines[profile];
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error('Verification duration must be a non-negative finite number.');
  }
  if (durationMs <= baseline.advisoryMs) return undefined;
  return `Duration advisory: ${profile} took ${durationMs}ms; calibration budget is ${baseline.advisoryMs}ms (observed baseline ${baseline.observedMs}ms).`;
}
