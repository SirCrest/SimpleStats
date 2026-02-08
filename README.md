# SimpleStats for Stream Deck

SimpleStats turns your Stream Deck keys into live system monitors for Windows, styled like compact Task Manager tiles.  
You can mix CPU, GPU, memory, disk, network, and clock tiles across pages, then tune each key for exactly what you care about.

![SimpleStats preview](docs/images/simplestats-preview.png)

## What You Get
- Live stat tiles with a mini trend graph per key.
- One flexible action (`Metric Display`) that can show many metric types.
- Per-device selectors (GPU, disk, and network interface) where relevant.
- Alert and idle thresholds for quick visual attention.
- Top-process views with process name and icon for quick attribution.

## Quick Start
1. Install the plugin (`.streamDeckPlugin`) from this repo/release.
2. In Stream Deck, drag **SimpleStats -> Metric Display** onto a key.
3. Open the Property Inspector and configure it using the flow below.

## Configure A Key (In Order)
1. `Device`
Select the metric group: `CPU`, `GPU`, `Memory`, `Disk`, `Network`, or `System`.

2. `Metric`
Choose the specific metric inside that group.

3. `Source Selector` (shown when needed)
`CPU`: optional per-core mode + core number picker.  
`GPU`: GPU dropdown.  
`Disk`: disk dropdown + rescan button.  
`Network`: interface dropdown + rescan button.

4. `Polling`
Set update speed from `1` to `5` seconds (when applicable).

5. `Alert %` (percent metrics only)
Set a threshold to highlight high usage.

6. `Idle below` (top-process metrics only)
Show `IDLE` when top-process activity is below your chosen threshold.

## Metrics By Group

### CPU
- `Total Usage`
- `Per-Core Usage`
- `Peak Core`
- `Top Process (CPU)`

### GPU
- `Core Usage`
- `VRAM Usage (%)`
- `VRAM Used (GB)`
- `Temperature (C)`
- `Power (W)`
- `Top Process (Compute)`

### Memory
- `Total Usage (%)`
- `Used (GB)`
- `Top Process (GB)`
- `Top Process (%)`

### Disk
- `Utilization (Active)`
- `% Used`
- `% Free`
- `Read Throughput (MB/s)`
- `Write Throughput (MB/s)`

### Network
- `Upload Rate (Mbps)`
- `Download Rate (Mbps)`
- `Total Transfer` over last `60 seconds`, `hour`, or `24 hours`

### System
- `Clock (HH:MM:SS)`

## Niche Features (Useful In Real Use)
- `Top-process mode`: top CPU/memory/GPU-compute metrics can show process name and app icon.
- `Idle gating`: top-process metrics can intentionally display `IDLE` below your threshold to reduce noise.
- `Transfer windows`: network totals support 1m/1h/24h rollups and can target a single interface or all interfaces.
- `Disk space cadence`: `% Used` and `% Free` are refreshed on a slower cycle (about 60s), since capacity changes slowly.
- `Interface hygiene`: loopback/internal adapters are filtered from network interface choices.
- `Legacy key safety`: old SimpleStats actions are still recognized so existing profiles keep working.

## Compatibility
- Windows `10` or newer (minimum Windows 10 build `10240`)
- Stream Deck `6.9+`

If Windows is below the required version, keys show `WIN10+ REQ`.

## Notes
- Network transfer totals are only recorded while the Stream Deck app/plugin is running.
- Metrics generally show `--` when data is temporarily unavailable.
- Network totals can show `0B` until at least two samples exist for the selected window.
