/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'platform-must-not-depend-on-features',
      severity: 'error',
      from: { path: '^libs/platform' },
      to: { path: '^libs/features' },
    },
    {
      name: 'feature-domain-must-be-pure',
      severity: 'error',
      from: { path: '^libs/features/[^/]+/domain' },
      to: {
        path: '^(apps/|libs/platform|libs/features/[^/]+/(app|infra))|node_modules/(?:@nestjs|@prisma|fastify|bullmq|ioredis|redis)',
      },
    },
    {
      name: 'feature-app-must-not-import-infra-or-framework',
      severity: 'error',
      from: { path: '^libs/features/[^/]+/app' },
      to: {
        path: '^(apps/|libs/platform|libs/features/[^/]+/infra)|node_modules/(?:@nestjs|@prisma|fastify|bullmq|ioredis|redis)',
      },
    },
    {
      name: 'features-must-not-depend-on-apps',
      severity: 'error',
      from: { path: '^libs/features' },
      to: { path: '^apps/' },
    },
  ],
  options: {
    // Keep the analysis limited to our source tree.
    includeOnly: {
      path: '^(apps|libs)/',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
    },
    doNotFollow: {
      path: 'node_modules',
    },
    // Improve signal/noise.
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+', theme: { graph: { rankdir: 'LR' } } },
    },
  },
};
