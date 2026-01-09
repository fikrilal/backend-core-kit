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
  collectCoverageFrom: ['apps/**/*.ts', 'libs/**/*.ts'],
  coverageDirectory: './coverage',
  clearMocks: true,
};
