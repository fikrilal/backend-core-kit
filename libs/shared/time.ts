export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export function addMilliseconds(base: Date, milliseconds: number): Date {
  return new Date(base.getTime() + milliseconds);
}

export function addSeconds(base: Date, seconds: number): Date {
  return addMilliseconds(base, seconds * 1000);
}

export function addDays(base: Date, days: number): Date {
  return addMilliseconds(base, days * 24 * 60 * 60 * 1000);
}
