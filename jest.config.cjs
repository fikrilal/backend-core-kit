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
    '<rootDir>/tools/backendkit/**/*.spec.ts',
    '<rootDir>/tools/backendkit/**/*.test.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  setupFiles: ['reflect-metadata', '<rootDir>/test/jest-unit.setup.ts'],
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
  coverageThreshold: {
    global: {
      statements: 45,
      branches: 38,
      functions: 40,
      lines: 46,
    },
  },
  clearMocks: true,
};
