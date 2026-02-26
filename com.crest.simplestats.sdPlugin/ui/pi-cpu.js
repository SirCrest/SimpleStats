(() => {
  const { initPI, setSettings, setVisible, wireInput, wireButton,
    readPositiveInt, PERCENT_METRICS, TOP_PROCESS_METRICS } = window.piCommon;

  const METRICS = [
    { value: "cpu-total", label: "Total Usage" },
    { value: "cpu-core", label: "Per-Core Usage" },
    { value: "cpu-peak", label: "Peak Core" },
    { value: "top-cpu", label: "Top Process (CPU)" }
  ];

  const DEFAULT_METRIC = "cpu-total";

  let maxCpuCore = getDefaultCpuCoreMax();

  function getDefaultCpuCoreMax() {
    const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
    if (typeof hc === "number" && Number.isFinite(hc) && hc > 0) return Math.floor(hc);
    return 1;
  }

  function clampCpuCore(value) {
    return Math.min(maxCpuCore, Math.max(1, value));
  }

  function syncCpuCoreLimits(value) {
    const cpuCoreEl = document.getElementById("cpu-core");
    const cpuCoreDownEl = document.getElementById("cpu-core-down");
    const cpuCoreUpEl = document.getElementById("cpu-core-up");
    if (cpuCoreEl && typeof cpuCoreEl.setAttribute === "function") {
      cpuCoreEl.setAttribute("min", "1");
      cpuCoreEl.setAttribute("max", String(maxCpuCore));
    }
    if (cpuCoreDownEl) cpuCoreDownEl.disabled = value <= 1;
    if (cpuCoreUpEl) cpuCoreUpEl.disabled = value >= maxCpuCore;
  }

  function normalizeSettings(settings) {
    const candidateMetric = settings.metric;
    const cpuPerCore = typeof settings.cpuPerCore === "boolean"
      ? settings.cpuPerCore : candidateMetric === "cpu-core";
    let metric = DEFAULT_METRIC;
    if (candidateMetric === "cpu-peak" || candidateMetric === "top-cpu" ||
        candidateMetric === "cpu-core" || candidateMetric === "cpu-total") {
      metric = candidateMetric;
    } else {
      metric = cpuPerCore ? "cpu-core" : "cpu-total";
    }
    return { metric, cpuPerCore: metric === "cpu-core" };
  }

  function updateVisibility(metric) {
    setVisible(document.getElementById("cpu-core-row"), metric === "cpu-core");
    setVisible(document.getElementById("poll-row"), true);

    const isPercent = PERCENT_METRICS.has(metric);
    setVisible(document.getElementById("warn-threshold-row"), isPercent);
    setVisible(document.getElementById("threshold-note"), isPercent);
    const isTopProcess = TOP_PROCESS_METRICS.has(metric);
    setVisible(document.getElementById("top-threshold-row"), isTopProcess);
    setVisible(document.getElementById("top-threshold-note"), isTopProcess);
  }

  async function handleMetricChange(metric) {
    const cpuPerCore = metric === "cpu-core";
    updateVisibility(metric);
    await setSettings({ metric, cpuPerCore });
  }

  async function handleCpuCoreChange(event) {
    if (window.piCommon.suppressEvents) return;
    const cpuCoreEl = document.getElementById("cpu-core");
    const rawValue = window.piCommon.readValueFromEvent(event, cpuCoreEl?.value ?? "1");
    const nextValue = clampCpuCore(readPositiveInt(rawValue, 1));
    if (cpuCoreEl && String(cpuCoreEl.value) !== String(nextValue)) cpuCoreEl.value = nextValue;
    syncCpuCoreLimits(nextValue);
    await setSettings({ cpuCore: nextValue });
  }

  async function stepCpuCore(delta) {
    const cpuCoreEl = document.getElementById("cpu-core");
    if (!cpuCoreEl) return;
    const nextValue = clampCpuCore(readPositiveInt(cpuCoreEl.value, 1) + delta);
    if (String(cpuCoreEl.value) !== String(nextValue)) cpuCoreEl.value = nextValue;
    syncCpuCoreLimits(nextValue);
    await setSettings({ cpuCore: nextValue });
  }

  function wireDeviceControls() {
    const cpuCoreEl = document.getElementById("cpu-core");
    const cpuCoreDownEl = document.getElementById("cpu-core-down");
    const cpuCoreUpEl = document.getElementById("cpu-core-up");
    if (cpuCoreEl) wireInput(cpuCoreEl, handleCpuCoreChange);
    if (cpuCoreDownEl) wireButton(cpuCoreDownEl, () => { void stepCpuCore(-1); });
    if (cpuCoreUpEl) wireButton(cpuCoreUpEl, () => { void stepCpuCore(1); });
  }

  function applyDeviceSettings(settings, normalized) {
    if (settings && typeof settings.cpuCoreMax !== "undefined") {
      const parsedMax = parseInt(settings.cpuCoreMax, 10);
      if (Number.isFinite(parsedMax) && parsedMax > 0) maxCpuCore = Math.floor(parsedMax);
    }
    const cpuCoreEl = document.getElementById("cpu-core");
    if (cpuCoreEl) {
      const raw = settings && settings.cpuCore !== undefined ? settings.cpuCore : cpuCoreEl.value;
      const nextValue = clampCpuCore(readPositiveInt(raw, 1));
      if (String(cpuCoreEl.value) !== String(nextValue)) cpuCoreEl.value = nextValue;
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) void setSettings({ cpuCore: nextValue });
      syncCpuCoreLimits(nextValue);
    }
  }

  initPI({
    group: "cpu",
    metrics: METRICS,
    defaultMetric: DEFAULT_METRIC,
    normalizeSettings,
    updateVisibility,
    wireDeviceControls,
    applyDeviceSettings,
    handleMetricChange
  });
})();
