const config = require('./jest.config.common')

module.exports = {
  ...config,
  roots: ['<rootDir>/src/'],
  testMatch: ['**/*.integration.test.ts', "**/__tests__/integration/**/*.test.ts"],
  collectCoverage: false
};
