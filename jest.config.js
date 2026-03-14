module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/cli.ts',
    '!src/mcp-server.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 75,
      statements: 75,
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
