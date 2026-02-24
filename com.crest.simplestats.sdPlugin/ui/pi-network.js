(() => {
  const { initPI, setSettings, setVisible, wireInput, wirePlainListener, PERCENT_METRICS } = window.piCommon;

  const METRICS = [
    { value: "net-down", label: "Download Rate" },
    { value: "net-up", label: "Upload Rate" },
    { value: "net-total", label: "Total Transfer" }
  ];

  const DEFAULT_METRIC = "net-down";

  function normalizeSettings(settings) {
    const candidate = settings.metric;
    const metric = METRICS.some((m) => m.value === candidate) ? candidate : DEFAULT_METRIC;
    return { metric };
  }

  function updateVisibility(metric) {
    setVisible(document.getElementById("net-row"), true);
    setVisible(document.getElementById("net-period-row"), metric === "net-total");
    setVisible(document.getElementById("net-total-note"), metric === "net-total");
    setVisible(document.getElementById("poll-row"), true);
    // Network metrics are not percent-based, hide alert
    setVisible(document.getElementById("warn-threshold-row"), false);
    setVisible(document.getElementById("threshold-note"), false);
  }

  async function handleNetChange(event) {
    if (window.piCommon.suppressEvents) return;
    const netIface = window.piCommon.readValueFromEvent(event, document.getElementById("net")?.value ?? "");
    await setSettings({ netIface });
  }

  async function handleNetPeriodChange(event) {
    if (window.piCommon.suppressEvents) return;
    const raw = window.piCommon.readValueFromEvent(event, document.getElementById("net-period")?.value ?? "60");
    const val = parseInt(raw, 10);
    if (Number.isFinite(val) && val > 0) {
      await setSettings({ netPeriodSec: val });
    }
  }

  function handleRescanInterfaces() {
    const { streamDeckClient } = SDPIComponents;
    if (typeof streamDeckClient.sendToPlugin === "function") {
      streamDeckClient.sendToPlugin({ event: "getNetIfaces" });
    } else {
      streamDeckClient.send("sendToPlugin", { event: "getNetIfaces" });
    }
  }

  function wireDeviceControls() {
    const netSelect = document.getElementById("net");
    const rescanEl = document.getElementById("rescan-interfaces");
    const netPeriodEl = document.getElementById("net-period");
    if (netSelect) wirePlainListener(netSelect, "change", handleNetChange);
    if (rescanEl) wirePlainListener(rescanEl, "click", handleRescanInterfaces);
    if (netPeriodEl) wireInput(netPeriodEl, handleNetPeriodChange);
  }

  function applyDeviceSettings(settings) {
    const netPeriodEl = document.getElementById("net-period");
    if (netPeriodEl && settings && settings.netPeriodSec !== undefined) {
      netPeriodEl.value = String(settings.netPeriodSec);
    }
  }

  initPI({
    group: "network",
    metrics: METRICS,
    defaultMetric: DEFAULT_METRIC,
    normalizeSettings,
    updateVisibility,
    wireDeviceControls,
    applyDeviceSettings
  });
})();
