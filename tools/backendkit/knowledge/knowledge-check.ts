import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { parseTaskPlan, TaskPlanError, type TaskPlanStatus } from '../task/task-plan';

export type KnowledgeIssue = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export type KnowledgeReport = Readonly<{
  checkedPlans: number;
  v2Plans: number;
  legacyCompletedPlans: number;
  issues: ReadonlyArray<KnowledgeIssue>;
}>;

const requiredSections: ReadonlyArray<string> = [
  'Objective',
  'Constraints',
  'Impact Areas',
  'Acceptance Criteria',
  'Implementation Checklist',
  'Decision Log',
  'Verification',
  'Runtime Evidence',
  'Risks And Mitigations',
  'Completion Notes',
  'Follow-Ups',
];

const folders: ReadonlyArray<Readonly<{ name: TaskPlanStatus; path: string }>> = [
  { name: 'active', path: 'docs/exec-plans/active' },
  { name: 'queued', path: 'docs/exec-plans/queued' },
  { name: 'completed', path: 'docs/exec-plans/completed' },
];

export async function checkKnowledge(root: string): Promise<KnowledgeReport> {
  const issues: KnowledgeIssue[] = [];
  const taskIds = new Map<string, string>();
  let checkedPlans = 0;
  let v2Plans = 0;
  let legacyCompletedPlans = 0;
  let activePlans = 0;

  for (const folder of folders) {
    for (const file of await markdownFiles(resolve(root, folder.path))) {
      checkedPlans += 1;
      const path = `${folder.path}/${file}`;
      const source = await readFile(resolve(root, path), 'utf8');
      if (!hasMetadata(source, 'Plan version')) {
        if (folder.name === 'completed') {
          legacyCompletedPlans += 1;
          continue;
        }
        issues.push(issue(path, 'plan-version-missing', 'Active and queued plans must use V2.'));
        continue;
      }

      try {
        const plan = parseTaskPlan(path, source);
        v2Plans += 1;
        if (plan.status !== folder.name) {
          issues.push(
            issue(
              path,
              'status-folder-mismatch',
              `Status '${plan.status}' does not match '${folder.name}'.`,
            ),
          );
        }
        if (folder.name === 'active') activePlans += 1;
        const previousPath = taskIds.get(plan.taskId);
        if (previousPath) {
          issues.push(
            issue(
              path,
              'task-id-duplicate',
              `Task ID '${plan.taskId}' is also used by ${previousPath}.`,
            ),
          );
        } else taskIds.set(plan.taskId, path);

        for (const section of requiredSections) {
          if (!hasSection(source, section)) {
            issues.push(
              issue(path, 'section-missing', `Missing required section '## ${section}'.`),
            );
          }
        }
        if (folder.name === 'completed' && hasUncheckedImplementationItem(source)) {
          issues.push(
            issue(
              path,
              'completed-checklist-open',
              'Completed plan has an unchecked implementation item.',
            ),
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof TaskPlanError ? error.code : 'plan-invalid';
        issues.push(issue(path, code, message));
      }
    }
  }

  if (activePlans > 1) {
    issues.push(
      issue(
        'docs/exec-plans/active/',
        'active-plan-count',
        `Expected at most one V2 active plan, found ${activePlans}.`,
      ),
    );
  }

  return { checkedPlans, v2Plans, legacyCompletedPlans, issues };
}

export function assertKnowledgeValid(report: KnowledgeReport): void {
  if (report.issues.length === 0) return;
  const details = report.issues
    .map(({ path, code, message }) => `${path} [${code}]: ${message}`)
    .join('\n');
  throw new Error(`Knowledge validation failed with ${report.issues.length} issue(s):\n${details}`);
}

async function markdownFiles(directory: string): Promise<ReadonlyArray<string>> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isFile() && entry.name.endsWith('.md') && basename(entry.name) !== '_template.md',
      )
      .map((entry) => entry.name)
      .sort();
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function hasMetadata(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\*\\*${escaped}:\\*\\*`, 'm').test(source);
}

function hasSection(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^## ${escaped}\\s*$`, 'm').test(source);
}

function hasUncheckedImplementationItem(source: string): boolean {
  const heading = /^## Implementation Checklist\s*$/m.exec(source);
  if (!heading || heading.index === undefined) return false;
  const remainder = source.slice(heading.index + heading[0].length);
  const nextHeading = remainder.search(/^## /m);
  const section = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  return /^\s*- \[ \]/m.test(section);
}

function issue(path: string, code: string, message: string): KnowledgeIssue {
  return { path, code, message };
}
