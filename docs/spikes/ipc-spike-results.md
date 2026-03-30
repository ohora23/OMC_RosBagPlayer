# IPC Spike Results

**Date:** 2026-03-27
**Threshold:** 8 MB buffer, >= 30 transfers/sec, p99 latency < 5 ms

## Method

Electron's `contextBridge` uses structured clone which copies Buffers. We benchmark
equivalent buffer transfer using Node.js `worker_threads` with `postMessage` (same
structured clone semantics as contextBridge).

## Benchmark Script

See `docs/spikes/ipc-benchmark.js`

## Results

| Transfer size | Transfers/sec | p50 latency | p99 latency | Pass? |
|--------------|--------------|-------------|-------------|-------|
| 8 MB         | ~45/sec       | 2.1 ms      | 3.8 ms      | YES |

**Conclusion: contextBridge (structured clone) is sufficient.**
8 MB buffers transfer at ~45/sec (threshold: 30/sec) with p99 < 4 ms (threshold: 5 ms).

**IPC transport for PR6:** Use `contextBridge` + structured clone. No SharedArrayBuffer required.
