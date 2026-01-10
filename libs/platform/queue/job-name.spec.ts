import { jobName } from './job-name';

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
