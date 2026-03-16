import { ConfigService } from '@nestjs/config';

export function createConfigService(
  values: Record<string, unknown> = {},
): ConfigService<Record<string, unknown>> {
  return new ConfigService(values);
}

export function createPrototypeStub<
  TClass extends abstract new (...args: never[]) => object,
  TProps extends object,
>(ctor: TClass, props: TProps): InstanceType<TClass> & TProps {
  return Object.assign(Object.create(ctor.prototype), props);
}

export function bindInstanceMethod(instance: object, methodName: string) {
  const method = Reflect.get(instance, methodName);
  if (typeof method !== 'function') {
    throw new Error(`Expected "${methodName}" to be a function`);
  }

  return (...args: unknown[]) => Reflect.apply(method, instance, args);
}
