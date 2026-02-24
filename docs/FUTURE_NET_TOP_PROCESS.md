# Future Feature: Network Top Process Metric

**Status**: Deferred — no clean non-elevated approach provides accurate per-process network bytes on Windows.

## Goal

A `net-top` metric showing which process is using the most network throughput (Mbps), with an idle/threshold based on Mbps instead of %. Same display pattern as `top-cpu` (icon + name + value).

## Research Summary (2026-02-22)

### Approaches Investigated

| Approach | Real-time? | Elevation? | Per-Process? | Bytes? | Verdict |
|----------|-----------|------------|--------------|--------|---------|
| ETW `Microsoft-Windows-Kernel-Network` | Yes (event-driven) | Admin required | Yes (PID) | Yes | Best accuracy, but requires elevation |
| `GetPerTcpConnectionEStats` | Yes (polled) | Admin required | Yes (per-connection) | Yes | Must call `SetPerTcpConnectionEStats` first (admin-only) to enable collection; disabled by default on all Windows versions |
| WinRT `GetAttributedNetworkUsageAsync` | No (~1min+ granularity) | Needs MSIX packaging | Per-app (not PID) | Yes | Backed by SRUM (hourly flush); not real-time; requires `networkDataUsageManagement` restricted capability |
| SRUDB.dat direct read | No (hourly) | Admin to copy | Per-app | Yes | Locked by Diagnostic Policy Service; hourly write cadence |
| `GetProcessIoCounters` | Yes (polled) | No | Yes (PID) | Combined (disk+net+pipe) | No way to isolate network I/O from disk/pipe I/O |
| `GetExtendedTcpTable` / `GetExtendedUdpTable` | Yes | No | Yes (PID) | No byte counts | Shows connection-to-PID mapping only |
| Hybrid (table + I/O counters) | Yes | No | Yes | Approximate | Filter I/O to network-connected PIDs; still includes disk I/O for those processes |
| WFP / NDIS / Npcap drivers | Yes | Admin to install | Yes | Yes | Kernel driver required |
| Windows Performance Counters | Yes | No | No (per-adapter only) | Yes | `Process` category has only aggregate I/O, no network-specific counters |

### Why Each Was Rejected

**ETW (best data quality)**: Requires admin elevation to start a kernel trace session. Would need either:
- User runs Stream Deck as admin (changes privilege model for entire SD ecosystem)
- Helper self-elevates (UAC prompt every SD start)
- Helper runs as a Windows service (significant architecture change — IPC from stdio to named pipes)

**Hybrid approach (best non-elevated option)**: `GetProcessIoCounters` returns ALL I/O (disk + network + pipe + device), not just network. Filtering to PIDs with active TCP/UDP connections helps, but processes like browsers do heavy disk I/O (caching) alongside network, producing noisy/inflated values.

**WinRT APIs**: Granularity is ~1 minute at best (SRUM writes hourly). Requires MSIX packaging for the restricted capability. Useless for real-time 1-2s polling.

## Windows Service Approach (Future Reference)

If we decide to pursue this with elevation, the cleanest UX is a lightweight Windows service:

### Architecture
```
[Stream Deck Plugin (Node.js)]
    ↓ named pipe IPC
[SimpleStatsHelper.exe] ← existing helper, no changes needed
    ↓ named pipe IPC
[SimpleStatsNetService.exe] ← new, runs elevated as Windows service
    ↓ ETW kernel trace
[Microsoft-Windows-Kernel-Network provider]
```

### Service Details
- **NuGet**: `Microsoft.Diagnostics.Tracing.TraceEvent` for managed ETW consumption
- **ETW Provider**: `Microsoft-Windows-Kernel-Network` — emits per-packet events with PID, bytes sent/received
- **Install**: One-time admin install via `sc create` or installer — no repeated UAC prompts
- **IPC**: Named pipe server, helper connects as client, requests per-process network stats
- **Data flow**: Service aggregates ETW events into per-PID byte counters, resets every poll interval
- **Fallback**: If service isn't installed/running, `net-top` metric shows "Service required" or is hidden from metric list

### Install/Uninstall
```
SimpleStatsNetService.exe --install    # creates + starts Windows service (requires admin)
SimpleStatsNetService.exe --uninstall  # stops + removes service (requires admin)
```

Could be offered as an optional download or checkbox in a future installer.

### Auto-Detection
Plugin checks if named pipe `\\.\pipe\SimpleStatsNet` exists on startup. If available, `net-top` metric appears in the Network PI. If not, metric is hidden or shows a note about installing the service.

## Implementation Sketch (When Ready)

### Helper Changes (`native/SimpleStatsHelper/Program.cs`)
- New P/Invoke: `GetExtendedTcpTable`, `GetExtendedUdpTable`, `GetProcessIoCounters` from `iphlpapi.dll` / `kernel32.dll`
- Extend `TopProcessSampler` to track network-connected PIDs + I/O deltas
- Add `netName`, `netBps`, `netIconBase64` to `TopProcessPayload`
- Apply existing `MomentumHelper` with separate momentum dictionary

### TypeScript Changes (`src/stats.ts`)
- Extend `HelperTopProcess` + `TopProcessSnapshot` types with `netName`, `netBps`, `netIconBase64`
- Parse new fields in `parseHelperPayload()`

### TypeScript Changes (`src/actions/base-metric.ts`)
- Add `"net-top"` to `MetricId` type, `METRICS_BY_GROUP.network`, `isMetricId()`
- Add `buildMetricDisplay` case: process layout (icon + name), value in Mbps
- Idle check: `if (netMbps < topThreshold)` → IDLE
- Threshold interpreted as Mbps (reuse existing `topThreshold` field, 0-100 range)

### PI Changes
- `pi-network.html`: Add `top-threshold-row` + `top-threshold-note` elements
- `pi-network.js`: Add "Top Process" to metric dropdown, update visibility (hide interface selector for net-top, show threshold controls)
- `pi-common.js`: Add `"net-top"` to `TOP_PROCESS_METRICS` set

## Key References
- [GetExtendedTcpTable](https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable) — PID-to-connection mapping (no admin)
- [GetPerTcpConnectionEStats](https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getpertcpconnectionestats) — per-connection byte counters (admin required)
- [GetProcessIoCounters](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getprocessiocounters) — aggregate I/O counters (no admin, but includes disk)
- [GetAttributedNetworkUsageAsync](https://learn.microsoft.com/en-us/uwp/api/windows.networking.connectivity.connectionprofile.getattributednetworkusageasync) — per-app usage (MSIX required, hourly granularity)
- [Microsoft.Diagnostics.Tracing.TraceEvent](https://github.com/microsoft/dotnet-samples/blob/master/Microsoft.Diagnostics.Tracing/TraceEvent/docs/TraceEvent.md) — managed ETW consumption
