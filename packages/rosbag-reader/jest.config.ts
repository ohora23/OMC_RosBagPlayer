import type { Config } from 'jest';

const config: Config = {
  displayName: 'rosbag-reader',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: false }],
  },
};

export default config;
