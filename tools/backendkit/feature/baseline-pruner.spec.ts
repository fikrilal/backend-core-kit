import { pruneSmellBaselineSource, pruneDuplicationAllowlistSource } from './baseline-pruner';

describe('baseline-pruner', () => {
  describe('pruneSmellBaselineSource', () => {
    it('prunes keys belonging to the target feature', () => {
      const raw = JSON.stringify(
        {
          version: 1,
          generatedAt: '2026-03-02T07:17:15.246Z',
          keys: [
            'layer-crossing|libs/features/auth/auth.service.ts|10|Direct infra import',
            'layer-crossing|libs/features/billing/billing.service.ts|25|Direct infra import',
            'test-violation|test/billing.e2e-spec.ts|5|Missing setup',
            'layer-crossing|libs/features/users/users.service.ts|12|Direct infra import',
          ],
        },
        null,
        2,
      );

      const result = pruneSmellBaselineSource(raw, 'billing');
      expect(result.changed).toBe(true);
      expect(result.prunedCount).toBe(2);

      const parsed = JSON.parse(result.content);
      expect(parsed.keys).toEqual([
        'layer-crossing|libs/features/auth/auth.service.ts|10|Direct infra import',
        'layer-crossing|libs/features/users/users.service.ts|12|Direct infra import',
      ]);
    });

    it('returns changed=false when feature has no baseline entries', () => {
      const raw = JSON.stringify(
        {
          version: 1,
          generatedAt: '2026-03-02T07:17:15.246Z',
          keys: ['layer-crossing|libs/features/auth/auth.service.ts|10|Direct infra import'],
        },
        null,
        2,
      );

      const result = pruneSmellBaselineSource(raw, 'billing');
      expect(result.changed).toBe(false);
      expect(result.prunedCount).toBe(0);
      expect(result.content).toBe(raw);
    });

    it('handles empty keys or invalid JSON gracefully', () => {
      expect(pruneSmellBaselineSource('{"keys":[]}', 'billing')).toEqual({
        content: '{"keys":[]}',
        prunedCount: 0,
        changed: false,
      });

      expect(pruneSmellBaselineSource('not-json', 'billing')).toEqual({
        content: 'not-json',
        prunedCount: 0,
        changed: false,
      });
    });

    it('does not prune sibling features (e.g. order vs order-history or billing vs billing-v2)', () => {
      const raw = JSON.stringify(
        {
          version: 1,
          generatedAt: '2026-03-02T07:17:15.246Z',
          keys: [
            'layer-crossing|libs/features/order/order.service.ts|10|Direct infra import',
            'layer-crossing|libs/features/order-history/order-history.service.ts|15|Direct infra import',
            'test-violation|test/order-history.e2e-spec.ts|5|Missing setup',
          ],
        },
        null,
        2,
      );

      const result = pruneSmellBaselineSource(raw, 'order');
      expect(result.changed).toBe(true);
      expect(result.prunedCount).toBe(1);

      const parsed = JSON.parse(result.content);
      expect(parsed.keys).toEqual([
        'layer-crossing|libs/features/order-history/order-history.service.ts|15|Direct infra import',
        'test-violation|test/order-history.e2e-spec.ts|5|Missing setup',
      ]);
    });
  });

  describe('pruneDuplicationAllowlistSource', () => {
    it('prunes entries where removing feature reduces file count below 2', () => {
      const raw = JSON.stringify(
        {
          version: 1,
          reviewedAcceptable: [
            {
              category: 'shared_dto',
              files: [
                'libs/features/billing/dto/create-bill.dto.ts',
                'libs/features/billing/dto/update-bill.dto.ts',
              ],
              reason: 'Similar fields',
            },
            {
              category: 'prisma_query_builder',
              files: [
                'libs/features/admin/shared/persistence/prisma-admin-audit.query-builders.ts',
                'libs/features/admin/shared/persistence/prisma-admin-users.query-builders.ts',
              ],
              reason: 'Prisma builders',
            },
          ],
        },
        null,
        2,
      );

      const result = pruneDuplicationAllowlistSource(raw, 'billing');
      expect(result.changed).toBe(true);
      expect(result.prunedEntriesCount).toBe(1);
      expect(result.prunedFilesCount).toBe(2);

      const parsed = JSON.parse(result.content);
      expect(parsed.reviewedAcceptable).toHaveLength(1);
      expect(parsed.reviewedAcceptable[0].category).toBe('prisma_query_builder');
    });

    it('keeps entry if remaining files are at least 2', () => {
      const raw = JSON.stringify(
        {
          version: 1,
          reviewedAcceptable: [
            {
              category: 'shared_utils',
              files: [
                'libs/features/billing/utils.ts',
                'libs/features/orders/utils.ts',
                'libs/features/payments/utils.ts',
              ],
              reason: 'Shared utility shape',
            },
          ],
        },
        null,
        2,
      );

      const result = pruneDuplicationAllowlistSource(raw, 'billing');
      expect(result.changed).toBe(true);
      expect(result.prunedEntriesCount).toBe(0);
      expect(result.prunedFilesCount).toBe(1);

      const parsed = JSON.parse(result.content);
      expect(parsed.reviewedAcceptable).toHaveLength(1);
      expect(parsed.reviewedAcceptable[0].files).toEqual([
        'libs/features/orders/utils.ts',
        'libs/features/payments/utils.ts',
      ]);
    });

    it('returns changed=false when feature is not in allowlist', () => {
      const raw = JSON.stringify(
        {
          version: 1,
          reviewedAcceptable: [
            {
              category: 'prisma_query_builder',
              files: ['libs/features/admin/a.ts', 'libs/features/admin/b.ts'],
            },
          ],
        },
        null,
        2,
      );

      const result = pruneDuplicationAllowlistSource(raw, 'billing');
      expect(result.changed).toBe(false);
      expect(result.prunedEntriesCount).toBe(0);
      expect(result.content).toBe(raw);
    });

    it('handles empty allowlist or invalid JSON gracefully', () => {
      expect(pruneDuplicationAllowlistSource('{"reviewedAcceptable":[]}', 'billing')).toEqual({
        content: '{"reviewedAcceptable":[]}',
        prunedEntriesCount: 0,
        prunedFilesCount: 0,
        changed: false,
      });

      expect(pruneDuplicationAllowlistSource('not-json', 'billing')).toEqual({
        content: 'not-json',
        prunedEntriesCount: 0,
        prunedFilesCount: 0,
        changed: false,
      });
    });

    it('does not prune sibling feature files (e.g. order vs order-history)', () => {
      const raw = JSON.stringify(
        {
          version: 1,
          reviewedAcceptable: [
            {
              category: 'shared_dto',
              files: [
                'libs/features/order-history/dto/a.dto.ts',
                'libs/features/order-history/dto/b.dto.ts',
              ],
              reason: 'Similar fields',
            },
          ],
        },
        null,
        2,
      );

      const result = pruneDuplicationAllowlistSource(raw, 'order');
      expect(result.changed).toBe(false);
      expect(result.prunedEntriesCount).toBe(0);
      expect(result.content).toBe(raw);
    });
  });
});
