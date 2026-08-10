import type { RiskClassification } from '../policy/risk-classifier';
import type { TaskImpactAreas } from '../task/task-plan';
import type { VerificationProfileId } from './profile-registry';

export type VerificationLaneId = Extract<VerificationProfileId, 'fast' | 'full' | 'runtime'>;

export type LaneSelection = Readonly<{
  lanes: ReadonlyArray<VerificationLaneId>;
  runtimeReasons: ReadonlyArray<string>;
}>;

export function selectVerificationLanes(
  classification: RiskClassification,
  impacts: TaskImpactAreas,
): LaneSelection {
  const staticLane: VerificationLaneId = classification.effectiveRisk === 'low' ? 'fast' : 'full';
  const runtimeReasons = [
    ...declaredRuntimeReasons(impacts),
    ...classification.paths.flatMap(runtimePathReasons),
  ];
  const uniqueReasons = [...new Set(runtimeReasons)].sort();
  return {
    lanes: uniqueReasons.length > 0 ? [staticLane, 'runtime'] : [staticLane],
    runtimeReasons: uniqueReasons,
  };
}

function declaredRuntimeReasons(impacts: TaskImpactAreas): ReadonlyArray<string> {
  const reasons: string[] = [];
  if (impacts.api) reasons.push('impact.api');
  if (impacts.database) reasons.push('impact.database');
  if (impacts.auth) reasons.push('impact.auth');
  if (impacts.queue) reasons.push('impact.queue');
  if (impacts.environment) reasons.push('impact.environment');
  if (impacts.externalIntegrations) reasons.push('impact.external-integrations');
  return reasons;
}

function runtimePathReasons(path: string): ReadonlyArray<string> {
  const reasons: string[] = [];
  if (path === 'prisma/schema.prisma' || path.startsWith('prisma/migrations/')) {
    reasons.push('path.database-schema');
  }
  if (
    path.startsWith('libs/platform/db/') ||
    path.startsWith('libs/platform/redis/') ||
    path.startsWith('libs/platform/queue/') ||
    path.startsWith('libs/platform/storage/')
  ) {
    reasons.push('path.runtime-platform');
  }
  if (path.startsWith('apps/worker/') || /(?:\.processor|\.worker)\.(?:ts|js)$/.test(path)) {
    reasons.push('path.worker');
  }
  if (/\.controller\.(?:ts|js)$/.test(path) || /(?:^|\/)test\/.*(?:e2e|int)/.test(path)) {
    reasons.push('path.critical-http');
  }
  if (
    path.startsWith('libs/platform/email/') ||
    path.startsWith('libs/platform/push/') ||
    path.startsWith('libs/platform/otel/')
  ) {
    reasons.push('path.external-adapter');
  }
  return reasons;
}
