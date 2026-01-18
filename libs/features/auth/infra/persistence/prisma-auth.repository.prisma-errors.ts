import { Prisma } from '@prisma/client';

export function isUniqueConstraintError(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  if (!field) return true;

  const meta: unknown = err.meta;
  if (!meta || typeof meta !== 'object') return true;

  const target: unknown = (meta as { target?: unknown }).target;
  if (Array.isArray(target)) {
    return target.some((t) => typeof t === 'string' && t === field);
  }
  if (typeof target === 'string') {
    return target.includes(field);
  }
  return true;
}

export function isUniqueConstraintErrorOnFields(
  err: unknown,
  fields: ReadonlyArray<string>,
): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;

  const meta: unknown = err.meta;
  if (!meta || typeof meta !== 'object') return false;

  const target: unknown = (meta as { target?: unknown }).target;
  if (Array.isArray(target)) {
    const t = target.filter((v): v is string => typeof v === 'string');
    return fields.every((f) => t.includes(f));
  }
  if (typeof target === 'string') {
    return fields.every((f) => target.includes(f));
  }
  return false;
}

