# SimpleStats

Stream Deck plugin for real-time Windows system performance monitoring with Task Manager-style metrics.

> **Multi-agent repo:** See `AGENTS.md` for active work by each agent and coordination rules.

## Project Vision

- Hardware integration: persistent system stats on Stream Deck keys
- Real-time monitoring with per-device cadence and low-latency updates
- Windows 10+: modern APIs for accurate Task Manager metrics
- Resource efficient: lazy polling only when keys are visible

## Feature Summary

Six per-device actions (CPU, GPU, Memory, Disk, Network, System) that display system metrics with inline graphs and per-device property inspectors.

### Current Features

- Six actions: CPU, GPU, Memory, Disk, Network, System (one per device category)
- Metric selection per device (see list below)
- Graph-based SVG rendering: 60s history, smoothed 1px line, dim fill, per-device colors
- Text optimized for keys (left-aligned labels/values, reduced sizes for more graph space)
- Per-key render interval (1-5 seconds) with async per-group polling/caches so slow sources don't block fast updates
- Network total history persists locally across Stream Deck restarts (minute resolution for 24h)
- History persists across page switches (background tracking for 60s TTL)
- Null-safe formatting (preserves last values on failures)
- Smart defaults for device selection (GPU 0, C: drive, all network interfaces)
- CPU per-core stepper with max core count from the system
- Windows 10 Build 10240+ required (shows "WIN10+ REQ" on older versions)
- Alert threshold color: optional single threshold (red) for percent-based metrics

### Metrics Supported

CPU
- Total usage
- Per-core usage (select core)
- Peak core (highest core load)
- Top process (CPU %)

GPU (via NVML)
- Core usage
- VRAM usage (%)
- VRAM used (GB)
- Temperature
- Power (W)
- Top compute process (%)

Memory
- Total usage (%)
- Used (GB)
- Top process (GB)
- Top process (%)

Disk
- Utilization / Active time (per selected drive)
- % Filled (select drive)
- % Free (select drive)
- Read throughput (MB/s)
- Write throughput (MB/s)
- Top process (I/O MB/s)

Network
- Upload rate (Mbps, per interface or total)
- Download rate (Mbps, per interface or total)
- Total transfer over a period (Last 60 seconds / Last hour / Last 24 hours)

System
- Clock (HH:MM:SS)

## Property Inspectors

- Six per-device property inspectors (no device dropdown needed)
- Shared common JS module (`pi-common.js`) and CSS (`pi-common.css`)
- Built with sdpi-components
- Metric dropdown per device
- Polling interval selector (1-5 seconds)
- Conditional fields for device selection (CPU core, GPU, Disk, Interface)
- CPU per-core stepper controls
- Transfer period selector for network totals (Last 60 seconds / Last hour / Last 24 hours)
- Disk space note: "Disk space updates every 60 seconds."
- Footnote shown for total transfer: "Totals are recorded only when the Stream Deck app is active."
- Light text styling for the dark Stream Deck UI

## Tech Stack

- TypeScript 5.x / Node.js 20+
- Stream Deck SDK 2.0 (decorator-based API)
- .NET 8 helper (SimpleStatsHelper.exe) for CPU/Disk/Network metrics, NVML for GPU metrics, and System.Drawing.Common for process icon extraction
- Rollup 4.x (bundler with watch mode)

## Project Structure

```
SimpleStats/
  src/
    actions/
      base-metric.ts       # Shared base class with rendering engine (~1800 lines)
      cpu.ts               # CPU action subclass
      gpu.ts               # GPU action subclass
      memory.ts            # Memory action subclass
      disk.ts              # Disk action subclass
      network.ts           # Network action subclass
      system.ts            # System action subclass
    index.ts               # Plugin entry point, registers 6 actions
    stats.ts               # Polling service + history (CPU, GPU, disk, network)
  com.crest.simplestats.sdPlugin/
    bin/
      plugin.js            # Compiled bundle
      plugin.js.map        # Source maps
      SimpleStatsHelper.exe # .NET helper for Windows metrics + GPU + icons
    imgs/
      actions/
        cpu.png            # Per-device color-themed action icons
        gpu.png
        memory.png
        disk.png
        network.png
        system.png
      plugin/
        icon.png
        category.png
    ui/
      pi-common.js         # Shared PI logic (settings, wiring, device cache)
      pi-common.css        # Shared PI styles
      pi-cpu.html + .js    # CPU property inspector
      pi-gpu.html + .js    # GPU property inspector
      pi-memory.html + .js # Memory property inspector
      pi-disk.html + .js   # Disk property inspector
      pi-network.html + .js # Network property inspector
      pi-system.html + .js # System property inspector
      sdpi-components.js
    manifest.json
  native/
    SimpleStatsHelper/
      Program.cs             # All samplers (CPU, Disk, Network, GPU/NVML, icons)
      SimpleStatsHelper.csproj
  package.json
  tsconfig.json
  rollup.config.mjs
```

## Architecture Notes

- Six per-device actions (CPU, GPU, Memory, Disk, Network, System) inherit from BaseMetricAction.
- Each subclass overrides `getDeviceGroup()` to fix the device group, eliminating the device dropdown.
- StatsPoller is a singleton with lazy start/stop based on visible actions.
- Each visible key subscribes to the poller and renders label + value + graph (top-process keys use icon + name layout instead of graph).
- Property inspectors are per-device HTML+JS files sharing a common module (`pi-common.js`).
- Device lists (CPU cores, GPUs, disks, network interfaces) are populated on demand.
- Polling is metric-aware and per-group: CPU/memory update together, GPU/disk/network on their own cadences.
- Polling is async and cached so slow sources don’t block fast renders.
- Disk space cache is 60s; GPU cache is 1s; network stats cache is 2s; network interface cache is 1h.
- History is cached per action and can be continued in the background for 60s when switching pages.
- .NET helper provides process icons cached by process name (24x24 PNG, base64-encoded).
- Performance profiling logs are emitted to `debug.log` when ticks are slow or on interval, including process CPU/memory.

## Development Workflow

- npm install
- npm run build
- npm run watch (auto-rebuild + plugin restart)
- npm run package:release (build + helper publish + `.streamDeckPlugin` package in `dist/`)

## Release Packaging Rule

- Every GitHub release must include a packaged `.streamDeckPlugin` asset.
- Automation: `.github/workflows/release-package.yml` runs on published releases, builds the plugin, packages it, and uploads `dist/*.streamDeckPlugin` to the release.
- Manual fallback: `npm run package:release` then `gh release upload <tag> dist/<asset>.streamDeckPlugin --clobber`.

## Version Proposal Workflow

### Requirement

- For any task that modifies repo-tracked files, include a `Version Proposal` block at the end of the response.
- Do not apply version edits automatically unless the user explicitly pre-authorized auto-apply.
- If the task is read-only (no repo-tracked file changes), skip the version proposal.

### Baseline Analysis Commands

- `git describe --tags --abbrev=0`
- `git log --oneline <base>..HEAD`
- `git diff --name-status <base>..HEAD`

### Required Version Proposal Block

Use this exact field set:

```md
## Version Proposal
- Baseline: <tag-or-no-tag>
- Recommended Version: <x.y.z.w>
- Bump Type: <major|minor|patch|build>
- Impact Score (1-10): <n>
- Why: <short rationale>
- Alternatives:
  - Conservative: <x.y.z.w + rationale>
  - Aggressive: <x.y.z.w + rationale>
- Decision Options:
  1. Accept recommended
  2. Propose another
  3. Custom version: x.y.z.w
```

The full proposal should also include:

- Commit range from baseline
- Changed-file summary
- User-visible additions list
- Behavior/correctness fixes list

### Decision Handling

- Accept:
  - Apply version updates to `package.json` and `manifest.json`
  - Report exact file changes
- Propose another:
  - Generate a revised proposal with updated rationale
- Custom:
  - Validate and apply user-specified `x.y.z.w`
  - Report exact file changes

## Known Limitations

- Network total transfer persists locally, but after long downtime totals may show `0B` until enough new samples are collected.
- Disk read/write throughput uses per-drive counters on Windows when available; falls back to totals if unavailable.
- GPU metrics require NVIDIA GPU with NVML-compatible drivers; non-NVIDIA GPUs are not supported.
- Graph history resets if the Stream Deck app is closed.

## Planned Enhancements

- Network totals during long Stream Deck downtime: investigate OS-level usage history or an optional background helper/service.

## Recent Changes (2026-02-24) — v0.10.3.0

- Always-on background graph history: graph data now kept alive for 8 hours instead of 60 seconds after a key leaves the screen
- Returning to any stats page after a long absence now shows a fully populated graph instead of resetting to zero
- `SimpleStatsHelper.exe` stays running during extended off-screen periods, eliminating cold-start delays on return

## Changes (2026-02-24) — v0.10.2.1

- Top-process keys (TOP CPU, TOP MEM, TOP DISK, GPU TOP COMPUTE): process icon now displayed as large 40×40 faded background watermark (40% opacity) centered behind the process name
- Process icon extraction bumped from 24×24 to 48×48 for sharper rendering at display size
- Process name text now rendered with a black outline (4-copy offset technique) for legibility over the icon background

## Changes (2026-02-24) — v0.10.2.0

- Removed redundant Per-Core checkbox from CPU property inspector; metric dropdown now directly controls core stepper visibility
- Fixed `normalizeSettings()`: explicit `cpu-core`/`cpu-total` metric values no longer silently overridden by `cpuPerCore` flag
- Fixed disk/GPU/network dropdowns snapping to first item after rescan — selection now preserved from current settings
- Fixed `populateSelect` to explicitly set `""` (Auto) value so Auto selection is driven by value, not browser default

## Changes (2026-02-24)

- Added "Top Process (I/O)" metric to Disk action: shows process icon, name, and MB/s for the highest disk I/O process
- Added "Auto (Most Active)" disk selection option — all disk metrics can now auto-select the busiest drive
- Idle threshold for top-disk: hides display when top process is below a configurable MB/s floor
- Fixed CPU % summing to aggregate across same-named processes (matches Task Manager multi-instance behavior)
- Added top-disk process data (name, bps, hasIcon) to disk debug snapshot log

## Changes (2026-02-22)

- Refactored single "Metric Display" action into 6 per-device actions (CPU, GPU, Memory, Disk, Network, System)
- Removed device dropdown — each action is fixed to its device group
- Extracted BaseMetricAction base class with rendering engine; 6 thin subclasses override getDeviceGroup()
- Created 6 per-device property inspectors (HTML + JS) sharing pi-common.js module
- Generated color-themed action icons per device using GROUP_STYLE colors
- Removed all legacy action classes and backward-compatibility code

## Changes (2026-02-21)

- Fixed network total transfer (1H/24H) showing less than 60s after PC reboot. Replaced single end-start delta with sum-of-positive-consecutive-deltas to skip counter resets at reboot boundaries.

## Changes (2026-02-06)

- Removed gpu-top-vram metric (not feasible on Windows NVML)
- Added top-mem-pct metric (% of total RAM used by top process)
- Added process icon extraction to .NET helper (System.Drawing.Common)
- Redesigned top-process keys: icon + separate value/name layout, no graph
- GPU metrics now include power (W) and top compute process (%)

## Changes (2026-02-03)

- Refactored to a single configurable action with per-key settings.
- Added property inspector using sdpi-components and device selectors.
- Added per-core CPU, GPU VRAM, disk throughput, and network transfer windows.
- Added per-key polling interval (1-5 seconds) and a Clock metric for validation.
- Persisted network total history locally to survive Stream Deck restarts.
- Matched disk utilization to Task Manager active time (per-drive when available).
- Added CPU per-core stepper with max thread cap from the system.
- Added PI footnotes for total transfer tracking and disk space cadence.
- Replaced ASCII sparklines with colored SVG graphs (smoothed line, 1px stroke, dim fill, left-aligned labels).
- Added graph scaling rules (fixed percent scales, VRAM/MEM use total GB, GPU temp 20-100C, net min scale).
- Updated labels/units (CPU TOTAL, GPU TEMP, NET UP/DOWN, disk labels with drive letters, MB/s, Mbps, 24H).
- Clamped disk activity to 0-100% and aligned disk metrics to Task Manager.
- Added background history continuation across page switches (60s TTL).
- Added .NET helper for fast Windows CPU/Disk/Network sampling (no per-tick PowerShell).
- Switched polling to async per-group cadence so slow sources don’t block ticks.
- Added process CPU/memory usage to perf logs for real CPU impact.
