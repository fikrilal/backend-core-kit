import type { ValidationError } from 'class-validator';

export type FlattenedValidationError = Readonly<{ field?: string; message: string }>;

export function flattenValidationErrors(
  errors: ReadonlyArray<ValidationError>,
  prefix = '',
): FlattenedValidationError[] {
  const out: FlattenedValidationError[] = [];

  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        out.push({ field: path, message });
      }
    }

    if (error.children && error.children.length > 0) {
      out.push(...flattenValidationErrors(error.children, path));
    }
  }

  return out;
}
