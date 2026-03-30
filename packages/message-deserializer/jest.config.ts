import type { Config } from 'jest';

const config: Config = {
  displayName: 'message-deserializer',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: { module: 'CommonJS', moduleResolution: 'node' },
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};

export default config;
