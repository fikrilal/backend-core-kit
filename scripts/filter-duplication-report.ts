import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

type Profile = 'core' | 'small-helpers';

type Category =
  | 'cursor_filter_sort_helper'
  | 'date_time_normalization_helper'
  | 'dto_view_mapper'
  | 'error_problem_mapping'
  | 'prisma_query_builder'
  | 'queue_job_envelope'
  | 'rate_limiter_helper'
  | 'request_trace_fallback'
  | 'transaction_retry_helper';

type CliOptions = Readonly<{
  profile: Profile;
  reportPath: string;
  allowlistPath: string;
  outputPath: string;
  fatalFound: boolean;
}>;

type FileSpan = Readonly<{
  name: string;
  start: number;
  end: number;
}>;

type Duplicate = Readonly<{
  format: string;
  lines: number;
  tokens: number;
  fragment: string;
  firstFile: FileSpan;
  secondFile: FileSpan;
}>;

type CategorizedDuplicate = Readonly<{
  duplicate: Duplicate;
  category: Category;
}>;

type AllowlistEntry = Readonly<{
  category: Category;
  files: readonly [string, string];
  reason: string;
  reviewedOn?: string;
}>;

type AllowlistMatch = Readonly<{
  entry: AllowlistEntry;
  index: number;
}>;

type Allowlist = Readonly<{
  entries: ReadonlyArray<AllowlistEntry>;
}>;

type Group = Readonly<{
  category: Category;
  firstPath: string;
  secondPath: string;
  occurrences: number;
  maxLines: number;
  maxTokens: number;
  firstLine: number;
  secondLine: number;
  allowlistEntry?: AllowlistEntry;
}>;

const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  cursor_filter_sort_helper: 'Cursor/filter/sort helper',
  date_time_normalization_helper: 'Date/time parsing or normalization helper',
  dto_view_mapper: 'DTO/view mapper',
  error_problem_mapping: 'Error/problem mapping',
  prisma_query_builder: 'Prisma query builder',
  queue_job_envelope: 'Queue job envelope/idempotency helper',
  rate_limiter_helper: 'Rate limiter helper',
  request_trace_fallback: 'Request trace fallback',
  transaction_retry_helper: 'Transaction retry helper',
};

const CATEGORY_VALUES: ReadonlyArray<Category> = [
  'cursor_filter_sort_helper',
  'date_time_normalization_helper',
  'dto_view_mapper',
  'error_problem_mapping',
  'prisma_query_builder',
  'queue_job_envelope',
  'rate_limiter_helper',
  'request_trace_fallback',
  'transaction_retry_helper',
];

const PROFILE_DEFAULTS: Readonly<Record<Profile, Omit<CliOptions, 'profile' | 'fatalFound'>>> = {
  core: {
    reportPath: '.tmp/jscpd-core/jscpd-report.json',
    allowlistPath: 'tools/duplication-allowlist.json',
    outputPath: '_WIP/duplication-report.md',
  },
  'small-helpers': {
    reportPath: '.tmp/jscpd-small-helpers/jscpd-report.json',
    allowlistPath: 'tools/small-helper-duplication-allowlist.json',
    outputPath: '_WIP/small-helper-duplication-report.md',
  },
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return readString(value, field);
}

function parseProfile(value: string): Profile {
  if (value === 'core' || value === 'small-helpers') return value;
  throw new Error('--profile must be one of: core, small-helpers');
}

function parseCategory(value: unknown, field: string): Category {
  const raw = readString(value, field);
  for (const category of CATEGORY_VALUES) {
    if (raw === category) {
      return category;
    }
  }
  throw new Error(`${field} must be one of: ${CATEGORY_VALUES.join(', ')}`);
}

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
  let profile: Profile = 'core';
  let reportPath: string | undefined;
  let allowlistPath: string | undefined;
  let outputPath: string | undefined;
  let fatalFound = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--fatal-found') {
      fatalFound = true;
      continue;
    }

    if (arg === '--profile') {
      const value = argv[i + 1];
      if (!value) throw new Error('--profile requires a value');
      profile = parseProfile(value);
      i += 1;
      continue;
    }

    if (arg === '--report') {
      const value = argv[i + 1];
      if (!value) throw new Error('--report requires a value');
      reportPath = value;
      i += 1;
      continue;
    }

    if (arg === '--allowlist') {
      const value = argv[i + 1];
      if (!value) throw new Error('--allowlist requires a value');
      allowlistPath = value;
      i += 1;
      continue;
    }

    if (arg === '--output') {
      const value = argv[i + 1];
      if (!value) throw new Error('--output requires a value');
      outputPath = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const defaults = PROFILE_DEFAULTS[profile];

  return {
    profile,
    reportPath: reportPath ?? defaults.reportPath,
    allowlistPath: allowlistPath ?? defaults.allowlistPath,
    outputPath: outputPath ?? defaults.outputPath,
    fatalFound,
  };
}

function parseSpan(value: unknown, field: string): FileSpan {
  if (!isObject(value)) throw new Error(`${field} must be an object`);
  return {
    name: normalizePath(readString(value.name, `${field}.name`)),
    start: readNumber(value.start, `${field}.start`),
    end: readNumber(value.end, `${field}.end`),
  };
}

function parseDuplicate(value: unknown, index: number): Duplicate {
  if (!isObject(value)) throw new Error(`duplicates[${index}] must be an object`);
  return {
    format: readString(value.format, `duplicates[${index}].format`),
    lines: readNumber(value.lines, `duplicates[${index}].lines`),
    tokens: typeof value.tokens === 'number' && Number.isFinite(value.tokens) ? value.tokens : 0,
    fragment: readString(value.fragment, `duplicates[${index}].fragment`),
    firstFile: parseSpan(value.firstFile, `duplicates[${index}].firstFile`),
    secondFile: parseSpan(value.secondFile, `duplicates[${index}].secondFile`),
  };
}

async function loadDuplicates(reportPath: string): Promise<ReadonlyArray<Duplicate>> {
  const raw = await readFile(resolve(process.cwd(), reportPath), 'utf8');
  const decoded: unknown = JSON.parse(raw);
  if (!isObject(decoded)) throw new Error(`Report '${reportPath}' must be a JSON object`);

  const rawDuplicates = decoded.duplicates;
  if (!Array.isArray(rawDuplicates)) {
    throw new Error(`Report '${reportPath}' must contain a duplicates array`);
  }

  return rawDuplicates.map((item, index) => parseDuplicate(item, index));
}

async function loadAllowlist(allowlistPath: string): Promise<Allowlist> {
  const raw = await readFile(resolve(process.cwd(), allowlistPath), 'utf8');
  const decoded: unknown = JSON.parse(raw);
  if (!isObject(decoded)) throw new Error(`Allowlist '${allowlistPath}' must be a JSON object`);

  const version = readNumber(decoded.version, `${allowlistPath}.version`);
  if (version !== 1) throw new Error(`Allowlist '${allowlistPath}' must use version 1`);

  const rawEntries = decoded.reviewedAcceptable;
  if (!Array.isArray(rawEntries)) {
    throw new Error(`Allowlist '${allowlistPath}' must contain reviewedAcceptable array`);
  }

  const entries = rawEntries.map((item, index) => {
    if (!isObject(item)) throw new Error(`reviewedAcceptable[${index}] must be an object`);
    if (!Array.isArray(item.files) || item.files.length !== 2) {
      throw new Error(`reviewedAcceptable[${index}].files must contain exactly two paths`);
    }
    const firstFile = normalizePath(
      readString(item.files[0], `reviewedAcceptable[${index}].files[0]`),
    );
    const secondFile = normalizePath(
      readString(item.files[1], `reviewedAcceptable[${index}].files[1]`),
    );
    return {
      category: parseCategory(item.category, `reviewedAcceptable[${index}].category`),
      files: [firstFile, secondFile],
      reason: readString(item.reason, `reviewedAcceptable[${index}].reason`),
      reviewedOn: readOptionalString(item.reviewedOn, `reviewedAcceptable[${index}].reviewedOn`),
    } satisfies AllowlistEntry;
  });

  return { entries };
}

function isSelfFile(duplicate: Duplicate): boolean {
  return duplicate.firstFile.name === duplicate.secondFile.name;
}

function pairKey(first: string, second: string): string {
  const ordered = [normalizePath(first), normalizePath(second)].sort((a, b) => a.localeCompare(b));
  return `${ordered[0]}<>${ordered[1]}`;
}

function duplicatePairKey(duplicate: Duplicate): string {
  return pairKey(duplicate.firstFile.name, duplicate.secondFile.name);
}

function categorize(profile: Profile, duplicate: Duplicate): Category | undefined {
  const files = `${duplicate.firstFile.name}\n${duplicate.secondFile.name}`.toLowerCase();
  const fragment = duplicate.fragment.toLowerCase();
  const combined = `${files}\n${fragment}`;

  if (
    combined.includes('problem') ||
    combined.includes('exception.filter') ||
    combined.includes('error.filter')
  ) {
    return 'error_problem_mapping';
  }

  if (
    files.includes('query-builder') ||
    files.includes('query-builders') ||
    combined.includes('prisma.')
  ) {
    return 'prisma_query_builder';
  }

  if (
    files.includes('list-query') ||
    combined.includes('cursor') ||
    combined.includes('sort') ||
    combined.includes('pagination')
  ) {
    return 'cursor_filter_sort_helper';
  }

  if (
    files.includes('rate-limit') ||
    combined.includes('ratelimit') ||
    combined.includes('rate limit')
  ) {
    return 'rate_limiter_helper';
  }

  if (
    combined.includes('transaction') ||
    combined.includes('retry') ||
    files.includes('tx-retry')
  ) {
    return 'transaction_retry_helper';
  }

  if (
    files.includes('/jobs/') ||
    files.includes('/queue/') ||
    combined.includes('idempotency') ||
    combined.includes('job.data')
  ) {
    return 'queue_job_envelope';
  }

  if (
    combined.includes('requestid') ||
    combined.includes('request-id') ||
    combined.includes('traceid')
  ) {
    return 'request_trace_fallback';
  }

  if (
    combined.includes('date') ||
    combined.includes('datetime') ||
    combined.includes('parseiso') ||
    combined.includes('clock')
  ) {
    return 'date_time_normalization_helper';
  }

  if (
    files.includes('/dtos/') ||
    files.includes('.mapper') ||
    files.includes('.mappers') ||
    combined.includes('dto') ||
    combined.includes('toview') ||
    combined.includes('response')
  ) {
    return 'dto_view_mapper';
  }

  if (
    profile === 'small-helpers' &&
    (combined.includes('normalize') || combined.includes('parse') || combined.includes('format'))
  ) {
    return 'date_time_normalization_helper';
  }

  return undefined;
}

function findAllowlistMatch(
  duplicate: Duplicate,
  category: Category,
  allowlist: Allowlist,
): AllowlistMatch | undefined {
  const currentKey = duplicatePairKey(duplicate);

  for (let index = 0; index < allowlist.entries.length; index += 1) {
    const entry = allowlist.entries[index];
    if (!entry || entry.category !== category) continue;
    if (pairKey(entry.files[0], entry.files[1]) === currentKey) {
      return { entry, index };
    }
  }

  return undefined;
}

function groupKey(duplicate: Duplicate, category: Category): string {
  return `${category}|${duplicatePairKey(duplicate)}`;
}

function addToGroup(existing: Group, duplicate: Duplicate): Group {
  return {
    ...existing,
    occurrences: existing.occurrences + 1,
    maxLines: Math.max(existing.maxLines, duplicate.lines),
    maxTokens: Math.max(existing.maxTokens, duplicate.tokens),
    firstLine: Math.min(existing.firstLine, duplicate.firstFile.start),
    secondLine: Math.min(existing.secondLine, duplicate.secondFile.start),
  };
}

function groupDuplicates(
  items: ReadonlyArray<CategorizedDuplicate>,
  matches: ReadonlyMap<string, AllowlistEntry>,
): ReadonlyArray<Group> {
  const grouped = new Map<string, Group>();

  for (const item of items) {
    const key = groupKey(item.duplicate, item.category);
    const existing = grouped.get(key);
    if (existing) {
      grouped.set(key, addToGroup(existing, item.duplicate));
      continue;
    }

    grouped.set(key, {
      category: item.category,
      firstPath: item.duplicate.firstFile.name,
      secondPath: item.duplicate.secondFile.name,
      occurrences: 1,
      maxLines: item.duplicate.lines,
      maxTokens: item.duplicate.tokens,
      firstLine: item.duplicate.firstFile.start,
      secondLine: item.duplicate.secondFile.start,
      allowlistEntry: matches.get(key),
    });
  }

  return [...grouped.values()].sort(byGroupOrder);
}

function byGroupOrder(a: Group, b: Group): number {
  const byCategory = a.category.localeCompare(b.category);
  if (byCategory !== 0) return byCategory;
  const byLines = b.maxLines - a.maxLines;
  if (byLines !== 0) return byLines;
  return `${a.firstPath}${a.secondPath}`.localeCompare(`${b.firstPath}${b.secondPath}`);
}

function categoryCounts(groups: ReadonlyArray<Group>): ReadonlyMap<Category, number> {
  const counts = new Map<Category, number>();
  for (const group of groups) {
    counts.set(group.category, (counts.get(group.category) ?? 0) + 1);
  }
  return counts;
}

function formatCategoryCounts(groups: ReadonlyArray<Group>): ReadonlyArray<string> {
  const counts = categoryCounts(groups);
  return CATEGORY_VALUES.filter((category) => counts.has(category)).map(
    (category) => `- ${CATEGORY_LABELS[category]}: ${counts.get(category) ?? 0}`,
  );
}

function formatGroup(group: Group): ReadonlyArray<string> {
  const lines = [
    `- [${CATEGORY_LABELS[group.category]}] ${group.firstPath}:${group.firstLine} <> ${group.secondPath}:${group.secondLine}`,
    `  occurrences=${group.occurrences}, maxLines=${group.maxLines}, maxTokens=${group.maxTokens}`,
  ];

  if (group.allowlistEntry) {
    lines.push(`  reviewedOn=${group.allowlistEntry.reviewedOn ?? 'n/a'}`);
    lines.push(`  reason=${group.allowlistEntry.reason}`);
  }

  return lines;
}

function renderReport(params: {
  options: CliOptions;
  rawCount: number;
  selfFileCount: number;
  crossFileCount: number;
  categorizedCount: number;
  uncategorizedCount: number;
  reviewedGroups: ReadonlyArray<Group>;
  actionableGroups: ReadonlyArray<Group>;
  unusedAllowlistEntries: ReadonlyArray<AllowlistEntry>;
}): string {
  const lines: string[] = [
    `# Duplication Report (${params.options.profile})`,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Raw report: ${params.options.reportPath}`,
    `Allowlist: ${params.options.allowlistPath}`,
    '',
    '## Summary',
    '',
    `- Raw duplicates: ${params.rawCount}`,
    `- Self-file filtered out: ${params.selfFileCount}`,
    `- Cross-file duplicates: ${params.crossFileCount}`,
    `- Categorized duplicates: ${params.categorizedCount}`,
    `- Uncategorized filtered out: ${params.uncategorizedCount}`,
    `- Reviewed acceptable groups: ${params.reviewedGroups.length}`,
    `- Actionable duplicate groups: ${params.actionableGroups.length}`,
    `- Unused allowlist entries: ${params.unusedAllowlistEntries.length}`,
  ];

  if (params.actionableGroups.length > 0) {
    lines.push('', '## Actionable Category Breakdown', '');
    lines.push(...formatCategoryCounts(params.actionableGroups));
    lines.push('', '## Actionable Groups', '');
    for (const group of params.actionableGroups) {
      lines.push(...formatGroup(group));
    }
  } else {
    lines.push('', '## Actionable Groups', '', 'No actionable duplicate groups found.');
  }

  if (params.reviewedGroups.length > 0) {
    lines.push('', '## Reviewed Acceptable Groups', '');
    for (const group of params.reviewedGroups) {
      lines.push(...formatGroup(group));
    }
  }

  if (params.unusedAllowlistEntries.length > 0) {
    lines.push('', '## Unused Allowlist Entries', '');
    for (const entry of params.unusedAllowlistEntries) {
      lines.push(`- [${CATEGORY_LABELS[entry.category]}] ${entry.files[0]} <> ${entry.files[1]}`);
      lines.push(`  reason=${entry.reason}`);
    }
  }

  lines.push('', '## Interpretation', '');
  lines.push(
    'Actionable means the duplicate matched a backend category and has not been reviewed as acceptable.',
    'It does not automatically mean extract immediately; it means review the pattern before adding more parallel code.',
    'Reviewed acceptable duplicates must stay explicit in the allowlist with rationale.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const duplicates = await loadDuplicates(options.reportPath);
  const allowlist = await loadAllowlist(options.allowlistPath);

  const crossFile = duplicates.filter((duplicate) => !isSelfFile(duplicate));
  const categorized: CategorizedDuplicate[] = [];
  let uncategorizedCount = 0;

  for (const duplicate of crossFile) {
    const category = categorize(options.profile, duplicate);
    if (!category) {
      uncategorizedCount += 1;
      continue;
    }
    categorized.push({ duplicate, category });
  }

  const usedAllowlistIndexes = new Set<number>();
  const reviewed: CategorizedDuplicate[] = [];
  const actionable: CategorizedDuplicate[] = [];
  const reviewedMatches = new Map<string, AllowlistEntry>();

  for (const item of categorized) {
    const match = findAllowlistMatch(item.duplicate, item.category, allowlist);
    if (match) {
      usedAllowlistIndexes.add(match.index);
      reviewed.push(item);
      reviewedMatches.set(groupKey(item.duplicate, item.category), match.entry);
      continue;
    }
    actionable.push(item);
  }

  const reviewedGroups = groupDuplicates(reviewed, reviewedMatches);
  const actionableGroups = groupDuplicates(actionable, new Map<string, AllowlistEntry>());
  const unusedAllowlistEntries = allowlist.entries.filter(
    (_, index) => !usedAllowlistIndexes.has(index),
  );

  const report = renderReport({
    options,
    rawCount: duplicates.length,
    selfFileCount: duplicates.length - crossFile.length,
    crossFileCount: crossFile.length,
    categorizedCount: categorized.length,
    uncategorizedCount,
    reviewedGroups,
    actionableGroups,
    unusedAllowlistEntries,
  });

  const outputAbs = resolve(process.cwd(), options.outputPath);
  await mkdir(dirname(outputAbs), { recursive: true });
  await writeFile(outputAbs, report, 'utf8');

  const reportRel = normalizePath(relative(process.cwd(), outputAbs));
  process.stdout.write(`Duplication summary (${options.profile})\n`);
  process.stdout.write(`- Raw duplicates: ${duplicates.length}\n`);
  process.stdout.write(`- Actionable groups: ${actionableGroups.length}\n`);
  process.stdout.write(`- Reviewed acceptable groups: ${reviewedGroups.length}\n`);
  process.stdout.write(`- Unused allowlist entries: ${unusedAllowlistEntries.length}\n`);
  process.stdout.write(`Report written to ${reportRel}\n`);

  if (options.fatalFound && actionableGroups.length > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
