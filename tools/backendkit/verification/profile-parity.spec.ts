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

  it('keeps hosted CI jobs on canonical full and runtime aliases', async () => {
    const workflow = await readFile(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

    expect(workflow).toContain('run: npm run verify:ci-local');
    expect(workflow).toContain('run: npm run verify:e2e');
    expect(workflow).not.toContain('run: npm run format:check');
    expect(workflow).not.toContain('run: npm run test:e2e');
  });

  it('pins every third-party action to an immutable full commit SHA', async () => {
    const workflow = await readFile(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    const references = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)].map(
      (match) => match[1],
    );

    expect(references.length).toBeGreaterThan(0);
    expect(references.every((reference) => /@[0-9a-f]{40}$/.test(reference ?? ''))).toBe(true);
  });
});
