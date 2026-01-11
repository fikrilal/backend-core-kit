import type { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailService } from './email.service';
import { EmailSendError } from './email.types';

jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: jest.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null }),
      },
    })),
  };
});

function stubConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as unknown as T,
  } as unknown as ConfigService;
}

describe('EmailService (Resend)', () => {
  it('is disabled when RESEND_API_KEY/EMAIL_FROM are missing', () => {
    const svc = new EmailService(stubConfig({}));
    expect(svc.isEnabled()).toBe(false);
  });

  it('throws when sending without config', async () => {
    const svc = new EmailService(stubConfig({}));
    await expect(
      svc.send({ to: 'user@example.com', subject: 'Hello', text: 'Hi' }),
    ).rejects.toBeInstanceOf(EmailSendError);
  });

  it('sends via Resend when configured', async () => {
    const svc = new EmailService(
      stubConfig({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'onboarding@example.com' }),
    );
    expect(svc.isEnabled()).toBe(true);

    const result = await svc.send({ to: 'user@example.com', subject: 'Hello', text: 'Hi' });
    expect(result).toEqual({ id: 'email-id' });

    const ResendMock = Resend as unknown as jest.Mock;
    expect(ResendMock).toHaveBeenCalledWith('re_test');

    const resendClient = ResendMock.mock.results[0]?.value as unknown as {
      emails: { send: jest.Mock };
    };
    expect(resendClient.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'onboarding@example.com',
        to: 'user@example.com',
        subject: 'Hello',
        text: 'Hi',
      }),
    );
  });
});
