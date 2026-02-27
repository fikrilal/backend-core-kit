import { SystemClock } from '../../shared/time';
import {
  provideAppService,
  provideClockedAppService,
  provideConstructedAppService,
  provideConstructedClockedAppService,
  provideSystemClockToken,
} from './app-service.provider';

class PlainService {
  constructor(readonly repo: string) {}
}

class ClockedService {
  constructor(
    readonly repo: string,
    readonly clock: { now(): Date },
  ) {}
}

describe('app-service.provider', () => {
  it('builds provider for sync factories', async () => {
    const provider = provideAppService({
      provide: PlainService,
      inject: ['REPO'],
      factory: (repo: string) => new PlainService(repo),
    });

    expect(provider.provide).toBe(PlainService);
    expect(provider.inject).toEqual(['REPO']);
    const useFactory = provider.useFactory as (repo: string) => PlainService;
    const service = useFactory('repo-a');
    expect(service.repo).toBe('repo-a');
  });

  it('builds provider for clocked factories', async () => {
    const provider = provideClockedAppService<ClockedService, [string]>({
      provide: ClockedService,
      inject: ['REPO'],
      factory: (repo, clock) => new ClockedService(repo, clock),
    });

    const useFactory = provider.useFactory as (repo: string) => ClockedService;
    const service = useFactory('repo-a');
    expect(service.repo).toBe('repo-a');
    expect(service.clock).toBeInstanceOf(SystemClock);
  });

  it('builds provider for plain constructors', async () => {
    const provider = provideConstructedAppService({
      provide: PlainService,
      inject: ['REPO'],
      useClass: PlainService,
    });

    const useFactory = provider.useFactory as (repo: string) => PlainService;
    const service = useFactory('repo-b');
    expect(service).toBeInstanceOf(PlainService);
    expect(service.repo).toBe('repo-b');
  });

  it('builds provider for clocked constructors', async () => {
    const provider = provideConstructedClockedAppService({
      provide: ClockedService,
      inject: ['REPO'],
      useClass: ClockedService,
    });

    const useFactory = provider.useFactory as (repo: string) => ClockedService;
    const service = useFactory('repo-c');
    expect(service).toBeInstanceOf(ClockedService);
    expect(service.repo).toBe('repo-c');
    expect(service.clock).toBeInstanceOf(SystemClock);
  });

  it('provides a reusable system clock token provider', () => {
    const provider = provideSystemClockToken(Symbol.for('CLOCK'));
    expect(provider.provide).toBe(Symbol.for('CLOCK'));
    expect(provider.useValue).toBeInstanceOf(SystemClock);
  });
});
