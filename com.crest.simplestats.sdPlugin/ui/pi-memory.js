(() => {
  const { initPI, setVisible, PERCENT_METRICS, TOP_PROCESS_METRICS } = window.piCommon;

  const METRICS = [
    { value: "mem-total", label: "Total Usage (%)" },
    { value: "mem-used", label: "Used (GB)" },
    { value: "top-mem", label: "Top Process (GB)" },
    { value: "top-mem-pct", label: "Top Process (%)" }
  ];

  const DEFAULT_METRIC = "mem-total";

  function normalizeSettings(settings) {
    const candidate = settings.metric;
    const metric = METRICS.some((m) => m.value === candidate) ? candidate : DEFAULT_METRIC;
    return { metric };
  }

  function updateVisibility(metric) {
    const isPercent = PERCENT_METRICS.has(metric);
    setVisible(document.getElementById("warn-threshold-row"), isPercent);
    setVisible(document.getElementById("threshold-note"), isPercent);
    const isTopProcess = TOP_PROCESS_METRICS.has(metric);
    setVisible(document.getElementById("top-threshold-row"), isTopProcess);
    setVisible(document.getElementById("top-threshold-note"), isTopProcess);
  }

  initPI({
    group: "memory",
    metrics: METRICS,
    defaultMetric: DEFAULT_METRIC,
    normalizeSettings,
    updateVisibility
  });
})();
