import { confirmFeatureRemoval } from './removal-confirmation';

describe('removal-confirmation', () => {
  it('proceeds without prompting for dry-run or --yes', async () => {
    const prompt = jest.fn(async () => 'n');

    await expect(
      confirmFeatureRemoval({ name: 'billing', dryRun: true, interactive: true, prompt }),
    ).resolves.toBe('proceed');
    await expect(
      confirmFeatureRemoval({ name: 'billing', yes: true, interactive: false, prompt }),
    ).resolves.toBe('proceed');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('fails closed without --yes in non-interactive environments', async () => {
    await expect(
      confirmFeatureRemoval({ name: 'billing', interactive: false, prompt: async () => 'y' }),
    ).rejects.toThrow(
      'Refusing to remove feature without confirmation in non-interactive environment. Pass --yes to confirm deletion.',
    );
  });

  it('proceeds only on an explicit y/yes answer', async () => {
    await expect(
      confirmFeatureRemoval({ name: 'billing', interactive: true, prompt: async () => ' y \n' }),
    ).resolves.toBe('proceed');
    await expect(
      confirmFeatureRemoval({ name: 'billing', interactive: true, prompt: async () => 'YES' }),
    ).resolves.toBe('proceed');
  });

  it('aborts on negative answers and on EOF (empty answer)', async () => {
    await expect(
      confirmFeatureRemoval({ name: 'billing', interactive: true, prompt: async () => 'n' }),
    ).resolves.toBe('aborted');
    await expect(
      confirmFeatureRemoval({ name: 'billing', interactive: true, prompt: async () => '' }),
    ).resolves.toBe('aborted');
  });
});
