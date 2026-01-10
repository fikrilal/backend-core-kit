export type ListQueryIssue = Readonly<{
  field: string;
  message: string;
}>;

export class ListQueryValidationError extends Error {
  readonly issues: ReadonlyArray<ListQueryIssue>;

  constructor(issues: ReadonlyArray<ListQueryIssue>) {
    super('Invalid list query');
    this.issues = issues;
  }
}
