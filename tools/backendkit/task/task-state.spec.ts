import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FileTaskStateStore,
  validateTaskState,
  type TaskStateError,
  type TaskState,
} from './task-state';

describe('task state', () => {
  it('writes and reads schema-versioned state under the ignored task directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-state-'));
    const store = new FileTaskStateStore(root);
    const state = taskState();

    await store.create(state);

    await expect(store.read(state.taskId)).resolves.toEqual(state);
    const persisted = await readFile(
      join(root, '.tmp', 'backendkit', 'tasks', state.taskId, 'state.json'),
      'utf8',
    );
    expect(persisted).not.toContain('DATABASE_URL');
    await expect(store.create(state)).rejects.toMatchObject<Partial<TaskStateError>>({
      code: 'state-exists',
    });
  });

  it('rejects malformed or unsupported state', () => {
    expect(() => validateTaskState({ schemaVersion: 2 })).toThrow('schema version 1');
    expect(() => validateTaskState({ ...taskState(), boundaries: { allowedPaths: [] } })).toThrow(
      'schema version 1',
    );
  });
});

function taskState(): TaskState {
  return {
    schemaVersion: 1,
    taskId: 'example-task',
    status: 'authorized',
    startedAt: '2026-08-09T00:00:00.000Z',
    baseRevision: 'a'.repeat(40),
    planPath: 'docs/exec-plans/active/example.md',
    planSourceHash: 'b'.repeat(64),
    authorityHash: 'c'.repeat(64),
    declaredRisk: 'medium',
    boundaries: {
      allowedPaths: ['libs/features/users/'],
      allowedActions: ['edit', 'verify'],
      maximumRisk: 'high',
      repairLimit: 2,
      timeoutMs: 60_000,
    },
    preexistingChanges: [],
  };
}
