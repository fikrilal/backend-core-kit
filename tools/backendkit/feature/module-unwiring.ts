import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type UnwireResult = Readonly<{
  content: string;
  changed: boolean;
  unwiredIdentifiers: ReadonlyArray<string>;
}>;

/**
 * Extracts identifiers imported from paths matching the feature name.
 * e.g., import { OrderHistoryModule } from '.../libs/features/order-history/...'
 */
export function findFeatureImportedSymbols(source: string, featureKebab: string): string[] {
  const symbols = new Set<string>();
  const featurePattern = new RegExp(
    `(?:libs/features/${escapeRegex(featureKebab)}|jobs/${escapeRegex(featureKebab)})`,
  );

  const importRegex = /import\s*(?:type\s*)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(source)) !== null) {
    const [, inside, importPath] = match;
    if (featurePattern.test(importPath)) {
      const tokens = inside
        .split(',')
        .map((t) => t.trim().replace(/^type\s+/, ''))
        .filter((t) => t.length > 0);
      for (const token of tokens) {
        symbols.add(token);
      }
    }
  }

  return Array.from(symbols);
}

function unwireImports(source: string, identifier: string): { content: string; changed: boolean } {
  let changed = false;
  const escaped = escapeRegex(identifier);
  const importRegex = new RegExp(
    `([ \\t]*import\\s*(?:type\\s*)?\\{)([\\s\\S]*?)(\\}\\s*from\\s*['"][^'"]+['"];?[ \\t]*\\r?\\n?)`,
    'g',
  );

  const newContent = source.replace(
    importRegex,
    (fullMatch, prefix: string, inside: string, suffix: string) => {
      const identRegex = new RegExp(`\\b${escaped}\\b`);
      if (!identRegex.test(inside)) {
        return fullMatch;
      }

      changed = true;
      const isMultiline = inside.includes('\n');
      const rawTokens = inside.split(',').map((t) => t.trim());
      const remainingTokens = rawTokens.filter((t) => {
        const stripped = t.replace(/^type\s+/, '');
        return stripped.length > 0 && stripped !== identifier;
      });

      if (remainingTokens.length === 0) {
        return '';
      }

      if (isMultiline) {
        const lines = remainingTokens.map((t) => `  ${t},`).join('\n');
        return `${prefix}\n${lines}\n${suffix.replace(/^\s*/, '')}`;
      }

      return `${prefix} ${remainingTokens.join(', ')} ${suffix.replace(/^\s*/, '')}`;
    },
  );

  return { content: newContent, changed };
}

function unwireArrayElements(
  arrayBody: string,
  identifier: string,
): { content: string; changed: boolean } {
  const escaped = escapeRegex(identifier);

  // 1. Line-based removal if identifier is on its own line:
  const lineRegex = new RegExp(`^[ \\t]*${escaped},?[ \\t]*(?://.*)?\\r?\\n`, 'm');
  if (lineRegex.test(arrayBody)) {
    return {
      content: arrayBody.replace(lineRegex, ''),
      changed: true,
    };
  }

  // 2. Inline removal within array:
  const identPattern = new RegExp(`\\b${escaped}\\b`);
  if (!identPattern.test(arrayBody)) {
    return { content: arrayBody, changed: false };
  }

  let updated = arrayBody;

  // Single element: [ Identifier ] -> [ ]
  updated = updated.replace(new RegExp(`^(\\s*)${escaped}(\\s*)$`), '$1$2');

  // Preceded by comma: , Identifier
  updated = updated.replace(new RegExp(`,\\s*${escaped}\\b`), '');

  // Followed by comma: Identifier ,
  updated = updated.replace(new RegExp(`\\b${escaped}\\s*,\\s*`), '');

  // Standalone: Identifier
  updated = updated.replace(new RegExp(`\\b${escaped}\\b`), '');

  return { content: updated, changed: true };
}

function unwireDecoratorArrays(
  source: string,
  identifier: string,
): { content: string; changed: boolean } {
  let changed = false;
  const escaped = escapeRegex(identifier);

  // Check if identifier is even present in the source before scanning
  if (!new RegExp(`\\b${escaped}\\b`).test(source)) {
    return { content: source, changed: false };
  }

  // Target common NestJS module arrays: imports, providers, controllers, exports
  const arrayPropertyRegex = /(imports|providers|controllers|exports)(\s*:\s*\[)([\s\S]*?)(\])/g;

  const newContent = source.replace(
    arrayPropertyRegex,
    (fullMatch, propName: string, prefix: string, arrayBody: string, suffix: string) => {
      const res = unwireArrayElements(arrayBody, identifier);
      if (res.changed) {
        changed = true;
        return `${propName}${prefix}${res.content}${suffix}`;
      }
      return fullMatch;
    },
  );

  return { content: newContent, changed };
}

/**
 * Strips given identifier(s) from import statements and decorator arrays in NestJS module source.
 */
export function unwireModuleSource(
  source: string,
  identifiers: string | ReadonlyArray<string>,
): UnwireResult {
  const identList = Array.isArray(identifiers) ? identifiers : [identifiers];
  let currentContent = source;
  const unwiredSet = new Set<string>();

  for (const ident of identList) {
    if (!ident || ident.trim().length === 0) continue;
    const trimmed = ident.trim();

    const importRes = unwireImports(currentContent, trimmed);
    if (importRes.changed) {
      currentContent = importRes.content;
      unwiredSet.add(trimmed);
    }

    const arrayRes = unwireDecoratorArrays(currentContent, trimmed);
    if (arrayRes.changed) {
      currentContent = arrayRes.content;
      unwiredSet.add(trimmed);
    }
  }

  // Clean up any excessive blank lines introduced by line removal
  const cleanedContent = currentContent.replace(/\n{3,}/g, '\n\n');
  const wasChanged = unwiredSet.size > 0 || cleanedContent !== source;

  return {
    content: cleanedContent,
    changed: wasChanged,
    unwiredIdentifiers: Array.from(unwiredSet),
  };
}

/**
 * Unwires feature references from a specific module file on disk.
 */
export async function unwireModuleFile(
  filePath: string,
  identifiers: string | ReadonlyArray<string>,
  options?: { dryRun?: boolean },
): Promise<UnwireResult> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return { content: '', changed: false, unwiredIdentifiers: [] };
  }

  const result = unwireModuleSource(raw, identifiers);
  if (result.changed && !options?.dryRun) {
    await writeFile(filePath, result.content, 'utf8');
  }

  return result;
}

/**
 * Unwires feature modules and workers from standard entry points:
 * - apps/api/src/app.module.ts
 * - apps/worker/src/worker.module.ts
 */
export async function unwireFeatureFromApps(
  rootDir: string,
  featureKebab: string,
  additionalSymbols: ReadonlyArray<string> = [],
  options?: { dryRun?: boolean },
): Promise<
  Readonly<{ modifiedFiles: ReadonlyArray<string>; unwiredSymbols: ReadonlyArray<string> }>
> {
  const modifiedFiles: string[] = [];
  const unwiredSymbols = new Set<string>();

  const targetFiles = [
    resolve(rootDir, 'apps', 'api', 'src', 'app.module.ts'),
    resolve(rootDir, 'apps', 'worker', 'src', 'worker.module.ts'),
  ];

  for (const file of targetFiles) {
    let source: string;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    const detectedSymbols = findFeatureImportedSymbols(source, featureKebab);
    const symbolsToUnwire = Array.from(new Set([...detectedSymbols, ...additionalSymbols]));

    if (symbolsToUnwire.length === 0) continue;

    const res = await unwireModuleFile(file, symbolsToUnwire, options);
    if (res.changed) {
      modifiedFiles.push(file);
      for (const s of res.unwiredIdentifiers) {
        unwiredSymbols.add(s);
      }
    }
  }

  return {
    modifiedFiles,
    unwiredSymbols: Array.from(unwiredSymbols),
  };
}
