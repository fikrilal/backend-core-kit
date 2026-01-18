import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

let loadPromise: Promise<void> | undefined;

export function loadDotEnvOnce(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const envPath = resolve(process.cwd(), '.env');
    if (!existsSync(envPath)) return;

    try {
      const dotenv = await import('dotenv');
      dotenv.config({ path: envPath, quiet: true });
    } catch {
      // best-effort; ignore
    }
  })();

  return loadPromise;
}
