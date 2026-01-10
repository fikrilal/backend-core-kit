export type AuthIssue = Readonly<{ field?: string; message: string }>;

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: ReadonlyArray<AuthIssue>;

  constructor(params: {
    status: number;
    code: string;
    message?: string;
    issues?: ReadonlyArray<AuthIssue>;
  }) {
    super(params.message ?? params.code);
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
  }
}

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('Email already exists');
  }
}
