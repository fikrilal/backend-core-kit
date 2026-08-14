import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EpisodeStore, validateEpisode, type TaskEpisode } from './episode';

describe('sanitized task episode', () => {
  it('writes only the approved schema', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-episode-'));
    const episode = validEpisode();
    const path = await new EpisodeStore(root).write(episode);
    const source = await readFile(join(root, path), 'utf8');

    expect(JSON.parse(source)).toEqual(episode);
    expect(source).not.toContain('stdout');
    expect(source).not.toContain('DATABASE_URL');
  });

  it('rejects raw diagnostic and secret-bearing fields', () => {
    expect(() => validateEpisode({ ...validEpisode(), stdout: 'raw output' })).toThrow(
      'sanitized schema',
    );
    expect(() => validateEpisode({ ...validEpisode(), environment: { TOKEN: 'secret' } })).toThrow(
      'sanitized schema',
    );
    expect(() =>
      validateEpisode({
        ...validEpisode(),
        diagnostic: { path: 'safe', metadata: { stderr: 'raw' } },
      }),
    ).toThrow('sanitized schema');
  });
});

function validEpisode(): TaskEpisode {
  return {
    schemaVersion: 1,
    taskId: 'example-task',
    attempt: 1,
    generatedAt: '2026-08-09T00:00:01.000Z',
    planPath: 'docs/exec-plans/active/example.md',
    authorityHash: 'a'.repeat(64),
    baseRevision: 'b'.repeat(40),
    taskFingerprint: 'c'.repeat(64),
    effectiveRisk: 'high',
    reviewRequired: true,
    matchedRiskRuleIds: ['high.harness'],
    changedPaths: ['tools/backendkit/task/example.ts'],
    runtimeReasons: [],
    lanes: [{ id: 'full', status: 'passed', durationMs: 10 }],
    transitions: [
      {
        status: 'ready_for_review',
        occurredAt: '2026-08-09T00:00:01.000Z',
        reason: 'task.verify.passed',
      },
    ],
    finalStatus: 'ready_for_review',
    stopReason: 'verification.passed',
  };
}
