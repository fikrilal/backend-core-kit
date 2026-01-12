export const AUTH_METHOD_VALUES = ['PASSWORD', 'GOOGLE'] as const;

export type AuthMethod = (typeof AUTH_METHOD_VALUES)[number];
