import path from 'path';
import { parseMessageDefinition } from '../parser.js';
import { deserializePointCloud2, deserializeImage, deserializeLaserScan, deserializeOdometry } from '../messages/index.js';


const FIXTURE = path.join(__dirname, '../../../rosbag-reader/test/fixtures/test.bag');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let addon: any = null;
try {
  addon = require(path.join(__dirname, '../../../rosbag-reader/build/Release/rosbag_reader.node'));
} catch { /* skip if not built */ }

const PC2_DEF = `sensor_msgs/PointCloud2
Header header
uint32 height
uint32 width
sensor_msgs/PointField[] fields
bool is_bigendian
uint32 point_step
uint32 row_step
uint8[] data
bool is_dense
================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
================================================================================
MSG: sensor_msgs/PointField
string name
uint32 offset
uint8 datatype
uint32 count`;

const IMAGE_DEF = `sensor_msgs/Image
Header header
uint32 height
uint32 width
string encoding
uint8 is_bigendian
uint32 step
uint8[] data
================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id`;

const SCAN_DEF = `sensor_msgs/LaserScan
Header header
float32 angle_min
float32 angle_max
float32 angle_increment
float32 time_increment
float32 scan_time
float32 range_min
float32 range_max
float32[] ranges
float32[] intensities
================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id`;

const ODOM_DEF = `nav_msgs/Odometry
Header header
string child_frame_id
geometry_msgs/PoseWithCovariance pose
geometry_msgs/TwistWithCovariance twist
================================================================================
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
================================================================================
MSG: geometry_msgs/PoseWithCovariance
geometry_msgs/Pose pose
float64[36] covariance
================================================================================
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w
================================================================================
MSG: geometry_msgs/TwistWithCovariance
geometry_msgs/Twist twist
float64[36] covariance
================================================================================
MSG: geometry_msgs/Twist
geometry_msgs/Vector3 linear
geometry_msgs/Vector3 angular
================================================================================
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z`;

// ── Parser tests (no addon needed) ──────────────────────────────────────────

describe('parseMessageDefinition', () => {
  it('parses PointCloud2 fields correctly', () => {
    const def = parseMessageDefinition(PC2_DEF);
    const names = def.fields.map(f => f.name);
    expect(names).toContain('header');
    expect(names).toContain('height');
    expect(names).toContain('width');
    expect(names).toContain('fields');
    expect(names).toContain('data');
    expect(names).toContain('is_dense');
  });

  it('marks variable-length array fields', () => {
    const def = parseMessageDefinition(PC2_DEF);
    const fieldsField = def.fields.find(f => f.name === 'fields')!;
    expect(fieldsField.isArray).toBe(true);
    expect(fieldsField.arrayLength).toBeNull();
    const dataField = def.fields.find(f => f.name === 'data')!;
    expect(dataField.isArray).toBe(true);
    expect(dataField.type).toBe('uint8');
  });

  it('registers sub-definitions including Header and PointField', () => {
    const def = parseMessageDefinition(PC2_DEF);
    const keys = Array.from(def.subDefs.keys());
    expect(keys.some(k => k.includes('Header'))).toBe(true);
    expect(keys.some(k => k.includes('PointField'))).toBe(true);
  });

  it('resolves 3+ levels deep for Odometry', () => {
    const def = parseMessageDefinition(ODOM_DEF);
    const keys = Array.from(def.subDefs.keys());
    expect(keys.some(k => k.includes('Pose'))).toBe(true);
    expect(keys.some(k => k.includes('Point'))).toBe(true);
    expect(keys.some(k => k.includes('Quaternion'))).toBe(true);
  });
});

// ── Deserializer tests (require native addon) ─────────────────────────────

function getMsg(topic: string): Buffer {
  const h = addon.openBag(FIXTURE);
  const it = addon.createIterator(h, [topic]);
  const m = addon.nextMessage(it);
  addon.closeBag(h);
  return m.data;
}

describe('deserializePointCloud2', () => {
  it('deserializes from fixture: height=1, width=4, pointStep=12', () => {
    if (!addon) return;
    const def = parseMessageDefinition(PC2_DEF);
    const pc2 = deserializePointCloud2(def, getMsg('/points'));
    expect(pc2.height).toBe(1);
    expect(pc2.width).toBe(4);
    expect(pc2.pointStep).toBe(12);
    expect(pc2.fields.length).toBe(3);
    expect(pc2.fields[0].name).toBe('x');
  });

  it('XYZ values match fixture: point1=(1,0.5,0.25)', () => {
    if (!addon) return;
    const def = parseMessageDefinition(PC2_DEF);
    const pc2 = deserializePointCloud2(def, getMsg('/points'));
    const floats = new Float32Array(pc2.data.buffer, pc2.data.byteOffset, pc2.data.byteLength / 4);
    expect(Math.abs(floats[3] - 1.0)).toBeLessThan(1e-6);   // point1 x
    expect(Math.abs(floats[4] - 0.5)).toBeLessThan(1e-6);   // point1 y
    expect(Math.abs(floats[5] - 0.25)).toBeLessThan(1e-6);  // point1 z
  });
});

describe('deserializeImage', () => {
  it('deserializes from fixture: 4x4 rgb8', () => {
    if (!addon) return;
    const def = parseMessageDefinition(IMAGE_DEF);
    const img = deserializeImage(def, getMsg('/image'));
    expect(img.height).toBe(4);
    expect(img.width).toBe(4);
    expect(img.encoding).toBe('rgb8');
    expect(img.step).toBe(12);
    expect(img.data.length).toBe(48);
  });
});

describe('deserializeLaserScan', () => {
  it('deserializes from fixture: angle range matches', () => {
    if (!addon) return;
    const def = parseMessageDefinition(SCAN_DEF);
    const scan = deserializeLaserScan(def, getMsg('/scan'));
    expect(Math.abs(scan.angleMin - (-1.5707963))).toBeLessThan(1e-5);
    expect(Math.abs(scan.angleMax - 1.5707963)).toBeLessThan(1e-5);
    expect(scan.ranges.length).toBeGreaterThan(0);
    expect(Math.abs(scan.ranges[0] - 1.0)).toBeLessThan(1e-5);
  });
});

describe('deserializeOdometry', () => {
  it('deserializes nested types: position=(1,0.5,0), orientation.w=1', () => {
    if (!addon) return;
    const def = parseMessageDefinition(ODOM_DEF);
    const odom = deserializeOdometry(def, getMsg('/odom'));
    expect(Math.abs(odom.pose.position.x - 1.0)).toBeLessThan(1e-9);
    expect(Math.abs(odom.pose.position.y - 0.5)).toBeLessThan(1e-9);
    expect(Math.abs(odom.pose.orientation.w - 1.0)).toBeLessThan(1e-9);
    expect(odom.pose.covariance.length).toBe(36);
    expect(Math.abs(odom.twist.linear.x - 0.5)).toBeLessThan(1e-9);
  });
});
