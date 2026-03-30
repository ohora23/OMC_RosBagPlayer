import type { Config } from 'jest';

const config: Config = {
  projects: [
    '<rootDir>/packages/player-core',
    '<rootDir>/packages/message-deserializer',
    '<rootDir>/packages/renderer',
    '<rootDir>/packages/ui',
  ],
};

export default config;
