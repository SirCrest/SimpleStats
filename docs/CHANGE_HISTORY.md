# Change History

## v0.12.0.0 (2026-03-07)

- Fixed property inspector metric selection propagation for Stream Deck `sdpi-*` controls: selecting GPU metrics such as `gpu-encoder` now reaches the action again instead of leaving the key on the old metric
- Updated shared PI wiring to attach a single `change` listener to the inner native form control (`input` / `select` / `textarea`) instead of the custom element host
- Added a bounded retry when Stream Deck custom control shadow DOM is not ready on the first frame, preserving the single-writer PI design without reintroducing duplicate settings writes
- Removed GPU Throttle Status metric from PI dropdown (was already absent from plugin code)
- Reorganized all PI metric dropdowns: logical grouping with disabled-option separators between basic and advanced metrics
- Renamed GPU PI metrics for consistency: "VRAM (%)", "VRAM (GB)", "Temperature", "Encoder (%)", "Decoder (%)", "Core Clock (MHz)", "VRAM Clock (Effective MHz)", "Fan Speed (%)"
- Renamed CPU PI metrics: "Usage (Per-Core)", "Usage (Peak Core)"; moved Top Process above Clock Frequency
- Renamed Memory PI: "Usage (%)" (dropped "Total"); added separator before top-process metrics
- Renamed Disk PI: "Used (%)", "Free (%)", "Read (MB/s)", "Write (MB/s)"; added separator before Top Process
- Renamed Network PI: "Download (Mbps)", "Upload (Mbps)"
- Added GPU temperature unit toggle (°C / °F) as a segmented button control; graph history persists across unit switches
- Added segmented button group CSS component (`.btn-group`) for use across all PIs
- Replaced Network transfer period dropdown with 3-way segmented button toggle (60s / 1h / 24h)
- `setOptions()` in pi-common.js now supports `{ separator: true }` entries rendered as disabled options
- GPU clock display now always shows GHz (no more switching between MHz and GHz)
- CPU Peak Core label now shows which core is hottest (e.g. `PEAK: C7`)
- Fixed graph history reset when switching temperature unit: `tempUnit` is a display-only setting excluded from the history cache key

## v0.11.2.0 (2026-03-06)

- Fixed settings feedback loop: `saveDeviceCacheToSettings()` now compares new device cache against existing via `JSON.stringify` and skips `setSettings()` when unchanged, breaking the PI ↔ plugin `didReceiveSettings` cycle
- Fixed helper exit misclassification: exit code `0x40010004` (STATUS_LOG_HARD_ERROR from system sleep/logoff) is now treated as an expected exit, avoiding unnecessary backoff/retry
- Added `"system-exit"` to `StopReason` type in stats.ts
- Fixed property inspector metric reverts: GPU and other PI metric changes no longer bounce between old/new values due to overlapping SDK auto-binding and manual settings writes
- Removed `setting="..."` auto-binding from manually managed PI controls and simplified shared PI wiring to a single host-level `change` listener
- Advanced GPU metrics now show `N/A` instead of `--` when the GPU is present but the current driver/GPU does not expose that NVML field

## v0.11.0.0 (2026-03-02)

- Added CPU Clock Frequency metric (`cpu-freq`): average MHz across all cores via `CallNtPowerInformation`, displayed as GHz/MHz with auto-scaling graph
- Added GPU Clock metric (`gpu-clock`): graphics core clock MHz via `nvmlDeviceGetClockInfo`
- Added GPU Memory Clock metric (`gpu-mem-clock`): VRAM clock MHz via `nvmlDeviceGetClockInfo`
- Added GPU Encoder metric (`gpu-encoder`): NVENC utilization % via `nvmlDeviceGetEncoderUtilization`
- Added GPU Decoder metric (`gpu-decoder`): NVDEC utilization % via `nvmlDeviceGetDecoderUtilization`
- Added GPU Fan Speed metric (`gpu-fan`): fan % via `nvmlDeviceGetFanSpeed`
- Added GPU PCIe Download/Upload metrics (`gpu-pcie-rx`, `gpu-pcie-tx`): bus throughput in KB/s via `nvmlDeviceGetPcieThroughput`, formatted as MB/s or GB/s
- Added GPU Throttle Status metric (`gpu-throttle`): reads clocks throttle reasons bitmask, displays highest-priority reason (HW THERM, HW PWR, SW THERM, PWR CAP, HW SLOW, SYNC, or NONE)
- All 6 new NVML calls wrapped with `EntryPointNotFoundException` guards for older driver compatibility
- Extended `CpuPayload` record with `frequencyMhz` field
- Extended `GpuItem` record with 8 new nullable fields
- Updated GPU and CPU property inspectors with new metric entries
- Encoder, decoder, and fan speed added to `PERCENT_METRICS` for alert threshold support
- Removed polling interval selector (1–5 sec) from all 6 property inspectors; hardcoded to 1-second cadence
- Removed `pollIntervalSec` from `NormalizedSettings`, `DEFAULT_SETTINGS`, `settingsKey()`, and `normalizeSettings()` in base-metric.ts
- Removed `handlePollIntervalChange()`, `clampPollInterval()`, and poll-interval wiring from pi-common.js
- Old saved `pollIntervalSec` values in Settings are silently ignored (field kept in input type for compatibility)

## v0.10.4.0 (2026-02-28)

- Per-disk graph history for Auto (Most Active): each disk retains its own graph history independently; switching drives no longer clears the graph, and inactive disks accumulate data in the background
- Added Performance metric to System action — displays rolling 60s tick AVG/MAX, Node.js CPU%, and heap MB on the key
- Added `perf.log` structured history file (NDJSON, one entry per 30s interval) for post-hoc performance analysis
- Performance key uses 60-second rolling window for AVG and MAX instead of lifetime aggregates, so startup spikes don't dominate
- Cached `NetworkInterface.GetAllNetworkInterfaces()` in .NET helper — adapter enumeration now runs every 60s instead of every tick, reducing kernel CPU overhead (~50% of helper CPU)
- Added `rescan_interfaces` stdin command to .NET helper for on-demand network adapter re-enumeration
- Graph crawl-from-right: new keys start empty and fill from the right edge like Windows Task Manager, instead of stretching sparse data across the full width
- Atomic network history write: `net-history.json` is now written to a `.tmp` file first, then renamed over the real file, preventing corruption if the process crashes mid-write
- Reduced GC pressure in .NET helper: `TopProcessSampler` and `MomentumHelper` now reuse dictionaries across ticks instead of allocating new ones each sample

## v0.10.3.1 (2026-02-27)

- Fixed subscription leak when rapidly switching Stream Deck pages — repeated `willAppear` without `willDisappear` no longer leaks poller subscriptions
- Graph data now right-aligned: newest point always at right edge, line grows from left as history fills

## v0.10.3.0 (2026-02-24)

- Always-on background graph history: graph data now kept alive for 8 hours instead of 60 seconds after a key leaves the screen
- Returning to any stats page after a long absence now shows a fully populated graph instead of resetting to zero
- `SimpleStatsHelper.exe` stays running during extended off-screen periods, eliminating cold-start delays on return

## v0.10.2.1 (2026-02-24)

- Top-process keys (TOP CPU, TOP MEM, TOP DISK, GPU TOP COMPUTE): process icon now displayed as large 40×40 faded background watermark (40% opacity) centered behind the process name
- Process icon extraction bumped from 24×24 to 48×48 for sharper rendering at display size
- Process name text now rendered with a black outline (4-copy offset technique) for legibility over the icon background

## v0.10.2.0 (2026-02-24)

- Removed redundant Per-Core checkbox from CPU property inspector; metric dropdown now directly controls core stepper visibility
- Fixed `normalizeSettings()`: explicit `cpu-core`/`cpu-total` metric values no longer silently overridden by `cpuPerCore` flag
- Fixed disk/GPU/network dropdowns snapping to first item after rescan — selection now preserved from current settings
- Fixed `populateSelect` to explicitly set `""` (Auto) value so Auto selection is driven by value, not browser default
- Added "Top Process (I/O)" metric to Disk action: shows process icon, name, and MB/s for the highest disk I/O process
- Added "Auto (Most Active)" disk selection option — all disk metrics can now auto-select the busiest drive
- Idle threshold for top-disk: hides display when top process is below a configurable MB/s floor
- Fixed CPU % summing to aggregate across same-named processes (matches Task Manager multi-instance behavior)
- Added top-disk process data (name, bps, hasIcon) to disk debug snapshot log

## v0.10.1.1 (2026-02-22)

- Refactored single "Metric Display" action into 6 per-device actions (CPU, GPU, Memory, Disk, Network, System)
- Removed device dropdown — each action is fixed to its device group
- Extracted BaseMetricAction base class with rendering engine; 6 thin subclasses override getDeviceGroup()
- Created 6 per-device property inspectors (HTML + JS) sharing pi-common.js module
- Generated color-themed action icons per device using GROUP_STYLE colors
- Removed all legacy action classes and backward-compatibility code
- Fixed network total transfer (1H/24H) showing less than 60s after PC reboot
- Renamed network transfer period label from `NET 1M` to `NET 60S`

## v0.9.4.1 (2026-02-21)

- Fixed network total transfer (1H/24H) showing dramatically less than 60s value after a PC reboot. Counter resets at reboot boundaries are now skipped instead of causing a fallback to only 60 seconds of data.

## v0.9.4.0

- Improved icon extraction fallback using QueryFullProcessImageName for processes where MainModule access is restricted
- Graph fill now uses a vertical gradient (brighter near the line, fading toward the baseline) for added depth
- GPU temperature now displays with degree symbol (e.g., 72°C instead of 72C)
- Network upload/download labels now include SVG arrow indicators (NET ↑ UP / NET ↓ DOWN)
- Network metric dropdown now defaults to Download Rate first
- GB values (MEM USED, VRAM) now show one decimal place under 100GB
- Unit suffixes (%, GB, Mbps, etc.) now render at a smaller font size than the numeric value
- Top-process keys now use a fixed 13pt value font for consistent icon alignment
- Process icon refined: smaller size and vertically centered with the value text
- Graph edges now fade to transparent with an ease-out curve
- Graph area extended nearly edge-to-edge for a wider, more immersive look

## v0.9.3.0 (2026-02-06)

- Removed gpu-top-vram metric (not feasible on Windows NVML)
- Added top-mem-pct metric (% of total RAM used by top process)
- Added process icon extraction to .NET helper (System.Drawing.Common)
- Redesigned top-process keys: icon + separate value/name layout, no graph
- GPU metrics now include power (W) and top compute process (%)

## v0.9.0.0 (2026-02-03)

- Refactored to a single configurable action with per-key settings
- Added property inspector using sdpi-components and device selectors
- Added per-core CPU, GPU VRAM, disk throughput, and network transfer windows
- Added per-key polling interval (1-5 seconds) and a Clock metric for validation
- Persisted network total history locally to survive Stream Deck restarts
- Matched disk utilization to Task Manager active time (per-drive when available)
- Added CPU per-core stepper with max thread cap from the system
- Added PI footnotes for total transfer tracking and disk space cadence
- Replaced ASCII sparklines with colored SVG graphs (smoothed line, 1px stroke, dim fill, left-aligned labels)
- Added graph scaling rules (fixed percent scales, VRAM/MEM use total GB, GPU temp 20-100C, net min scale)
- Updated labels/units (CPU TOTAL, GPU TEMP, NET UP/DOWN, disk labels with drive letters, MB/s, Mbps, 24H)
- Clamped disk activity to 0-100% and aligned disk metrics to Task Manager
- Added background history continuation across page switches (60s TTL)
- Added .NET helper for fast Windows CPU/Disk/Network sampling (no per-tick PowerShell)
- Switched polling to async per-group cadence so slow sources don't block ticks
- Added process CPU/memory usage to perf logs for real CPU impact
