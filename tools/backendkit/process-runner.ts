import { spawn } from 'node:child_process';

export type ProcessStdio = 'inherit' | 'pipe';

export type ProcessRequest = Readonly<{
  command: string;
  args: ReadonlyArray<string>;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: ProcessStdio;
  timeoutMs?: number;
  terminateGraceMs?: number;
}>;

export type ProcessResult = Readonly<{
  command: string;
  args: ReadonlyArray<string>;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}>;

export interface ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessResult>;
}

export class ProcessStartError extends Error {
  constructor(
    readonly command: string,
    readonly cause: Error,
  ) {
    super(`Failed to start '${command}': ${cause.message}`);
    this.name = 'ProcessStartError';
  }
}

function chunkText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString('utf8');
  return String(chunk);
}

export async function runProcess(request: ProcessRequest): Promise<ProcessResult> {
  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    throw new Error('Process timeout must be a positive finite number');
  }

  const startedAt = Date.now();
  const stdio = request.stdio ?? 'inherit';
  const terminateGraceMs = request.terminateGraceMs ?? 2_000;

  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: request.env ?? process.env,
      shell: false,
      stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeout: NodeJS.Timeout | undefined;
    let forceKillTimeout: NodeJS.Timeout | undefined;

    if (stdio === 'pipe') {
      child.stdout?.on('data', (chunk: unknown) => {
        stdout += chunkText(chunk);
      });
      child.stderr?.on('data', (chunk: unknown) => {
        stderr += chunkText(chunk);
      });
    }

    const clearTimers = (): void => {
      if (timeout) clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
    };

    child.once('error', (error: Error) => {
      clearTimers();
      reject(new ProcessStartError(request.command, error));
    });

    child.once('close', (code, signal) => {
      clearTimers();
      resolve({
        command: request.command,
        args: [...request.args],
        code,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });

    if (request.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        forceKillTimeout = setTimeout(() => {
          child.kill('SIGKILL');
        }, terminateGraceMs);
      }, request.timeoutMs);
    }
  });
}

export const systemProcessRunner: ProcessRunner = {
  run: runProcess,
};

export type ProcessInvocation = Readonly<{
  command: string;
  args: ReadonlyArray<string>;
}>;

export function npmInvocation(args: ReadonlyArray<string>): ProcessInvocation {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', ...args],
    };
  }

  return { command: 'npm', args };
}
