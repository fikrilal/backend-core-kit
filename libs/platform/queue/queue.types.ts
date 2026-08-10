export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

// Runtime validation is the source of truth here; a nominal brand would require assertions.
export type JobName = string;
export type QueueName = string;

const JOB_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const QUEUE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

export function jobName(value: string): JobName {
  const normalized = value.trim();
  if (!JOB_NAME_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid job name "${value}". Expected: dot-separated segments using lowerCamelCase (e.g., "user.sendVerificationEmail").`,
    );
  }
  return normalized;
}

export function queueName(value: string): QueueName {
  const normalized = value.trim();
  if (!QUEUE_NAME_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid queue name "${value}". Expected: lowercase letters/digits/hyphen, 1-63 chars, starting with a letter.`,
    );
  }
  return normalized;
}
