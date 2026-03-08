(() => {
  const { initPI, setSettings, setVisible, wirePlainListener, PERCENT_METRICS, TOP_PROCESS_METRICS } = window.piCommon;

  const METRICS = [
    { value: "gpu-load", label: "Core Usage" },
    { value: "gpu-vram", label: "VRAM (%)" },
    { value: "gpu-vram-used", label: "VRAM (GB)" },
    { value: "gpu-temp", label: "Temperature" },
    { value: "gpu-power", label: "Power (W)" },
    { value: "gpu-top-compute", label: "Top Process (GPU %)" },
    { separator: true },
    { value: "gpu-encoder", label: "Encoder (%)" },
    { value: "gpu-decoder", label: "Decoder (%)" },
    { value: "gpu-pcie-rx", label: "PCIe Download (CPU \u2192 GPU)" },
    { value: "gpu-pcie-tx", label: "PCIe Upload (GPU \u2192 CPU)" },
    { value: "gpu-clock", label: "Core Clock (MHz)" },
    { value: "gpu-mem-clock", label: "VRAM Clock (Effective MHz)" },
    { value: "gpu-fan", label: "Fan Speed (%)" }
  ];

  const METRIC_NOTES = {
    "gpu-encoder": "NVENC usage. Hardware encoder block on NVIDIA GPUs. Same encoder used by Shadowplay.",
    "gpu-decoder": "NVDEC usage. Hardware decoder block on NVIDIA GPUs used for real-time video decoding.",
    "gpu-pcie-rx": "Data flowing from the CPU/system into the GPU over the PCIe bus.",
    "gpu-pcie-tx": "Data flowing from the GPU back to the CPU/system over the PCIe bus.",
    "gpu-mem-clock": "Reports effective data rate. GDDR memory is multi-pumped, so this value is higher than the base clock."
  };

  const DEFAULT_METRIC = "gpu-load";

  function normalizeSettings(settings) {
    const candidate = settings.metric;
    const metric = METRICS.some((m) => m.value === candidate) ? candidate : DEFAULT_METRIC;
    return { metric };
  }

  function updateVisibility(metric) {
    setVisible(document.getElementById("gpu-row"), true);
    setVisible(document.getElementById("temp-unit-row"), metric === "gpu-temp");
    const note = METRIC_NOTES[metric] || null;
    const noteRow = document.getElementById("metric-note");
    const noteText = document.getElementById("metric-note-text");
    if (noteRow) setVisible(noteRow, !!note);
    if (noteText) noteText.textContent = note || "";
    const showAlert = PERCENT_METRICS.has(metric) && !METRIC_NOTES[metric];
    setVisible(document.getElementById("warn-threshold-row"), showAlert);
    setVisible(document.getElementById("threshold-note"), showAlert);
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
