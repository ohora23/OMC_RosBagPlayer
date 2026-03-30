# Open Questions

## rosbag-player-v1 - 2026-03-25

### Resolved by architect/critic review (2026-03-25)

- [x] **Test fixture bag file source** -- Resolved: use `rosbag` Python pip package (`pip install rosbag`), no full ROS installation needed. Script at `test/fixtures/generate_fixture.py`, committed fixture ~1MB.
- [x] **TF transform handling scope** -- Resolved: v1 renders all data in a single user-selected reference frame (default: first frame seen in `/tf` topic). TF frames extracted once at bag load time. Dynamic transform interpolation deferred to v2. Frame selector dropdown in UI.
- [x] **Electron IPC vs Worker Thread for bag reading** -- Resolved: PR2 includes an IPC spike with measurable pass/fail threshold (8MB buffer, >= 30 transfers/sec, p99 < 5ms). Result determines contextBridge vs SharedArrayBuffer+MessagePort for PR6.
- [x] **Prebuild electron ABI matrix** -- Resolved: Electron pinned to 30.x (LTS) in PR1. Prebuilds target Electron 30.x ABI only for v1.

### Still open

- [ ] **Bayer debayering quality** -- Is nearest-neighbor debayer acceptable for v1, or should we use bilinear? Nearest is simpler but produces visible artifacts. Current plan says "best-effort" for bayer.
- [ ] **Point cloud colormap selection** -- Should the user be able to choose colormaps (viridis, turbo, jet, etc.) in v1, or is a single default colormap sufficient? PR4 mentions "support point size and colormap selection" but no acceptance criteria for how many colormaps.
- [ ] **Large bag file streaming strategy** -- For bags >1GB, should we memory-map the file or stream chunks? Memory mapping is faster but has platform differences. PR6 acceptance criteria says "no crashes on bags up to 1GB" but does not specify the I/O strategy.
- [ ] **Code signing certificates** -- Are macOS/Windows code signing certificates available for the release pipeline, or should PR8 leave signing as a placeholder?
- [ ] **@foxglove/rosmsg evaluation** -- PR2.5 depends on evaluating whether `@foxglove/rosmsg` covers the `.msg` parsing use case. This decision cannot be made until PR2.5 implementation begins. If it does not cover nested definitions adequately, a custom parser must be written.
- [ ] **WASM spike outcome** -- PR2 WASM spike is optional and timeboxed. If it passes, the entire C++ addon architecture changes to TypeScript + WASM. This is a high-impact decision that would require revising PRs 2, 2.5, 3, 6, and 7.
