import { mkdir, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EpisodeStore } from './evidence/episode';
import { EventIntakeService } from './events/event-intake';
import { HandoffService } from './handoff/handoff-service';
import type { PublicationAdapter, PublicationRepositoryState } from './handoff/publication-adapter';
import { runProcess } from './process-runner';
import { SystemGitRepository } from './task/git-repository';
import { TaskService } from './task/task-service';
import { FileTaskStateStore } from './task/task-state';
import { TaskVerificationController } from './task/task-verification';
import type { VerificationProfileId } from './verification/profile-registry';
import type { VerificationProfileRunResult } from './verification/run-profile';
import { TaskWorkspaceService } from './workspace/task-workspace';

describe('backendkit end-to-end loop', () => {
  it('authorizes, isolates, verifies, and hands off one local task', async () => {
    const root = await repositoryFixture();
    const taskId = 'loop-e2e-fixture';
    const planPath = 'docs/exec-plans/active/loop-e2e-fixture.md';
    const states = new FileTaskStateStore(root);
    const tasks = new TaskService(root, new SystemGitRepository(root), states);

    await tasks.begin(planPath);
    const workspaces = new TaskWorkspaceService(root, { states, tasks });
    const workspace = await workspaces.prepare(taskId);
    await writeFile(join(workspace.path, 'docs', 'candidate.md'), '# Verified candidate\n');

    const candidateTasks = new TaskService(
      workspace.path,
      new SystemGitRepository(workspace.path),
      states,
    );
    const profiles = new RecordingProfiles();
    const verification = new TaskVerificationController(workspace.path, {
      taskService: candidateTasks,
      states,
      episodes: new EpisodeStore(root),
      profiles,
    });
    const verified = await verification.verify(taskId);

    expect(verified.status).toBe('ready_for_review');
    expect(profiles.runs).toEqual(['fast']);

    const adapter = new LocalPublicationAdapter(workspace.branch, ['docs/candidate.md']);
    const handoff = new HandoffService(root, {
      states,
      workspaces,
      preflights: () => candidateTasks,
      adapters: () => adapter,
    });

    const commitApproval = await handoff.dryRun(taskId, 'commit');
    await handoff.commit(taskId, commitApproval.approval, 'docs: publish verified fixture');
    const pushApproval = await handoff.dryRun(taskId, 'push');
    await handoff.push(taskId, pushApproval.approval);
    const draftApproval = await handoff.dryRun(taskId, 'draft-pr');
    await handoff.draftPr(
      taskId,
      draftApproval.approval,
      'main',
      'Verified loop engineering fixture',
    );

    expect(adapter.actions).toEqual(['commit', 'push', 'draft-pr']);
    expect((await states.read(taskId)).status).toBe('handed_off');

    const completedDirectory = join(root, 'docs', 'exec-plans', 'completed');
    await mkdir(completedDirectory, { recursive: true });
    await rename(join(root, planPath), join(completedDirectory, 'loop-e2e-fixture.md'));
    await expect(new EventIntakeService(root).runOnce()).resolves.toEqual({
      kind: 'idle',
      reason: 'no-queued-plans',
    });
  });
});

class RecordingProfiles {
  readonly runs: VerificationProfileId[] = [];

  async run(profile: VerificationProfileId): Promise<VerificationProfileRunResult> {
    this.runs.push(profile);
    return { profile, durationMs: 1, steps: [] };
  }
}

class LocalPublicationAdapter implements PublicationAdapter {
  readonly actions: string[] = [];
  private stagedPaths: ReadonlyArray<string> = [];

  constructor(
    private readonly branch: string,
    private worktreePaths: ReadonlyArray<string>,
  ) {}

  async inspect(): Promise<PublicationRepositoryState> {
    return {
      branch: this.branch,
      remote: 'github.com/example/backend',
      head: 'a'.repeat(40),
      stagedPaths: this.stagedPaths,
      worktreePaths: this.worktreePaths,
    };
  }

  async stage(paths: ReadonlyArray<string>): Promise<void> {
    this.stagedPaths = [...paths];
  }

  async commit(): Promise<string> {
    this.actions.push('commit');
    this.stagedPaths = [];
    this.worktreePaths = [];
    return 'b'.repeat(40);
  }

  async push(): Promise<string> {
    this.actions.push('push');
    return 'c'.repeat(40);
  }

  async createDraftPr(): Promise<string> {
    this.actions.push('draft-pr');
    return 'https://github.com/example/backend/pull/42';
  }
}

async function repositoryFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'backendkit-loop-e2e-'));
  const planPath = join(root, 'docs', 'exec-plans', 'active');
  await mkdir(planPath, { recursive: true });
  await writeFile(join(root, '.gitignore'), '.tmp/\n');
  await writeFile(join(root, 'docs', 'candidate.md'), '# Initial candidate\n');
  await writeFile(join(planPath, 'loop-e2e-fixture.md'), fixturePlan());
  await git(root, ['init', '-b', 'development']);
  await git(root, ['config', 'user.name', 'Backendkit Fixture']);
  await git(root, ['config', 'user.email', 'backendkit@example.invalid']);
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', 'chore: initialize loop fixture']);
  return root;
}

async function git(root: string, args: ReadonlyArray<string>): Promise<void> {
  const result = await runProcess({ command: 'git', args, cwd: root, stdio: 'pipe' });
  if (result.code !== 0) throw new Error(`Fixture Git command failed: ${args[0] ?? 'unknown'}`);
}

function fixturePlan(): string {
  return `# Loop E2E Fixture

**Plan version:** 2
**Task ID:** loop-e2e-fixture
**Status:** active
**Owner:** Fixture owner
**Risk:** low
**Authority:** edit, verify, and publish the local fixture only
**Allowed paths:** docs/candidate.md, docs/exec-plans/active/loop-e2e-fixture.md
**Allowed actions:** edit, verify, commit, push, draft-pr
**Maximum risk:** high
**Repair limit:** 1
**Task timeout:** 30m

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: no
`;
}
