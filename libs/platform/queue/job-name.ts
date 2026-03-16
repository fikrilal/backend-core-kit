// Runtime validation is the source of truth here; a nominal brand would require assertions.
export type JobName = string;

const JOB_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;

export function jobName(value: string): JobName {
  const normalized = value.trim();
  if (!JOB_NAME_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid job name "${value}". Expected: dot-separated segments using lowerCamelCase (e.g., "user.sendVerificationEmail").`,
    );
  }
  return normalized;
}
