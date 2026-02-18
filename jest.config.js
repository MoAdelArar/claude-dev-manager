module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/cli.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@agents/(.*)$': '<rootDir>/src/agents/$1',
    '^@orchestrator/(.*)$': '<rootDir>/src/orchestrator/$1',
    '^@pipeline/(.*)$': '<rootDir>/src/pipeline/$1',
    '^@communication/(.*)$': '<rootDir>/src/communication/$1',
    '^@workspace/(.*)$': '<rootDir>/src/workspace/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  },
};
