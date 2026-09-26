import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverDeletablePaths,
  planModifications,
  runFeatureRemoval,
  validateFeatureRemovalPreflight,
} from './feature-removal';

describe('feature-removal', () => {
  describe('validateFeatureRemovalPreflight', () => {
    it('accepts valid kebab-case name', () => {
      const res = validateFeatureRemovalPreflight('order-history');
      expect(res).toEqual({ kebab: 'order-history', pascal: 'OrderHistory' });
    });

    it('rejects invalid kebab-case names', () => {
      expect(() => validateFeatureRemovalPreflight('OrderHistory')).toThrow(
        'Feature name must be kebab-case',
      );
      expect(() => validateFeatureRemovalPreflight('order_history')).toThrow(
        'Feature name must be kebab-case',
      );
      expect(() => validateFeatureRemovalPreflight('order history')).toThrow(
        'Feature name must be kebab-case',
      );
    });

    it('rejects protected core features without forceCore', () => {
      expect(() => validateFeatureRemovalPreflight('auth')).toThrow(
        'Refusing to remove protected core feature "auth". Use --force-core to override.',
      );
      expect(() => validateFeatureRemovalPreflight('users')).toThrow(
        'Refusing to remove protected core feature "users". Use --force-core to override.',
      );
      expect(() => validateFeatureRemovalPreflight('admin')).toThrow(
        'Refusing to remove protected core feature "admin". Use --force-core to override.',
      );
    });

    it('allows protected core features with forceCore=true', () => {
      expect(validateFeatureRemovalPreflight('auth', true)).toEqual({
        kebab: 'auth',
        pascal: 'Auth',
      });
    });
  });

  describe('file discovery & execution in isolated directory', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'backendkit-feature-removal-test-'));

      // Create dummy file structure
      await mkdir(join(tempDir, 'libs', 'features', 'billing'), { recursive: true });
      await writeFile(
        join(tempDir, 'libs', 'features', 'billing', 'billing.module.ts'),
        'export class BillingModule {}',
      );

      await mkdir(join(tempDir, 'test'), { recursive: true });
      await writeFile(join(tempDir, 'test', 'billing.e2e-spec.ts'), '// e2e test');
      await writeFile(join(tempDir, 'test', 'billing.int-spec.ts'), '// int test');
      await writeFile(join(tempDir, 'test', 'other.e2e-spec.ts'), '// other test');

      await mkdir(join(tempDir, 'apps', 'worker', 'src', 'jobs'), { recursive: true });
      await writeFile(
        join(tempDir, 'apps', 'worker', 'src', 'jobs', 'billing.worker.ts'),
        '// worker',
      );

      await mkdir(join(tempDir, 'apps', 'api', 'src'), { recursive: true });
      await writeFile(
        join(tempDir, 'apps', 'api', 'src', 'app.module.ts'),
        `import { Module } from '@nestjs/common';
import { BillingModule } from '../../../libs/features/billing/billing.module';

@Module({
  imports: [
    BillingModule,
  ],
})
export class AppModule {}
`,
      );

      await writeFile(
        join(tempDir, 'apps', 'worker', 'src', 'worker.module.ts'),
        `import { Module } from '@nestjs/common';
import { BillingWorker } from './jobs/billing.worker';

@Module({
  providers: [
    BillingWorker,
  ],
})
export class WorkerModule {}
`,
      );

      await mkdir(join(tempDir, 'tools'), { recursive: true });
      await writeFile(
        join(tempDir, 'tools', 'architecture-smells.baseline.json'),
        JSON.stringify({
          version: 1,
          keys: ['smell|libs/features/billing/billing.service.ts|1|error'],
        }),
      );
      await writeFile(
        join(tempDir, 'tools', 'duplication-allowlist.json'),
        JSON.stringify({
          version: 1,
          reviewedAcceptable: [
            {
              files: ['libs/features/billing/a.ts', 'libs/features/billing/b.ts'],
            },
          ],
        }),
      );
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('discoverDeletablePaths finds all related feature paths and ignores others', async () => {
      const paths = await discoverDeletablePaths(tempDir, 'billing');
      expect(paths).toEqual([
        join('apps', 'worker', 'src', 'jobs', 'billing.worker.ts'),
        join('libs', 'features', 'billing'),
        join('test', 'billing.e2e-spec.ts'),
        join('test', 'billing.int-spec.ts'),
      ]);
    });

    it('planModifications detects all modifications without mutating disk', async () => {
      const plan = await planModifications(tempDir, 'billing', 'Billing');
      expect(plan.modifiedPaths).toEqual([
        join('apps', 'api', 'src', 'app.module.ts'),
        join('apps', 'worker', 'src', 'worker.module.ts'),
        join('tools', 'architecture-smells.baseline.json'),
        join('tools', 'duplication-allowlist.json'),
      ]);
      expect(plan.prunedBaselineKeys).toBe(2);

      // Verify files were not modified
      const appSource = await readFile(
        join(tempDir, 'apps', 'api', 'src', 'app.module.ts'),
        'utf8',
      );
      expect(appSource).toContain('BillingModule');
    });

    it('runFeatureRemoval preview in dry-run mode makes zero filesystem changes', async () => {
      let output = '';
      const report = await runFeatureRemoval({ name: 'billing', dryRun: true }, tempDir, {
        write: (chunk) => (output += chunk),
      });

      expect(report.dryRun).toBe(true);
      expect(report.deletedPaths).toHaveLength(4);
      expect(report.modifiedPaths).toHaveLength(4);
      expect(report.prunedBaselineKeys).toBe(2);
      expect(output).toContain('Removal preview for feature "billing" [dry-run]:');
      expect(output).toContain('Dry-run completed. No files were deleted or modified.');

      // Check files still exist on disk
      const appSource = await readFile(
        join(tempDir, 'apps', 'api', 'src', 'app.module.ts'),
        'utf8',
      );
      expect(appSource).toContain('BillingModule');
      const testExists = await readFile(join(tempDir, 'test', 'billing.e2e-spec.ts'), 'utf8');
      expect(testExists).toBe('// e2e test');
    });

    it('runFeatureRemoval rejects if wiring files are reported dirty and force=false', async () => {
      const fakeGitChecker = async () => ['apps/api/src/app.module.ts'];

      await expect(
        runFeatureRemoval(
          { name: 'billing', dryRun: false, force: false },
          tempDir,
          undefined,
          fakeGitChecker,
        ),
      ).rejects.toThrow(
        'Refusing to modify wiring files because they have uncommitted modifications',
      );
    });

    it('runFeatureRemoval executes mutations cleanly when force=true or git is clean', async () => {
      let output = '';
      const fakeCleanGitChecker = async () => [];

      const report = await runFeatureRemoval(
        { name: 'billing', dryRun: false },
        tempDir,
        { write: (chunk) => (output += chunk) },
        fakeCleanGitChecker,
      );

      expect(report.dryRun).toBe(false);
      expect(output).toContain('Done. Feature "billing" has been removed.');

      // 1. Files deleted
      await expect(
        readFile(join(tempDir, 'test', 'billing.e2e-spec.ts'), 'utf8'),
      ).rejects.toThrow();
      await expect(
        readFile(join(tempDir, 'test', 'billing.int-spec.ts'), 'utf8'),
      ).rejects.toThrow();
      await expect(
        readFile(join(tempDir, 'apps', 'worker', 'src', 'jobs', 'billing.worker.ts'), 'utf8'),
      ).rejects.toThrow();
      await expect(
        readFile(join(tempDir, 'libs', 'features', 'billing', 'billing.module.ts'), 'utf8'),
      ).rejects.toThrow();

      // 2. Unrelated files preserved
      const otherTest = await readFile(join(tempDir, 'test', 'other.e2e-spec.ts'), 'utf8');
      expect(otherTest).toBe('// other test');

      // 3. Module unwired
      const appSource = await readFile(
        join(tempDir, 'apps', 'api', 'src', 'app.module.ts'),
        'utf8',
      );
      expect(appSource).not.toContain('BillingModule');

      const workerSource = await readFile(
        join(tempDir, 'apps', 'worker', 'src', 'worker.module.ts'),
        'utf8',
      );
      expect(workerSource).not.toContain('BillingWorker');

      // 4. Baseline pruned
      const smellSource = await readFile(
        join(tempDir, 'tools', 'architecture-smells.baseline.json'),
        'utf8',
      );
      expect(JSON.parse(smellSource).keys).toEqual([]);
    });

    it('handles non-existent feature gracefully', async () => {
      let output = '';
      const report = await runFeatureRemoval({ name: 'non-existent' }, tempDir, {
        write: (chunk) => (output += chunk),
      });

      expect(report.deletedPaths).toEqual([]);
      expect(report.modifiedPaths).toEqual([]);
      expect(output).toContain('Feature "non-existent" was not found');
    });
  });
});
