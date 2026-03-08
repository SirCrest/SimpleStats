(() => {
  const { initPI, setSettings, setVisible, wirePlainListener, PERCENT_METRICS, TOP_PROCESS_METRICS } = window.piCommon;

  const METRICS = [
    { value: "gpu-load", label: "Core Usage" },
    { value: "gpu-vram", label: "VRAM (%)" },
    { value: "gpu-vram-used", label: "VRAM (GB)" },
    { value: "gpu-temp", label: "Temperature" },
    { value: "gpu-power", label: "Power (W)" },
    { value: "gpu-top-compute", label: "Top Process (Compute)" },
    { separator: true },
    { value: "gpu-encoder", label: "Encoder (%)" },
    { value: "gpu-decoder", label: "Decoder (%)" },
    { value: "gpu-pcie-rx", label: "PCIe Download" },
    { value: "gpu-pcie-tx", label: "PCIe Upload" },
    { value: "gpu-clock", label: "Core Clock (MHz)" },
    { value: "gpu-mem-clock", label: "VRAM Clock (Effective MHz)" },
    { value: "gpu-fan", label: "Fan Speed (%)" }
  ];

  const DEFAULT_METRIC = "gpu-load";

  function normalizeSettings(settings) {
    const candidate = settings.metric;
    const metric = METRICS.some((m) => m.value === candidate) ? candidate : DEFAULT_METRIC;
    return { metric };
  }

  function updateVisibility(metric) {
    setVisible(document.getElementById("gpu-row"), true);
    setVisible(document.getElementById("temp-unit-row"), metric === "gpu-temp");
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

  function setActiveTempUnit(value) {
    const group = document.getElementById("temp-unit");
    if (!group) return;
    for (const btn of group.querySelectorAll(".btn-group__btn")) {
      btn.classList.toggle("active", btn.dataset.value === value);
    }
  }

  async function handleTempUnitClick(event) {
    if (window.piCommon.suppressEvents) return;
    const btn = event.target.closest(".btn-group__btn");
    if (!btn) return;
    const tempUnit = btn.dataset.value;
    setActiveTempUnit(tempUnit);
    await setSettings({ tempUnit });
  }

  function wireDeviceControls() {
    const gpuSelect = document.getElementById("gpu");
    if (gpuSelect) wirePlainListener(gpuSelect, "change", handleGpuChange);
    const tempUnitGroup = document.getElementById("temp-unit");
    if (tempUnitGroup) wirePlainListener(tempUnitGroup, "click", handleTempUnitClick);
  }

  function applyDeviceSettings(settings) {
    setActiveTempUnit(settings.tempUnit === "F" ? "F" : "C");
  }

  initPI({
    group: "gpu",
    metrics: METRICS,
    defaultMetric: DEFAULT_METRIC,
    normalizeSettings,
    updateVisibility,
    wireDeviceControls,
    applyDeviceSettings
  });
})();
