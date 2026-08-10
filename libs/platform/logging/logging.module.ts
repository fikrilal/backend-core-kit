import { Global, Module, type DynamicModule, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule, type Params } from 'nestjs-pino';
import { createPinoHttpOptions, type LoggingRole } from './pino-http.options';

export type { LoggingRole } from './pino-http.options';

@Global()
@Module({})
export class LoggingModule {
  static forRoot(role: LoggingRole): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService): Params => {
            return {
              pinoHttp: createPinoHttpOptions(config, role),
              forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
              exclude: [
                { method: RequestMethod.ALL, path: 'health' },
                { method: RequestMethod.ALL, path: 'ready' },
              ],
            };
          },
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
