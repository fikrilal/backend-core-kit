import type { FactoryProvider, Type } from '@nestjs/common';
import type { Clock } from '../../shared/time';
import { SystemClock } from '../../shared/time';

type ProviderToken<T = unknown> = Type<T> | string | symbol;
type InjectToken = Type<unknown> | string | symbol;
type UnknownTuple = readonly unknown[];

type Constructor<T, TDeps extends UnknownTuple> = new (...args: TDeps) => T;
type ClockedConstructor<T, TDeps extends UnknownTuple> = new (...args: [...TDeps, Clock]) => T;

export function provideAppService<T, TDeps extends UnknownTuple>(params: {
  provide: ProviderToken<T>;
  inject: ReadonlyArray<InjectToken>;
  factory: (...deps: TDeps) => T | Promise<T>;
}): FactoryProvider<T> {
  return {
    provide: params.provide,
    inject: [...params.inject],
    useFactory: (...deps: TDeps) => params.factory(...deps),
  };
}

export function provideClockedAppService<T, TDeps extends UnknownTuple>(params: {
  provide: ProviderToken<T>;
  inject: ReadonlyArray<InjectToken>;
  factory: (...deps: [...TDeps, Clock]) => T | Promise<T>;
}): FactoryProvider<T> {
  return provideAppService({
    provide: params.provide,
    inject: params.inject,
    factory: (...deps: TDeps) => params.factory(...deps, new SystemClock()),
  });
}

export function provideConstructedAppService<T, TDeps extends UnknownTuple>(params: {
  provide: ProviderToken<T>;
  inject: ReadonlyArray<InjectToken>;
  useClass: Constructor<T, TDeps>;
}): FactoryProvider<T> {
  return provideAppService({
    provide: params.provide,
    inject: params.inject,
    factory: (...deps: TDeps) => new params.useClass(...deps),
  });
}

export function provideConstructedClockedAppService<T, TDeps extends UnknownTuple>(params: {
  provide: ProviderToken<T>;
  inject: ReadonlyArray<InjectToken>;
  useClass: ClockedConstructor<T, TDeps>;
}): FactoryProvider<T> {
  return provideClockedAppService({
    provide: params.provide,
    inject: params.inject,
    factory: (...deps: [...TDeps, Clock]) => new params.useClass(...deps),
  });
}

export function provideSystemClockToken(token: ProviderToken<Clock>): {
  provide: ProviderToken<Clock>;
  useValue: Clock;
} {
  return {
    provide: token,
    useValue: new SystemClock(),
  };
}
