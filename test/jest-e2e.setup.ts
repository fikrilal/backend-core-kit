import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.NODE_ENV ??= 'test';

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function loadDotEnvIfPresent(keys: readonly string[]): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const parsed = parseDotEnv(readFileSync(envPath, 'utf8'));
  for (const key of keys) {
    if (process.env[key] === undefined && parsed[key] !== undefined) {
      process.env[key] = parsed[key];
    }
  }
}

loadDotEnvIfPresent(['DATABASE_URL', 'REDIS_URL']);
