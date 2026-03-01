# Release Notes

## v0.10.4.0

### New features
- **Performance metric** for the System action: select "Performance" in the metric dropdown to see plugin health at a glance — rolling 60-second tick AVG/MAX latency, Node.js CPU%, and heap memory usage, all rendered on a single key.
- **`perf.log` structured history**: a newline-delimited JSON file written every 30 seconds capturing tick latency, CPU%, and heap MB for post-hoc performance analysis. Located in the plugin bin folder alongside `debug.log`.

### Improvements
- **Per-disk graph history for Auto (Most Active)**: when auto-disk switches between drives, each disk now retains its own independent graph history. Switching back to a previously-active disk shows a full graph instead of starting from scratch. Inactive disks accumulate data in the background so they always have a complete 60-second graph ready.
- **Graph crawl-from-right**: new keys now start empty and fill from the right edge (like Windows Task Manager) instead of stretching sparse data across the full width.
- **Helper network optimization**: `NetworkInterface.GetAllNetworkInterfaces()` (the most expensive per-tick call in the .NET helper) is now cached for 60 seconds. Bandwidth counters still update every tick via `GetIPStatistics()` on cached adapter objects. Added `rescan_interfaces` command for on-demand re-enumeration when adapters change.
- Performance metric uses a 60-second rolling window for AVG and MAX, so startup spikes don't permanently inflate the display.
- **Atomic network history write**: `net-history.json` is now written to a temporary file first, then atomically renamed into place. If the Stream Deck process crashes mid-write, the previous valid file is preserved instead of being left with partial/corrupt JSON.
- **Reduced GC allocation in .NET helper**: `TopProcessSampler` and `MomentumHelper` now reuse dictionaries across ticks instead of allocating new collections each sample, reducing garbage collection pressure during every polling cycle.

## v0.10.1.1

Per-device actions refactor, network transfer fixes, and label improvements.

### Per-device actions
- **Six visible actions**: CPU, GPU, Memory, Disk, Network, System replace the single "Metric Display" action.
- **Per-device property inspectors**: each action opens a tailored PI with only the fields relevant to that device (no device dropdown).
- **Color-themed action icons**: each device has its own icon colored to match its graph style (cyan CPU, purple GPU, blue Memory, green Disk, pink Network, gold System).
- **Shared base class**: rendering engine (~1800 lines) lives in `BaseMetricAction`; each device action is a thin subclass overriding `getDeviceGroup()`.
- **Shared PI module**: `pi-common.js` provides settings management, device cache, and wiring utilities shared by all 6 property inspectors.
- **Removed all legacy actions and backward-compatibility code** (no migration needed for beta users).

### Network transfer fixes
- Fixed network total transfer (1H/24H) showing less than the 60S value after reboots or plugin restarts. Replaced dual cumulative-counter history with a cascading bucket design where longer periods literally include shorter ones, making 1H < 60S mathematically impossible.
- "Total" transfer now sums per-interface deltas instead of tracking a single cumulative counter, so a counter reset on one interface no longer causes a negative spike on the total.
- Network history persistence upgraded to version 2 format (old v1 files are discarded on first run — brief loss of historical totals for beta users).

### Label improvements
- Renamed network transfer period label from `NET 1M` to `NET 60S` to avoid ambiguity with "1 million" or "1 megabyte".

## v0.9.4.1

- Fixed network total transfer (1H/24H) showing dramatically less than 60s value after a PC reboot. Counter resets at reboot boundaries are now skipped instead of causing a fallback to only 60 seconds of data.

## v0.9.4.0

- Improved icon extraction fallback using QueryFullProcessImageName for processes where MainModule access is restricted.
- Graph fill now uses a vertical gradient (brighter near the line, fading toward the baseline) for added depth.
- GPU temperature now displays with degree symbol (e.g., 72°C instead of 72C).
- Network upload/download labels now include SVG arrow indicators (NET ↑ UP / NET ↓ DOWN) for faster at-a-glance recognition.
- Network metric dropdown now defaults to Download Rate first, since most users care about download speed.
- GB values (MEM USED, VRAM) now show one decimal place under 100GB (e.g., 16.3GB) and round above (e.g., 128GB).
- Top-mem formatting now reuses shared GB formatter (decimal capped at 100GB+).
- Unit suffixes (%, GB, Mbps, etc.) now render at a smaller font size than the numeric value for cleaner visual hierarchy.
- Top-process keys now use a fixed 13pt value font for consistent icon alignment.
- Process icon refined: smaller size and vertically centered with the value text.
- Graph edges now fade to transparent with an ease-out curve, dissolving into the key background instead of a hard cut-off.
- Graph area extended nearly edge-to-edge for a wider, more immersive look.