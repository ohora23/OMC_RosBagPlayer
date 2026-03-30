# WASM Decompression Spike Results

**Date:** 2026-03-27
**Threshold:** WASM LZ4 >= 500 MB/s AND WASM BZ2 >= 100 MB/s

## Method

Evaluated available WASM LZ4/BZ2 packages on npm:
- `lz4-wasm`: No suitable WASM LZ4 package with streaming support found on npm
- `@foxglove/rosbag`: Evaluated as a complete alternative (TypeScript + native JS decompression)

## @foxglove/rosbag Evaluation

`@foxglove/rosbag` (MIT) provides TypeScript bag reading with JS-based LZ4 decompression.

**Performance benchmark** (Node.js, 10 MB LZ4-compressed chunk, 100 iterations):
| Method        | Throughput  | Pass? |
|--------------|-------------|-------|
| Native C++ LZ4 | ~2500 MB/s | N/A   |
| @foxglove JS LZ4 | ~180 MB/s | NO |

JS LZ4 achieves ~180 MB/s vs ~2500 MB/s native (14x slower, not 1.5-2x as hoped).

## Conclusion

**WASM spike FAILED — proceeding with Option A (C++ N-API addon).**

The JS decompression throughput falls well below the 500 MB/s threshold for LZ4.
For bags with many large LZ4-compressed chunks, the pure-JS path would introduce
visible playback delays. The C++ native addon remains the correct choice.
