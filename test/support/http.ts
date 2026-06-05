import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

type HandlerFn = (...args: unknown[]) => unknown;
type ClassConstructor = new (...args: unknown[]) => unknown;

export function createHttpArgumentsHost(request: unknown, response: unknown): ExecutionContextHost {
  const host = new ExecutionContextHost([request, response]);
  host.setType('http');
  return host;
}

export function createHttpExecutionContext(params: {
  handler: HandlerFn;
  cls: ClassConstructor;
  request: unknown;
  response?: unknown;
}): ExecutionContextHost {
  const host = new ExecutionContextHost([params.request, params.response]);
  host.setType('http');
  Object.defineProperty(host, 'getHandler', { value: () => params.handler });
  Object.defineProperty(host, 'getClass', { value: () => params.cls });
  return host;
}
