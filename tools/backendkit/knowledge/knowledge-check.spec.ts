import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkKnowledge } from './knowledge-check';

describe('knowledge lifecycle check', () => {
  it('accepts one valid active V2 plan and grandfathers legacy completed plans', async () => {
    const root = await knowledgeRoot();
    await writePlan(root, 'active/task.md', v2Plan());
    await writePlan(root, 'completed/legacy.md', '# Legacy completed plan\n');

    await expect(checkKnowledge(root)).resolves.toMatchObject({
      checkedPlans: 2,
      v2Plans: 1,
      legacyCompletedPlans: 1,
      issues: [],
    });
  });

  it('reports status mismatches, duplicate IDs, missing sections, and open completed work', async () => {
    const root = await knowledgeRoot();
    await writePlan(root, 'active/one.md', v2Plan({ taskId: 'duplicate-task' }));
    await writePlan(
      root,
      'completed/two.md',
      v2Plan({ taskId: 'duplicate-task', status: 'active', checklist: '- [ ] unfinished' }).replace(
        '## Runtime Evidence\n\nRecorded.\n',
        '',
      ),
    );

    const report = await checkKnowledge(root);
    expect(report.issues.map(({ code }) => code).sort()).toEqual(
      expect.arrayContaining([
        'completed-checklist-open',
        'section-missing',
        'status-folder-mismatch',
        'task-id-duplicate',
      ]),
    );
  });

  it('requires V2 for new active plans', async () => {
    const root = await knowledgeRoot();
    await writePlan(root, 'active/legacy.md', '# Legacy active plan\n');

    expect((await checkKnowledge(root)).issues).toContainEqual(
      expect.objectContaining({ code: 'plan-version-missing' }),
    );
  });
});

async function knowledgeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'backendkit-knowledge-'));
  for (const folder of ['active', 'queued', 'completed']) {
    await mkdir(join(root, 'docs', 'exec-plans', folder), { recursive: true });
  }
  return root;
}

async function writePlan(root: string, relativePath: string, source: string): Promise<void> {
  await writeFile(join(root, 'docs', 'exec-plans', relativePath), source);
}

function v2Plan(
  values: Readonly<{ taskId?: string; status?: string; checklist?: string }> = {},
): string {
  const sections = [
    ['Objective', 'Recorded.'],
    ['Constraints', 'Recorded.'],
    [
      'Impact Areas',
      '- API/OpenAPI: no\n- DB/Prisma/migrations: no\n- Auth/session/RBAC: no\n- Queue/jobs: no\n- Env/config/secrets: no\n- Observability/logging/tracing: no\n- External integrations: no\n- CI/release/harness: no',
    ],
    ['Acceptance Criteria', 'Recorded.'],
    ['Implementation Checklist', values.checklist ?? '- [x] complete'],
    ['Decision Log', 'Recorded.'],
    ['Verification', 'Recorded.'],
    ['Runtime Evidence', 'Recorded.'],
    ['Risks And Mitigations', 'Recorded.'],
    ['Completion Notes', 'Recorded.'],
    ['Follow-Ups', 'Recorded.'],
  ];
  return `# Plan

**Plan version:** 2
**Task ID:** ${values.taskId ?? 'valid-task'}
**Status:** ${values.status ?? 'active'}
**Owner:** test owner
**Risk:** low
**Authority:** edit and verify locally
**Allowed paths:** docs/
**Allowed actions:** edit, verify
**Maximum risk:** low
**Repair limit:** 1
**Task timeout:** 30m

${sections.map(([heading, content]) => `## ${heading}\n\n${content}\n`).join('\n')}`;
}
