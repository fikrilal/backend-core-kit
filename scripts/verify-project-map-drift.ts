import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

type CheckResult = Readonly<{
  checked: number;
  errors: ReadonlyArray<string>;
}>;

const REQUIRED_LAYOUT_PATHS: ReadonlyArray<string> = [
  'apps/api',
  'apps/worker',
  'libs/platform',
  'libs/features',
  'docs',
];

const DOC_INDEX_PATHS: ReadonlyArray<string> = [
  'docs/README.md',
  'docs/adr/README.md',
  'docs/standards/README.md',
];

const ADR_DIR = 'docs/adr';
const STANDARDS_DIR = 'docs/standards';

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(resolve(process.cwd(), path));
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const result = await stat(resolve(process.cwd(), path));
    return result.isDirectory();
  } catch {
    return false;
  }
}

function extractBacktickDocPaths(markdown: string): ReadonlyArray<string> {
  const paths = new Set<string>();
  const re = /`(docs\/[^`]+)`/g;

  for (const match of markdown.matchAll(re)) {
    const raw = match[1];
    if (!raw) continue;
    const withoutAnchor = raw.split('#')[0] ?? raw;
    const normalized = normalizePath(withoutAnchor.trim());
    if (normalized !== '') {
      paths.add(normalized);
    }
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

async function markdownFilesIn(dir: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(resolve(process.cwd(), dir), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.md'))
    .map((name) => normalizePath(join(dir, name)))
    .sort((a, b) => a.localeCompare(b));
}

function withoutIndexFiles(paths: ReadonlyArray<string>): ReadonlyArray<string> {
  return paths.filter((path) => !path.endsWith('/README.md'));
}

async function checkRequiredLayout(): Promise<CheckResult> {
  const errors: string[] = [];
  const agents = await readFile(resolve(process.cwd(), 'AGENTS.md'), 'utf8');

  for (const path of REQUIRED_LAYOUT_PATHS) {
    if (!agents.includes(path)) {
      errors.push(`AGENTS.md does not document required layout path ${path}`);
    }
    if (!(await directoryExists(path))) {
      errors.push(`Documented layout path ${path} does not exist as a directory`);
    }
  }

  return { checked: REQUIRED_LAYOUT_PATHS.length, errors };
}

async function checkLinkedDocPaths(indexPath: string): Promise<CheckResult> {
  const markdown = await readFile(resolve(process.cwd(), indexPath), 'utf8');
  const linkedPaths = extractBacktickDocPaths(markdown);
  const errors: string[] = [];

  for (const linkedPath of linkedPaths) {
    if (!(await pathExists(linkedPath))) {
      errors.push(`${indexPath} links to missing path ${linkedPath}`);
    }
  }

  return { checked: linkedPaths.length, errors };
}

async function checkIndexEnumeratesFiles(params: {
  indexPath: string;
  directory: string;
  label: string;
}): Promise<CheckResult> {
  const markdown = await readFile(resolve(process.cwd(), params.indexPath), 'utf8');
  const linkedPaths = new Set(extractBacktickDocPaths(markdown));
  const expectedPaths = withoutIndexFiles(await markdownFilesIn(params.directory));
  const errors: string[] = [];

  for (const expectedPath of expectedPaths) {
    if (!linkedPaths.has(expectedPath)) {
      errors.push(`${params.label} index ${params.indexPath} is missing ${expectedPath}`);
    }
  }

  return { checked: expectedPaths.length, errors };
}

async function main(): Promise<void> {
  const checks = [
    await checkRequiredLayout(),
    ...(await Promise.all(DOC_INDEX_PATHS.map((indexPath) => checkLinkedDocPaths(indexPath)))),
    await checkIndexEnumeratesFiles({
      indexPath: 'docs/adr/README.md',
      directory: ADR_DIR,
      label: 'ADR',
    }),
    await checkIndexEnumeratesFiles({
      indexPath: 'docs/standards/README.md',
      directory: STANDARDS_DIR,
      label: 'Standards',
    }),
  ];

  const checked = checks.reduce((total, check) => total + check.checked, 0);
  const errors = checks.flatMap((check) => check.errors);

  if (errors.length > 0) {
    throw new Error(`Project map drift verification failed:\n- ${errors.join('\n- ')}`);
  }

  process.stdout.write(
    [
      'Project map drift verification completed',
      `- documented layout paths: ${REQUIRED_LAYOUT_PATHS.length}`,
      `- checked links/items: ${checked}`,
      `- repo root: ${normalizePath(relative(process.cwd(), process.cwd())) || '.'}`,
    ].join('\n') + '\n',
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
