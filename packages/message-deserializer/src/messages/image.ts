import type { MessageDefinition, ImageFields } from '../types.js';
import { deserializeMessage } from '../deserializer.js';

interface RawImage {
  header: { seq: number; stamp: { secs: number; nsecs: number }; frame_id: string };
  height: number; width: number; encoding: string; is_bigendian: number; step: number; data: Uint8Array;
}

export function deserializeImage(def: MessageDefinition, buffer: Buffer | Uint8Array): ImageFields {
  const r = deserializeMessage<RawImage>(def, buffer);
  return {
    header: { seq: r.header.seq, stampSecs: r.header.stamp.secs, stampNsecs: r.header.stamp.nsecs, frameId: r.header.frame_id },
    height: r.height, width: r.width, encoding: r.encoding, isBigendian: r.is_bigendian, step: r.step, data: r.data,
  };
}
