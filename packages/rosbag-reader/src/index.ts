// Native addon bindings for ROS1 bag reading
// The actual implementation is in C++ (addon.cpp)
// This file provides TypeScript type definitions

export interface TopicInfo {
  topic: string;
  type: string;
  messageCount: number;
  frequency: number;
}

export interface ConnectionInfo {
  topic: string;
  type: string;
  md5sum: string;
  messageDefinition: string;
  callerid?: string;
}

export interface RawMessage {
  topic: string;
  timestamp: number;
  data: Buffer;
}

export type BagHandle = unknown;
export type IteratorHandle = unknown;

// Placeholder — will be replaced by native addon in PR2
export function openBag(_filePath: string): BagHandle {
  throw new Error('Native addon not yet compiled');
}

export function getTopics(_handle: BagHandle): TopicInfo[] {
  throw new Error('Native addon not yet compiled');
}

export function getConnections(_handle: BagHandle): ConnectionInfo[] {
  throw new Error('Native addon not yet compiled');
}

export function createIterator(
  _handle: BagHandle,
  _topics: string[],
  _startTime?: number,
  _endTime?: number
): IteratorHandle {
  throw new Error('Native addon not yet compiled');
}

export function nextMessage(_iterator: IteratorHandle): RawMessage | null {
  throw new Error('Native addon not yet compiled');
}

export function closeBag(_handle: BagHandle): void {
  throw new Error('Native addon not yet compiled');
}
