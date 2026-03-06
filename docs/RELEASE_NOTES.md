# Release Notes

## v0.11.2.0

### Bug fixes

- **Fixed settings feedback loop**: opening a property inspector no longer triggers a continuous `didReceiveSettings` / `savedDeviceCache` cycle. The device cache write is now skipped when the cache is unchanged, eliminating ~22k unnecessary events observed over a 26-hour session.
- **Fixed helper exit on system sleep/logoff**: the .NET helper exiting with `0x40010004` (STATUS_LOG_HARD_ERROR) during system sleep or logoff is now recognized as an expected exit, preventing unnecessary backoff and retry cycles.
- **Fixed property inspector metric reverts**: GPU metric changes no longer bounce back to the previous value because the property inspectors now use a single settings-writer path instead of overlapping SDK auto-binding plus manual JS persistence.
- **Clarified unsupported advanced GPU metrics**: when a GPU is present but NVML does not expose a specific advanced field (clock, encoder/decoder, fan, PCIe throughput, throttle status), the key now shows `N/A` instead of an ambiguous `--`.

### Details

- Removed `setting="..."` auto-binding from manually managed PI controls so dropdowns and numeric fields persist through one consistent code path.
- Simplified shared PI event wiring to a single host-level `change` listener for Stream Deck custom controls, reducing duplicate/out-of-order settings writes.

## v0.11.0.0

### New metrics

- **CPU Clock Frequency**: select "Clock Frequency" in the CPU action to display the average CPU clock speed across all cores (e.g., `4.82 GHz`). Uses `CallNtPowerInformation` for accurate real-time MHz readings. Auto-scaling graph.
- **GPU Clock (MHz)**: current graphics core clock speed with auto-scaling graph.
- **Memory Clock (MHz)**: current VRAM clock speed with auto-scaling graph.
- **Encoder (NVENC %)**: NVIDIA hardware encoder utilization (0–100%). Shows `0%` when not encoding.
- **Decoder (NVDEC %)**: NVIDIA hardware decoder utilization (0–100%). Shows `0%` when not decoding.
- **Fan Speed (%)**: GPU fan speed as a percentage. Supports alert threshold.
- **PCIe Download / Upload**: GPU PCIe bus throughput in MB/s or GB/s with auto-scaling graph and arrow indicators.
- **Throttle Status**: shows `NONE` when running normally, or the active throttle reason (`HW THERM`, `HW PWR`, `SW THERM`, `PWR CAP`, `HW SLOW`, `SYNC`). Binary graph (0 when clear, 100 when throttled).

### UI changes

- **Removed polling interval control**: the 1–5 second polling dropdown has been removed from all property inspectors. All keys now update at a fixed 1-second cadence — the .NET helper is fast enough that a user-configurable interval is no longer needed.

### Details

- 6 new NVML API calls added to the .NET helper for clock, encoder/decoder, fan, PCIe throughput, and throttle reasons — all with `EntryPointNotFoundException` guards for older driver compatibility.
- CPU frequency uses Windows `CallNtPowerInformation` (powrprof.dll) to read per-core `CurrentMhz`, averaged across all cores.
- All new GPU metrics gracefully show `--` when NVIDIA drivers are unavailable.
- Encoder, decoder, and fan speed metrics support the existing alert threshold feature.
