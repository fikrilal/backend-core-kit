export type EmailTag = Readonly<{ name: string; value: string }>;

export type SendEmailInput = Readonly<{
  /**
   * Recipient(s).
   * Resend supports a single email or an array.
   */
  to: string | ReadonlyArray<string>;
  subject: string;
  text?: string;
  html?: string;
  /**
   * Optional override for the configured sender.
   */
  from?: string;
  /**
   * Optional override for the configured reply-to address.
   */
  replyTo?: string;
  tags?: ReadonlyArray<EmailTag>;
  headers?: Readonly<Record<string, string>>;
}>;

export type SendEmailResult = Readonly<{ id: string }>;

export class EmailSendError extends Error {
  readonly provider: string;
  readonly causeName?: string;

  constructor(params: { provider: string; message: string; causeName?: string }) {
    super(params.message);
    this.provider = params.provider;
    this.causeName = params.causeName;
  }
}
