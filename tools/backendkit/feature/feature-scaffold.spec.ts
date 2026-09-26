import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildFeatureNames,
  buildScaffoldFiles,
  normalizeFeatureName,
  runFeatureScaffold,
} from './feature-scaffold';

describe('feature-scaffold', () => {
  describe('normalizeFeatureName', () => {
    it('normalizes snake_case, spaces, and uppercase characters to kebab-case', () => {
      expect(normalizeFeatureName('user_billing')).toBe('user-billing');
      expect(normalizeFeatureName('User Profile ')).toBe('user-profile');
      expect(normalizeFeatureName('Order---Processing_Queue')).toBe('order-processing-queue');
    });

    it('throws on empty or non-alphanumeric input', () => {
      expect(() => normalizeFeatureName('')).toThrow(/Feature name must start with a letter/);
      expect(() => normalizeFeatureName('---')).toThrow(/Feature name must start with a letter/);
      expect(() => normalizeFeatureName('   ')).toThrow(/Feature name must start with a letter/);
    });

    it('throws on digit-leading input', () => {
      expect(() => normalizeFeatureName('2fa')).toThrow(/Feature name must start with a letter/);
      expect(() => normalizeFeatureName('123-feature')).toThrow(
        /Feature name must start with a letter/,
      );
    });
  });

  describe('buildFeatureNames', () => {
    it('produces kebab, pascal, camel, and upperSnake case variants', () => {
      const names = buildFeatureNames('merchant-orders');
      expect(names).toEqual({
        kebab: 'merchant-orders',
        pascal: 'MerchantOrders',
        camel: 'merchantOrders',
        upperSnake: 'MERCHANT_ORDERS',
      });
    });
  });

  describe('buildScaffoldFiles', () => {
    it('builds standard simple feature file list without queue', () => {
      const files = buildScaffoldFiles({
        name: 'billing',
        tier: 'simple',
        withQueue: false,
      });

      const paths = files.map((f) => f.path);
      expect(paths).toContain(join('libs', 'features', 'billing', 'billing.tokens.ts'));
      expect(paths).toContain(join('libs', 'features', 'billing', 'billing.dto.ts'));
      expect(paths).toContain(join('libs', 'features', 'billing', 'billing.controller.ts'));
      expect(paths).toContain(join('libs', 'features', 'billing', 'billing.service.ts'));
      expect(paths).toContain(join('libs', 'features', 'billing', 'billing.module.ts'));
      expect(paths).toContain(join('test', 'billing.e2e-spec.ts'));
      expect(paths.some((p) => p.includes('jobs'))).toBe(false);
    });

    it('builds simple feature files with queue when requested', () => {
      const files = buildScaffoldFiles({
        name: 'billing',
        tier: 'simple',
        withQueue: true,
      });

      const paths = files.map((f) => f.path);
      expect(paths).toContain(join('libs', 'features', 'billing', 'jobs', 'billing.job.ts'));
      expect(paths).toContain(join('libs', 'features', 'billing', 'jobs', 'billing.jobs.ts'));
    });

    it('builds clean architecture feature files when requested', () => {
      const files = buildScaffoldFiles({
        name: 'payments',
        tier: 'clean',
        withQueue: true,
      });

      const paths = files.map((f) => f.path);
      expect(paths).toContain(
        join('libs', 'features', 'payments', 'app', 'ports', 'payments.repository.ts'),
      );
      expect(paths).toContain(join('libs', 'features', 'payments', 'app', 'payments.service.ts'));
      expect(paths).toContain(join('libs', 'features', 'payments', 'infra', 'payments.tokens.ts'));
      expect(paths).toContain(
        join('libs', 'features', 'payments', 'infra', 'http', 'dtos', 'payments.dto.ts'),
      );
      expect(paths).toContain(
        join('libs', 'features', 'payments', 'infra', 'http', 'payments.controller.ts'),
      );
      expect(paths).toContain(
        join(
          'libs',
          'features',
          'payments',
          'infra',
          'persistence',
          'prisma-payments.repository.ts',
        ),
      );
      expect(paths).toContain(
        join('libs', 'features', 'payments', 'infra', 'jobs', 'payments.job.ts'),
      );
      expect(paths).toContain(join('libs', 'features', 'payments', 'infra', 'payments.module.ts'));
      expect(paths).toContain(join('test', 'payments.e2e-spec.ts'));
    });
  });

  describe('runFeatureScaffold', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'feature-scaffold-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('performs dry-run without writing files', async () => {
      const result = await runFeatureScaffold({ name: 'catalog', dryRun: true }, tempDir);

      expect(result.dryRun).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
      await expect(readFile(join(tempDir, result.files[0].path))).rejects.toThrow();
    });

    it('writes files on disk and respects force flag on overwrite', async () => {
      const result = await runFeatureScaffold({ name: 'catalog', tier: 'simple' }, tempDir);

      expect(result.files.length).toBeGreaterThan(0);
      const controllerPath = join(tempDir, 'libs', 'features', 'catalog', 'catalog.controller.ts');
      const content = await readFile(controllerPath, 'utf8');
      expect(content).toContain('class CatalogController');

      // Re-running without force throws
      await expect(
        runFeatureScaffold({ name: 'catalog', tier: 'simple' }, tempDir),
      ).rejects.toThrow(/already exists/);

      // Re-running with force succeeds
      await expect(
        runFeatureScaffold({ name: 'catalog', tier: 'simple', force: true }, tempDir),
      ).resolves.toBeDefined();
    });
  });
});
