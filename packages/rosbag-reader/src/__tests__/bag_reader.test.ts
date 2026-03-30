import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require('../../build/Release/rosbag_reader.node') as typeof import('../../src/index.js');

const FIXTURE_BAG = path.join(__dirname, '../../test/fixtures/test.bag');

describe('rosbag-reader addon', () => {
  it('opens a bag file without error', () => {
    const handle = addon.openBag(FIXTURE_BAG);
    expect(typeof handle).toBe('number');
    addon.closeBag(handle);
  });

  it('throws on missing file', () => {
    expect(() => addon.openBag('/nonexistent/path.bag')).toThrow();
  });

  it('getTopics returns expected topics', () => {
    const handle = addon.openBag(FIXTURE_BAG);
    const topics = addon.getTopics(handle);
    expect(topics.length).toBe(4);
    const topicNames = topics.map((t: { topic: string }) => t.topic).sort();
    expect(topicNames).toEqual(['/image', '/odom', '/points', '/scan'].sort());
    topics.forEach((t: { topic: string; type: string; messageCount: number }) => {
      expect(t.messageCount).toBe(3);
    });
    addon.closeBag(handle);
  });

  it('getConnections returns messageDefinition strings', () => {
    const handle = addon.openBag(FIXTURE_BAG);
    const conns = addon.getConnections(handle);
    expect(conns.length).toBe(4);
    conns.forEach((c: { topic: string; type: string; md5sum: string; messageDefinition: string }) => {
      expect(c.messageDefinition.length).toBeGreaterThan(0);
      expect(c.md5sum.length).toBeGreaterThan(0);
    });
    addon.closeBag(handle);
  });

  it('iterates messages in timestamp order', () => {
    const handle = addon.openBag(FIXTURE_BAG);
    const iter = addon.createIterator(handle, []);
    const messages: { topic: string; timestamp: number; data: Buffer }[] = [];
    let msg;
    while ((msg = addon.nextMessage(iter)) !== null) {
      messages.push(msg);
    }
    expect(messages.length).toBe(12); // 4 topics x 3 messages
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].timestamp).toBeGreaterThanOrEqual(messages[i - 1].timestamp);
    }
    addon.closeBag(handle);
  });

  it('filters messages by topic', () => {
    const handle = addon.openBag(FIXTURE_BAG);
    const iter = addon.createIterator(handle, ['/points']);
    const messages = [];
    let msg;
    while ((msg = addon.nextMessage(iter)) !== null) {
      messages.push(msg);
    }
    expect(messages.length).toBe(3);
    messages.forEach((m: { topic: string }) => expect(m.topic).toBe('/points'));
    addon.closeBag(handle);
  });

  it('message data is a non-empty Buffer', () => {
    const handle = addon.openBag(FIXTURE_BAG);
    const iter = addon.createIterator(handle, ['/image']);
    const msg = addon.nextMessage(iter);
    expect(msg).not.toBeNull();
    expect(Buffer.isBuffer(msg?.data)).toBe(true);
    expect(msg!.data.length).toBeGreaterThan(0);
    addon.closeBag(handle);
  });
});
