(() => {
  const { initPI, setSettings, setVisible, wirePlainListener, PERCENT_METRICS, TOP_PROCESS_METRICS } = window.piCommon;

  const METRICS = [
    { value: "disk-activity", label: "Utilization (Active)" },
    { value: "disk-used", label: "Used (%)" },
    { value: "disk-free", label: "Free (%)" },
    { value: "disk-read", label: "Read (MB/s)" },
    { value: "disk-write", label: "Write (MB/s)" },
    { separator: true },
    { value: "top-disk", label: "Top Process (I/O)" }
  ];

  const METRIC_NOTES = {
    "disk-activity": "Percentage of time the disk is busy processing requests. Same as Active Time in Task Manager."
  };

  const DEFAULT_METRIC = "disk-activity";

  function normalizeSettings(settings) {
    let candidate = settings.metric;
    if (candidate === "disk-use") candidate = "disk-used";
    const metric = METRICS.some((m) => m.value === candidate) ? candidate : DEFAULT_METRIC;
    return { metric };
  }

  function updateVisibility(metric) {
    const isTopDisk = metric === "top-disk";
    const isDiskSpace = metric === "disk-used" || metric === "disk-free";
    setVisible(document.getElementById("disk-row"), !isTopDisk);
    setVisible(document.getElementById("disk-space-note"), isDiskSpace);
    const note = METRIC_NOTES[metric] || null;
    const noteRow = document.getElementById("metric-note");
    const noteText = document.getElementById("metric-note-text");
    if (noteRow) setVisible(noteRow, !!note);
    if (noteText) noteText.textContent = note || "";
    const isPercent = PERCENT_METRICS.has(metric);
    setVisible(document.getElementById("warn-threshold-row"), isPercent);
    setVisible(document.getElementById("threshold-note"), isPercent);
    const isTopProcess = TOP_PROCESS_METRICS.has(metric);
    setVisible(document.getElementById("top-threshold-row"), isTopProcess);
    setVisible(document.getElementById("top-threshold-note"), isTopProcess);
  }

  async function handleDiskChange(event) {
    if (window.piCommon.suppressEvents) return;
    const diskId = window.piCommon.readValueFromEvent(event, document.getElementById("disk")?.value ?? "");
    await setSettings({ diskId });
  }

  function handleRescanDisks() {
    const { streamDeckClient } = SDPIComponents;
    if (typeof streamDeckClient.sendToPlugin === "function") {
      streamDeckClient.sendToPlugin({ event: "getDisks" });
    } else {
      streamDeckClient.send("sendToPlugin", { event: "getDisks" });
    }
  }

  function wireDeviceControls() {
    const diskSelect = document.getElementById("disk");
    const rescanDisksEl = document.getElementById("rescan-disks");
    if (diskSelect) wirePlainListener(diskSelect, "change", handleDiskChange);
    if (rescanDisksEl) wirePlainListener(rescanDisksEl, "click", handleRescanDisks);
  }

  initPI({
    group: "disk",
    metrics: METRICS,
    defaultMetric: DEFAULT_METRIC,
    normalizeSettings,
    updateVisibility,
    wireDeviceControls
  });
})();
