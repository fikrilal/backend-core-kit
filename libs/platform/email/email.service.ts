import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailSendError, type SendEmailInput, type SendEmailResult } from './email.types';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function normalizeRecipients(to: SendEmailInput['to']): string | string[] {
  if (typeof to === 'string') {
    const v = asNonEmptyString(to);
    if (!v) {
      throw new EmailSendError({ provider: 'resend', message: 'Email recipient is required' });
    }
    return v;
  }

  const recipients = to.map(asNonEmptyString).filter((v): v is string => v !== undefined);
  if (recipients.length === 0) {
    throw new EmailSendError({ provider: 'resend', message: 'Email recipient is required' });
  }
  return recipients;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class EmailService {
  private readonly enabled: boolean;
  private readonly resend?: Resend;
  private readonly from?: string;
  private readonly replyTo?: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = asNonEmptyString(this.config.get<string>('RESEND_API_KEY'));
    const from = asNonEmptyString(this.config.get<string>('EMAIL_FROM'));
    const replyTo = asNonEmptyString(this.config.get<string>('EMAIL_REPLY_TO'));

    this.enabled = apiKey !== undefined && from !== undefined;
    this.from = from;
    this.replyTo = replyTo;

    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.resend || !this.from) {
      throw new EmailSendError({
        provider: 'resend',
        message: 'Email is not configured (set RESEND_API_KEY and EMAIL_FROM)',
      });
    }

    const resend = this.resend;

    const text = asNonEmptyString(input.text);
    const html = asNonEmptyString(input.html);
    if (!text && !html) {
      throw new EmailSendError({
        provider: 'resend',
        message: 'Email content is required (text or html)',
      });
    }

    const subject = asNonEmptyString(input.subject);
    if (!subject) {
      throw new EmailSendError({ provider: 'resend', message: 'Email subject is required' });
    }

    const from = asNonEmptyString(input.from) ?? this.from;
    const replyTo = asNonEmptyString(input.replyTo) ?? this.replyTo;

    const base = {
      from,
      to: normalizeRecipients(input.to),
      subject,
      ...(replyTo ? { replyTo } : {}),
      ...(input.tags ? { tags: [...input.tags] } : {}),
      ...(input.headers ? { headers: { ...input.headers } } : {}),
    };

    const { data, error } = await (async () => {
      if (html) {
        return resend.emails.send({
          ...base,
          html,
          ...(text ? { text } : {}),
        });
      }

      if (text) {
        return resend.emails.send({
          ...base,
          text,
        });
      }

      // unreachable due to earlier validation, but keeps TS happy.
      throw new EmailSendError({
        provider: 'resend',
        message: 'Email content is required (text or html)',
      });
    })();

    if (error) {
      const errObj: unknown = error;
      const message =
        isRecord(errObj) && typeof errObj.message === 'string'
          ? errObj.message
          : 'Failed to send email';
      const causeName =
        isRecord(errObj) && typeof errObj.name === 'string' ? errObj.name : undefined;

      throw new EmailSendError({ provider: 'resend', message, causeName });
    }

    const id = isRecord(data) && typeof data.id === 'string' ? data.id : undefined;
    if (!id) {
      throw new EmailSendError({
        provider: 'resend',
        message: 'Email provider returned an invalid response (missing id)',
      });
    }

    return { id };
  }
}
