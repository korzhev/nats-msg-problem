module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/', '<rootDir>/__mocks__/'],
  collectCoverageFrom: [
    '!**/__tests__/**',
    '!**/__mocks__/**'
  ]
};
