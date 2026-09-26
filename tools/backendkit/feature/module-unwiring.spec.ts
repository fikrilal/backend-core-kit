import { findFeatureImportedSymbols, unwireModuleSource } from './module-unwiring';

describe('module-unwiring', () => {
  describe('findFeatureImportedSymbols', () => {
    it('finds symbols imported from feature path', () => {
      const source = `
import { Module } from '@nestjs/common';
import { OrderHistoryModule } from '../../../libs/features/order-history/order-history.module';
import { OtherModule } from '../../../libs/features/other/other.module';
`;
      const symbols = findFeatureImportedSymbols(source, 'order-history');
      expect(symbols).toEqual(['OrderHistoryModule']);
    });

    it('finds multiple symbols and type imports from feature or worker job path', () => {
      const source = `
import {
  BillingWorker,
  type BillingJobData,
} from './jobs/billing.worker';
import { BillingModule } from '../../../libs/features/billing/infra/billing.module';
`;
      const symbols = findFeatureImportedSymbols(source, 'billing');
      expect(symbols).toEqual(
        expect.arrayContaining(['BillingWorker', 'BillingJobData', 'BillingModule']),
      );
    });

    it('returns empty array when feature is not imported', () => {
      const source = `import { AuthModule } from '../../../libs/features/auth/auth.module';`;
      const symbols = findFeatureImportedSymbols(source, 'order-history');
      expect(symbols).toEqual([]);
    });
  });

  describe('unwireModuleSource', () => {
    it('removes standalone import statement and array entry in multiline decorator', () => {
      const source = `import { Module } from '@nestjs/common';
import { AuthModule } from '../../../libs/features/auth/auth.module';
import { OrderHistoryModule } from '../../../libs/features/order-history/order-history.module';
import { UsersModule } from '../../../libs/features/users/users.module';

@Module({
  imports: [
    AuthModule,
    OrderHistoryModule,
    UsersModule,
  ],
})
export class AppModule {}
`;

      const result = unwireModuleSource(source, 'OrderHistoryModule');
      expect(result.changed).toBe(true);
      expect(result.unwiredIdentifiers).toContain('OrderHistoryModule');
      expect(result.content).not.toContain('OrderHistoryModule');
      expect(result.content).toContain('AuthModule');
      expect(result.content).toContain('UsersModule');
      expect(result.content).toBe(`import { Module } from '@nestjs/common';
import { AuthModule } from '../../../libs/features/auth/auth.module';
import { UsersModule } from '../../../libs/features/users/users.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
`);
    });

    it('removes identifier from multi-symbol import statement while preserving others', () => {
      const source = `import { OrderHistoryModule, OrderHelper } from './order-history.module';
@Module({
  imports: [OrderHistoryModule],
})
export class AppModule {}
`;
      const result = unwireModuleSource(source, 'OrderHistoryModule');
      expect(result.changed).toBe(true);
      expect(result.content).toContain("import { OrderHelper } from './order-history.module';");
      expect(result.content).not.toContain('OrderHistoryModule');
    });

    it('removes identifier from multiline import statement while preserving others', () => {
      const source = `import {
  KeepMe,
  DropMeModule,
} from './my-module';
@Module({
  imports: [
    KeepMe,
    DropMeModule,
  ],
})
export class AppModule {}
`;
      const result = unwireModuleSource(source, 'DropMeModule');
      expect(result.changed).toBe(true);
      expect(result.content).not.toContain('DropMeModule');
      expect(result.content).toContain('KeepMe');
    });

    it('removes identifier from providers array in worker module', () => {
      const source = `@Module({
  providers: [
    SystemSmokeWorker,
    BillingWorker,
    EmailsWorker,
  ],
})
export class WorkerModule {}
`;
      const result = unwireModuleSource(source, 'BillingWorker');
      expect(result.changed).toBe(true);
      expect(result.content).not.toContain('BillingWorker');
      expect(result.content).toContain('SystemSmokeWorker');
      expect(result.content).toContain('EmailsWorker');
    });

    it('removes identifier from single-line array format', () => {
      const source = `@Module({
  imports: [AuthModule, BillingModule, UsersModule],
})
export class AppModule {}
`;
      const result = unwireModuleSource(source, 'BillingModule');
      expect(result.changed).toBe(true);
      expect(result.content).not.toContain('BillingModule');
      expect(result.content).toContain('AuthModule');
      expect(result.content).toContain('UsersModule');
    });

    it('strictly respects word boundaries and does not modify prefixed/suffixed identifiers', () => {
      const source = `import { UserModule } from './user';
import { UsersModule } from './users';
import { UserModuleExtended } from './extended';

@Module({
  imports: [
    UserModule,
    UsersModule,
    UserModuleExtended,
  ],
})
export class AppModule {}
`;
      const result = unwireModuleSource(source, 'UserModule');
      expect(result.changed).toBe(true);
      expect(result.content).not.toContain("import { UserModule } from './user';");
      expect(result.content).toContain("import { UsersModule } from './users';");
      expect(result.content).toContain("import { UserModuleExtended } from './extended';");
      expect(result.content).toContain('UsersModule,');
      expect(result.content).toContain('UserModuleExtended,');
    });

    it('returns changed=false when target identifier is absent', () => {
      const source = `import { HealthModule } from './health';
@Module({ imports: [HealthModule] })
export class AppModule {}
`;
      const result = unwireModuleSource(source, 'NonExistentModule');
      expect(result.changed).toBe(false);
      expect(result.unwiredIdentifiers).toEqual([]);
      expect(result.content).toBe(source);
    });

    it('handles multiple identifiers in single invocation', () => {
      const source = `import { FooModule } from './foo';
import { BarModule } from './bar';

@Module({
  imports: [
    FooModule,
    BarModule,
    BazModule,
  ],
})
export class AppModule {}
`;
      const result = unwireModuleSource(source, ['FooModule', 'BarModule']);
      expect(result.changed).toBe(true);
      expect(result.unwiredIdentifiers).toEqual(['FooModule', 'BarModule']);
      expect(result.content).not.toContain('FooModule');
      expect(result.content).not.toContain('BarModule');
      expect(result.content).toContain('BazModule');
    });
  });
});
