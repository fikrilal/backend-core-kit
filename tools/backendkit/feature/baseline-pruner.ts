import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type BaselinePruneResult = Readonly<{
  smellKeysPruned: number;
  duplicationEntriesPruned: number;
  duplicationFilesPruned: number;
  modifiedFiles: ReadonlyArray<string>;
}>;

function matchesFeaturePath(pathOrKey: string, featureName: string): boolean {
  const patterns = [
    `libs/features/${featureName}/`,
    `libs/features/${featureName}:`,
    `test/${featureName}.`,
    `test/${featureName}/`,
    `test/${featureName}-`,
    `apps/worker/src/jobs/${featureName}.`,
    `apps/worker/src/jobs/${featureName}-`,
  ];
  return patterns.some((pattern) => pathOrKey.includes(pattern));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Prunes feature-matching keys from architecture smells baseline JSON source.
 */
export function pruneSmellBaselineSource(
  rawJson: string,
  featureName: string,
): { content: string; prunedCount: number; changed: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { content: rawJson, prunedCount: 0, changed: false };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.keys) || parsed.keys.length === 0) {
    return { content: rawJson, prunedCount: 0, changed: false };
  }

  const rawKeys = parsed.keys.filter((k): k is string => typeof k === 'string');
  const initialCount = rawKeys.length;
  const filteredKeys = rawKeys.filter((key) => !matchesFeaturePath(key, featureName));
  const prunedCount = initialCount - filteredKeys.length;

  if (prunedCount === 0) {
    return { content: rawJson, prunedCount: 0, changed: false };
  }

  const updatedPayload = {
    ...parsed,
    keys: filteredKeys,
  };
  const formatted = `${JSON.stringify(updatedPayload, null, 2)}\n`;
  return { content: formatted, prunedCount, changed: true };
}

/**
 * Prunes feature-matching file paths and orphaned entries from duplication allowlist JSON source.
 */
export function pruneDuplicationAllowlistSource(
  rawJson: string,
  featureName: string,
): { content: string; prunedEntriesCount: number; prunedFilesCount: number; changed: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { content: rawJson, prunedEntriesCount: 0, prunedFilesCount: 0, changed: false };
  }

  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.reviewedAcceptable) ||
    parsed.reviewedAcceptable.length === 0
  ) {
    return { content: rawJson, prunedEntriesCount: 0, prunedFilesCount: 0, changed: false };
  }

  let totalFilesPruned = 0;
  const initialEntriesCount = parsed.reviewedAcceptable.length;

  const newEntries: Record<string, unknown>[] = [];
  for (const entry of parsed.reviewedAcceptable) {
    if (!isRecord(entry)) continue;
    if (!Array.isArray(entry.files)) {
      newEntries.push(entry);
      continue;
    }

    const rawFiles = entry.files.filter((f): f is string => typeof f === 'string');
    const beforeLength = rawFiles.length;
    const remainingFiles = rawFiles.filter((f) => !matchesFeaturePath(f, featureName));
    const prunedHere = beforeLength - remainingFiles.length;
    totalFilesPruned += prunedHere;

    // A duplication group requires at least 2 files to remain meaningful
    if (remainingFiles.length >= 2) {
      newEntries.push({
        ...entry,
        files: remainingFiles,
      });
    }
  }

  const prunedEntriesCount = initialEntriesCount - newEntries.length;
  const changed = prunedEntriesCount > 0 || totalFilesPruned > 0;

  if (!changed) {
    return { content: rawJson, prunedEntriesCount: 0, prunedFilesCount: 0, changed: false };
  }

  const updatedPayload = {
    ...parsed,
    reviewedAcceptable: newEntries,
  };
  const formatted = `${JSON.stringify(updatedPayload, null, 2)}\n`;
  return {
    content: formatted,
    prunedEntriesCount,
    prunedFilesCount: totalFilesPruned,
    changed: true,
  };
}

/**
 * Prunes architecture smells baseline and duplication allowlist on disk.
 */
export async function pruneBaselines(options: {
  rootDir?: string;
  featureName: string;
  dryRun?: boolean;
}): Promise<BaselinePruneResult> {
  const root = options.rootDir ?? process.cwd();
  const modifiedFiles: string[] = [];
  let smellKeysPruned = 0;
  let duplicationEntriesPruned = 0;
  let duplicationFilesPruned = 0;

  // 1. Architecture smell baseline
  const smellPath = resolve(root, 'tools', 'architecture-smells.baseline.json');
  try {
    const raw = await readFile(smellPath, 'utf8');
    const res = pruneSmellBaselineSource(raw, options.featureName);
    if (res.changed) {
      smellKeysPruned = res.prunedCount;
      modifiedFiles.push(smellPath);
      if (!options.dryRun) {
        await writeFile(smellPath, res.content, 'utf8');
      }
    }
  } catch {
    // If baseline file is not found, ignore
  }

  // 2. Duplication allowlist
  const dupPath = resolve(root, 'tools', 'duplication-allowlist.json');
  try {
    const raw = await readFile(dupPath, 'utf8');
    const res = pruneDuplicationAllowlistSource(raw, options.featureName);
    if (res.changed) {
      duplicationEntriesPruned = res.prunedEntriesCount;
      duplicationFilesPruned = res.prunedFilesCount;
      modifiedFiles.push(dupPath);
      if (!options.dryRun) {
        await writeFile(dupPath, res.content, 'utf8');
      }
    }
  } catch {
    // If allowlist file is not found, ignore
  }

  return {
    smellKeysPruned,
    duplicationEntriesPruned,
    duplicationFilesPruned,
    modifiedFiles,
  };
}
