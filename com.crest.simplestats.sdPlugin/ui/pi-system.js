(() => {
  const { initPI, setVisible } = window.piCommon;

  const METRICS = [{ value: "clock", label: "Clock (HH:MM:SS)" }];

  const DEFAULT_METRIC = "clock";

  function normalizeSettings() {
    return { metric: DEFAULT_METRIC };
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
