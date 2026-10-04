export type RemovalConfirmationDecision = 'proceed' | 'aborted';

export type RemovalConfirmationOptions = Readonly<{
  name: string;
  dryRun?: boolean;
  yes?: boolean;
  interactive: boolean;
  prompt: (question: string) => Promise<string>;
}>;

/**
 * Decides whether a destructive feature removal may proceed. Fails closed in
 * non-interactive environments; anything other than an explicit "y"/"yes"
 * (including an empty EOF answer) aborts.
 */
export async function confirmFeatureRemoval(
  options: RemovalConfirmationOptions,
): Promise<RemovalConfirmationDecision> {
  if (options.dryRun || options.yes) return 'proceed';

  if (!options.interactive) {
    throw new Error(
      'Refusing to remove feature without confirmation in non-interactive environment. Pass --yes to confirm deletion.',
    );
  }

  const answer = (
    await options.prompt(`Are you sure you want to remove feature "${options.name}"? [y/N] `)
  )
    .trim()
    .toLowerCase();

  return answer === 'y' || answer === 'yes' ? 'proceed' : 'aborted';
}
