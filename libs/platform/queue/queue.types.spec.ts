import { jobName, queueName } from './queue.types';

describe('queue.types', () => {
  describe('jobName', () => {
    it('accepts dot-separated lowerCamelCase segments', () => {
      expect(jobName('user.sendVerificationEmail')).toBe('user.sendVerificationEmail');
    });

    it('rejects missing namespace', () => {
      expect(() => jobName('smoke')).toThrow(/dot-separated/i);
    });

    it('rejects invalid characters', () => {
      expect(() => jobName('system.smoke_retry')).toThrow(/Invalid job name/i);
    });
  });

  describe('queueName', () => {
    it('accepts lowercase queue names with digits and hyphens', () => {
      expect(queueName('emails-v2')).toBe('emails-v2');
    });

    it('rejects uppercase names', () => {
      expect(() => queueName('Emails')).toThrow(/Invalid queue name/i);
    });

    it('rejects names that do not start with a letter', () => {
      expect(() => queueName('1emails')).toThrow(/Invalid queue name/i);
    });
  });
});
