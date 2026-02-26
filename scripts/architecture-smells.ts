import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

type Severity = 'high' | 'medium' | 'low';

type Finding = Readonly<{
  id: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  snippet?: string;
  docsLink?: string;
}>;

type FileData = Readonly<{
  path: string;
  content: string;
  lines: ReadonlyArray<string>;
}>;

type BaselineFile = Readonly<{
  version: 1;
  generatedAt: string;
  keys: ReadonlyArray<string>;
}>;

type CliOptions = Readonly<{
  ci: boolean;
  reportPath: string;
  baselinePath: string;
  updateBaseline: boolean;
  maxLoc: number;
  failOn: Severity;
  jsonPath?: string;
}>;

type ScanResult = Readonly<{
  findings: ReadonlyArray<Finding>;
  summary: Readonly<Record<Severity, number>>;
  newFindings: ReadonlyArray<Finding>;
  baselineFound: boolean;
}>;

const DEFAULT_REPORT_PATH = '_WIP/architecture-smells.md';
const DEFAULT_BASELINE_PATH = 'tools/architecture-smells.baseline.json';
const DEFAULT_MAX_LOC = 350;

const TS_FILE_EXT = '.ts';

const TEST_FILE_RE = /(?:\.spec|\.test|\.int-spec|\.e2e-spec)\.ts$/;

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  low: 1,
  medium: 2,
  high: 3,
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function isTsSourceFile(path: string): boolean {
  return path.endsWith(TS_FILE_EXT) && !path.endsWith('.d.ts');
}

function isTestLike(path: string): boolean {
  if (TEST_FILE_RE.test(path)) return true;
  if (path.startsWith('test/')) return true;
  return false;
}

function isAppOrLibPath(path: string): boolean {
  return path.startsWith('apps/') || path.startsWith('libs/');
}

function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
  }
}

function findingKey(finding: Finding): string {
  const message = finding.message.replace(/\s+/g, ' ').trim();
  return `${finding.id}|${finding.file}|${finding.line}|${message}`;
}

function byFindingOrder(a: Finding, b: Finding): number {
  const severityDelta = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
  if (severityDelta !== 0) return severityDelta;
  if (a.id !== b.id) return a.id.localeCompare(b.id);
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return a.line - b.line;
}

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
  let ci = false;
  let reportPath = DEFAULT_REPORT_PATH;
  let baselinePath = DEFAULT_BASELINE_PATH;
  let updateBaseline = false;
  let maxLoc = DEFAULT_MAX_LOC;
  let failOn: Severity = 'high';
  let jsonPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--ci') {
      ci = true;
      continue;
    }

    if (arg === '--update-baseline') {
      updateBaseline = true;
      continue;
    }

    if (arg === '--report') {
      const value = argv[i + 1];
      if (!value) throw new Error('--report requires a value');
      reportPath = value;
      i += 1;
      continue;
    }

    if (arg === '--baseline') {
      const value = argv[i + 1];
      if (!value) throw new Error('--baseline requires a value');
      baselinePath = value;
      i += 1;
      continue;
    }

    if (arg === '--max-loc') {
      const value = argv[i + 1];
      if (!value) throw new Error('--max-loc requires a value');
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('--max-loc must be a positive integer');
      }
      maxLoc = parsed;
      i += 1;
      continue;
    }

    if (arg === '--fail-on') {
      const value = argv[i + 1];
      if (!value) throw new Error('--fail-on requires a value');
      if (value !== 'high' && value !== 'medium' && value !== 'low') {
        throw new Error('--fail-on must be one of: high, medium, low');
      }
      failOn = value;
      i += 1;
      continue;
    }

    if (arg === '--json') {
      const value = argv[i + 1];
      if (!value) throw new Error('--json requires a value');
      jsonPath = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    ci,
    reportPath,
    baselinePath,
    updateBaseline,
    maxLoc,
    failOn,
    ...(jsonPath ? { jsonPath } : {}),
  };
}

async function listTsFilesUnder(rootAbs: string): Promise<ReadonlyArray<string>> {
  const out: string[] = [];

  async function walk(dirAbs: string): Promise<void> {
    const entries = await readdir(dirAbs, { withFileTypes: true });
    for (const entry of entries) {
      const abs = resolve(dirAbs, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
          continue;
        }
        await walk(abs);
        continue;
      }

      if (!entry.isFile()) continue;
      const rel = normalizePath(relative(process.cwd(), abs));
      if (isTsSourceFile(rel)) {
        out.push(rel);
      }
    }
  }

  await walk(rootAbs);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function loadFiles(paths: ReadonlyArray<string>): Promise<ReadonlyArray<FileData>> {
  const loaded = await Promise.all(
    paths.map(async (path) => {
      const content = await readFile(resolve(process.cwd(), path), 'utf8');
      return { path, content, lines: content.split(/\r?\n/) } satisfies FileData;
    }),
  );
  return loaded;
}

function lineNumberAt(content: string, index: number): number {
  if (index <= 0) return 1;
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function lineSnippet(lines: ReadonlyArray<string>, line: number): string | undefined {
  const raw = lines[line - 1];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function makeFinding(params: {
  id: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  snippet?: string;
  docsLink?: string;
}): Finding {
  return {
    id: params.id,
    severity: params.severity,
    file: params.file,
    line: params.line,
    message: params.message,
    ...(params.snippet ? { snippet: params.snippet } : {}),
    ...(params.docsLink ? { docsLink: params.docsLink } : {}),
  };
}

function findBoundaryAppImportsPlatformImpl(files: ReadonlyArray<FileData>): ReadonlyArray<Finding> {
  const findings: Finding[] = [];

  const appFileRe = /^libs\/features\/[^/]+\/app\/.*\.ts$/;
  const importRe = /import\s+(?:type\s+)?[\s\S]*?from\s+['"]([^'"\n]+)['"]/g;

  for (const file of files) {
    if (!appFileRe.test(file.path)) continue;
    if (isTestLike(file.path)) continue;

    for (const match of file.content.matchAll(importRe)) {
      const source = match[1];
      if (!source.includes('platform/')) continue;

      const index = match.index ?? 0;
      const line = lineNumberAt(file.content, index);
      findings.push(
        makeFinding({
          id: 'boundary_app_imports_platform_impl',
          severity: 'high',
          file: file.path,
          line,
          message: `Feature app layer imports platform path "${source}"`,
          snippet: lineSnippet(file.lines, line),
          docsLink: 'docs/standards/code-quality.md',
        }),
      );
    }
  }

  return findings;
}

function findRawErrorCodeLiterals(files: ReadonlyArray<FileData>): ReadonlyArray<Finding> {
  const findings: Finding[] = [];
  const codeLiteralRe = /\bcode\s*:\s*['"]([A-Z][A-Z0-9_]+)['"]/g;

  for (const file of files) {
    if (isTestLike(file.path)) continue;
    if (!file.path.startsWith('libs/') && !file.path.startsWith('apps/')) continue;

    for (const match of file.content.matchAll(codeLiteralRe)) {
      const literal = match[1];
      const index = match.index ?? 0;
      const line = lineNumberAt(file.content, index);
      findings.push(
        makeFinding({
          id: 'raw_error_code_literal',
          severity: 'high',
          file: file.path,
          line,
          message: `Raw error code literal "${literal}" used instead of typed enum`,
          snippet: lineSnippet(file.lines, line),
          docsLink: 'docs/standards/error-codes.md',
        }),
      );
    }
  }

  return findings;
}

function findDuplicateTxRetryClassifier(files: ReadonlyArray<FileData>): ReadonlyArray<Finding> {
  const matches: Finding[] = [];
  const fnRe = /\bfunction\s+isRetryableTransactionError\s*\(/g;

  for (const file of files) {
    if (!isAppOrLibPath(file.path)) continue;
    if (isTestLike(file.path)) continue;
    for (const match of file.content.matchAll(fnRe)) {
      const index = match.index ?? 0;
      const line = lineNumberAt(file.content, index);
      matches.push(
        makeFinding({
          id: 'duplicate_tx_retry_classifier',
          severity: 'high',
          file: file.path,
          line,
          message: 'Duplicate retryable transaction classifier found; use shared utility',
          snippet: lineSnippet(file.lines, line),
          docsLink: 'docs/standards/reliability.md',
        }),
      );
    }
  }

  return matches.length > 1 ? matches : [];
}

function findDuplicateCursorWhereBuilder(files: ReadonlyArray<FileData>): ReadonlyArray<Finding> {
  const matches: Finding[] = [];
  const fnRe = /\bfunction\s+(?:equalsForCursor|compareForCursor|buildAfter[A-Za-z0-9]*CursorWhere)\s*\(/g;

  for (const file of files) {
    if (!isAppOrLibPath(file.path)) continue;
    if (isTestLike(file.path)) continue;
    for (const match of file.content.matchAll(fnRe)) {
      const index = match.index ?? 0;
      const line = lineNumberAt(file.content, index);
      matches.push(
        makeFinding({
          id: 'duplicate_cursor_where_builder',
          severity: 'medium',
          file: file.path,
          line,
          message: 'Repeated cursor where-builder helper detected',
          snippet: lineSnippet(file.lines, line),
          docsLink: 'docs/standards/code-quality.md',
        }),
      );
    }
  }

  return matches.length > 1 ? matches : [];
}

function findRepeatedRequestTraceFallback(files: ReadonlyArray<FileData>): ReadonlyArray<Finding> {
  const matches: Finding[] = [];
  const re = /req\.requestId\s*\?\?\s*['"]unknown['"]/g;

  for (const file of files) {
    if (!file.path.endsWith('.controller.ts')) continue;
    if (isTestLike(file.path)) continue;

    for (const match of file.content.matchAll(re)) {
      const index = match.index ?? 0;
      const line = lineNumberAt(file.content, index);
      matches.push(
        makeFinding({
          id: 'repeated_request_trace_fallback',
          severity: 'medium',
          file: file.path,
          line,
          message: 'Repeated request trace fallback `req.requestId ?? "unknown"`',
          snippet: lineSnippet(file.lines, line),
          docsLink: 'docs/standards/observability.md',
        }),
      );
    }
  }

  return matches.length > 1 ? matches : [];
}

function findRepeatedBestEffortJobTryCatch(files: ReadonlyArray<FileData>): ReadonlyArray<Finding> {
  const matches: Finding[] = [];
  const re = /Failed to (?:enqueue|schedule|cancel)[^'"\n]*job/gi;

  for (const file of files) {
    if (!file.path.endsWith('.controller.ts')) continue;
    if (isTestLike(file.path)) continue;

    for (const match of file.content.matchAll(re)) {
      const index = match.index ?? 0;
      const line = lineNumberAt(file.content, index);
      matches.push(
        makeFinding({
          id: 'repeated_best_effort_job_try_catch',
          severity: 'medium',
          file: file.path,
          line,
          message: 'Repeated best-effort job enqueue/schedule/cancel logging block',
          snippet: lineSnippet(file.lines, line),
          docsLink: 'docs/guide/adding-a-job.md',
        }),
      );
    }
  }

  return matches.length > 1 ? matches : [];
}

function findOversizedOrchestrationFiles(
  files: ReadonlyArray<FileData>,
  maxLoc: number,
): ReadonlyArray<Finding> {
  const findings: Finding[] = [];
  const orchestrationRe = /\.(?:service|repository|worker)\.ts$/;

  for (const file of files) {
    if (isTestLike(file.path)) continue;
    if (!orchestrationRe.test(file.path)) continue;
    if (!(file.path.startsWith('apps/') || file.path.startsWith('libs/'))) continue;

    const loc = file.lines.length;
    if (loc <= maxLoc) continue;

    findings.push(
      makeFinding({
        id: 'oversized_orchestration_file',
        severity: 'medium',
        file: file.path,
        line: 1,
        message: `File has ${loc} LOC (threshold ${maxLoc})`,
        snippet: file.lines[0]?.trim() || undefined,
        docsLink: 'docs/standards/code-quality.md',
      }),
    );
  }

  return findings;
}

function findRepeatedLocalStringNormalizer(files: ReadonlyArray<FileData>): ReadonlyArray<Finding> {
  const matches: Finding[] = [];
  const fnRe = /\bfunction\s+asNonEmptyString\s*\(/g;

  for (const file of files) {
    if (!isAppOrLibPath(file.path)) continue;
    if (isTestLike(file.path)) continue;

    for (const match of file.content.matchAll(fnRe)) {
      const index = match.index ?? 0;
      const line = lineNumberAt(file.content, index);
      matches.push(
        makeFinding({
          id: 'repeated_local_string_normalizer',
          severity: 'low',
          file: file.path,
          line,
          message: 'Repeated local `asNonEmptyString` helper; consider shared utility',
          snippet: lineSnippet(file.lines, line),
          docsLink: 'docs/standards/code-quality.md',
        }),
      );
    }
  }

  return matches.length > 1 ? matches : [];
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, '\\`');
}

function summarize(findings: ReadonlyArray<Finding>): Readonly<Record<Severity, number>> {
  const summary: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    summary[finding.severity] += 1;
  }
  return summary;
}

function groupBySeverityAndId(
  findings: ReadonlyArray<Finding>,
): Readonly<Record<Severity, Readonly<Record<string, ReadonlyArray<Finding>>>>> {
  const grouped: Record<Severity, Record<string, Finding[]>> = {
    high: {},
    medium: {},
    low: {},
  };

  for (const finding of findings) {
    const byId = grouped[finding.severity];
    if (!byId[finding.id]) byId[finding.id] = [];
    byId[finding.id].push(finding);
  }

  return grouped;
}

function markdownReport(params: {
  findings: ReadonlyArray<Finding>;
  summary: Readonly<Record<Severity, number>>;
  newFindings: ReadonlyArray<Finding>;
  baselineFound: boolean;
  options: CliOptions;
}): string {
  const grouped = groupBySeverityAndId(params.findings);
  const newKeys = new Set(params.newFindings.map((f) => findingKey(f)));

  const lines: string[] = [];
  lines.push('# Architecture Smell Scan Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Mode: ${params.options.ci ? 'CI' : 'Local'}`);
  lines.push(`Baseline: ${params.options.baselinePath} (${params.baselineFound ? 'found' : 'not found'})`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- High: ${params.summary.high}`);
  lines.push(`- Medium: ${params.summary.medium}`);
  lines.push(`- Low: ${params.summary.low}`);
  lines.push(`- Total: ${params.findings.length}`);
  if (params.options.ci) {
    lines.push(`- New vs baseline: ${params.newFindings.length}`);
  }
  lines.push('');

  const severityOrder: Severity[] = ['high', 'medium', 'low'];
  for (const severity of severityOrder) {
    const byId = grouped[severity];
    const ids = Object.keys(byId).sort((a, b) => a.localeCompare(b));
    if (ids.length === 0) continue;

    lines.push(`## ${severityLabel(severity)}`);
    lines.push('');

    for (const id of ids) {
      const findings = [...byId[id]].sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        return a.line - b.line;
      });
      lines.push(`### ${id} (${findings.length})`);
      lines.push('');
      for (const finding of findings) {
        const isNew = newKeys.has(findingKey(finding));
        const newTag = params.options.ci && isNew ? ' [new]' : '';
        lines.push(`- ${finding.file}:${finding.line}${newTag}`);
        lines.push(`  - ${finding.message}`);
        if (finding.snippet) {
          lines.push(`  - Snippet: \`${escapeInlineCode(finding.snippet)}\``);
        }
        if (finding.docsLink) {
          lines.push(`  - Docs: \`${escapeInlineCode(finding.docsLink)}\``);
        }
      }
      lines.push('');
    }
  }

  if (params.findings.length === 0) {
    lines.push('No architecture smells detected by current rules.');
    lines.push('');
  }

  return lines.join('\n');
}

async function readBaseline(path: string): Promise<ReadonlyArray<string> | undefined> {
  try {
    const raw = await readFile(resolve(process.cwd(), path), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return undefined;

    const asBaseline = parsed as { version?: unknown; keys?: unknown };
    if (asBaseline.version !== 1) return undefined;
    if (!Array.isArray(asBaseline.keys)) return undefined;

    const keys = asBaseline.keys.filter((k): k is string => typeof k === 'string');
    return keys;
  } catch {
    return undefined;
  }
}

async function writeBaseline(path: string, keys: ReadonlyArray<string>): Promise<void> {
  const sorted = [...new Set(keys)].sort((a, b) => a.localeCompare(b));
  const payload: BaselineFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    keys: sorted,
  };

  const abs = resolve(process.cwd(), path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function writeReport(path: string, content: string): Promise<void> {
  const abs = resolve(process.cwd(), path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

function newFindingsAgainstBaseline(
  findings: ReadonlyArray<Finding>,
  baselineKeys: ReadonlyArray<string>,
): ReadonlyArray<Finding> {
  const baseline = new Set(baselineKeys);
  return findings.filter((finding) => !baseline.has(findingKey(finding)));
}

function shouldFailCi(
  newFindings: ReadonlyArray<Finding>,
  failOn: Severity,
): Readonly<{ fail: boolean; reason?: string }> {
  const threshold = SEVERITY_ORDER[failOn];
  const violating = newFindings.filter((finding) => SEVERITY_ORDER[finding.severity] >= threshold);
  if (violating.length === 0) return { fail: false };

  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const finding of violating) {
    bySeverity[finding.severity] += 1;
  }

  return {
    fail: true,
    reason: `Found ${violating.length} new finding(s) at or above severity \"${failOn}\" (high=${bySeverity.high}, medium=${bySeverity.medium}, low=${bySeverity.low})`,
  };
}

async function scan(options: CliOptions): Promise<ScanResult> {
  const roots = ['apps', 'libs', 'scripts'];
  const existingRoots: string[] = [];

  for (const root of roots) {
    const abs = resolve(process.cwd(), root);
    try {
      const st = await stat(abs);
      if (st.isDirectory()) existingRoots.push(abs);
    } catch {
      // ignore missing roots
    }
  }

  const allPaths = (
    await Promise.all(existingRoots.map((rootAbs) => listTsFilesUnder(rootAbs)))
  ).flat();

  const uniquePaths = [...new Set(allPaths)].sort((a, b) => a.localeCompare(b));
  const files = await loadFiles(uniquePaths);

  const findings = [
    ...findBoundaryAppImportsPlatformImpl(files),
    ...findRawErrorCodeLiterals(files),
    ...findDuplicateTxRetryClassifier(files),
    ...findDuplicateCursorWhereBuilder(files),
    ...findRepeatedRequestTraceFallback(files),
    ...findRepeatedBestEffortJobTryCatch(files),
    ...findOversizedOrchestrationFiles(files, options.maxLoc),
    ...findRepeatedLocalStringNormalizer(files),
  ]
    .sort(byFindingOrder)
    .filter((finding, index, arr) => {
      if (index === 0) return true;
      return findingKey(finding) !== findingKey(arr[index - 1]);
    });

  const summary = summarize(findings);

  const baselineKeys = (await readBaseline(options.baselinePath)) ?? [];
  const baselineFound = baselineKeys.length > 0;
  const newFindings = options.ci
    ? newFindingsAgainstBaseline(findings, baselineKeys)
    : ([] as ReadonlyArray<Finding>);

  return { findings, summary, newFindings, baselineFound };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await scan(options);

  const report = markdownReport({
    findings: result.findings,
    summary: result.summary,
    newFindings: result.newFindings,
    baselineFound: result.baselineFound,
    options,
  });
  await writeReport(options.reportPath, report);

  if (options.jsonPath) {
    const payload = {
      generatedAt: new Date().toISOString(),
      options,
      summary: result.summary,
      findings: result.findings,
      newFindings: result.newFindings,
      baselineFound: result.baselineFound,
    };
    await writeReport(options.jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  const baselineKeys = result.findings.map((finding) => findingKey(finding));
  if (options.updateBaseline) {
    await writeBaseline(options.baselinePath, baselineKeys);
    process.stdout.write(`Updated baseline at ${options.baselinePath}\n`);
  }

  process.stdout.write(
    [
      'Architecture smell scan completed',
      `- report: ${options.reportPath}`,
      `- findings: high=${result.summary.high}, medium=${result.summary.medium}, low=${result.summary.low}, total=${result.findings.length}`,
      ...(options.ci
        ? [`- new vs baseline: ${result.newFindings.length}${result.baselineFound ? '' : ' (baseline not found or empty)'}`]
        : []),
    ].join('\n') + '\n',
  );

  if (options.ci) {
    const ciDecision = shouldFailCi(result.newFindings, options.failOn);
    if (ciDecision.fail) {
      process.stderr.write(`${ciDecision.reason}\n`);
      process.exit(1);
    }
  }
}

void main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
