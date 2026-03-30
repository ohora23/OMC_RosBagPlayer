# ROS1 Rosbag Player with WebGL Acceleration -- v1 Work Plan

**Date:** 2026-03-25
**Status:** DRAFT -- Awaiting user confirmation
**Complexity:** HIGH
**Scope:** Greenfield monorepo, ~9 PRs, 6 packages + 1 app

---

## Context

Build a cross-platform Electron desktop application that reads ROS1 `.bag` files via a C++ native addon, deserializes messages using a TypeScript `.msg` definition parser, schedules message playback in TypeScript, and renders sensor data (PointCloud2, Image, LaserScan, Odometry/TF) through a Three.js WebGL pipeline. The repository is completely empty today.

---

## Monorepo Package Structure

| Package | Purpose |
|---------|---------|
| `packages/rosbag-reader` | C++ native addon (or WASM if spike passes) -- bag I/O, decompression, chunk iteration |
| `packages/message-deserializer` | ROS1 `.msg` definition parser + typed deserializers for supported message types |
| `packages/player-core` | TypeScript playback engine -- scheduling, seek, speed control |
| `packages/renderer` | Three.js WebGL renderers for PointCloud2, LaserScan, Odometry |
| `packages/ui` | React + Electron UI -- topic panel, timeline, viewport, image panel |
| `apps/desktop` | Electron main process + entry point |

---

## RALPLAN-DR

### Principles

1. **Incremental Delivery** -- Every PR is independently mergeable, testable, and demo-able. No "big bang" integration.
2. **Native Where It Matters** -- Use C++ only for bag I/O (decompression is perf-critical). Message deserialization and all other logic stays in TypeScript for iteration speed.
3. **Separation of Concerns** -- Rendering, playback logic, bag reading, message deserialization, and UI are distinct packages with well-defined APIs. No cross-cutting imports.
4. **Test-First** -- Each PR ships with unit tests for the code it introduces. Integration tests appear once interfaces stabilize.
5. **WebGL Performance Budget** -- v1 baseline: 100k points at 30 FPS. PR7 stretch: 500k points at 30 FPS. Design BufferGeometry reuse and transfer patterns accordingly.

### Decision Drivers

| Rank | Driver | Why |
|------|--------|-----|
| 1 | **Cross-platform native build reliability** | C++ addon must compile on Linux, macOS, Windows with minimal user friction. This gates every other feature. |
| 2 | **Point cloud rendering throughput** | PointCloud2 is the primary WebGL use case; if it stutters, the product fails. |
| 3 | **Developer iteration speed** | Greenfield project needs fast feedback loops -- hot reload for UI, incremental C++ builds, parallel package builds. |

### Viable Options

#### Option A: Standalone C++ bag parser with N-API bindings (CHOSEN)

Write a minimal C++ library that reads the ROS1 bag format directly (LZ4/BZ2 decompression, connection header parsing, chunk iteration) without depending on a full ROS installation. Expose via node-addon-api / N-API.

| Pros | Cons |
|------|------|
| No ROS installation required at build or runtime | Must implement/vendor the bag format parser (~2k LOC) |
| Smaller binary, simpler cross-compilation | Must handle edge cases (bag versions, compression modes) manually |
| Clean N-API boundary, prebuildable with prebuild-install | Initial development cost higher than wrapping existing library |

#### Option B: Wrap `rosbag` C++ API from ros_comm

Link against the `rosbag` library from the ROS1 `ros_comm` stack. Expose a thin N-API wrapper.

| Pros | Cons |
|------|------|
| Battle-tested bag reading code | Requires ROS1 dev packages installed (catkin, roscpp, etc.) |
| Handles all bag format edge cases | Massive transitive dependency tree (~50 packages) |
| Less initial C++ code to write | Cross-compilation to macOS/Windows is extremely difficult |

#### Option C: Pure TypeScript bag reader (e.g., fork of @foxglove/rosbag)

Use or fork an existing TypeScript/JavaScript bag reader.

| Pros | Cons |
|------|------|
| No native compilation at all | JS decompression of LZ4/BZ2 is 3-5x slower than native |
| Simplest build pipeline | Cannot stream large bags (>1GB) without blocking the main thread |
| Existing open-source implementations available | Worker thread overhead for large files |

#### Option D: Use/fork `@foxglove/rosbag` (MIT)

Adopt or fork the Foxglove rosbag library as a complete solution.

| Pros | Cons |
|------|------|
| Maintained MIT-licensed library with bag reading support | Does not include a message deserializer |
| No native compilation required | TypeScript-only decompression is 3-5x slower for large bags |
| Reduced initial development effort | Building atop an external dependency limits control over performance-critical code paths |

### ADR

- **Decision:** Option A -- Standalone C++ bag parser with N-API bindings.
- **Drivers:** Cross-platform build reliability (#1 driver) eliminates Option B. Performance budget (#2 driver) eliminates Option C and Option D for large bags.
- **Alternatives considered:** Option B (ros_comm wrapper), Option C (pure TypeScript reader), Option D (use/fork `@foxglove/rosbag`).
- **Why chosen:** Option A is the only path that satisfies both cross-platform builds and native decompression performance. The bag format is well-documented and finite in scope -- implementing it is bounded work. Option D was rejected because it does not include a message deserializer, its TypeScript-only decompression is 3-5x slower for large bags, and building atop an external dependency limits control over performance-critical code paths.
- **Consequences:** We own the bag parser code and must handle format edge cases ourselves. We should vendor LZ4 and BZ2 as submodules or use system packages via CMake `find_package`.
- **Follow-ups:** Evaluate whether to publish the C++ bag reader as a standalone npm package with prebuilds. Consider adding ROS2 mcap support in v2.

---

## Work Objectives

1. Scaffold a pnpm monorepo with Turborepo, TypeScript project references, ESLint, Prettier, and CMake integration.
2. Implement a C++ native addon that reads ROS1 bag files and exposes topic metadata, connection records, and message iteration to Node.js.
3. Build a message deserializer that parses ROS1 `.msg` definitions and deserializes raw buffers to typed TypeScript objects.
4. Build a TypeScript playback engine that schedules messages by timestamp with speed control and seek.
5. Implement Three.js WebGL renderers for PointCloud2, LaserScan, Odometry trajectories, and Image topics.
6. Build a React/Electron UI with a 3D viewport, timeline, topic panel, and playback controls.
7. Wire everything together in the Electron app with IPC between main and renderer processes.
8. Set up CI/CD with GitHub Actions for lint, test, and build on every PR.

---

## Guardrails

### Must Have

- Every PR includes unit tests for the code it introduces
- C++ addon builds without a ROS installation
- Point cloud renderer handles >= 100k points at >= 30 FPS (v1 baseline)
- Playback engine is decoupled from rendering (can run headless)
- Electron app runs on Linux, macOS, Windows

### Must NOT Have

- No ROS1 runtime dependency (no roscore, no catkin)
- No ROS2 / mcap support in v1 (defer to v2)
- No network streaming -- local bag files only
- No plugin system in v1 -- hardcoded message type support
- No recording capability -- read-only

---

## Task Flow (PR Sequence)

```
PR1: Monorepo Scaffold
  |
PR2: C++ Bag Reader Addon (+ IPC spike + WASM spike)
  |
PR2.5: Message Deserializer
  |
PR3: Playback Engine
  |
  +-------+-------+
  |               |
PR4: WebGL      PR5: Image
Renderers       Renderer
  |               |
  +-------+-------+
          |
PR6: Electron UI + Integration
  |
PR7: Polish + Performance
  |
PR8: CI/CD + Release Pipeline
```

---

## Detailed TODOs

### PR1: Monorepo Scaffold and Tooling

**Goal:** A developer can clone, install, and run lint/typecheck/test across all packages with zero configuration beyond `pnpm install`.

**Tasks:**
1. Initialize git repo, create `.gitignore` (node_modules, build/, dist/, *.node, CMake build artifacts)
2. Create `pnpm-workspace.yaml` defining `packages/*` and `apps/*`
3. Create root `package.json` with pnpm workspaces, scripts for `lint`, `typecheck`, `test`, `build`
4. Set up Turborepo (`turbo.json`) with pipeline: `build` depends on `^build`, `test` depends on `build`, `lint` has no deps
5. Create `tsconfig.base.json` with strict mode, ES2022 target, project references pattern
6. Create skeleton `package.json` + `tsconfig.json` for each package: `rosbag-reader`, `message-deserializer`, `player-core`, `renderer`, `ui`
7. Create skeleton `package.json` for `apps/desktop`
8. Pin Electron to version 30.x (LTS) in `apps/desktop/package.json` -- this determines native addon ABI, SharedArrayBuffer headers, and contextBridge behavior
9. Set up ESLint flat config (`eslint.config.mjs`) with TypeScript plugin, Prettier integration
10. Set up Prettier config (`.prettierrc`)
11. Create `packages/rosbag-reader/CMakeLists.txt` stub with node-addon-api and cmake-js integration
12. Add `jest.config.ts` at root with project references for each TS package
13. Add placeholder test in `player-core` that passes

**Acceptance Criteria:**
- `pnpm install` completes without errors
- `pnpm lint` runs ESLint across all packages with zero violations
- `pnpm typecheck` runs tsc --noEmit across all TS packages with zero errors
- `pnpm test` runs Jest and reports >= 1 passing test
- `pnpm build` runs turbo build (produces empty dist dirs for skeleton packages)
- CMakeLists.txt is parseable by cmake-js (verified by `npx cmake-js configure` in rosbag-reader returning exit code 0)
- `apps/desktop/package.json` has `"electron": "~30.x"` in devDependencies
- All 6 packages + 1 app are listed in `pnpm-workspace.yaml`

---

### PR2: C++ Native Bag Reader Addon

**Goal:** A Node.js caller can open a `.bag` file, list topics with metadata, retrieve full connection records (including `.msg` definition strings), and iterate messages by topic with raw binary buffers. Includes IPC spike and WASM spike to inform architecture decisions for later PRs.

**Tasks:**
1. Implement C++ bag format parser:
   - `BagReader` class: open file, parse header, read connection records (including full message definition strings)
   - `ChunkIterator`: decompress LZ4/BZ2 chunks, yield `(connection_id, timestamp, raw_data)` tuples
   - Vendor LZ4 (BSD) and link BZ2 via CMake `find_package` or vendored source
2. Implement N-API bindings (`src/addon.cpp`):
   - `openBag(filePath: string): BagHandle` -- returns opaque handle
   - `getTopics(handle): Array<{topic, type, messageCount, frequency}>` -- topic metadata
   - `getConnections(handle): Array<{topic: string, type: string, md5sum: string, messageDefinition: string, callerid?: string}>` -- full connection record data including `.msg` definition text from connection records
   - `createIterator(handle, topics: string[], startTime?, endTime?): IteratorHandle` -- filtered message iterator
   - `nextMessage(iterator): {topic, timestamp, data: Buffer} | null` -- pull next message
   - `closeBag(handle): void` -- release resources
3. Generate test fixture bag using `rosbag` Python pip package (`pip install rosbag`) -- does NOT require a full ROS installation. Script: `test/fixtures/generate_fixture.py`. Commit the generated `.bag` file (~1MB) to the repo. The fixture must contain at least one message each of PointCloud2, Image, LaserScan, and Odometry types.
4. Write C++ unit tests (Google Test):
   - Parse the test fixture bag file
   - Verify topic listing, message count, timestamp ordering
   - Verify LZ4 and BZ2 decompression produce correct raw bytes
   - Verify connection records contain non-empty `messageDefinition` strings
5. Write Node.js integration tests (Jest):
   - Load addon, open test bag, verify topic list matches expected
   - Load addon, open test bag, verify `getConnections()` returns records with non-empty `messageDefinition` for each connection
   - Iterate all messages, verify count and timestamp ordering
   - Test error handling: missing file returns descriptive error, corrupted bag throws, empty bag returns zero topics
6. **IPC Spike** (acceptance criteria for this PR):
   - Transfer an 8 MB buffer (simulating 500k points x 16 bytes) from Electron main process to renderer process using `contextBridge` (structured clone)
   - Measure throughput and latency over 100 consecutive transfers
   - **Pass threshold:** >= 30 transfers/sec with p99 latency < 5 ms
   - **If contextBridge passes threshold:** use contextBridge for IPC in PR6
   - **If contextBridge fails threshold:** switch to `SharedArrayBuffer` + `MessagePort` in PR6; document that `--enable-features=SharedArrayBuffer` is required in Electron BrowserWindow configuration
   - Record results in `docs/spikes/ipc-spike-results.md`
7. **WASM Spike** (optional, timeboxed to 2 days, run in parallel with C++ implementation):
   - Compile LZ4 and BZ2 decompression to WASM using Emscripten
   - Benchmark WASM decompression throughput on the test fixture bag
   - Also evaluate `@foxglove/rosbag` as a complete TypeScript + WASM alternative rather than just WASM decompression in isolation
   - **Pass threshold:** WASM LZ4 throughput >= 500 MB/s AND WASM BZ2 throughput >= 100 MB/s on the developer's machine
   - **If pass:** eliminate the C++ bag reader entirely, switch to TypeScript + WASM implementation; update this plan accordingly
   - **If fail:** proceed with Option A (C++ N-API addon) as planned
   - Record results in `docs/spikes/wasm-spike-results.md`

**Acceptance Criteria:**
- `npx cmake-js build` compiles the addon on Linux (macOS/Windows deferred to PR7)
- `require('./build/Release/rosbag_reader.node')` loads without error in Node.js
- Node.js tests pass: open bag, list topics, get connections with message definitions, iterate messages, close bag
- `getConnections()` returns an array where every entry has a non-empty `messageDefinition` string
- C++ tests pass via `ctest` in the build directory
- Memory: no leaks reported by AddressSanitizer on the full test suite
- IPC spike results documented in `docs/spikes/ipc-spike-results.md` with pass/fail determination
- WASM spike results documented in `docs/spikes/wasm-spike-results.md` with pass/fail determination (or "skipped" if timeboxed out)
- Test fixture bag file committed at `test/fixtures/` with generation script at `test/fixtures/generate_fixture.py`

---

### PR2.5: Message Deserializer (`message-deserializer`)

**Goal:** Parse ROS1 `.msg` definition strings (as embedded in bag connection records) into field descriptor objects, and deserialize raw binary buffers into typed TypeScript objects for the 4 supported message types.

**Tasks:**
1. Evaluate `@foxglove/rosmsg` (MIT licensed TypeScript `.msg` parser) as the parsing backend:
   - If it covers the use case (parses nested message definitions, handles all ROS1 primitive types): use it as a dependency
   - If it does not cover the use case: implement a recursive `.msg` definition parser from scratch
   - Document the decision in a code comment at the top of the parser module
2. Implement core API:
   ```
   parseMessageDefinition(msgDefStr: string): MessageDefinition
   deserializeMessage<T>(def: MessageDefinition, buffer: Buffer, offset?: number): T
   ```
   - `parseMessageDefinition` takes a raw `.msg` definition string (which may contain multiple `===` separated sub-definitions for nested types) and produces a tree of field descriptors
   - `deserializeMessage` reads binary data according to the field descriptors, handling ROS1 serialization format (little-endian, 4-byte length-prefixed strings and arrays)
3. Handle nested message types: e.g., `geometry_msgs/Pose` contains `geometry_msgs/Point` + `geometry_msgs/Quaternion`. The parser must resolve nested type references from the sub-definitions embedded in the connection record's message definition string.
4. Implement convenience typed deserializers for the 4 supported message types:
   - `deserializePointCloud2(def: MessageDefinition, buffer: Buffer): PointCloud2Fields` -- extracts height, width, fields[], point_step, row_step, data, is_dense
   - `deserializeImage(def: MessageDefinition, buffer: Buffer): ImageFields` -- extracts height, width, encoding, step, data
   - `deserializeLaserScan(def: MessageDefinition, buffer: Buffer): LaserScanFields` -- extracts angle_min, angle_max, angle_increment, ranges[], intensities[]
   - `deserializeOdometry(def: MessageDefinition, buffer: Buffer): OdometryFields` -- extracts pose (position + orientation), twist (linear + angular)
5. Export TypeScript type definitions for `MessageDefinition`, `PointCloud2Fields`, `ImageFields`, `LaserScanFields`, `OdometryFields`
6. Write unit tests:
   - Parse known `.msg` definition strings (taken from the test fixture bag's connection records) and verify the produced field descriptors match expected structure
   - Parse a nested message definition (e.g., `nav_msgs/Odometry` which contains `geometry_msgs/PoseWithCovariance` -> `geometry_msgs/Pose` -> `geometry_msgs/Point` + `geometry_msgs/Quaternion`) and verify all nested types resolve
   - Deserialize known binary buffers (extracted from the test fixture bag) and verify field values match expected values within floating-point tolerance (1e-6 for floats, exact for integers and strings)
   - Round-trip test: for each of the 4 message types, verify that deserializing a message from the test fixture bag produces values consistent with what the `generate_fixture.py` script wrote

**Acceptance Criteria:**
- `parseMessageDefinition` correctly parses `.msg` definition strings for all 4 supported message types (PointCloud2, Image, LaserScan, Odometry) including nested sub-definitions
- `deserializeMessage` produces typed objects whose field values match expected values from the test fixture
- Nested message types (at least 3 levels deep: Odometry -> PoseWithCovariance -> Pose -> Point) resolve correctly
- All unit tests pass
- Package exports ESM from `packages/message-deserializer`
- Zero runtime dependencies beyond `@foxglove/rosmsg` (if chosen) -- no Node.js-specific APIs so the package works in both Node and browser contexts

---

### PR3: TypeScript Playback Engine (`player-core`)

**Goal:** Given a message source (the bag reader), the playback engine schedules messages at the correct wall-clock times, supports play/pause/seek/speed, and emits typed events.

**Tasks:**
1. Define `MessageSource` interface:
   ```
   interface MessageSource {
     getTopics(): TopicInfo[]
     getConnections(): ConnectionInfo[]
     createIterator(topics: string[], startTime?: number, endTime?: number): MessageIterator
   }
   interface MessageIterator {
     next(): Promise<RawMessage | null>
   }
   ```
2. Implement `PlaybackEngine` class:
   - State machine: `IDLE -> LOADING -> PAUSED -> PLAYING -> PAUSED | SEEKING -> PLAYING`
   - `load(source: MessageSource)` -- read topic list, read connections (for message definitions), determine time range
   - `play()` -- start scheduling messages via `setTimeout` chains relative to bag timestamps and speed multiplier
   - `pause()` -- stop scheduling, retain current position
   - `seek(timestamp: number)` -- create new iterator from timestamp, update position
   - `setSpeed(multiplier: number)` -- 0.1x to 4.0x, applied to next scheduled delay
   - `setEnabledTopics(topics: string[])` -- filter which topics emit messages
3. Implement event emitter pattern:
   - `on('message', (msg: RawMessage) => void)` -- fired for each message at playback time
   - `on('stateChange', (state: PlaybackState) => void)`
   - `on('timeUpdate', (current: number, total: number) => void)` -- periodic position updates
4. Write unit tests with a mock `MessageSource`:
   - Play from start: messages arrive in timestamp order with correct relative delays (within 50ms tolerance)
   - Pause/resume: no messages emitted during pause, resume continues from correct position (verified by checking next message timestamp)
   - Seek: messages after seek start from the target timestamp (within 1ms)
   - Speed: 2x speed halves the inter-message delay (within 25ms tolerance)
   - Topic filtering: disabled topics produce zero `message` events for those topics

**Acceptance Criteria:**
- `PlaybackEngine` is a pure TypeScript class with no DOM or Electron dependencies
- All unit tests pass with mock sources
- Integration test with real `rosbag-reader` addon: load test fixture, play all messages, verify message count matches `getTopics()` total
- `MessageSource` interface includes `getConnections()` so playback engine can pass connection info (including message definitions) downstream
- Exported as ESM from `packages/player-core`

---

### PR4: WebGL Renderers -- PointCloud2, LaserScan, Odometry

**Goal:** Three.js-based renderer classes that accept deserialized message objects (from `message-deserializer`) and update GPU-side geometry efficiently.

**Tasks:**
1. Implement `SceneManager`:
   - Create Three.js `Scene`, `PerspectiveCamera`, `WebGLRenderer`
   - Orbit controls (via `three/examples/jsm/controls/OrbitControls`)
   - Grid helper, axis helper for spatial reference
   - `render()` loop via `requestAnimationFrame`
   - Resize handling
2. Implement `PointCloud2Renderer`:
   - Accept `PointCloud2Fields` (from `message-deserializer`) -- use field descriptors to locate x, y, z, intensity/rgb within the point data buffer
   - Use `THREE.BufferGeometry` with `Float32BufferAttribute` for positions
   - Use `THREE.Points` with `ShaderMaterial` for colormap (intensity-based: viridis/turbo, or RGB passthrough)
   - Double-buffer pattern: prepare next frame's geometry while current frame renders
   - Support point size and colormap selection
3. Implement `LaserScanRenderer`:
   - Accept `LaserScanFields` (from `message-deserializer`)
   - Convert polar (angle_min, angle_increment, ranges[]) to Cartesian XY
   - Render as `THREE.Line` (connected) or `THREE.Points` (dots)
   - Color by intensity or range
4. Implement `OdometryRenderer`:
   - Accept `OdometryFields` (from `message-deserializer`)
   - Accumulate pose positions into a trajectory `THREE.Line`
   - Render current pose as an arrow or axes marker
   - TF handling: v1 renders all data in a single user-selected reference frame (default: first frame seen in bag's `/tf` topic). TF frames are extracted once at bag load time; dynamic transform interpolation is deferred to v2. Display a frame selector dropdown in the UI.
5. Write unit tests:
   - PointCloud2Renderer: given a known `PointCloud2Fields` object (deserialized from the test fixture), verify BufferGeometry positions match expected XYZ values within 1e-6 tolerance
   - LaserScanRenderer: verify polar-to-Cartesian conversion for known inputs (0, pi/2, pi radians) produces correct XY within 1e-6
   - OdometryRenderer: verify trajectory accumulation -- feed 10 poses, verify line geometry has 10 vertices

**Acceptance Criteria:**
- Each renderer accepts a deserialized message object (from `message-deserializer`), not raw Buffers
- PointCloud2 renderer handles 100k points at >= 30 FPS (v1 baseline; benchmark test with synthetic `PointCloud2Fields` data, measured as mean FPS over 100 frames)
- Renderers own their Three.js objects and release all GPU resources on `dispose()` (verified: calling dispose() then checking renderer.info.memory.geometries returns 0)
- No DOM dependency in tests (use offscreen canvas or mock WebGL context via `jest-webgl-canvas-mock`)
- All renderers import from `message-deserializer` for type definitions -- no raw byte parsing in renderer code

---

### PR5: Image Topic Renderer

**Goal:** Display `sensor_msgs/Image` topics as 2D texture planes in the 3D viewport or as separate 2D panels.

**Tasks:**
1. Implement `ImageRenderer`:
   - Accept `ImageFields` (from `message-deserializer`) -- extract width, height, encoding, step, data
   - Convert to RGBA `Uint8Array` for WebGL texture upload
   - Mode A (3D): render as `THREE.PlaneGeometry` with `THREE.MeshBasicMaterial` + `THREE.DataTexture` in the scene
   - Mode B (2D panel): render to a separate `<canvas>` element using `CanvasRenderingContext2D` or WebGL
2. Implement encoding converters:
   - `rgb8` -> RGBA (add alpha channel)
   - `bgr8` -> RGBA (swap channels)
   - `mono8` -> RGBA (grayscale)
   - Bayer -> RGB (simple nearest-neighbor debayer for v1)
3. Optimize texture upload:
   - Reuse `DataTexture` object, only update `.image.data` and set `.needsUpdate = true`
   - Avoid creating new textures per frame
4. Write unit tests:
   - Encoding conversion: known input bytes produce expected RGBA output (verify byte-for-byte for a 4x4 pixel test image in each encoding)
   - Verify texture dimensions match `ImageFields.width` and `ImageFields.height`

**Acceptance Criteria:**
- Image renderer displays camera feed at native resolution
- Supports rgb8, bgr8, mono8 encodings (bayer is best-effort, tested but not required to pass visual quality bar)
- Texture reuse: no GPU memory growth over 1000 frame updates (verified by checking renderer.info.memory.textures stays constant)
- Tests pass with synthetic `ImageFields` objects
- Renderer imports from `message-deserializer` for `ImageFields` type -- no raw byte parsing in renderer code

---

### PR6: Electron UI and Integration

**Goal:** A working Electron app that opens a bag file, shows the topic panel, plays back with timeline controls, and renders all supported message types in the 3D viewport.

**Tasks:**
1. Electron main process (`apps/desktop`):
   - Window creation, menu bar with "Open Bag File" dialog
   - IPC bridge: main process loads bag via `rosbag-reader` addon, uses `message-deserializer` to parse connection records' message definitions
   - IPC transport: use `contextBridge`/`preload` if IPC spike passed, or `SharedArrayBuffer` + `MessagePort` if IPC spike indicated contextBridge is insufficient (see PR2 spike results in `docs/spikes/ipc-spike-results.md`)
   - If using `SharedArrayBuffer`: add `--enable-features=SharedArrayBuffer` to BrowserWindow webPreferences
2. React UI (`packages/ui`):
   - `<App>` root with layout: sidebar (topic panel) + main (3D viewport + timeline)
   - `<TopicPanel>` -- lists topics with checkboxes, shows type and message count
   - `<PlaybackControls>` -- Play/Pause button, speed dropdown (0.1x, 0.25x, 0.5x, 1x, 2x, 4x), current time display
   - `<Timeline>` -- seekable progress bar showing current position in bag time range, click-to-seek
   - `<Viewport3D>` -- hosts the Three.js canvas, passes deserialized messages to renderers
   - `<ImagePanel>` -- optional floating panel for 2D image display
   - `<FrameSelector>` -- dropdown for selecting the reference TF frame (populated at bag load time from `/tf` topic)
3. Integration wiring:
   - On "Open Bag": load bag -> parse connection records for message definitions -> populate topic panel -> enable default topics -> pause at t=0
   - On "Play": playback engine emits messages -> deserialize via `message-deserializer` using cached `MessageDefinition` per topic -> dispatch to correct renderer by topic type
   - On "Seek": playback engine seeks -> renderers clear and rebuild from new position
   - On topic toggle: update playback engine enabled topics -> show/hide renderer objects
4. State management: use React context + `useReducer` for playback state, or Zustand for simplicity
5. Write integration tests:
   - Open a test bag via mocked IPC, verify topic panel lists correct topics (assert topic count and names)
   - Play and verify renderer receives deserialized messages (mock renderers, assert call count matches expected message count)

**Acceptance Criteria:**
- App launches via `pnpm --filter desktop dev` without errors
- Can open a bag file via file dialog
- Topic panel shows all topics with correct types and message counts
- Play/Pause/Seek/Speed controls function correctly (verified manually and by integration tests)
- 3D viewport renders point clouds, laser scans, and trajectories
- Image panel displays camera images
- Frame selector dropdown is populated and switching frames re-renders data in the selected frame
- No crashes on bag files up to 1 GB (tested with a 1 GB bag file, app remains responsive)
- IPC transport matches the spike decision from PR2

---

### PR7: Performance Polish and Cross-Platform Builds

**Goal:** Optimize rendering performance to hit the stretch target, fix cross-platform build issues, and add prebuild support for the native addon.

**Tasks:**
1. Performance optimization:
   - Profile point cloud rendering with Chrome DevTools Performance tab
   - Implement point cloud decimation for bags with >500k points/frame
   - Use `SharedArrayBuffer` + worker thread for bag decompression off the main thread (if not already done via IPC spike decision)
   - Implement frame skipping: if renderer is behind, skip to latest message per topic
2. Cross-platform native builds:
   - Set up CMake toolchain files for macOS (clang) and Windows (MSVC)
   - Test and fix compilation on macOS (Homebrew lz4/bzip2) and Windows (vcpkg)
   - Add `prebuild-install` support: publish prebuilt `.node` binaries for Electron 30.x ABI
3. UI polish:
   - Keyboard shortcuts: Space (play/pause), Left/Right arrows (seek 1s), +/- (speed)
   - Status bar: bag file name, total duration, message count
   - Error handling: user-friendly messages for unsupported bags, missing topics
4. Write performance benchmark:
   - Synthetic 500k-point PointCloud2 at 10 Hz, measure FPS over 100 frames
   - Assert mean FPS >= 30 (stretch target)

**Acceptance Criteria:**
- 500k points at 10 Hz renders at >= 30 FPS on mid-range GPU (stretch target; measured as mean FPS over 100 frames in benchmark)
- v1 baseline confirmed: 100k points at 10 Hz renders at >= 30 FPS (regression test)
- Native addon compiles on Linux, macOS, and Windows (verified by CI matrix)
- `prebuild-install` downloads prebuilt binary when available, falls back to source build
- Keyboard shortcuts work (Space, arrows, +/-)

---

### PR8: CI/CD and Release Pipeline

**Goal:** Every PR is automatically linted, tested, and built. Releases produce cross-platform Electron installers.

**Tasks:**
1. GitHub Actions workflow (`.github/workflows/ci.yml`):
   - Trigger on push and pull_request
   - Matrix: Ubuntu 22.04, macOS 13, Windows Server 2022
   - Steps: checkout, setup pnpm, install deps, lint, typecheck, build (including cmake-js), test
   - Cache: pnpm store, CMake build directory, turbo cache
2. GitHub Actions workflow (`.github/workflows/release.yml`):
   - Trigger on tag push (`v*`)
   - Build Electron app with `electron-builder` for Linux (AppImage, deb), macOS (dmg), Windows (nsis)
   - Upload artifacts to GitHub Release
   - Build and publish native addon prebuilds
3. Add `electron-builder` config to `apps/desktop/package.json`:
   - Include native addon in asar extraFiles
   - Configure code signing placeholders (macOS notarization, Windows Authenticode)
4. Add badge to README: CI status, latest release

**Acceptance Criteria:**
- CI passes on all three platforms for the full test suite (lint, typecheck, build, test all green)
- Release workflow produces downloadable installers for Linux, macOS, Windows
- Native addon prebuilds are uploaded as release assets
- CI run completes in under 15 minutes per platform

---

## Testing Strategy

| Layer | Tool | What It Covers |
|-------|------|----------------|
| C++ unit tests | Google Test | Bag format parsing, decompression, connection record extraction |
| Node.js unit tests | Jest | N-API bindings, message iteration, connection record access |
| Message deserializer tests | Jest | `.msg` parsing, binary deserialization, nested type resolution |
| Player-core unit tests | Jest | Playback state machine, timing, seek, speed |
| Renderer unit tests | Jest + jest-webgl-canvas-mock | Geometry construction, encoding conversion, buffer management |
| UI component tests | React Testing Library | Topic panel, controls, timeline interactions |
| Integration tests | Jest | Bag reader -> message deserializer -> playback engine -> renderer pipeline |
| E2E tests | Playwright + Electron | Open bag, play, verify viewport renders (screenshot comparison) |
| Performance tests | Custom benchmark harness | Point cloud FPS (100k baseline, 500k stretch), memory usage, large bag handling |
| Spike validation | Custom scripts | IPC throughput/latency, WASM decompression throughput |

---

## Success Criteria

1. A user can open a ROS1 bag file, see all topics listed, enable/disable them, and play back with timeline controls.
2. PointCloud2 data renders as a 3D colored point cloud at >= 30 FPS for 100k points (v1 baseline).
3. LaserScan, Odometry, and Image topics render correctly alongside point clouds, using typed deserialized data from `message-deserializer`.
4. The app runs on Linux, macOS, and Windows without requiring a ROS installation.
5. Every PR in the sequence has passing unit tests and CI.
6. The codebase is well-organized as a pnpm monorepo with clear package boundaries (6 packages + 1 app).
7. PR7 stretch target: 500k points at 30 FPS on a mid-range GPU.

---

## Key Technology Choices

| Choice | Selected | Rationale |
|--------|----------|-----------|
| Monorepo tool | pnpm workspaces + Turborepo | pnpm for efficient node_modules, turbo for incremental builds |
| C++ build | cmake-js + node-addon-api | Standard approach for Node.js native addons, cross-platform CMake |
| Bag parser | Custom standalone (Option A) | No ROS dependency, cross-platform, performant |
| Compression | Vendored LZ4 + system/vendored BZ2 | Required for bag chunk decompression |
| Message deserialization | `message-deserializer` package (evaluate `@foxglove/rosmsg` as parser backend) | Typed deserialization decoupled from bag reading and rendering |
| 3D rendering | Three.js | Mature, well-documented, large ecosystem |
| UI framework | React 18 | Standard for Electron renderer process |
| Electron | Pinned to 30.x (LTS) | Determines native addon ABI, SharedArrayBuffer headers, contextBridge behavior |
| State management | Zustand | Lightweight, no boilerplate, works well with React |
| Testing (TS) | Jest + React Testing Library | Standard, good TypeScript support |
| Testing (C++) | Google Test | Standard C++ unit testing |
| E2E | Playwright (Electron mode) | Modern, supports Electron natively |
| CI/CD | GitHub Actions | Native to GitHub, matrix builds for 3 platforms |
| Packaging | electron-builder | Mature, supports all target platforms and formats |

---

## Open Questions

See `.omc/plans/open-questions.md` for tracked items.
