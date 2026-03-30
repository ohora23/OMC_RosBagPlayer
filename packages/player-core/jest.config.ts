import type { Config } from 'jest';

const config: Config = {
  displayName: 'player-core',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: { module: 'CommonJS', moduleResolution: 'node' },
    }],
  },
};

export default config;
