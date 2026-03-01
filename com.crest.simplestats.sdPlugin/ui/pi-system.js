(() => {
  const { initPI, setVisible } = window.piCommon;

  const METRICS = [
    { value: "clock", label: "Clock (HH:MM:SS)" },
    { value: "perf", label: "Performance" }
  ];

  const DEFAULT_METRIC = "clock";

  function normalizeSettings(settings) {
    const candidate = settings?.metric;
    const metric = METRICS.some((item) => item.value === candidate) ? candidate : DEFAULT_METRIC;
    return { metric };
  }

  function updateVisibility() {
    setVisible(document.getElementById("poll-row"), true);
  }

  initPI({
    group: "system",
    metrics: METRICS,
    defaultMetric: DEFAULT_METRIC,
    normalizeSettings,
    updateVisibility
  });
})();
