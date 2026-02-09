# Release Notes

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