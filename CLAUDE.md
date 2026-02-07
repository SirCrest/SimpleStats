# SimpleStats

Stream Deck plugin for real-time Windows system performance monitoring with Task Manager-style metrics.

## Project Vision

- Hardware integration: persistent system stats on Stream Deck keys
- Real-time monitoring with per-device cadence and low-latency updates
- Windows 10+: modern APIs for accurate Task Manager metrics
- Resource efficient: lazy polling only when keys are visible

## Feature Summary

Single configurable action that displays system metrics with inline graphs and a property inspector for selection.

### Current Features

- One action: "Metric Display" with per-key settings
- Device selection: CPU, GPU, Memory, Disk, Network, System
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
- Alert threshold colors: optional warning (amber) and critical (red) thresholds for percent-based metrics

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

Network
- Upload rate (Mbps, per interface or total)
- Download rate (Mbps, per interface or total)
- Total transfer over a period (Last 60 seconds / Last 60 minutes / Last 24 hours)

System
- Clock (HH:MM:SS)

## Property Inspector

- Built with sdpi-components
- Device + metric dropdowns
- Polling interval selector (1-5 seconds)
- Conditional fields for device selection (CPU core, GPU, Disk, Interface)
- CPU per-core stepper controls
- Transfer period selector for network totals (Last 60 seconds / Last 60 minutes / Last 24 hours)
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
      metric.ts            # Single configurable action + sparklines
    index.ts               # Plugin entry point, registers the action
    stats.ts               # Polling service + history (CPU, GPU, disk, network)
  com.crest.simplestats.sdPlugin/
    bin/
      plugin.js            # Compiled bundle
      plugin.js.map        # Source maps
      SimpleStatsHelper.exe # .NET helper for Windows metrics + GPU + icons
    imgs/
      actions/
        metric.png         # Action icon
      plugin/
        icon.png
        category.png
    ui/
      property-inspector.html
      property-inspector.js
      property-inspector.css
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

- StatsPoller is a singleton with lazy start/stop based on visible actions.
- Each visible key subscribes to the poller and renders label + value + graph (top-process keys use icon + name layout instead of graph).
- Property inspector uses Stream Deck settings to persist per-key configuration.
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

## Known Limitations

- Network total transfer persists locally, but if Stream Deck is closed longer than the selected window, totals show as -- until enough new samples are collected.
- Disk read/write throughput uses per-drive counters on Windows when available; falls back to totals if unavailable.
- GPU metrics require NVIDIA GPU with NVML-compatible drivers; non-NVIDIA GPUs are not supported.
- Graph history resets if the Stream Deck app is closed.

## Planned Enhancements

- Network totals during long Stream Deck downtime: investigate OS-level usage history or an optional background helper/service.

## Recent Changes (2026-02-06)

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
