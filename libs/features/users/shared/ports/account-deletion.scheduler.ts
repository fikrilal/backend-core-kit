export interface AccountDeletionScheduler {
  scheduleFinalize(userId: string, scheduledFor: Date): Promise<void>;
  cancelFinalize(userId: string): Promise<void>;
}
