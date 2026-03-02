# Release Notes

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
