import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import type { PushService } from './push.service';
import type { PushNotification, SendPushToTokenInput, SendPushToTokenResult } from './push.types';
import { PushSendError } from './push.types';

const FCM_APP_NAME = 'push';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseServiceAccount(value: unknown): ServiceAccount {
  if (!isRecord(value)) {
    throw new Error('Service account JSON must be an object');
  }

  const projectId = value.project_id;
  const clientEmail = value.client_email;
  const privateKey = value.private_key;

  if (typeof projectId !== 'string' || projectId.trim() === '') {
    throw new Error('Service account JSON is missing project_id');
  }
  if (typeof clientEmail !== 'string' || clientEmail.trim() === '') {
    throw new Error('Service account JSON is missing client_email');
  }
  if (typeof privateKey !== 'string' || privateKey.trim() === '') {
    throw new Error('Service account JSON is missing private_key');
  }

  const normalizedKey = privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;

  return {
    projectId: projectId.trim(),
    clientEmail: clientEmail.trim(),
    privateKey: normalizedKey,
  } satisfies ServiceAccount;
}

function loadServiceAccountFromPath(path: string): ServiceAccount {
  if (!existsSync(path)) {
    throw new Error(`FCM service account file does not exist: ${path}`);
  }

  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw) as unknown;
  return parseServiceAccount(parsed);
}

function loadServiceAccountFromEnv(json: string): ServiceAccount {
  const parsed: unknown = JSON.parse(json) as unknown;
  return parseServiceAccount(parsed);
}

function normalizeNotification(input: PushNotification | undefined): PushNotification | undefined {
  if (!input) return undefined;
  const title = asNonEmptyString(input.title);
  const body = asNonEmptyString(input.body);
  if (!title && !body) return undefined;
  return { ...(title ? { title } : {}), ...(body ? { body } : {}) };
}

function getErrorCode(err: unknown): string | undefined {
  if (!isRecord(err)) return undefined;
  const code = err.code;
  return typeof code === 'string' ? code : undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (isRecord(err) && typeof err.message === 'string') return err.message;
  return 'Failed to send push notification';
}

function isRetryableMessagingError(code: string | undefined): boolean {
  if (!code) return true;

  // Known non-retryable errors (token invalid/unregistered, invalid payload).
  if (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-argument'
  ) {
    return false;
  }

  // Everything else is treated as retryable by default (transient infra issues, etc.).
  return true;
}

@Injectable()
export class FcmPushService implements PushService {
  private readonly enabled: boolean;
  private readonly app?: App;

  constructor(private readonly config: ConfigService) {
    const provider = asNonEmptyString(this.config.get<string>('PUSH_PROVIDER'));
    if (provider !== 'FCM') {
      this.enabled = false;
      return;
    }

    const projectId = asNonEmptyString(this.config.get<string>('FCM_PROJECT_ID'));
    const useAdc = this.config.get<boolean>('FCM_USE_APPLICATION_DEFAULT') === true;

    const serviceAccountPath = asNonEmptyString(
      this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON_PATH'),
    );
    const serviceAccountJson = asNonEmptyString(
      this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON'),
    );

    const apps = getApps();
    const existing = apps.find((a) => a.name === FCM_APP_NAME);
    if (existing) {
      this.enabled = true;
      this.app = existing;
      return;
    }

    const credential = (() => {
      if (useAdc) return applicationDefault();

      if (serviceAccountPath) {
        const sa = loadServiceAccountFromPath(serviceAccountPath);
        return cert(sa);
      }

      if (serviceAccountJson) {
        const sa = loadServiceAccountFromEnv(serviceAccountJson);
        return cert(sa);
      }

      throw new Error(
        'FCM credentials are not configured (set FCM_USE_APPLICATION_DEFAULT=true or set FCM_SERVICE_ACCOUNT_JSON_PATH/FCM_SERVICE_ACCOUNT_JSON)',
      );
    })();

    if (!projectId) {
      throw new Error('FCM_PROJECT_ID is not configured');
    }

    this.app = initializeApp({ credential, projectId }, FCM_APP_NAME);
    this.enabled = true;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendToToken(input: SendPushToTokenInput): Promise<SendPushToTokenResult> {
    if (!this.app) {
      throw new PushSendError({
        provider: 'fcm',
        message: 'Push provider is not configured',
        retryable: false,
        code: 'push/not-configured',
      });
    }

    const token = asNonEmptyString(input.token);
    if (!token) {
      throw new PushSendError({
        provider: 'fcm',
        message: 'Push token is required',
        retryable: false,
        code: 'push/invalid-token',
      });
    }

    const notification = normalizeNotification(input.notification);

    const message: Message = {
      token,
      ...(notification ? { notification } : {}),
      ...(input.data ? { data: { ...input.data } } : {}),
    };

    try {
      const messageId = await getMessaging(this.app).send(message);
      return { messageId };
    } catch (err: unknown) {
      const code = getErrorCode(err);
      const retryable = isRetryableMessagingError(code);
      throw new PushSendError({
        provider: 'fcm',
        code,
        retryable,
        message: getErrorMessage(err),
      });
    }
  }
}
