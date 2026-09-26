import { runFeatureScaffold, type ScaffoldTier } from './backendkit/feature/feature-scaffold';

type CliOptions = Readonly<{
  name: string;
  tier: ScaffoldTier;
  withQueue: boolean;
  dryRun: boolean;
  force: boolean;
}>;

function usage(): string {
  return [
    'Usage: npm run scaffold:feature -- --name <feature-name> [--tier simple|clean] [--with-queue] [--dry-run] [--force]',
    '',
    'Options:',
    '  --name <value>       Feature name (e.g. billing, user-preferences).',
    '  --tier <value>       Scaffold tier: simple (default) or clean.',
    '  --with-queue         Include queue job skeleton files.',
    '  --dry-run            Print generated paths without writing files.',
    '  --force              Overwrite existing files.',
  ].join('\n');
}

function parseTier(value: string): ScaffoldTier {
  if (value === 'simple' || value === 'clean') return value;
  throw new Error('--tier must be one of: simple, clean');
}

function parseArgs(argv: string[]): CliOptions {
  let name: string | undefined;
  let tier: ScaffoldTier = 'simple';
  let withQueue = false;
  let dryRun = false;
  let force = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--name') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --name');
      }
      name = value;
      i += 1;
      continue;
    }

    if (arg === '--tier') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --tier');
      }
      tier = parseTier(value);
      i += 1;
      continue;
    }

    if (arg === '--with-queue') {
      withQueue = true;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      throw new Error(usage());
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!name) throw new Error('Missing required argument --name');

  return { name, tier, withQueue, dryRun, force };
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    await runFeatureScaffold(options, process.cwd(), process.stdout);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (!message.includes('Usage:')) {
      process.stderr.write(`${usage()}\n`);
    }
    process.exit(1);
  }
}

void main();
