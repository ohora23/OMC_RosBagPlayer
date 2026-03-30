import type { MessageDefinition, OdometryFields } from '../types.js';
import { deserializeMessage } from '../deserializer.js';

interface RawOdom {
  header: { seq: number; stamp: { secs: number; nsecs: number }; frame_id: string };
  child_frame_id: string;
  pose: {
    pose: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } };
    covariance: Float64Array;
  };
  twist: {
    twist: { linear: { x: number; y: number; z: number }; angular: { x: number; y: number; z: number } };
    covariance: Float64Array;
  };
}

export function deserializeOdometry(def: MessageDefinition, buffer: Buffer | Uint8Array): OdometryFields {
  const r = deserializeMessage<RawOdom>(def, buffer);
  return {
    header: { seq: r.header.seq, stampSecs: r.header.stamp.secs, stampNsecs: r.header.stamp.nsecs, frameId: r.header.frame_id },
    childFrameId: r.child_frame_id,
    pose: { position: r.pose.pose.position, orientation: r.pose.pose.orientation, covariance: r.pose.covariance },
    twist: { linear: r.twist.twist.linear, angular: r.twist.twist.angular, covariance: r.twist.covariance },
  };
}
