export type JobName = string & { readonly __brand: unique symbol };

const JOB_NAME_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;

export function jobName(value: string): JobName {
  const normalized = value.trim();
  if (!JOB_NAME_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid job name "${value}". Expected: dot-separated segments (e.g., "user.sendVerificationEmail").`,
    );
  }
  return normalized as JobName;
}
