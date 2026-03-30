import type { MessageDefinition, PointCloud2Fields } from '../types.js';
import { deserializeMessage } from '../deserializer.js';

interface RawPC2 {
  header: { seq: number; stamp: { secs: number; nsecs: number }; frame_id: string };
  height: number; width: number;
  fields: Array<{ name: string; offset: number; datatype: number; count: number }>;
  is_bigendian: boolean; point_step: number; row_step: number;
  data: Uint8Array; is_dense: boolean;
}

export function deserializePointCloud2(def: MessageDefinition, buffer: Buffer | Uint8Array): PointCloud2Fields {
  const r = deserializeMessage<RawPC2>(def, buffer);
  return {
    header: { seq: r.header.seq, stampSecs: r.header.stamp.secs, stampNsecs: r.header.stamp.nsecs, frameId: r.header.frame_id },
    height: r.height, width: r.width, fields: r.fields,
    isBigendian: r.is_bigendian, pointStep: r.point_step, rowStep: r.row_step,
    data: r.data, isDense: r.is_dense,
  };
}
