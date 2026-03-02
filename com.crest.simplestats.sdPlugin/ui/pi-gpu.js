(() => {
  const { initPI, setSettings, setVisible, wirePlainListener, PERCENT_METRICS, TOP_PROCESS_METRICS } = window.piCommon;

  const METRICS = [
    { value: "gpu-load", label: "Core Usage" },
    { value: "gpu-vram", label: "VRAM Usage (%)" },
    { value: "gpu-vram-used", label: "VRAM Used (GB)" },
    { value: "gpu-temp", label: "Temperature" },
    { value: "gpu-power", label: "Power (W)" },
    { value: "gpu-clock", label: "GPU Clock (MHz)" },
    { value: "gpu-mem-clock", label: "Memory Clock (MHz)" },
    { value: "gpu-encoder", label: "Encoder (NVENC %)" },
    { value: "gpu-decoder", label: "Decoder (NVDEC %)" },
    { value: "gpu-fan", label: "Fan Speed (%)" },
    { value: "gpu-pcie-rx", label: "PCIe Download" },
    { value: "gpu-pcie-tx", label: "PCIe Upload" },
    { value: "gpu-throttle", label: "Throttle Status" },
    { value: "gpu-top-compute", label: "Top Process (Compute)" }
  ];

  const DEFAULT_METRIC = "gpu-load";

  function normalizeSettings(settings) {
    const candidate = settings.metric;
    const metric = METRICS.some((m) => m.value === candidate) ? candidate : DEFAULT_METRIC;
    return { metric };
  }

  function updateVisibility(metric) {
    setVisible(document.getElementById("gpu-row"), true);
    const isPercent = PERCENT_METRICS.has(metric);
    setVisible(document.getElementById("warn-threshold-row"), isPercent);
    setVisible(document.getElementById("threshold-note"), isPercent);
    const isTopProcess = TOP_PROCESS_METRICS.has(metric);
    setVisible(document.getElementById("top-threshold-row"), isTopProcess);
    setVisible(document.getElementById("top-threshold-note"), isTopProcess);
  }

  async function handleGpuChange(event) {
    if (window.piCommon.suppressEvents) return;
    const gpuIndex = parseInt(window.piCommon.readValueFromEvent(event, document.getElementById("gpu")?.value ?? "0"), 10) || 0;
    await setSettings({ gpuIndex });
  }

  function wireDeviceControls() {
    const gpuSelect = document.getElementById("gpu");
    if (gpuSelect) wirePlainListener(gpuSelect, "change", handleGpuChange);
  }

  initPI({
    group: "gpu",
    metrics: METRICS,
    defaultMetric: DEFAULT_METRIC,
    normalizeSettings,
    updateVisibility,
    wireDeviceControls
  });
})();
