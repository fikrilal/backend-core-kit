import { maximumRisk, normalizeRepositoryPath, type Risk } from '../task/task-plan';

export type RiskReason = Readonly<{
  path: string;
  risk: Risk;
  ruleId: string;
  description: string;
}>;

export type RiskClassification = Readonly<{
  effectiveRisk: Risk;
  pathRisk: Risk;
  declaredRisk?: Risk;
  paths: ReadonlyArray<string>;
  reasons: ReadonlyArray<RiskReason>;
}>;

type RiskRule = Readonly<{
  id: string;
  risk: Risk;
  description: string;
  matches(path: string): boolean;
}>;

const rules: ReadonlyArray<RiskRule> = [
  rule('high.ci', 'high', 'CI or repository automation', (path) => path.startsWith('.github/')),
  rule(
    'high.harness',
    'high',
    'Harness implementation or policy',
    (path) => path.startsWith('tools/backendkit/') || path.startsWith('tools/harness-policy/'),
  ),
  rule('high.dependencies', 'high', 'Dependency or runtime lock', (path) =>
    ['package.json', 'package-lock.json', '.nvmrc', 'Dockerfile', 'docker-compose.yml'].includes(
      path,
    ),
  ),
  rule(
    'high.secrets',
    'high',
    'Secrets or environment policy',
    (path) => /^\.env(?:\.|$)/.test(path) || path.includes('/security') || path === 'AGENTS.md',
  ),
  rule('high.auth', 'high', 'Authentication, session, or RBAC behavior', (path) =>
    /(?:^|\/)(?:auth|rbac|session|sessions)(?:\/|[.-])/.test(path),
  ),
  rule(
    'high.persistence',
    'high',
    'Database schema, migration, or destructive data behavior',
    (path) =>
      path === 'prisma/schema.prisma' ||
      path.startsWith('prisma/migrations/') ||
      /account-deletion|data-deletion/.test(path),
  ),
  rule(
    'high.queue',
    'high',
    'Queue contract or idempotency behavior',
    (path) =>
      path.startsWith('libs/platform/queue/') || /idempotenc|\.processor\.|\.worker\./.test(path),
  ),
  rule(
    'medium.application',
    'medium',
    'Application or shared source',
    (path) => path.startsWith('apps/') || path.startsWith('libs/'),
  ),
  rule('medium.tests', 'medium', 'Test behavior', (path) => path.startsWith('test/')),
  rule('medium.scripts', 'medium', 'Repository script', (path) => path.startsWith('scripts/')),
  rule('medium.config', 'medium', 'Build or test configuration', (path) =>
    /^(?:eslint|jest|nest-cli|prettier|tsconfig)(?:\.|$)/.test(path),
  ),
  rule('low.docs', 'low', 'Documentation', (path) => path.startsWith('docs/')),
  rule(
    'low.metadata',
    'low',
    'Repository documentation or metadata',
    (path) => path === 'README.md' || path === '.gitignore',
  ),
];

export function classifyRisk(
  changedPaths: ReadonlyArray<string>,
  declaredRisk?: Risk,
): RiskClassification {
  const paths = [...new Set(changedPaths.map(normalizeRepositoryPath))].sort();
  const pathReasons = paths.map(classifyPath);
  const pathRisk =
    pathReasons.length === 0 ? 'low' : maximumRisk(pathReasons.map(({ risk }) => risk));
  const effectiveRisk = declaredRisk ? maximumRisk([pathRisk, declaredRisk]) : pathRisk;
  const reasons = pathReasons.filter(({ risk }) => risk === effectiveRisk);

  return { effectiveRisk, pathRisk, declaredRisk, paths, reasons };
}

export function classifyPath(path: string): RiskReason {
  const normalized = normalizeRepositoryPath(path);
  const matched = rules.find((candidate) => candidate.matches(normalized));
  if (!matched) {
    return {
      path: normalized,
      risk: 'medium',
      ruleId: 'medium.unknown',
      description: 'Unknown repository path',
    };
  }
  return {
    path: normalized,
    risk: matched.risk,
    ruleId: matched.id,
    description: matched.description,
  };
}

function rule(
  id: string,
  risk: Risk,
  description: string,
  matches: (path: string) => boolean,
): RiskRule {
  return { id, risk, description, matches };
}
