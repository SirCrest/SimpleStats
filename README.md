# SimpleStats for Stream Deck

SimpleStats turns your Stream Deck keys into live system monitors for Windows, styled like compact Task Manager tiles.
Six dedicated actions — CPU, GPU, Memory, Disk, Network, and System — each with their own property inspector, so you can drag exactly what you need onto any key and configure it in seconds.

![SimpleStats preview](docs/images/simplestats-preview.png)

## What You Get
- Live stat tiles with a mini trend graph per key (60s history, Task Manager-style crawl-from-right fill).
- Six dedicated actions — one per device group — with color-themed icons.
- Per-device selectors (GPU, disk, network interface) where relevant.
- Alert threshold for percent-based metrics (highlights in red when exceeded).
- Idle threshold for top-process metrics (shows `IDLE` below your floor to reduce noise).
- Top-process views with process name and large watermark app icon.
- Always-on background history: graph data kept alive for 8 hours across page switches.

## Quick Start
1. Install the plugin (`.streamDeckPlugin`) from the [latest release](../../releases/latest).
2. In Stream Deck, drag one of the six **SimpleStats** actions onto a key:
   - **CPU**, **GPU**, **Memory**, **Disk**, **Network**, or **System**
3. Open the Property Inspector and pick a metric.

## Configure A Key
1. **Metric** — Choose the specific metric for that device group.

2. **Source Selector** (shown when needed)
   `CPU`: optional per-core mode + core number picker.
   `GPU`: GPU dropdown (multi-GPU systems).
   `Disk`: disk dropdown + rescan button, or "Auto (Most Active)" to follow the busiest drive.
   `Network`: interface dropdown + rescan button, or "All" for aggregate.

3. **Alert %** (percent metrics only) — Set a threshold to highlight high usage in red.

4. **Idle below** (top-process metrics only) — Show `IDLE` when activity is below your chosen threshold.

## Metrics By Group

### CPU
- `Total Usage`
- `Usage (Per-Core)` (select core)
- `Usage (Peak Core)` — shows which core is hottest
- `Top Process (CPU)`
- `Clock Frequency` (average GHz)

### GPU (NVIDIA, via NVML)
- `Core Usage`
- `VRAM (%)`
- `VRAM (GB)`
- `Temperature` — toggle °C / °F
- `Power (W)`
- `Top Process (Compute)`
- `Encoder (%)`
- `Decoder (%)`
- `PCIe Download`
- `PCIe Upload`
- `Core Clock (MHz)`
- `VRAM Clock (Effective MHz)`
- `Fan Speed (%)`

### Memory
- `Usage (%)`
- `Used (GB)`
- `Top Process (GB)`
- `Top Process (%)`

### Disk
- `Utilization (Active)` — per-drive active time
- `Used (%)`
- `Free (%)`
- `Read (MB/s)`
- `Write (MB/s)`
- `Top Process (I/O)`

Disk supports "Auto (Most Active)" to automatically follow the busiest drive, with independent graph history per disk.

### Network
- `Download (Mbps)`
- `Upload (Mbps)`
- `Total Transfer` — toggle `60s` / `1h` / `24h`

### System
- `Clock (HH:MM:SS)`
- `Performance` (rolling 60s tick stats, CPU%, heap — for plugin diagnostics)

## Niche Features
- **Top-process mode**: CPU, memory, GPU compute, and disk I/O metrics show the top process name with a large faded app icon watermark.
- **Idle gating**: top-process metrics display `IDLE` below your threshold to cut noise.
- **Transfer windows**: network totals support 60s / 1h / 24h rollups, per-interface or all.
- **Auto disk selection**: "Auto (Most Active)" follows the busiest drive with per-disk graph history.
- **Disk space cadence**: `% Used` and `% Free` refresh on a slower cycle (~60s) since capacity changes slowly.
- **Interface hygiene**: loopback and internal adapters are filtered from network interface choices.
- **Graph fill gradient**: vertical gradient that's brighter near the line and fades toward the baseline.
- **N/A for unsupported GPU fields**: advanced GPU metrics show `N/A` when the driver doesn't expose a field, instead of `--`.
- **Network history persistence**: total transfer history survives Stream Deck restarts (minute-resolution, 24h).

## Compatibility
- Windows `10` or newer (minimum Windows 10 build `10240`)
- Stream Deck `6.9+`
- NVIDIA GPU required for GPU metrics (NVML-compatible drivers)

If Windows is below the required version, keys show `WIN10+ REQ`.

## Notes
- All keys update at a 1-second cadence.
- Network transfer totals are only recorded while the Stream Deck app/plugin is running.
- Metrics show `--` when data is temporarily unavailable.
- Network totals can show `0B` until at least two samples exist for the selected window.
- Graph history resets if the Stream Deck app is fully closed.
