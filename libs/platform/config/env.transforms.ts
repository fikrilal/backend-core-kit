import { Transform, type TransformFnParams } from 'class-transformer';

export function parseEnvBoolean(value: unknown): boolean | undefined | string {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') return undefined;
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  // Return the original value so `@IsBoolean()` fails (fail-fast) when an invalid value is provided.
  return String(value);
}

export function TransformEnvBoolean(): PropertyDecorator {
  return Transform(({ obj, key }: TransformFnParams) => {
    const source = obj as Record<string, unknown>;
    return parseEnvBoolean(source[key]);
  });
}
