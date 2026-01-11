export type AdminIssue = Readonly<{ field?: string; message: string }>;

export class AdminError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: ReadonlyArray<AdminIssue>;

  constructor(params: {
    status: number;
    code: string;
    message?: string;
    issues?: ReadonlyArray<AdminIssue>;
  }) {
    super(params.message ?? params.code);
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
  }
}
