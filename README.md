# SimpleStats Stream Deck Plugin

Task Manager-style system stats for Stream Deck keys (Windows 10+).

## Prereqs
- Node.js 20+
- Stream Deck 6.9+
- Windows 10 Build 10240+
- Stream Deck CLI (optional, for restart on watch)

## Dev
1. npm install
2. npm run watch

## Action
Metric Display (configure group, metric, and device in the property inspector).
Metrics include CPU total/per-core, GPU core/VRAM/temp, memory total, disk utilization/read/write, and network up/down/total transfer.

## Notes
- Uses the systeminformation package and a .NET helper for Windows metrics.
- Windows 10 Build 10240+ required. On older versions the keys show WIN10+ REQ.
