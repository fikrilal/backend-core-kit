function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type UnwireResult = Readonly<{
  content: string;
  changed: boolean;
  unwiredIdentifiers: ReadonlyArray<string>;
}>;

/**
 * Extracts identifiers imported from paths matching the feature name with strict segment boundaries.
 * e.g., import { OrderHistoryModule } from '.../libs/features/order-history/...'
 */
export function findFeatureImportedSymbols(source: string, featureKebab: string): string[] {
  const symbols = new Set<string>();
  const escaped = escapeRegex(featureKebab);
  // Enforce segment boundaries so "billing" does not match "billing-v2"
  const featurePattern = new RegExp(
    `(?:libs/features/${escaped}/|jobs/${escaped}(?:\\.worker|\\.job|/|$))`,
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

function unwireImports(
  source: string,
  identifier: string,
  eol: string,
): { content: string; changed: boolean } {
  let changed = false;
  const escaped = escapeRegex(identifier);
  const importRegex = new RegExp(
    `([ \\t]*import\\s*(?:type\\s*)?\\{)([\\s\\S]*?)(\\}\\s*from\\s*['"][^'"]+['"];?[ \\t]*(?:\\r?\\n)?)`,
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
        const lines = remainingTokens.map((t) => `  ${t},`).join(eol);
        return `${prefix}${eol}${lines}${eol}${suffix.replace(/^\s*/, '')}`;
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
  const lineRegex = new RegExp(`^[ \\t]*${escaped},?[ \\t]*(?://.*)?(?:\\r?\\n|$)`, 'm');
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

/**
 * Finds the index of the matching closing bracket ']' accounting for nested brackets,
 * string literals (with toggle-based escape handling), and comments.
 */
function findMatchingClosingBracket(source: string, openBracketIndex: number): number {
  let depth = 1;
  let inString: string | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openBracketIndex + 1; i < source.length; i += 1) {
    const char = source[i];
    const prevChar = source[i - 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '/' && prevChar === '*') {
        inBlockComment = false;
      }
      continue;
    }

    if (inString !== null) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    // Check for comment starts
    if (char === '/' && source[i + 1] === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    // Check for string starts
    if (char === "'" || char === '"' || char === '`') {
      inString = char;
      escaped = false;
      continue;
    }

    // Check bracket depth
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function unwireDecoratorArrays(
  source: string,
  identifier: string,
): { content: string; changed: boolean } {
  let changed = false;
  const escaped = escapeRegex(identifier);

  // Quick exit if identifier is not in source
  if (!new RegExp(`\\b${escaped}\\b`).test(source)) {
    return { content: source, changed: false };
  }

  // Non-global regex because we slice currentContent at offset and scan sequentially
  const propRegex = /(?:imports|providers|controllers|exports)\s*:\s*\[/;
  let currentContent = source;
  let offset = 0;
  let match: RegExpExecArray | null;

  while ((match = propRegex.exec(currentContent.slice(offset))) !== null) {
    const propertyMatchStart = offset + match.index;
    const openBracketIndex = propertyMatchStart + match[0].length - 1;
    const closeBracketIndex = findMatchingClosingBracket(currentContent, openBracketIndex);

    if (closeBracketIndex === -1) {
      break;
    }

    const arrayBody = currentContent.slice(openBracketIndex + 1, closeBracketIndex);
    const res = unwireArrayElements(arrayBody, identifier);

    if (res.changed) {
      changed = true;
      const before = currentContent.slice(0, openBracketIndex + 1);
      const after = currentContent.slice(closeBracketIndex);
      currentContent = before + res.content + after;
      offset = openBracketIndex + 1 + res.content.length + 1;
    } else {
      offset = closeBracketIndex + 1;
    }
  }

  return { content: currentContent, changed };
}

/**
 * Strips given identifier(s) from import statements and decorator arrays in NestJS module source.
 */
export function unwireModuleSource(
  source: string,
  identifiers: string | ReadonlyArray<string>,
): UnwireResult {
  const identList = Array.isArray(identifiers) ? identifiers : [identifiers];
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  let currentContent = source;
  const unwiredSet = new Set<string>();

  for (const ident of identList) {
    if (!ident || ident.trim().length === 0) continue;
    const trimmed = ident.trim();

    const importRes = unwireImports(currentContent, trimmed, eol);
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

  // If nothing was unwired, do not modify or touch whitespace
  if (unwiredSet.size === 0) {
    return {
      content: source,
      changed: false,
      unwiredIdentifiers: [],
    };
  }

  // Clean up any excessive blank lines introduced by line removal
  const cleanedContent = currentContent.replace(/\n{3,}/g, '\n\n');

  return {
    content: cleanedContent,
    changed: true,
    unwiredIdentifiers: Array.from(unwiredSet),
  };
}
