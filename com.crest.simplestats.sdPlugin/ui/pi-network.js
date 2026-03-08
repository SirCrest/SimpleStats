(() => {
  const { initPI, setSettings, setVisible, wirePlainListener, PERCENT_METRICS } = window.piCommon;

  const METRICS = [
    { value: "net-down", label: "Download (Mbps)" },
    { value: "net-up", label: "Upload (Mbps)" },
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
    // Network metrics are not percent-based, hide alert
    setVisible(document.getElementById("warn-threshold-row"), false);
    setVisible(document.getElementById("threshold-note"), false);
  }

  function setActivePeriod(value) {
    const group = document.getElementById("net-period");
    if (!group) return;
    const strVal = String(value);
    for (const btn of group.querySelectorAll(".btn-group__btn")) {
      btn.classList.toggle("active", btn.dataset.value === strVal);
    }
  }

  async function handleNetChange(event) {
    if (window.piCommon.suppressEvents) return;
    const netIface = window.piCommon.readValueFromEvent(event, document.getElementById("net")?.value ?? "");
    await setSettings({ netIface });
  }

  async function handleNetPeriodClick(event) {
    if (window.piCommon.suppressEvents) return;
    const btn = event.target.closest(".btn-group__btn");
    if (!btn) return;
    const val = parseInt(btn.dataset.value, 10);
    if (Number.isFinite(val) && val > 0) {
      setActivePeriod(val);
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
    const netPeriodGroup = document.getElementById("net-period");
    if (netSelect) wirePlainListener(netSelect, "change", handleNetChange);
    if (rescanEl) wirePlainListener(rescanEl, "click", handleRescanInterfaces);
    if (netPeriodGroup) wirePlainListener(netPeriodGroup, "click", handleNetPeriodClick);
  }

  function applyDeviceSettings(settings) {
    setActivePeriod(settings?.netPeriodSec ?? 60);
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
