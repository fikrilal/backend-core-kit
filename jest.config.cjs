/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/{apps,libs}/**/*.spec.ts', '<rootDir>/{apps,libs}/**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  setupFiles: ['reflect-metadata'],
  testEnvironment: 'node',
  collectCoverageFrom: ['apps/**/*.ts', 'libs/**/*.ts'],
  coverageDirectory: './coverage',
  clearMocks: true,
};
