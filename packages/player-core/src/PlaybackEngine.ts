import type { RawMessage } from '@omc/rosbag-reader';
import type { MessageSource, MessageIterator, PlaybackState } from './types.js';

type EventMap = {
  message: RawMessage;
  stateChange: PlaybackState;
  timeUpdate: number;
};

export class PlaybackEngine {
  private _state: PlaybackState = 'IDLE';
  private _source: MessageSource | null = null;
  private _iterator: MessageIterator | null = null;
  private _pendingMsg: RawMessage | null = null;
  private _speed = 1.0;
  private _enabledTopics: Set<string> | null = null;
  private _playing = false;
  private _currentTime = 0;
  private _loopToken = 0;
  private _cancelSleep: (() => void) | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _listeners = new Map<string, Array<(v: any) => void>>();

  on<K extends keyof EventMap>(event: K, listener: (v: EventMap[K]) => void): this {
    const list = this._listeners.get(event) ?? [];
    list.push(listener);
    this._listeners.set(event, list);
    return this;
  }

  off<K extends keyof EventMap>(event: K, listener: (v: EventMap[K]) => void): this {
    const list = this._listeners.get(event);
    if (list) {
      const i = list.indexOf(listener);
      if (i !== -1) list.splice(i, 1);
    }
    return this;
  }

  private _emit<K extends keyof EventMap>(event: K, value: EventMap[K]): void {
    const list = this._listeners.get(event);
    if (list) for (const fn of list.slice()) fn(value);
  }

  private _setState(s: PlaybackState): void {
    if (this._state !== s) {
      this._state = s;
      this._emit('stateChange', s);
    }
  }

  get state(): PlaybackState { return this._state; }
  get currentTime(): number { return this._currentTime; }

  load(source: MessageSource): void {
    this._stop();
    this._source = source;
    this._iterator = null;
    this._pendingMsg = null;
    this._currentTime = 0;
    this._setState('LOADING');
    this._setState('PAUSED');
  }

  play(): void {
    if (!this._source) throw new Error('No source loaded');
    if (this._playing) return;
    if (!this._iterator) {
      const topics = this._source.getTopics().map(t => t.topic);
      this._iterator = this._source.createIterator(
        topics,
        this._currentTime > 0 ? this._currentTime : undefined,
      );
    }
    this._playing = true;
    this._setState('PLAYING');
    void this._runLoop(++this._loopToken, this._iterator);
  }

  pause(): void {
    this._stop();
    if (this._state === 'PLAYING') this._setState('PAUSED');
  }

  seek(timestamp: number): void {
    const wasPlaying = this._playing;
    this._stop();
    this._setState('SEEKING');
    this._currentTime = timestamp;
    this._iterator = null;
    this._pendingMsg = null;
    if (wasPlaying) {
      const topics = this._source!.getTopics().map(t => t.topic);
      this._iterator = this._source!.createIterator(topics, timestamp);
      this._playing = true;
      this._setState('PLAYING');
      void this._runLoop(++this._loopToken, this._iterator);
    } else {
      this._setState('PAUSED');
    }
  }

  setSpeed(speed: number): void {
    this._speed = Math.max(0.1, Math.min(4.0, speed));
  }

  setEnabledTopics(topics: string[]): void {
    this._enabledTopics = new Set(topics);
  }

  private _stop(): void {
    this._playing = false;
    this._loopToken++;
    this._cancelSleep?.();
    this._cancelSleep = null;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      const timer = setTimeout(resolve, ms);
      this._cancelSleep = () => { clearTimeout(timer); resolve(); };
    }).then(() => { this._cancelSleep = null; });
  }

  private async _runLoop(token: number, iterator: MessageIterator): Promise<void> {
    let prevBagTime: number | null = null;
    let prevWallTime: number | null = null;

    while (this._playing && token === this._loopToken) {
      // Fetch next message (reuse pending if available)
      let msg: RawMessage | null;
      if (this._pendingMsg !== null) {
        msg = this._pendingMsg;
        this._pendingMsg = null;
      } else {
        msg = await iterator.next();
        if (!this._playing || token !== this._loopToken) {
          if (msg !== null) this._pendingMsg = msg;
          break;
        }
      }

      if (msg === null) {
        this._playing = false;
        this._iterator = null;
        this._setState('PAUSED');
        break;
      }

      // Apply timing delay for messages after the first
      if (prevBagTime !== null && prevWallTime !== null) {
        const bagDeltaNs = msg.timestamp - prevBagTime;
        const waitMs = bagDeltaNs / 1_000_000 / this._speed;
        if (waitMs > 1) {
          await this._sleep(waitMs);
          if (!this._playing || token !== this._loopToken) {
            this._pendingMsg = msg;
            break;
          }
        }
      }

      prevBagTime = msg.timestamp;
      prevWallTime = Date.now();
      this._currentTime = msg.timestamp;
      this._emit('timeUpdate', msg.timestamp);

      if (this._enabledTopics === null || this._enabledTopics.has(msg.topic)) {
        this._emit('message', msg);
      }
    }
  }
}
