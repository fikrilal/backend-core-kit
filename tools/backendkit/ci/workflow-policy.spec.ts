import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

describe('hosted CI policy', () => {
  it('keeps independently visible lanes and a stable aggregate check', async () => {
    const workflow = await workflowSource();

    for (const name of ['CI Risk', 'CI Full', 'CI Runtime', 'CI Governance', 'CI Required']) {
      expect(workflow).toContain(`name: ${name}`);
    }
    expect(workflow).toContain("if: needs.risk.outputs.runtime_required == 'true'");
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('RUNTIME_RESULT: ${{ needs.runtime.result }}');
    expect(workflow).toContain('"$RUNTIME_RESULT" != "skipped"');
  });

  it('uses read-only checkout credentials and excludes private controller evidence', async () => {
    const workflow = await workflowSource();

    expect(workflow).toContain('permissions:\n  contents: read\n  pull-requests: read');
    expect(workflow.match(/persist-credentials: false/g)).toHaveLength(4);
    expect(workflow).not.toContain('.tmp/backendkit');
    expect(workflow).not.toMatch(/diagnostic|prompt|stdout|stderr|environment/i);
  });
});

async function workflowSource(): Promise<string> {
  return readFile(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
}
