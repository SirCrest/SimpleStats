(() => {
  const { initPI, setSettings, setVisible, wireInput, wireButton, readCheckboxValue,
    readCheckboxValueFromEvent, readPositiveInt, PERCENT_METRICS, TOP_PROCESS_METRICS } = window.piCommon;

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
    const cpuPerCore = typeof settings.cpuPerCore === "boolean" ? settings.cpuPerCore : candidateMetric === "cpu-core";
    let metric = DEFAULT_METRIC;
    if (candidateMetric === "cpu-peak" || candidateMetric === "top-cpu") {
      metric = candidateMetric;
    } else {
      metric = cpuPerCore ? "cpu-core" : "cpu-total";
    }
    return { metric, cpuPerCore: Boolean(cpuPerCore) };
  }

  function updateVisibility(metric) {
    const isSpecialCpu = metric === "cpu-peak" || metric === "top-cpu";
    const cpuPerCore = readCheckboxValue(document.getElementById("cpu-per-core"));
    setVisible(document.getElementById("cpu-mode-row"), !isSpecialCpu);
    setVisible(document.getElementById("cpu-core-row"), cpuPerCore && !isSpecialCpu);
    setVisible(document.getElementById("poll-row"), true);

    const isPercent = PERCENT_METRICS.has(metric);
    setVisible(document.getElementById("warn-threshold-row"), isPercent);
    setVisible(document.getElementById("threshold-note"), isPercent);
    const isTopProcess = TOP_PROCESS_METRICS.has(metric);
    setVisible(document.getElementById("top-threshold-row"), isTopProcess);
    setVisible(document.getElementById("top-threshold-note"), isTopProcess);
  }

  async function handleMetricChange(metric) {
    const isSpecialCpu = metric === "cpu-peak" || metric === "top-cpu";
    const cpuPerCore = isSpecialCpu ? false : metric === "cpu-core";
    updateVisibility(metric);
    await setSettings({ metric, cpuPerCore });
  }

  async function handleCpuModeChange(event) {
    if (window.piCommon.suppressEvents) return;
    const cpuPerCore = readCheckboxValueFromEvent(event, document.getElementById("cpu-per-core"));
    const metric = cpuPerCore ? "cpu-core" : "cpu-total";
    document.getElementById("metric").value = metric;
    updateVisibility(metric);
    await setSettings({ cpuPerCore, metric });
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
    const cpuPerCoreEl = document.getElementById("cpu-per-core");
    const cpuCoreEl = document.getElementById("cpu-core");
    const cpuCoreDownEl = document.getElementById("cpu-core-down");
    const cpuCoreUpEl = document.getElementById("cpu-core-up");
    if (cpuPerCoreEl) wireInput(cpuPerCoreEl, handleCpuModeChange);
    if (cpuCoreEl) wireInput(cpuCoreEl, handleCpuCoreChange);
    if (cpuCoreDownEl) wireButton(cpuCoreDownEl, () => { void stepCpuCore(-1); });
    if (cpuCoreUpEl) wireButton(cpuCoreUpEl, () => { void stepCpuCore(1); });
  }

  function applyDeviceSettings(settings, normalized) {
    if (settings && typeof settings.cpuCoreMax !== "undefined") {
      const parsedMax = parseInt(settings.cpuCoreMax, 10);
      if (Number.isFinite(parsedMax) && parsedMax > 0) maxCpuCore = Math.floor(parsedMax);
    }
    const cpuPerCoreEl = document.getElementById("cpu-per-core");
    if (cpuPerCoreEl) {
      cpuPerCoreEl.value = normalized.cpuPerCore;
      if (typeof cpuPerCoreEl.checked === "boolean") cpuPerCoreEl.checked = normalized.cpuPerCore;
      if (typeof cpuPerCoreEl.toggleAttribute === "function") {
        cpuPerCoreEl.toggleAttribute("checked", normalized.cpuPerCore);
      } else if (typeof cpuPerCoreEl.setAttribute === "function") {
        if (normalized.cpuPerCore) cpuPerCoreEl.setAttribute("checked", "");
        else cpuPerCoreEl.removeAttribute("checked");
      }
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
