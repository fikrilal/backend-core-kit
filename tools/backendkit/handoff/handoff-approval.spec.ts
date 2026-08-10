import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FileHandoffApprovalStore,
  parseHandoffApproval,
  type HandoffApproval,
} from './handoff-approval';

describe('handoff approval state', () => {
  it('writes strict private approval without the raw challenge', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-handoff-approval-'));
    const store = new FileHandoffApprovalStore(root);
    const approval = approvalState();
    await store.write(approval);

    await expect(store.read(approval.taskId, approval.action)).resolves.toEqual(approval);
    const path = join(
      root,
      '.tmp',
      'backendkit',
      'tasks',
      approval.taskId,
      'handoff',
      'commit.json',
    );
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readFile(path, 'utf8')).not.toMatch(/approval.*value|prompt|stdout|stderr|token/i);
  });

  it('rejects unknown fields and inconsistent terminal state', () => {
    expect(() => parseHandoffApproval({ ...approvalState(), model: 'codex' })).toThrow('invalid');
    expect(() => parseHandoffApproval({ ...approvalState(), status: 'completed' })).toThrow(
      'invalid',
    );
  });

  it('rejects non-canonical or escaping changed paths', () => {
    expect(() =>
      parseHandoffApproval({ ...approvalState(), changedPaths: ['nested/../candidate.ts'] }),
    ).toThrow('invalid');
    expect(() =>
      parseHandoffApproval({ ...approvalState(), changedPaths: ['../candidate.ts'] }),
    ).toThrow('invalid');
  });
});

function approvalState(): HandoffApproval {
  return {
    schemaVersion: 1,
    taskId: 'handoff-task',
    action: 'commit',
    status: 'prepared',
    taskFingerprint: 'a'.repeat(64),
    authorityHash: 'b'.repeat(64),
    attempt: 1,
    branch: 'backendkit/handoff-task',
    remote: 'github.com/example/backend',
    changedPaths: ['candidate.ts'],
    challengeHash: 'c'.repeat(64),
    preparedAt: '2026-08-10T00:00:00.000Z',
    expiresAt: '2026-08-10T00:15:00.000Z',
  };
}
