import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stringify } from 'yaml';
import { createApiApp } from '../apps/api/src/bootstrap';
import { buildOpenApiDocument } from '../apps/api/src/openapi';

function resolveSnapshotPath(): string {
  const override = process.env.OPENAPI_CHECK_SNAPSHOT_PATH?.trim();
  if (override && override !== '') {
    return resolve(process.cwd(), override);
  }
  return resolve(process.cwd(), 'docs/openapi/openapi.yaml');
}

async function main() {
  process.env.NODE_ENV ??= 'development';

  const outPath = resolveSnapshotPath();
  const existing = await readFile(outPath, 'utf8').catch(() => null);
  if (existing === null) {
    throw new Error(`Missing OpenAPI snapshot at ${outPath}. Run: npm run openapi:generate`);
  }

  const app = await createApiApp();
  try {
    const document = buildOpenApiDocument(app);
    const next = stringify(document, { indent: 2 });
    if (next !== existing) {
      throw new Error('OpenAPI snapshot is out of date. Run: npm run openapi:generate');
    }
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
