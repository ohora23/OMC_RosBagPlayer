import type { ConnectionInfo, RawMessage, TopicInfo } from '@omc/rosbag-reader';

export type { RawMessage };

export interface MessageIterator {
  next(): Promise<RawMessage | null>;
}

export interface MessageSource {
  getTopics(): TopicInfo[];
  getConnections(): ConnectionInfo[];
  createIterator(topics: string[], startTime?: number, endTime?: number): MessageIterator;
}

export type PlaybackState = 'IDLE' | 'LOADING' | 'PAUSED' | 'PLAYING' | 'SEEKING';
