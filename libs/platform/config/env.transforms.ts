import { Transform, type TransformFnParams } from 'class-transformer';
import { parseEnvBoolean } from './env-parsing';
export { parseEnvBoolean } from './env-parsing';

export function TransformEnvBoolean(): PropertyDecorator {
  return Transform(({ obj, key }: TransformFnParams) => {
    if (typeof obj !== 'object' || obj === null) {
      return parseEnvBoolean(undefined);
    }
    return parseEnvBoolean(Reflect.get(obj, key));
  });
}
