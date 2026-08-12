import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushProvider } from '../config/env.enums';
import { QueueModule } from '../queue/queue.module';
import { PUSH_SERVICE } from './push.service';
import { DisabledPushService } from './disabled-push.service';
import { FcmPushService } from './fcm-push.service';

@Module({
  imports: [QueueModule],
  providers: [
    DisabledPushService,
    FcmPushService,
    {
      provide: PUSH_SERVICE,
      inject: [ConfigService, FcmPushService, DisabledPushService],
      useFactory: (config: ConfigService, fcm: FcmPushService, disabled: DisabledPushService) => {
        const provider = config.get<string>('PUSH_PROVIDER');
        if (typeof provider === 'string' && provider.trim().toUpperCase() === PushProvider.Fcm) {
          return fcm;
        }
        return disabled;
      },
    },
  ],
  exports: [PUSH_SERVICE, FcmPushService, DisabledPushService],
})
export class PlatformPushModule {}
