export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasOwnField<T extends object>(
  value: T,
  field: PropertyKey,
): field is Extract<keyof T, string> {
  return Object.prototype.hasOwnProperty.call(value, field);
}
