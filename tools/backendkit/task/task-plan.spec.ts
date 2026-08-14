import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertAllowedPathsStayInRepository,
  findScopeViolations,
  parseTaskPlan,
  type TaskPlanError,
} from './task-plan';

describe('V2 task plan', () => {
  it('parses explicit authority metadata', () => {
    const plan = parseTaskPlan('docs/exec-plans/active/example.md', planSource());

    expect(plan.taskId).toBe('example-task');
    expect(plan.risk).toBe('medium');
    expect(plan.boundaries.allowedPaths).toEqual(['libs/features/users/', 'test/users/']);
    expect(plan.boundaries.allowedActions).toEqual(['edit', 'verify']);
    expect(plan.boundaries.timeoutMs).toBe(5_400_000);
    expect(plan.authorityHash).toHaveLength(64);
  });

  it.each([
    ['root scope', 'libs/features/users/, .', 'path-invalid'],
    ['traversal', '../outside/', 'path-invalid'],
    ['glob', 'libs/**', 'allowed-path'],
    ['whitespace ambiguity', 'libs/features/my feature/', 'allowed-path'],
  ])('rejects %s', (_name, paths, expectedCode) => {
    expect(() => parseTaskPlan('docs/exec-plans/active/example.md', planSource({ paths }))).toThrow(
      expect.objectContaining<Partial<TaskPlanError>>({
        code: expect.stringContaining(expectedCode),
      }),
    );
  });

  it('rejects duplicate authority fields and risk above authorization', () => {
    expect(() =>
      parseTaskPlan(
        'docs/exec-plans/active/example.md',
        `${planSource()}\n**Allowed actions:** edit\n`,
      ),
    ).toThrow('exactly one');
    expect(() =>
      parseTaskPlan(
        'docs/exec-plans/active/example.md',
        planSource({ risk: 'high', maximumRisk: 'medium' }),
      ),
    ).toThrow('cannot exceed');
  });

  it('matches only exact files or directory prefixes', () => {
    expect(
      findScopeViolations(
        ['libs/features/users/a.ts', 'libs/features/user.ts'],
        ['libs/features/users/'],
      ),
    ).toEqual(['libs/features/user.ts']);
  });

  it('rejects an existing allowed path that escapes through a symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-plan-'));
    const outside = await mkdtemp(join(tmpdir(), 'backendkit-outside-'));
    await mkdir(join(root, 'libs'), { recursive: true });
    await symlink(outside, join(root, 'libs', 'escape'));

    await expect(assertAllowedPathsStayInRepository(root, ['libs/escape/'])).rejects.toThrow(
      'escapes through a symlink',
    );
  });
});

function planSource(
  values: Readonly<{
    paths?: string;
    risk?: string;
    maximumRisk?: string;
  }> = {},
): string {
  return `# Example

**Plan version:** 2
**Task ID:** example-task
**Status:** active
**Owner:** test owner
**Risk:** ${values.risk ?? 'medium'}
**Authority:** edit and verify locally
**Allowed paths:** ${values.paths ?? 'libs/features/users/, test/users/'}
**Allowed actions:** edit, verify
**Maximum risk:** ${values.maximumRisk ?? 'high'}
**Repair limit:** 2
**Task timeout:** 90m
`;
}
