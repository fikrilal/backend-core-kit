export type QueueName = string & { readonly __brand: unique symbol };

const QUEUE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

export function queueName(value: string): QueueName {
  const normalized = value.trim();
  if (!QUEUE_NAME_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid queue name "${value}". Expected: lowercase letters/digits/hyphen, 1-63 chars, starting with a letter.`,
    );
  }
  return normalized as QueueName;
}
