import { runBackendkitCli } from './command';
import { runVerificationProfile } from './verification/run-profile';

async function main(): Promise<void> {
  process.exitCode = await runBackendkitCli(process.argv.slice(2), {
    runProfile: runVerificationProfile,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}

void main();
