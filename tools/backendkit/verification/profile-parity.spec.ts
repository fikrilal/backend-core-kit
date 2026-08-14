import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function packageScripts(): Promise<Record<string, unknown>> {
  const source = await readFile(resolve(process.cwd(), 'package.json'), 'utf8');
  const decoded: unknown = JSON.parse(source);
  if (!isObject(decoded) || !isObject(decoded.scripts)) {
    throw new Error('package.json must contain a scripts object');
  }
  return decoded.scripts;
}

describe('verification profile parity', () => {
  it('keeps public npm aliases on canonical backendkit profiles', async () => {
    const scripts = await packageScripts();

    expect(scripts.verify).toBe('npm run backendkit -- verify --profile fast');
    expect(scripts['verify:ci-local']).toBe('npm run backendkit -- verify --profile full');
    expect(scripts['verify:e2e']).toBe('npm run backendkit -- verify --profile runtime');
    expect(scripts['verify:ci']).toBe('npm run backendkit -- verify --profile ci');
  });

  it('keeps hosted CI on the canonical ci profile', async () => {
    const workflow = await readFile(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

    expect(workflow).toContain('run: npm run verify:ci');
    expect(workflow).not.toContain('run: npm run format:check');
    expect(workflow).not.toContain('run: npm run test:e2e');
  });
});
