import { ListQueryValidationError, type ListQueryIssue } from './errors';
import { parseFilterScalar } from './scalars';
import { isPlainObject } from './object';
import type { FilterAllowlist, FilterExpr, FilterFieldConfig, FilterOperator } from './types';

function formatFilterField(field: string, op?: string): string {
  return op ? `filter[${field}][${op}]` : `filter[${field}]`;
}

function isOperatorAllowed(config: FilterFieldConfig, op: FilterOperator): boolean {
  return config.ops.includes(op);
}

function parseInList(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string') return undefined;
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  return parts.length > 0 ? parts : undefined;
}

export function parseFilters<Field extends string>(
  rawFilter: unknown,
  allowlist: FilterAllowlist<Field>,
): ReadonlyArray<FilterExpr<Field>> {
  if (rawFilter === undefined || rawFilter === null) return [];

  const issues: ListQueryIssue[] = [];
  const filters: Array<FilterExpr<Field>> = [];

  // Support both:
  // - nested objects via qs parser: filter: { status: 'ACTIVE', createdAt: { gte: '...' } }
  // - bracketed keys (legacy): { 'filter[status]': 'ACTIVE', 'filter[createdAt][gte]': '...' }

  const isBracketed =
    isPlainObject(rawFilter) && Object.keys(rawFilter).some((k) => k.startsWith('filter['));
  const nestedFilter = isPlainObject(rawFilter) && !isBracketed ? rawFilter : undefined;
  const bracketedEntries = isBracketed ? (rawFilter as Record<string, unknown>) : undefined;

  if (!nestedFilter && !bracketedEntries) {
    throw new ListQueryValidationError([{ field: 'filter', message: 'filter must be an object' }]);
  }

  const allowedFields = Object.keys(allowlist) as Field[];
  const allowedSet = new Set<string>(allowedFields);

  const addExpr = (
    field: Field,
    op: FilterOperator,
    rawValue: unknown,
    config: FilterFieldConfig,
  ) => {
    if (!isOperatorAllowed(config, op)) {
      issues.push({ field: formatFilterField(String(field), op), message: 'Unsupported operator' });
      return;
    }

    if (op === 'in') {
      const list = parseInList(rawValue);
      if (!list) {
        issues.push({
          field: formatFilterField(String(field), 'in'),
          message: 'Expected a comma-separated list',
        });
        return;
      }

      const parsed = list
        .map((item) => parseFilterScalar(config.type, item, config.enumValues))
        .filter((v): v is Exclude<typeof v, undefined> => v !== undefined);

      if (parsed.length !== list.length) {
        issues.push({
          field: formatFilterField(String(field), 'in'),
          message: 'Invalid value in list',
        });
        return;
      }

      filters.push({ field, op: 'in', value: parsed });
      return;
    }

    const parsed = parseFilterScalar(config.type, rawValue, config.enumValues);
    if (parsed === undefined) {
      issues.push({
        field: formatFilterField(String(field), op === 'eq' ? undefined : op),
        message: 'Invalid value',
      });
      return;
    }

    if (op === 'eq') {
      filters.push({ field, op: 'eq', value: parsed });
      return;
    }

    filters.push({ field, op, value: parsed });
  };

  if (nestedFilter) {
    for (const [fieldRaw, value] of Object.entries(nestedFilter)) {
      if (!allowedSet.has(fieldRaw)) {
        issues.push({ field: formatFilterField(fieldRaw), message: 'Unsupported filter field' });
        continue;
      }

      const field = fieldRaw as Field;
      const config = allowlist[field];

      if (isPlainObject(value)) {
        for (const [opRaw, opValue] of Object.entries(value)) {
          if (opRaw === 'eq') {
            addExpr(field, 'eq', opValue, config);
          } else if (opRaw === 'in') {
            addExpr(field, 'in', opValue, config);
          } else if (opRaw === 'gte') {
            addExpr(field, 'gte', opValue, config);
          } else if (opRaw === 'lte') {
            addExpr(field, 'lte', opValue, config);
          } else {
            issues.push({
              field: formatFilterField(fieldRaw, opRaw),
              message: 'Unsupported operator',
            });
          }
        }
      } else {
        addExpr(field, 'eq', value, config);
      }
    }
  }

  if (bracketedEntries) {
    const eqRe = /^filter\[([^\]]+)\]$/;
    const opRe = /^filter\[([^\]]+)\]\[([^\]]+)\]$/;

    for (const [key, value] of Object.entries(bracketedEntries)) {
      let m = eqRe.exec(key);
      if (m) {
        const fieldRaw = m[1];
        if (!allowedSet.has(fieldRaw)) {
          issues.push({ field: formatFilterField(fieldRaw), message: 'Unsupported filter field' });
          continue;
        }
        const field = fieldRaw as Field;
        const config = allowlist[field];
        addExpr(field, 'eq', value, config);
        continue;
      }

      m = opRe.exec(key);
      if (m) {
        const fieldRaw = m[1];
        const opRaw = m[2];
        if (!allowedSet.has(fieldRaw)) {
          issues.push({
            field: formatFilterField(fieldRaw, opRaw),
            message: 'Unsupported filter field',
          });
          continue;
        }
        const field = fieldRaw as Field;
        const config = allowlist[field];

        if (opRaw === 'eq') addExpr(field, 'eq', value, config);
        else if (opRaw === 'in') addExpr(field, 'in', value, config);
        else if (opRaw === 'gte') addExpr(field, 'gte', value, config);
        else if (opRaw === 'lte') addExpr(field, 'lte', value, config);
        else {
          issues.push({
            field: formatFilterField(fieldRaw, opRaw),
            message: 'Unsupported operator',
          });
        }
      }
    }
  }

  if (issues.length > 0) {
    throw new ListQueryValidationError(issues);
  }

  return filters;
}
