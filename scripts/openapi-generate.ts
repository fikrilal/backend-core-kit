import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stringify } from 'yaml';
import { createApiApp } from '../apps/api/src/bootstrap';
import { buildOpenApiDocument } from '../apps/api/src/openapi';

async function main() {
  const app = await createApiApp();
  try {
    const document = buildOpenApiDocument(app);
    const outPath = resolve(process.cwd(), 'docs/openapi/openapi.yaml');
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, stringify(document, { indent: 2 }), 'utf8');
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
