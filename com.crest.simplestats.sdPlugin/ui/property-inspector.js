const { streamDeckClient } = SDPIComponents;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Device list cache - loaded from settings (which persist across PI opens)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const piStartTime = performance.now();
let deviceCache = { gpus: null, disks: null, netIfaces: null };
let settingsLoadedResolve;
const settingsLoaded = new Promise((resolve) => { settingsLoadedResolve = resolve; });
console.log("[PI +0.0ms] PI loaded, cache: gpus=null, disks=null, net=null");

function logTiming(msg) {
  const elapsed = (performance.now() - piStartTime).toFixed(1);
  const logMsg = `[PI +${elapsed}ms] ${msg}`;
  console.log(logMsg);
  // Send to plugin for debug.log
  try {
    if (typeof streamDeckClient.sendToPlugin === "function") {
      streamDeckClient.sendToPlugin({ event: "piLog", message: logMsg });
    } else if (typeof streamDeckClient.send === "function") {
      streamDeckClient.send("sendToPlugin", { event: "piLog", message: logMsg });
    }
  } catch { /* ignore */ }
}

// Populate a plain select element with options (not sdpi-select)
function populateSelect(selectEl, items, currentValue) {
  if (!selectEl) {
    logTiming(`populateSelect: selectEl is null`);
    return;
  }
  if (!items) {
    logTiming(`populateSelect: items is null for ${selectEl.id}`);
    return;
  }

  logTiming(`populateSelect: ${selectEl.id} items=${items.length} currentValue=${currentValue}`);

  // Clear existing options
  while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);

  // Add new options
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    selectEl.appendChild(opt);
  }

  // Restore selected value if provided
  if (currentValue !== undefined && currentValue !== null && currentValue !== "") {
    selectEl.value = currentValue;
  }

  logTiming(`populateSelect: ${selectEl.id} done, childCount=${selectEl.childElementCount}, value=${selectEl.value}`);
}

// Load cache from settings (set by plugin when data is available)
function loadCacheFromSettings(settings) {
  if (settings?._deviceCache) {
    deviceCache = settings._deviceCache;
    logTiming(`loadCacheFromSettings: gpus=${deviceCache.gpus?.length ?? 'null'}, disks=${deviceCache.disks?.length ?? 'null'}, net=${deviceCache.netIfaces?.length ?? 'null'}`);
    // Populate the select elements with cached data
    const gpuEl = document.getElementById("gpu");
    const diskEl = document.getElementById("disk");
    const netEl = document.getElementById("net");
    if (deviceCache.gpus) populateSelect(gpuEl, deviceCache.gpus, settings?.gpuIndex);
    if (deviceCache.disks) populateSelect(diskEl, deviceCache.disks, settings?.diskId);
    if (deviceCache.netIfaces) populateSelect(netEl, deviceCache.netIfaces, settings?.netIface);
  }
  // Signal that settings are loaded (resolve the promise)
  if (settingsLoadedResolve) {
    settingsLoadedResolve();
    settingsLoadedResolve = null;
  }
}

// Global data source functions for sdpi-select datasource attribute
// Return cached data immediately if available, otherwise wait for settings
window.getGpus = function() {
  // If cache already has data, return it immediately (no Loading flash)
  if (deviceCache.gpus && deviceCache.gpus.length > 0) {
    logTiming(`getGpus() returning ${deviceCache.gpus.length} items from cache (sync)`);
    return deviceCache.gpus;
  }
  // Otherwise wait for settings to load
  logTiming(`getGpus() waiting for settings...`);
  return settingsLoaded.then(() => {
    const result = deviceCache.gpus || [];
    logTiming(`getGpus() resolved with ${result.length} items`);
    return result;
  });
};

window.getDisks = function() {
  if (deviceCache.disks && deviceCache.disks.length > 0) {
    logTiming(`getDisks() returning ${deviceCache.disks.length} items from cache (sync)`);
    return deviceCache.disks;
  }
  logTiming(`getDisks() waiting for settings...`);
  return settingsLoaded.then(() => {
    const result = deviceCache.disks || [];
    logTiming(`getDisks() resolved with ${result.length} items`);
    return result;
  });
};

window.getNetIfaces = function() {
  if (deviceCache.netIfaces && deviceCache.netIfaces.length > 0) {
    logTiming(`getNetIfaces() returning ${deviceCache.netIfaces.length} items from cache (sync)`);
    return deviceCache.netIfaces;
  }
  logTiming(`getNetIfaces() waiting for settings...`);
  return settingsLoaded.then(() => {
    const result = deviceCache.netIfaces || [];
    logTiming(`getNetIfaces() resolved with ${result.length} items`);
    return result;
  });
};

// Listen for plugin messages (for rescan functionality)
// Since we removed datasource attributes, we handle sendToPropertyInspector manually
if (streamDeckClient.onDidReceivePluginMessage) {
  streamDeckClient.onDidReceivePluginMessage.subscribe((ev) => {
    const payload = ev?.payload;
    if (!payload) return;
    logTiming(`onDidReceivePluginMessage: event=${payload.event}, items=${payload.items?.length ?? 0}`);
    if (payload.event === "getGpus" && payload.items) {
      deviceCache.gpus = payload.items;
      populateSelect(document.getElementById("gpu"), payload.items);
    }
    if (payload.event === "getDisks" && payload.items) {
      deviceCache.disks = payload.items;
      populateSelect(document.getElementById("disk"), payload.items);
    }
    if (payload.event === "getNetIfaces" && payload.items) {
      deviceCache.netIfaces = payload.items;
      populateSelect(document.getElementById("net"), payload.items);
    }
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const METRICS_BY_GROUP = {
  cpu: [
    { value: "cpu-total", label: "Total Usage" },
    { value: "cpu-core", label: "Per-Core Usage" },
    { value: "cpu-peak", label: "Peak Core" },
    { value: "top-cpu", label: "Top Process (CPU)" }
  ],
  gpu: [
    { value: "gpu-load", label: "Core Usage" },
    { value: "gpu-vram", label: "VRAM Usage (%)" },
    { value: "gpu-vram-used", label: "VRAM Used (GB)" },
    { value: "gpu-temp", label: "Temperature" },
    { value: "gpu-power", label: "Power (W)" },
    { value: "gpu-top-compute", label: "Top Process (Compute)" }
  ],
  memory: [
    { value: "mem-total", label: "Total Usage (%)" },
    { value: "mem-used", label: "Used (GB)" },
    { value: "top-mem", label: "Top Process (GB)" },
    { value: "top-mem-pct", label: "Top Process (%)" }
  ],
  disk: [
    { value: "disk-activity", label: "Utilization (Active)" },
    { value: "disk-used", label: "% Used" },
    { value: "disk-free", label: "% Free" },
    { value: "disk-read", label: "Read Throughput" },
    { value: "disk-write", label: "Write Throughput" }
  ],
  network: [
    { value: "net-up", label: "Upload Rate" },
    { value: "net-down", label: "Download Rate" },
    { value: "net-total", label: "Total Transfer" }
  ],
  system: [{ value: "clock", label: "Clock (HH:MM:SS)" }]
};

const DEFAULT_METRIC = {
  cpu: "cpu-total",
  gpu: "gpu-load",
  memory: "mem-total",
  disk: "disk-activity",
  network: "net-up",
  system: "clock"
};

const groupEl = document.getElementById("group");
const metricRow = document.getElementById("metric-row");
const pollRow = document.getElementById("poll-row");
const metricEl = document.getElementById("metric");
const pollIntervalEl = document.getElementById("poll-interval");
const cpuModeRow = document.getElementById("cpu-mode-row");
const cpuPerCoreEl = document.getElementById("cpu-per-core");
const cpuCoreEl = document.getElementById("cpu-core");
const cpuCoreRow = document.getElementById("cpu-core-row");
const cpuCoreDownEl = document.getElementById("cpu-core-down");
const cpuCoreUpEl = document.getElementById("cpu-core-up");
const gpuRow = document.getElementById("gpu-row");
const diskRow = document.getElementById("disk-row");
const diskSpaceNoteRow = document.getElementById("disk-space-note");
const netRow = document.getElementById("net-row");
const netPeriodRow = document.getElementById("net-period-row");
const netTotalNoteRow = document.getElementById("net-total-note");
const rescanDisksEl = document.getElementById("rescan-disks");
const rescanInterfacesEl = document.getElementById("rescan-interfaces");
const warnThresholdRow = document.getElementById("warn-threshold-row");
const thresholdNoteRow = document.getElementById("threshold-note");
const warnThresholdEl = document.getElementById("warn-threshold");
const topThresholdRow = document.getElementById("top-threshold-row");
const topThresholdNoteRow = document.getElementById("top-threshold-note");
const topThresholdEl = document.getElementById("top-threshold");

let currentSettings = {};
let maxCpuCore = getDefaultCpuCoreMax();
let suppressEvents = false;
const SETTINGS_KEYS = [
  "group",
  "metric",
  "cpuPerCore",
  "cpuCore",
  "gpuIndex",
  "diskId",
  "netIface",
  "netPeriodSec",
  "pollIntervalSec",
  "warnThreshold",
  "topThreshold"
];

const PERCENT_METRICS = new Set([
  "cpu-total", "cpu-core", "cpu-peak", "gpu-load", "gpu-vram",
  "mem-total", "disk-activity", "disk-used", "disk-free", "top-mem-pct"
]);

const TOP_PROCESS_METRICS = new Set([
  "top-cpu", "gpu-top-compute", "top-mem", "top-mem-pct"
]);

function normalizeSettingValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function settingsEqual(left, right) {
  return SETTINGS_KEYS.every(
    (key) => normalizeSettingValue(left && left[key]) === normalizeSettingValue(right && right[key])
  );
}

function getDefaultCpuCoreMax() {
  const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  if (typeof hc === "number" && Number.isFinite(hc) && hc > 0) {
    return Math.floor(hc);
  }
  return 1;
}

function updateCpuCoreMax(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    maxCpuCore = Math.floor(value);
  }
}

function setOptions(select, options) {
  while (select.firstChild) {
    select.removeChild(select.firstChild);
  }
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  }
}

function setVisible(element, visible) {
  if (!element) return;
  element.style.display = visible ? "" : "none";
}

function coerceBool(value) {
  return value === true || value === "true";
}

function readCheckboxValue(element) {
  if (!element) return false;
  if (typeof element.checked === "boolean") return element.checked;
  if (typeof element.getAttribute === "function") {
    const attr = element.getAttribute("checked");
    if (attr !== null) return attr !== "false";
  }
  return coerceBool(element.value);
}

function readCheckboxValueFromEvent(event, fallbackElement) {
  const target = event && event.target ? event.target : null;
  if (target) {
    if (typeof target.checked === "boolean") return target.checked;
    if (typeof target.value !== "undefined") return coerceBool(target.value);
  }
  return readCheckboxValue(fallbackElement);
}

function readValueFromEvent(event, fallbackValue) {
  const target = event && event.target ? event.target : null;
  if (target && typeof target.value !== "undefined") {
    return target.value;
  }
  return fallbackValue;
}

function readPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function clampCpuCore(value) {
  return Math.min(maxCpuCore, Math.max(1, value));
}

function clampPollInterval(value) {
  return Math.max(1, Math.min(5, value));
}

function syncCpuCoreLimits(value) {
  if (cpuCoreEl && typeof cpuCoreEl.setAttribute === "function") {
    cpuCoreEl.setAttribute("min", "1");
    cpuCoreEl.setAttribute("max", String(maxCpuCore));
  }
  if (cpuCoreDownEl) cpuCoreDownEl.disabled = value <= 1;
  if (cpuCoreUpEl) cpuCoreUpEl.disabled = value >= maxCpuCore;
}

const wiredHosts = new WeakSet();
const wiredInner = new WeakMap();
const wiredButtonTargets = new WeakMap();

function getInnerControl(element) {
  if (!element) return null;
  if (element.focusElement instanceof HTMLElement) return element.focusElement;
  const root = element.shadowRoot;
  if (!root) return null;
  return root.querySelector("select, input, textarea");
}

function getInnerButton(element) {
  if (!element) return null;
  if (element.focusElement instanceof HTMLElement) return element.focusElement;
  const root = element.shadowRoot;
  if (!root) return null;
  return root.querySelector("button");
}

function wireInput(element, handler) {
  if (!element) return;
  if (!wiredHosts.has(element)) {
    element.addEventListener("change", handler);
    element.addEventListener("input", handler);
    wiredHosts.add(element);
  }
  const inner = getInnerControl(element);
  if (inner && inner !== wiredInner.get(element)) {
    wiredInner.set(element, inner);
    inner.addEventListener("change", handler);
    inner.addEventListener("input", handler);
  } else if (!inner) {
    requestAnimationFrame(() => wireInput(element, handler));
  }
}

function wireButton(element, handler) {
  if (!element) return;
  const inner = getInnerButton(element);
  const target = inner || element;
  const previous = wiredButtonTargets.get(element);
  if (previous && previous !== target) {
    previous.removeEventListener("click", handler);
  }
  if (previous !== target) {
    target.addEventListener("click", handler);
    wiredButtonTargets.set(element, target);
  }
  if (!inner) {
    requestAnimationFrame(() => wireButton(element, handler));
  }
}

function updateVisibility(group, metric, cpuPerCore) {
  const isDiskSpace = group === "disk" && (metric === "disk-used" || metric === "disk-free");
  const isSpecialCpu = group === "cpu" && (metric === "cpu-peak" || metric === "top-cpu");
  setVisible(metricRow, true);
  setVisible(cpuModeRow, group === "cpu" && !isSpecialCpu);
  setVisible(cpuCoreRow, group === "cpu" && cpuPerCore && !isSpecialCpu);
  setVisible(gpuRow, group === "gpu");
  setVisible(diskRow, group === "disk");
  setVisible(netRow, group === "network");
  setVisible(netPeriodRow, group === "network" && metric === "net-total");
  setVisible(netTotalNoteRow, group === "network" && metric === "net-total");
  setVisible(pollRow, !isDiskSpace);
  setVisible(diskSpaceNoteRow, isDiskSpace);
  const isPercent = PERCENT_METRICS.has(metric);
  setVisible(warnThresholdRow, isPercent);
  setVisible(thresholdNoteRow, isPercent);
  const isTopProcess = TOP_PROCESS_METRICS.has(metric);
  setVisible(topThresholdRow, isTopProcess);
  setVisible(topThresholdNoteRow, isTopProcess);
}

function normalizeSettings(settings) {
  const group = Object.prototype.hasOwnProperty.call(METRICS_BY_GROUP, settings.group)
    ? settings.group
    : "cpu";
  const candidateMetric = settings.metric;
  const mappedMetric = group === "disk" && candidateMetric === "disk-use" ? "disk-used" : candidateMetric;
  const cpuPerCore =
    typeof settings.cpuPerCore === "boolean" ? settings.cpuPerCore : mappedMetric === "cpu-core";

  let metric = DEFAULT_METRIC[group];
  if (group === "cpu") {
    metric = mappedMetric === "cpu-peak" || mappedMetric === "top-cpu"
      ? mappedMetric : cpuPerCore ? "cpu-core" : "cpu-total";
  } else if (METRICS_BY_GROUP[group].some((item) => item.value === mappedMetric)) {
    metric = mappedMetric;
  }

  return { group, metric, cpuPerCore: Boolean(cpuPerCore) };
}

function applySettings(settings) {
  suppressEvents = true;
  // Load device cache from settings (stored by plugin)
  loadCacheFromSettings(settings);
  if (settings && typeof settings.cpuCoreMax !== "undefined") {
    const parsedMax = parseInt(settings.cpuCoreMax, 10);
    if (Number.isFinite(parsedMax) && parsedMax > 0) {
      updateCpuCoreMax(parsedMax);
    }
  }
  const normalized = normalizeSettings(settings);
  setOptions(metricEl, METRICS_BY_GROUP[normalized.group]);
  groupEl.value = normalized.group;
  metricEl.value = normalized.metric;
  if (cpuPerCoreEl) {
    cpuPerCoreEl.value = normalized.cpuPerCore;
    if (typeof cpuPerCoreEl.checked === "boolean") {
      cpuPerCoreEl.checked = normalized.cpuPerCore;
    }
    if (typeof cpuPerCoreEl.toggleAttribute === "function") {
      cpuPerCoreEl.toggleAttribute("checked", normalized.cpuPerCore);
    } else if (typeof cpuPerCoreEl.setAttribute === "function") {
      if (normalized.cpuPerCore) {
        cpuPerCoreEl.setAttribute("checked", "");
      } else {
        cpuPerCoreEl.removeAttribute("checked");
      }
    }
  }
  if (cpuCoreEl) {
    const raw = settings && settings.cpuCore !== undefined ? settings.cpuCore : cpuCoreEl.value;
    const nextValue = clampCpuCore(readPositiveInt(raw, 1));
    if (String(cpuCoreEl.value) !== String(nextValue)) {
      cpuCoreEl.value = nextValue;
    }
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      void setSettings({ cpuCore: nextValue });
    }
    syncCpuCoreLimits(nextValue);
  }
  if (pollIntervalEl) {
    const raw = settings && settings.pollIntervalSec !== undefined ? settings.pollIntervalSec : pollIntervalEl.value;
    const nextValue = clampPollInterval(readPositiveInt(raw, 1));
    if (String(pollIntervalEl.value) !== String(nextValue)) {
      pollIntervalEl.value = nextValue;
    }
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
      void setSettings({ pollIntervalSec: nextValue });
    }
  }
  if (warnThresholdEl) {
    const rawWarn = settings && settings.warnThreshold !== undefined ? settings.warnThreshold : "";
    const warnVal = parseInt(rawWarn, 10);
    warnThresholdEl.value = Number.isFinite(warnVal) && warnVal > 0 ? String(warnVal) : "";
  }
  if (topThresholdEl) {
    const rawTop = settings && settings.topThreshold !== undefined ? settings.topThreshold : 5;
    const topVal = parseInt(rawTop, 10);
    topThresholdEl.value = Number.isFinite(topVal) && topVal > 0 ? String(topVal) : "";
  }
  updateVisibility(normalized.group, normalized.metric, normalized.cpuPerCore);
  requestDataSources(normalized.group);
  wireAll();
  requestAnimationFrame(() => {
    suppressEvents = false;
    // Signal plugin that PI is ready to receive data
    sendPiReady();
  });
}

function sendPiReady() {
  if (typeof streamDeckClient.sendToPlugin === "function") {
    streamDeckClient.sendToPlugin({ event: "piReady" });
  } else {
    streamDeckClient.send("sendToPlugin", { event: "piReady" });
  }
}

async function setSettings(nextSettings) {
  const merged = { ...currentSettings, ...nextSettings };
  if (settingsEqual(merged, currentSettings)) {
    currentSettings = merged;
    return;
  }
  currentSettings = merged;
  await streamDeckClient.setSettings(currentSettings);
  sendSettingsToPlugin(currentSettings);
}

function sendSettingsToPlugin(settings) {
  if (typeof streamDeckClient.sendToPlugin === "function") {
    streamDeckClient.sendToPlugin({ event: "applySettings", settings });
  } else if (typeof streamDeckClient.send === "function") {
    streamDeckClient.send("sendToPlugin", { event: "applySettings", settings });
  }
}

function requestDataSources(group) {
  const events = [];
  if (group === "gpu") events.push("getGpus");
  if (group === "disk") events.push("getDisks");
  if (group === "network") events.push("getNetIfaces");
  if (events.length === 0) return;

  for (const event of events) {
    if (typeof streamDeckClient.sendToPlugin === "function") {
      streamDeckClient.sendToPlugin({ event });
    } else if (typeof streamDeckClient.send === "function") {
      streamDeckClient.send("sendToPlugin", { event });
    }
  }
}

async function handleGroupChange(event) {
  if (suppressEvents) return;
  const group = readValueFromEvent(event, groupEl.value);
  const cpuPerCore = readCheckboxValueFromEvent(event, cpuPerCoreEl);
  const metric = group === "cpu" ? (cpuPerCore ? "cpu-core" : "cpu-total") : DEFAULT_METRIC[group] || "cpu-total";
  setOptions(metricEl, METRICS_BY_GROUP[group] || []);
  metricEl.value = metric;
  updateVisibility(group, metric, cpuPerCore);
  await setSettings({ group, metric, cpuPerCore });
  requestDataSources(group);
}

async function handleMetricChange(event) {
  if (suppressEvents) return;
  const group = groupEl.value;
  const metric = readValueFromEvent(event, metricEl.value);
  if (group === "cpu") {
    const isSpecialCpu = metric === "cpu-peak" || metric === "top-cpu";
    const cpuPerCore = isSpecialCpu ? false : metric === "cpu-core";
    updateVisibility(group, metric, cpuPerCore);
    await setSettings({ group, metric, cpuPerCore });
    return;
  }
  updateVisibility(group, metric, readCheckboxValue(cpuPerCoreEl));
  await setSettings({ group, metric });
}

async function handleCpuModeChange(event) {
  if (suppressEvents) return;
  const cpuPerCore = readCheckboxValueFromEvent(event, cpuPerCoreEl);
  const metric = cpuPerCore ? "cpu-core" : "cpu-total";
  updateVisibility("cpu", metric, cpuPerCore);
  await setSettings({ cpuPerCore, metric });
}

async function handlePollIntervalChange(event) {
  if (suppressEvents) return;
  const rawValue = readValueFromEvent(event, pollIntervalEl.value);
  const nextValue = clampPollInterval(readPositiveInt(rawValue, 1));
  if (String(pollIntervalEl.value) !== String(nextValue)) {
    pollIntervalEl.value = nextValue;
  }
  await setSettings({ pollIntervalSec: nextValue });
}

async function handleCpuCoreChange(event) {
  if (suppressEvents) return;
  const rawValue = readValueFromEvent(event, cpuCoreEl.value);
  const nextValue = clampCpuCore(readPositiveInt(rawValue, 1));
  if (String(cpuCoreEl.value) !== String(nextValue)) {
    cpuCoreEl.value = nextValue;
  }
  syncCpuCoreLimits(nextValue);
  await setSettings({ cpuCore: nextValue });
}

async function stepCpuCore(delta) {
  if (!cpuCoreEl) return;
  const rawValue = cpuCoreEl.value;
  const nextValue = clampCpuCore(readPositiveInt(rawValue, 1) + delta);
  if (String(cpuCoreEl.value) !== String(nextValue)) {
    cpuCoreEl.value = nextValue;
  }
  syncCpuCoreLimits(nextValue);
  await setSettings({ cpuCore: nextValue });
}

function handleCpuCoreDown() {
  void stepCpuCore(-1);
}

function handleCpuCoreUp() {
  void stepCpuCore(1);
}

function handleRescanDisks() {
  if (typeof streamDeckClient.sendToPlugin === "function") {
    streamDeckClient.sendToPlugin({ event: "getDisks" });
  } else {
    streamDeckClient.send("sendToPlugin", { event: "getDisks" });
  }
}

function handleRescanInterfaces() {
  if (typeof streamDeckClient.sendToPlugin === "function") {
    streamDeckClient.sendToPlugin({ event: "getNetIfaces" });
  } else {
    streamDeckClient.send("sendToPlugin", { event: "getNetIfaces" });
  }
}

// Handle GPU selection change (plain select, not sdpi-select)
async function handleGpuChange(event) {
  if (suppressEvents) return;
  const gpuIndex = parseInt(readValueFromEvent(event, document.getElementById("gpu")?.value ?? "0"), 10) || 0;
  await setSettings({ gpuIndex });
}

// Handle disk selection change (plain select, not sdpi-select)
async function handleDiskChange(event) {
  if (suppressEvents) return;
  const diskId = readValueFromEvent(event, document.getElementById("disk")?.value ?? "");
  await setSettings({ diskId });
}

// Handle network interface selection change (plain select, not sdpi-select)
async function handleNetChange(event) {
  if (suppressEvents) return;
  const netIface = readValueFromEvent(event, document.getElementById("net")?.value ?? "");
  await setSettings({ netIface });
}

async function handleWarnThresholdChange(event) {
  if (suppressEvents) return;
  const raw = readValueFromEvent(event, warnThresholdEl ? warnThresholdEl.value : "");
  const val = parseInt(raw, 10);
  const next = Number.isFinite(val) && val > 0 ? Math.min(100, val) : 0;
  await setSettings({ warnThreshold: next });
}

async function handleTopThresholdChange(event) {
  if (suppressEvents) return;
  const raw = readValueFromEvent(event, topThresholdEl ? topThresholdEl.value : "");
  const val = parseInt(raw, 10);
  const next = Number.isFinite(val) && val > 0 ? Math.min(100, val) : 0;
  await setSettings({ topThreshold: next });
}

function wireAll() {
  wireInput(groupEl, handleGroupChange);
  wireInput(metricEl, handleMetricChange);
  if (pollIntervalEl) wireInput(pollIntervalEl, handlePollIntervalChange);
  if (cpuPerCoreEl) wireInput(cpuPerCoreEl, handleCpuModeChange);
  if (cpuCoreEl) wireInput(cpuCoreEl, handleCpuCoreChange);
  if (cpuCoreDownEl) wireButton(cpuCoreDownEl, handleCpuCoreDown);
  if (cpuCoreUpEl) wireButton(cpuCoreUpEl, handleCpuCoreUp);
  if (warnThresholdEl) wireInput(warnThresholdEl, handleWarnThresholdChange);
  if (topThresholdEl) wireInput(topThresholdEl, handleTopThresholdChange);
  // Wire plain refresh buttons (not sdpi-button, so direct addEventListener)
  if (rescanDisksEl) rescanDisksEl.addEventListener("click", handleRescanDisks);
  if (rescanInterfacesEl) rescanInterfacesEl.addEventListener("click", handleRescanInterfaces);
  // Wire plain select elements for GPU, disk, network
  const gpuSelect = document.getElementById("gpu");
  const diskSelect = document.getElementById("disk");
  const netSelect = document.getElementById("net");
  if (gpuSelect) gpuSelect.addEventListener("change", handleGpuChange);
  if (diskSelect) diskSelect.addEventListener("change", handleDiskChange);
  if (netSelect) netSelect.addEventListener("change", handleNetChange);
}

function extractSettings(value) {
  if (value && typeof value === "object") {
    if (value.settings && typeof value.settings === "object") {
      return value.settings;
    }
    return value;
  }
  return {};
}

async function init() {
  const settings = extractSettings(await streamDeckClient.getSettings());
  currentSettings = settings;
  applySettings(currentSettings);
}

streamDeckClient.didReceiveSettings.subscribe((ev) => {
  currentSettings = extractSettings(ev.payload);
  applySettings(currentSettings);
});

init();

