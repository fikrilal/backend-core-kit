import request from 'supertest';
import { UserRole, UserStatus } from '@prisma/client';
import {
  USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB,
  USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB,
} from '../../libs/features/users/infra/jobs/user-account-deletion-email.job';
import {
  describeAuthE2eSuite,
  isObject,
  type AuthE2eHarness,
  uniqueEmail,
} from './auth-e2e.harness';

describeAuthE2eSuite('Auth Account Deletion (e2e)', (harness) => {
  let baseUrl = '';
  let prisma: ReturnType<AuthE2eHarness['prisma']>;
  let emailQueue: ReturnType<AuthE2eHarness['emailQueue']>;

  beforeEach(() => {
    baseUrl = harness.baseUrl();
    prisma = harness.prisma();
    emailQueue = harness.emailQueue();
  });
  it('request account deletion schedules deletion and cancel clears it', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      accessToken: string;
    };

    await request(baseUrl)
      .post('/v1/me/account-deletion/request')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(204);

    const meAfterRequest = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    const userId = meAfterRequest.body.data.id as string;

    const emailJobsAfterRequest = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const deletionRequestedEmail = emailJobsAfterRequest.find(
      (job) =>
        job.name === USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB &&
        isObject(job.data) &&
        job.data.userId === userId,
    );
    const deletionReminderEmail = emailJobsAfterRequest.find(
      (job) =>
        job.name === USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB &&
        isObject(job.data) &&
        job.data.userId === userId,
    );

    expect(deletionRequestedEmail).toBeDefined();
    expect(deletionReminderEmail).toBeDefined();

    expect(meAfterRequest.body.data.accountDeletion).toBeDefined();
    expect(meAfterRequest.body.data.accountDeletion).toMatchObject({
      requestedAt: expect.any(String),
      scheduledFor: expect.any(String),
    });

    const requestedAt = new Date(meAfterRequest.body.data.accountDeletion.requestedAt as string);
    const scheduledFor = new Date(meAfterRequest.body.data.accountDeletion.scheduledFor as string);

    const msInDay = 24 * 60 * 60 * 1000;
    const deltaDays = (scheduledFor.getTime() - requestedAt.getTime()) / msInDay;
    expect(deltaDays).toBeGreaterThan(29.9);
    expect(deltaDays).toBeLessThan(30.1);

    await request(baseUrl)
      .post('/v1/me/account-deletion/cancel')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(204);

    const emailJobsAfterCancel = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const reminderStillPresent = emailJobsAfterCancel.some(
      (job) =>
        job.name === USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB &&
        isObject(job.data) &&
        job.data.userId === userId,
    );
    expect(reminderStillPresent).toBe(false);

    const meAfterCancel = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(200);

    expect(meAfterCancel.body.data.accountDeletion).toBeNull();
  });

  it('request account deletion returns USERS_CANNOT_DELETE_LAST_ADMIN for last active admin', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = registerRes.body.data as {
      user: { id: string };
      accessToken: string;
    };

    await prisma.user.update({
      where: { id: reg.user.id },
      data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    });

    // Ensure this user is the only active admin for a deterministic last-admin check.
    await prisma.user.updateMany({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        id: { not: reg.user.id },
      },
      data: { role: UserRole.USER },
    });

    const res = await request(baseUrl)
      .post('/v1/me/account-deletion/request')
      .set('Authorization', `Bearer ${reg.accessToken}`)
      .expect(409);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'USERS_CANNOT_DELETE_LAST_ADMIN', status: 409 });
  });
});
