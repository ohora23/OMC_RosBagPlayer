#!/usr/bin/env python3
"""
Generate a test .bag file for rosbag-reader unit tests.
Uses only stdlib — no ROS installation required.
"""
import struct
import os
import sys


def write_uint32(v):
    return struct.pack('<I', v)


def write_uint64(v):
    return struct.pack('<Q', v)


def make_header_field(key, value_bytes):
    if isinstance(value_bytes, str):
        value_bytes = value_bytes.encode()
    field = key.encode() + b'=' + value_bytes
    return write_uint32(len(field)) + field


def write_record(op_byte, header_fields_bytes, data_bytes=b''):
    header = b''.join(header_fields_bytes)
    return write_uint32(len(header)) + header + write_uint32(len(data_bytes)) + data_bytes


def encode_ros_time(t_ns):
    secs = int(t_ns // 1_000_000_000)
    nsecs = int(t_ns % 1_000_000_000)
    return struct.pack('<II', secs, nsecs)


def make_header_msg(frame_id='', seq=0, t_ns=0):
    """std_msgs/Header: uint32 seq, time stamp, string frame_id"""
    secs = int(t_ns // 1_000_000_000)
    nsecs = int(t_ns % 1_000_000_000)
    frame_bytes = frame_id.encode()
    return struct.pack('<III', seq, secs, nsecs) + write_uint32(len(frame_bytes)) + frame_bytes


def make_point_cloud2(t_ns=0, seq=0):
    """sensor_msgs/PointCloud2 with xyz float32 fields, 4 points"""
    header = make_header_msg('base_link', seq, t_ns)
    FLOAT32 = 7

    def make_field(name, offset, datatype, count=1):
        n = name.encode()
        return write_uint32(len(n)) + n + write_uint32(offset) + struct.pack('<B', datatype) + write_uint32(count)

    fields_data = make_field('x', 0, FLOAT32) + make_field('y', 4, FLOAT32) + make_field('z', 8, FLOAT32)
    num_fields = 3

    height = 1
    width = 4
    point_step = 12
    row_step = width * point_step

    points = []
    for i in range(4):
        points.append(struct.pack('<fff', float(i), float(i) * 0.5, float(i) * 0.25))
    data = b''.join(points)

    return (header +
            write_uint32(height) + write_uint32(width) +
            write_uint32(num_fields) + fields_data +
            struct.pack('<B', 0) +
            write_uint32(point_step) + write_uint32(row_step) +
            write_uint32(len(data)) + data +
            struct.pack('<B', 0))


def make_image(t_ns=0, seq=0):
    """sensor_msgs/Image: 4x4 rgb8 image"""
    header = make_header_msg('camera', seq, t_ns)
    height, width = 4, 4
    encoding = b'rgb8'
    step = width * 3
    pixels = bytes([i * 10 % 256 for i in range(height * step)])
    return (header +
            write_uint32(height) + write_uint32(width) +
            write_uint32(len(encoding)) + encoding +
            struct.pack('<B', 0) +
            write_uint32(step) +
            write_uint32(len(pixels)) + pixels)


def make_laser_scan(t_ns=0, seq=0):
    """sensor_msgs/LaserScan"""
    header = make_header_msg('base_link', seq, t_ns)
    angle_min = -1.5707963
    angle_max = 1.5707963
    angle_increment = 0.1
    num_ranges = int((angle_max - angle_min) / angle_increment) + 1
    ranges = [1.0 + i * 0.1 for i in range(num_ranges)]
    intensities = [100.0] * num_ranges

    return (header +
            struct.pack('<fffff', angle_min, angle_max, angle_increment, 0.0, 0.1) +
            struct.pack('<ff', 0.1, 10.0) +
            write_uint32(len(ranges)) + struct.pack(f'<{len(ranges)}f', *ranges) +
            write_uint32(len(intensities)) + struct.pack(f'<{len(intensities)}f', *intensities))


def make_odometry(t_ns=0, seq=0):
    """nav_msgs/Odometry"""
    header = make_header_msg('odom', seq, t_ns)
    child_frame = b'base_link'
    pos = struct.pack('<ddd', 1.0, 0.5, 0.0)
    quat = struct.pack('<dddd', 0.0, 0.0, 0.0, 1.0)
    covariance = struct.pack('<36d', *([0.0] * 36))
    twist_linear = struct.pack('<ddd', 0.5, 0.0, 0.0)
    twist_angular = struct.pack('<ddd', 0.0, 0.0, 0.1)
    twist_cov = struct.pack('<36d', *([0.0] * 36))

    return (header +
            write_uint32(len(child_frame)) + child_frame +
            pos + quat + covariance +
            twist_linear + twist_angular + twist_cov)


PC2_MSG_DEF = """sensor_msgs/PointCloud2
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
uint32 count"""

IMAGE_MSG_DEF = """sensor_msgs/Image
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
string frame_id"""

SCAN_MSG_DEF = """sensor_msgs/LaserScan
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
string frame_id"""

ODOM_MSG_DEF = """nav_msgs/Odometry
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
float64 z"""


def make_connection_record(conn_id, topic, msg_type, md5sum, msg_def, callerid='test_generator'):
    h_fields = [
        make_header_field('op', bytes([0x07])),
        make_header_field('conn', write_uint32(conn_id)),
        make_header_field('topic', topic),
    ]
    d_fields = [
        make_header_field('topic', topic),
        make_header_field('type', msg_type),
        make_header_field('md5sum', md5sum),
        make_header_field('message_definition', msg_def),
        make_header_field('callerid', callerid),
    ]
    data = b''.join(d_fields)
    return write_record(0x07, h_fields, data)


def make_msgdata_record(conn_id, t_ns, msg_bytes):
    h_fields = [
        make_header_field('op', bytes([0x02])),
        make_header_field('conn', write_uint32(conn_id)),
        make_header_field('time', encode_ros_time(t_ns)),
    ]
    return write_record(0x02, h_fields, msg_bytes)


def make_chunk(records_bytes, compression='none'):
    if compression != 'none':
        raise NotImplementedError('Only none compression for test fixture')
    h_fields = [
        make_header_field('op', bytes([0x05])),
        make_header_field('compression', 'none'),
        make_header_field('size', write_uint32(len(records_bytes))),
    ]
    return write_record(0x05, h_fields, records_bytes)


def generate_bag(output_path):
    base_time_ns = 1700000000 * 1_000_000_000  # 2023-11-14

    conns = [
        (0, '/points', 'sensor_msgs/PointCloud2', 'abc123def456', PC2_MSG_DEF),
        (1, '/image', 'sensor_msgs/Image', 'abc123def457', IMAGE_MSG_DEF),
        (2, '/scan', 'sensor_msgs/LaserScan', 'abc123def458', SCAN_MSG_DEF),
        (3, '/odom', 'nav_msgs/Odometry', 'abc123def459', ODOM_MSG_DEF),
    ]

    chunk_content = b''
    for conn_id, topic, msg_type, md5, msg_def in conns:
        chunk_content += make_connection_record(conn_id, topic, msg_type, md5, msg_def)

    for i in range(3):
        t = base_time_ns + i * 100_000_000  # 100ms apart
        chunk_content += make_msgdata_record(0, t, make_point_cloud2(t, i))
        chunk_content += make_msgdata_record(1, t + 1, make_image(t + 1, i))
        chunk_content += make_msgdata_record(2, t + 2, make_laser_scan(t + 2, i))
        chunk_content += make_msgdata_record(3, t + 3, make_odometry(t + 3, i))

    chunk_record = make_chunk(chunk_content)

    bag_header_fields = [
        make_header_field('op', bytes([0x03])),
        make_header_field('index_pos', write_uint64(0)),
        make_header_field('conn_count', write_uint32(len(conns))),
        make_header_field('chunk_count', write_uint32(1)),
    ]
    bag_header = write_record(0x03, bag_header_fields, b' ' * 4096)

    conn_records = b''
    for conn_id, topic, msg_type, md5, msg_def in conns:
        conn_records += make_connection_record(conn_id, topic, msg_type, md5, msg_def)

    with open(output_path, 'wb') as f:
        f.write(b'#rosbag V2.0\n')
        f.write(bag_header)
        f.write(chunk_record)
        f.write(conn_records)

    size = os.path.getsize(output_path)
    print(f'Generated {output_path} ({size} bytes)')
    print(f'Topics: {[c[1] for c in conns]}')
    print(f'Messages per topic: 3')


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'test.bag')
    generate_bag(out)
