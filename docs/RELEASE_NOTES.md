# Release Notes

## v0.9.2.1

- Fixed network rate keys (NET UP/DOWN) dropping to 0Mbps when dragging any network action to another key position.
- Graph history now carries over when dragging keys between positions (settingsKey-based fallback lookup).
- Fixed race condition where network polling interest could momentarily drop to zero during drag, causing cache invalidation.
- Keys render immediately on appear instead of waiting for the next poll tick.
- Renamed "Last 60 minutes" to "Last hour" in the transfer period selector.

## v0.9.2.0

### Why
- Aggressive bump for cumulative user-visible improvements in helper reliability, process display stability, and metric readability.
- Includes Claude's low-speed disk throughput graphing improvement so small read/write activity is represented more clearly.

### Highlights
- Top-process display stability improvements (momentum scoring + friendlier process naming/icons).
- Faster helper startup path for CPU/disk metrics.
- Release packaging automation and cleanup of generated artifacts in git tracking.
