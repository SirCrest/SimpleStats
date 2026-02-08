# Release Notes

## v0.9.3.0 (pending)

- Added category icon with stacked area chart visualization and action icon with single line graph.
- Added Action icon with single cyan bezier line graph. Feels Shmoove.
- 1H and 24H network transfer totals now update every poll tick using composite sampling (minute-level history + live second-level tail).
- 1H/24H totals no longer sit at 0B after a fresh install — they immediately match the 1M value until minute data accumulates.
- Added counter-reset detection so stale history from a previous session doesn't produce 0B totals.
- Removed the flat graph line from network transfer total keys — they now show label and value only.
- Network transfer totals now display proper unit suffixes (KB, MB, GB, TB) instead of shorthand (K, M, G, T).
- Disk read/write graphs now use a 10 MB/s minimum scale so low activity doesn't dominate the graph.
- Top memory process now aggregates all instances of the same process name (e.g., all Chrome.exe processes combined).
- Top memory process now uses Private Working Set (matching Task Manager) instead of total working set.
- Top memory values now display full unit suffixes (MB, GB) instead of shorthand (M, G).