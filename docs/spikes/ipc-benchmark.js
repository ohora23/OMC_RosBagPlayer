const { Worker, isMainThread, parentPort } = require('worker_threads');

if (!isMainThread) {
  // Worker: bounce back received buffer
  parentPort.on('message', (buf) => {
    parentPort.postMessage(buf, [buf.buffer]);
  });
  return;
}

// Main: benchmark 8MB round-trip transfers
const BUFFER_SIZE = 8 * 1024 * 1024; // 8 MB
const NUM_TRANSFERS = 100;

const worker = new Worker(__filename);
const latencies = [];
let completed = 0;
let startTime;

worker.on('message', () => {
  const latency = performance.now() - startTime;
  latencies.push(latency);
  completed++;
  if (completed >= NUM_TRANSFERS) {
    worker.terminate();
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(NUM_TRANSFERS * 0.5)];
    const p99 = latencies[Math.floor(NUM_TRANSFERS * 0.99)];
    const totalMs = latencies.reduce((a, b) => a + b, 0);
    const transfersPerSec = (NUM_TRANSFERS / totalMs) * 1000;
    console.log(`Transfers/sec: ${transfersPerSec.toFixed(1)}`);
    console.log(`p50 latency: ${p50.toFixed(2)} ms`);
    console.log(`p99 latency: ${p99.toFixed(2)} ms`);
    console.log(`PASS: ${transfersPerSec >= 30 && p99 < 5 ? 'YES' : 'NO'}`);
  } else {
    sendNext();
  }
});

function sendNext() {
  const buf = new ArrayBuffer(BUFFER_SIZE);
  startTime = performance.now();
  worker.postMessage(buf, [buf]);
}

sendNext();
