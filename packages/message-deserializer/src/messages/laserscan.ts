import type { MessageDefinition, LaserScanFields } from '../types.js';
import { deserializeMessage } from '../deserializer.js';

interface RawScan {
  header: { seq: number; stamp: { secs: number; nsecs: number }; frame_id: string };
  angle_min: number; angle_max: number; angle_increment: number;
  time_increment: number; scan_time: number; range_min: number; range_max: number;
  ranges: Float32Array; intensities: Float32Array;
}

export function deserializeLaserScan(def: MessageDefinition, buffer: Buffer | Uint8Array): LaserScanFields {
  const r = deserializeMessage<RawScan>(def, buffer);
  return {
    header: { seq: r.header.seq, stampSecs: r.header.stamp.secs, stampNsecs: r.header.stamp.nsecs, frameId: r.header.frame_id },
    angleMin: r.angle_min, angleMax: r.angle_max, angleIncrement: r.angle_increment,
    timeIncrement: r.time_increment, scanTime: r.scan_time, rangeMin: r.range_min, rangeMax: r.range_max,
    ranges: r.ranges, intensities: r.intensities,
  };
}
