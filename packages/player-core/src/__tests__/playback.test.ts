import path from 'path';
import { PlaybackEngine } from '../PlaybackEngine';
import type { MessageSource, MessageIterator } from '../types';
import type { RawMessage, TopicInfo, ConnectionInfo } from '@omc/rosbag-reader';

const FIXTURE = path.join(__dirname, '../../../rosbag-reader/test/fixtures/test.bag');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let addon: any = null;
try {
  addon = require(path.join(__dirname, '../../../rosbag-reader/build/Release/rosbag_reader.node'));
} catch { /* skip if not built */ }

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMsg(topic: string, timestampMs: number): RawMessage {
  return { topic, timestamp: timestampMs * 1_000_000, data: Buffer.alloc(0) };
}

class MockSource implements MessageSource {
  constructor(private messages: RawMessage[]) {}

  getTopics(): TopicInfo[] {
    const map = new Map<string, number>();
    for (const m of this.messages) map.set(m.topic, (map.get(m.topic) ?? 0) + 1);
    return Array.from(map.entries()).map(([topic, c]) => ({
      topic, type: 'test/Test', messageCount: c, frequency: 10,
    }));
  }

  getConnections(): ConnectionInfo[] {
    return this.getTopics().map(t => ({
      topic: t.topic, type: t.type, md5sum: 'test', messageDefinition: '',
    }));
  }

  createIterator(topics: string[], startTime?: number): MessageIterator {
    let msgs = this.messages.filter(m => topics.includes(m.topic));
    if (startTime !== undefined) msgs = msgs.filter(m => m.timestamp >= startTime);
    let idx = 0;
    return { next: async () => msgs[idx++] ?? null };
  }
}

function waitForMessages(engine: PlaybackEngine, count: number, timeoutMs = 3000): Promise<RawMessage[]> {
  return new Promise((resolve, reject) => {
    const received: RawMessage[] = [];
    const timer = setTimeout(
      () => reject(new Error(`Timeout: expected ${count} messages, got ${received.length}`)),
      timeoutMs,
    );
    engine.on('message', (msg) => {
      received.push(msg);
      if (received.length >= count) { clearTimeout(timer); resolve(received); }
    });
  });
}

function waitForState(engine: PlaybackEngine, targetState: string, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for state ${targetState}`)), timeoutMs);
    engine.on('stateChange', (s) => {
      if (s === targetState) { clearTimeout(timer); resolve(); }
    });
  });
}

// ── State machine ─────────────────────────────────────────────────────────────

describe('PlaybackEngine — state machine', () => {
  let engine: PlaybackEngine;
  beforeEach(() => { engine = new PlaybackEngine(); });
  afterEach(() => { engine.pause(); });

  it('starts in IDLE', () => {
    expect(engine.state).toBe('IDLE');
  });

  it('transitions IDLE -> PAUSED after load()', () => {
    engine.load(new MockSource([makeMsg('/a', 0)]));
    expect(engine.state).toBe('PAUSED');
  });

  it('transitions PAUSED -> PLAYING on play()', () => {
    engine.load(new MockSource([makeMsg('/a', 0)]));
    engine.play();
    expect(engine.state).toBe('PLAYING');
  });

  it('transitions PLAYING -> PAUSED on pause()', () => {
    engine.load(new MockSource([makeMsg('/a', 0), makeMsg('/a', 500)]));
    engine.play();
    engine.pause();
    expect(engine.state).toBe('PAUSED');
  });

  it('emits stateChange events', () => {
    const states: string[] = [];
    engine.on('stateChange', s => states.push(s));
    engine.load(new MockSource([makeMsg('/a', 0)]));
    expect(states).toContain('LOADING');
    expect(states).toContain('PAUSED');
  });

  it('returns to PAUSED when all messages consumed', async () => {
    const source = new MockSource([makeMsg('/a', 0), makeMsg('/a', 10)]);
    engine.load(source);
    let sawPlaying = false;
    const done = new Promise<void>(resolve => {
      engine.on('stateChange', s => {
        if (s === 'PLAYING') sawPlaying = true;
        if (s === 'PAUSED' && sawPlaying) resolve();
      });
    });
    engine.play();
    await done;
    expect(sawPlaying).toBe(true);
    expect(engine.state).toBe('PAUSED');
  }, 5000);
});

// ── Message ordering and timing ───────────────────────────────────────────────

describe('PlaybackEngine — message ordering', () => {
  let engine: PlaybackEngine;
  beforeEach(() => { engine = new PlaybackEngine(); });
  afterEach(() => { engine.pause(); });

  it('emits messages in ascending timestamp order', async () => {
    const source = new MockSource([
      makeMsg('/a', 0), makeMsg('/b', 50), makeMsg('/a', 100), makeMsg('/b', 150),
    ]);
    engine.load(source);
    const p = waitForMessages(engine, 4);
    engine.play();
    const received = await p;
    for (let i = 1; i < received.length; i++) {
      expect(received[i].timestamp).toBeGreaterThanOrEqual(received[i - 1].timestamp);
    }
  });

  it('inter-message wall delay within 50ms of bag time at 1x speed', async () => {
    const source = new MockSource([makeMsg('/a', 0), makeMsg('/a', 150)]);
    engine.load(source);
    const wallTimes: number[] = [];
    engine.on('message', () => wallTimes.push(Date.now()));
    const p = waitForMessages(engine, 2);
    engine.play();
    await p;
    const delta = wallTimes[1] - wallTimes[0];
    expect(delta).toBeGreaterThanOrEqual(100); // 150ms - 50ms
    expect(delta).toBeLessThanOrEqual(200);    // 150ms + 50ms
  }, 5000);

  it('setSpeed(2.0) roughly halves inter-message delay', async () => {
    const source = new MockSource([makeMsg('/a', 0), makeMsg('/a', 200)]);
    engine.setSpeed(2.0);
    engine.load(source);
    const wallTimes: number[] = [];
    engine.on('message', () => wallTimes.push(Date.now()));
    const p = waitForMessages(engine, 2);
    engine.play();
    await p;
    const delta = wallTimes[1] - wallTimes[0];
    // 200ms / 2 = 100ms, tolerance ±50ms
    expect(delta).toBeGreaterThanOrEqual(50);
    expect(delta).toBeLessThanOrEqual(150);
  }, 5000);
});

// ── Pause and resume ──────────────────────────────────────────────────────────

describe('PlaybackEngine — pause and resume', () => {
  let engine: PlaybackEngine;
  beforeEach(() => { engine = new PlaybackEngine(); });
  afterEach(() => { engine.pause(); });

  it('pause() stops message emission', async () => {
    const source = new MockSource([
      makeMsg('/a', 0), makeMsg('/a', 300), makeMsg('/a', 600),
    ]);
    engine.load(source);
    let count = 0;
    engine.on('message', () => count++);
    engine.play();
    await new Promise(r => setTimeout(r, 50));
    engine.pause();
    const countAtPause = count;
    await new Promise(r => setTimeout(r, 400));
    expect(count).toBe(countAtPause);
    expect(engine.state).toBe('PAUSED');
  }, 5000);

  it('resume() continues from correct position', async () => {
    const source = new MockSource([
      makeMsg('/a', 0), makeMsg('/a', 10), makeMsg('/a', 200), makeMsg('/a', 400),
    ]);
    engine.load(source);
    const firstTwo = waitForMessages(engine, 2);
    engine.play();
    await firstTwo;
    engine.pause();
    const pausedTime = engine.currentTime;
    const remaining = waitForMessages(engine, 2);
    engine.play();
    const msgs = await remaining;
    for (const m of msgs) {
      expect(m.timestamp).toBeGreaterThanOrEqual(pausedTime);
    }
  }, 5000);
});

// ── Seek ──────────────────────────────────────────────────────────────────────

describe('PlaybackEngine — seek', () => {
  let engine: PlaybackEngine;
  beforeEach(() => { engine = new PlaybackEngine(); });
  afterEach(() => { engine.pause(); });

  it('next message after seek has timestamp >= target', async () => {
    const target = 200 * 1_000_000; // 200ms in ns
    const source = new MockSource([
      makeMsg('/a', 0), makeMsg('/a', 100), makeMsg('/a', 200), makeMsg('/a', 300),
    ]);
    engine.load(source);
    engine.seek(target);
    const p = waitForMessages(engine, 1);
    engine.play();
    const [first] = await p;
    expect(first.timestamp).toBeGreaterThanOrEqual(target);
  }, 5000);
});

// ── Topic filtering ───────────────────────────────────────────────────────────

describe('PlaybackEngine — setEnabledTopics', () => {
  let engine: PlaybackEngine;
  beforeEach(() => { engine = new PlaybackEngine(); });
  afterEach(() => { engine.pause(); });

  it('emits zero message events for disabled topics', async () => {
    const source = new MockSource([
      makeMsg('/a', 0), makeMsg('/b', 10), makeMsg('/a', 20),
      makeMsg('/b', 30), makeMsg('/a', 40), makeMsg('/b', 50),
    ]);
    engine.load(source);
    engine.setEnabledTopics(['/a']);
    const received: RawMessage[] = [];
    engine.on('message', m => received.push(m));
    // Play until paused (all messages consumed)
    const done = new Promise<void>(resolve => {
      let sawPlaying = false;
      engine.on('stateChange', s => {
        if (s === 'PLAYING') sawPlaying = true;
        if (s === 'PAUSED' && sawPlaying) resolve();
      });
    });
    engine.play();
    await done;
    expect(received.every(m => m.topic === '/a')).toBe(true);
    expect(received.length).toBe(3);
  }, 5000);
});

// ── Integration (native addon) ────────────────────────────────────────────────

describe('PlaybackEngine — integration', () => {
  it('plays all messages from fixture bag', async () => {
    if (!addon) return;
    const handle = addon.openBag(FIXTURE);
    const source: MessageSource = {
      getTopics: () => addon.getTopics(handle) as TopicInfo[],
      getConnections: () => addon.getConnections(handle) as ConnectionInfo[],
      createIterator: (topics: string[], startTime?: number) => {
        const iter = addon.createIterator(handle, topics, startTime);
        return { next: async () => addon.nextMessage(iter) as RawMessage | null };
      },
    };
    const totalCount = source.getTopics().reduce((s, t) => s + t.messageCount, 0);
    const engine = new PlaybackEngine();
    engine.setSpeed(4.0);
    engine.load(source);
    let count = 0;
    engine.on('message', () => count++);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), 10_000);
      let sawPlaying = false;
      engine.on('stateChange', s => {
        if (s === 'PLAYING') sawPlaying = true;
        if (s === 'PAUSED' && sawPlaying) { clearTimeout(timer); resolve(); }
      });
      engine.play();
    });
    addon.closeBag(handle);
    expect(count).toBe(totalCount);
  }, 15_000);
});
