// @ts-check

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: ['tools/backendkit/verification/lane-selection.ts'],
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: 'jest.config.cjs',
    enableFindRelatedTests: true,
  },
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: '.tmp/mutation/phase7.json' },
  tempDirName: '.tmp/stryker',
  ignorePatterns: ['_WIP/**', 'coverage/**', 'docs/**'],
  concurrency: 2,
  thresholds: { high: 80, low: 60, break: 70 },
};

export default config;
