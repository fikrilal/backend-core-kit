import { execFile } from 'node:child_process';
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  pruneBaselines,
  pruneDuplicationAllowlistSource,
  pruneSmellBaselineSource,
} from './baseline-pruner';
import { findFeatureImportedSymbols, unwireModuleSource } from './module-unwiring';

const execFileAsync = promisify(execFile);

export const PROTECTED_CORE_FEATURES: ReadonlySet<string> = new Set(['auth', 'users', 'admin']);

export type RemoveFeatureOptions = Readonly<{
  name: string;
  dryRun?: boolean;
  yes?: boolean;
  forceCore?: boolean;
  force?: boolean;
}>;

export type RemoveFeatureReport = Readonly<{
  featureName: string;
  deletedPaths: ReadonlyArray<string>;
  modifiedPaths: ReadonlyArray<string>;
  prunedBaselineKeys: number;
  dryRun: boolean;
}>;

export type TextOutput = {
  write: (chunk: string) => void;
};

export type GitStatusChecker = (
  paths: ReadonlyArray<string>,
  rootDir: string,
) => Promise<ReadonlyArray<string>>;

const KEBAB_REGEX = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export const defaultGitStatusChecker: GitStatusChecker = async (paths, rootDir) => {
  if (paths.length === 0) return [];
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--', ...paths], {
      cwd: rootDir,
    });
    const lines = stdout
      .trim()
      .split('\n')
      .filter((line) => line.trim().length > 0);
    return lines.map((line) => line.slice(3).trim());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Git status check failed: ${message}`, { cause: err });
  }
};

/**
 * Validates feature name and protected core guards.
 */
export function validateFeatureRemovalPreflight(
  name: string,
  forceCore = false,
): { kebab: string; pascal: string } {
  const trimmed = name.trim();
  if (!KEBAB_REGEX.test(trimmed)) {
    throw new Error(
      `Feature name must be kebab-case (e.g. "billing" or "order-history"), got "${name}"`,
    );
  }

  if (PROTECTED_CORE_FEATURES.has(trimmed) && !forceCore) {
    throw new Error(
      `Refusing to remove protected core feature "${trimmed}". Use --force-core to override.`,
    );
  }

  return {
    kebab: trimmed,
    pascal: toPascalCase(trimmed),
  };
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Discovers paths targeted for deletion for the given feature.
 */
export async function discoverDeletablePaths(
  rootDir: string,
  featureKebab: string,
): Promise<string[]> {
  const deletable: string[] = [];

  // 1. Feature directory: libs/features/<name>
  const featureDir = resolve(rootDir, 'libs', 'features', featureKebab);
  if (await pathExists(featureDir)) {
    deletable.push(join('libs', 'features', featureKebab));
  }

  // 2. Test directory files: test/<name>.*-spec.ts or test/<name>/
  const testDir = resolve(rootDir, 'test');
  try {
    const entries = await readdir(testDir);
    for (const entry of entries) {
      if (
        entry === `${featureKebab}.e2e-spec.ts` ||
        entry === `${featureKebab}.int-spec.ts` ||
        entry === featureKebab ||
        (entry.startsWith(`${featureKebab}.`) &&
          (entry.endsWith('.int-spec.ts') || entry.endsWith('.e2e-spec.ts')))
      ) {
        deletable.push(join('test', entry));
      }
    }
  } catch {
    // If test directory does not exist or cannot be read, ignore
  }

  // 3. Worker jobs: apps/worker/src/jobs/<name>*.worker.ts or jobs importing libs/features/<name>/
  const jobsDir = resolve(rootDir, 'apps', 'worker', 'src', 'jobs');
  try {
    const entries = await readdir(jobsDir);
    for (const entry of entries) {
      const isExactOrDotMatch =
        entry === `${featureKebab}.worker.ts` ||
        entry === `${featureKebab}.worker.spec.ts` ||
        entry === featureKebab ||
        (entry.startsWith(`${featureKebab}.`) &&
          (entry.endsWith('.worker.ts') || entry.endsWith('.worker.spec.ts')));

      if (isExactOrDotMatch) {
        deletable.push(join('apps', 'worker', 'src', 'jobs', entry));
        continue;
      }

      // Also match feature-prefixed worker jobs (e.g. users-account-deletion.worker.ts)
      // provided they actually import from libs/features/<name>/ to avoid deleting sibling features
      const isHyphenatedWorker =
        entry.startsWith(`${featureKebab}-`) &&
        (entry.endsWith('.worker.ts') || entry.endsWith('.worker.spec.ts'));

      if (isHyphenatedWorker) {
        try {
          const jobPath = resolve(jobsDir, entry);
          const content = await readFile(jobPath, 'utf8');
          if (findFeatureImportedSymbols(content, featureKebab).length > 0) {
            deletable.push(join('apps', 'worker', 'src', 'jobs', entry));
          }
        } catch {
          // Ignore read errors
        }
      }
    }
  } catch {
    // If jobs directory does not exist or cannot be read, ignore
  }

  return deletable.sort();
}

/**
 * Plans file modifications (module unwiring and baseline pruning) without executing them.
 */
export async function planModifications(
  rootDir: string,
  featureKebab: string,
  pascalName: string,
): Promise<{
  modifiedPaths: string[];
  moduleModifications: Array<{ path: string; content: string }>;
  prunedBaselineKeys: number;
}> {
  const modifiedPaths: string[] = [];
  const moduleModifications: Array<{ path: string; content: string }> = [];

  // 1. Check apps/api/src/app.module.ts
  const appModuleRel = join('apps', 'api', 'src', 'app.module.ts');
  const appModuleAbs = resolve(rootDir, appModuleRel);
  try {
    const source = await readFile(appModuleAbs, 'utf8');
    const importedSymbols = findFeatureImportedSymbols(source, featureKebab);
    const symbolsToUnwire = Array.from(new Set([...importedSymbols, `${pascalName}Module`]));
    const res = unwireModuleSource(source, symbolsToUnwire);
    if (res.changed) {
      modifiedPaths.push(appModuleRel);
      moduleModifications.push({ path: appModuleAbs, content: res.content });
    }
  } catch {
    // File not found, ignore
  }

  // 2. Check apps/worker/src/worker.module.ts
  const workerModuleRel = join('apps', 'worker', 'src', 'worker.module.ts');
  const workerModuleAbs = resolve(rootDir, workerModuleRel);
  try {
    const source = await readFile(workerModuleAbs, 'utf8');
    const importedSymbols = findFeatureImportedSymbols(source, featureKebab);
    const symbolsToUnwire = Array.from(
      new Set([
        ...importedSymbols,
        `${pascalName}Module`,
        `${pascalName}Worker`,
        `${pascalName}Jobs`,
      ]),
    );
    const res = unwireModuleSource(source, symbolsToUnwire);
    if (res.changed) {
      modifiedPaths.push(workerModuleRel);
      moduleModifications.push({ path: workerModuleAbs, content: res.content });
    }
  } catch {
    // File not found, ignore
  }

  // 3. Check architecture smells baseline
  let prunedBaselineKeys = 0;
  const smellRel = join('tools', 'architecture-smells.baseline.json');
  const smellAbs = resolve(rootDir, smellRel);
  try {
    const source = await readFile(smellAbs, 'utf8');
    const res = pruneSmellBaselineSource(source, featureKebab);
    if (res.changed) {
      modifiedPaths.push(smellRel);
      prunedBaselineKeys += res.prunedCount;
    }
  } catch {
    // Ignore if not present
  }

  // 4. Check duplication allowlist
  const dupRel = join('tools', 'duplication-allowlist.json');
  const dupAbs = resolve(rootDir, dupRel);
  try {
    const source = await readFile(dupAbs, 'utf8');
    const res = pruneDuplicationAllowlistSource(source, featureKebab);
    if (res.changed) {
      modifiedPaths.push(dupRel);
      prunedBaselineKeys += res.prunedEntriesCount;
    }
  } catch {
    // Ignore if not present
  }

  return {
    modifiedPaths: modifiedPaths.sort(),
    moduleModifications,
    prunedBaselineKeys,
  };
}

/**
 * Core entry point for feature removal.
 */
export async function runFeatureRemoval(
  options: RemoveFeatureOptions,
  rootDir: string = process.cwd(),
  output?: TextOutput,
  gitStatusChecker: GitStatusChecker = defaultGitStatusChecker,
): Promise<RemoveFeatureReport> {
  const { kebab, pascal } = validateFeatureRemovalPreflight(options.name, options.forceCore);
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);

  // 1. Discover deletable paths
  const deletedPaths = await discoverDeletablePaths(rootDir, kebab);

  // 2. Plan modifications
  const { modifiedPaths, moduleModifications, prunedBaselineKeys } = await planModifications(
    rootDir,
    kebab,
    pascal,
  );

  if (deletedPaths.length === 0 && modifiedPaths.length === 0) {
    if (output) {
      output.write(`Feature "${kebab}" was not found (no matching files or module references).\n`);
    }
    return {
      featureName: kebab,
      deletedPaths: [],
      modifiedPaths: [],
      prunedBaselineKeys: 0,
      dryRun,
    };
  }

  // 3. Check for dirty files before making non-dry-run changes
  if (!dryRun && !force) {
    const pathsToCheck = Array.from(new Set([...modifiedPaths, ...deletedPaths]));
    if (pathsToCheck.length > 0) {
      const dirty = await gitStatusChecker(pathsToCheck, rootDir);
      if (dirty.length > 0) {
        throw new Error(
          `Refusing to remove feature because target paths have uncommitted modifications:\n  - ${dirty.join('\n  - ')}\nUse --force to proceed anyway.`,
        );
      }
    }
  }

  // 4. Dry-run output and return
  if (dryRun) {
    if (output) {
      output.write(`Removal preview for feature "${kebab}" [dry-run]:\n`);
      if (deletedPaths.length > 0) {
        output.write('Files to delete:\n');
        for (const p of deletedPaths) {
          output.write(`  - ${p}\n`);
        }
      }
      if (modifiedPaths.length > 0) {
        output.write('Files to modify:\n');
        for (const p of modifiedPaths) {
          output.write(`  - ${p}\n`);
        }
      }
      if (prunedBaselineKeys > 0) {
        output.write(`Pruned baseline entries: ${prunedBaselineKeys}\n`);
      }
      output.write('Dry-run completed. No files were deleted or modified.\n');
    }

    return {
      featureName: kebab,
      deletedPaths,
      modifiedPaths,
      prunedBaselineKeys,
      dryRun: true,
    };
  }

  // 5. Execute mutations:
  if (output) {
    output.write(`Removing feature "${kebab}"...\n`);
  }

  // Apply module modifications
  for (const mod of moduleModifications) {
    await writeFile(mod.path, mod.content, 'utf8');
  }

  // Delete files and directories
  for (const relPath of deletedPaths) {
    const absPath = resolve(rootDir, relPath);
    await rm(absPath, { recursive: true, force: true });
  }

  // Prune baselines on disk
  await pruneBaselines({ rootDir, featureName: kebab, dryRun: false });

  if (output) {
    if (deletedPaths.length > 0) {
      output.write('Deleted:\n');
      for (const p of deletedPaths) {
        output.write(`  - ${p}\n`);
      }
    }
    if (modifiedPaths.length > 0) {
      output.write('Modified:\n');
      for (const p of modifiedPaths) {
        output.write(`  - ${p}\n`);
      }
    }
    if (prunedBaselineKeys > 0) {
      output.write(`Pruned ${prunedBaselineKeys} baseline entry/entries.\n`);
    }
    output.write(`Done. Feature "${kebab}" has been removed.\n`);
  }

  return {
    featureName: kebab,
    deletedPaths,
    modifiedPaths,
    prunedBaselineKeys,
    dryRun: false,
  };
}
