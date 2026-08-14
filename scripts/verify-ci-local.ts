import { runVerificationProfile } from '../tools/backendkit/verification/run-profile';

async function main(): Promise<void> {
  await runVerificationProfile('full');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
