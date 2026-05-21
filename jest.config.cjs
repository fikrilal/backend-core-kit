/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // Avoid brace patterns here; on Windows they can produce an escaped `{` and break test discovery.
  testMatch: [
    '<rootDir>/apps/**/*.spec.ts',
    '<rootDir>/apps/**/*.test.ts',
    '<rootDir>/libs/**/*.spec.ts',
    '<rootDir>/libs/**/*.test.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  setupFiles: ['reflect-metadata'],
  testEnvironment: 'node',
  collectCoverageFrom: [
    'apps/**/*.ts',
    'libs/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.test.ts',
    '!**/*.d.ts',
    '!**/*.dto.ts',
    '!**/*.module.ts',
    '!**/*.tokens.ts',
    '!**/*.types.ts',
    '!**/*.job.ts',
    '!**/dtos/**',
    '!**/__gates__/**',
    '!**/generated/**',
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  clearMocks: true,
};
