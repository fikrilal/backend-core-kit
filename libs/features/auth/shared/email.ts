export type Email = string;

export function normalizeEmail(raw: string): Email {
  return raw.trim().toLowerCase();
}
