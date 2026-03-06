// Shared property inspector logic for all device PIs
const { streamDeckClient } = SDPIComponents;

// ─── Timing / Debug ──────────────────────────────────────────────────────
const piStartTime = performance.now();
const PI_TIMING_LOGS_ENABLED = (() => {
  try {
    const query = new URLSearchParams(window.location.search);
    if (query.get("piDebugTiming") === "1") return true;
    return window.localStorage?.getItem("simplestats_pi_debug_timing") === "1";
  } catch {
    return false;
  }
})();

function logTiming(msg) {
  if (!PI_TIMING_LOGS_ENABLED) return;
  const elapsed = (performance.now() - piStartTime).toFixed(1);
  const logMsg = `[PI +${elapsed}ms] ${msg}`;
  console.log(logMsg);
  try {
    if (typeof streamDeckClient.sendToPlugin === "function") {
      streamDeckClient.sendToPlugin({ event: "piLog", message: logMsg });
    } else if (typeof streamDeckClient.send === "function") {
      streamDeckClient.send("sendToPlugin", { event: "piLog", message: logMsg });
    }
  } catch { /* ignore */ }
}

// ─── Device list cache ───────────────────────────────────────────────────
let deviceCache = { gpus: null, disks: null, netIfaces: null };
let settingsLoadedResolve;
const settingsLoaded = new Promise((resolve) => { settingsLoadedResolve = resolve; });

function populateSelect(selectEl, items, currentValue) {
  if (!selectEl || !items) return;
  logTiming(`populateSelect: ${selectEl.id} items=${items.length} currentValue=${currentValue}`);
  while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    selectEl.appendChild(opt);
  }
  if (currentValue !== undefined && currentValue !== null) {
    selectEl.value = currentValue;
  }
}

function loadCacheFromSettings(settings) {
  if (settings?._deviceCache) {
    deviceCache = settings._deviceCache;
    logTiming(`loadCacheFromSettings: gpus=${deviceCache.gpus?.length ?? 'null'}, disks=${deviceCache.disks?.length ?? 'null'}, net=${deviceCache.netIfaces?.length ?? 'null'}`);
    const gpuEl = document.getElementById("gpu");
    const diskEl = document.getElementById("disk");
    const netEl = document.getElementById("net");
    if (deviceCache.gpus && gpuEl) populateSelect(gpuEl, deviceCache.gpus, settings?.gpuIndex);
    if (deviceCache.disks && diskEl) populateSelect(diskEl, deviceCache.disks, settings?.diskId);
    if (deviceCache.netIfaces && netEl) populateSelect(netEl, deviceCache.netIfaces, settings?.netIface);
  }
  if (settingsLoadedResolve) {
    settingsLoadedResolve();
    settingsLoadedResolve = null;
  }
}

// Listen for plugin messages (rescan results)
if (streamDeckClient.onDidReceivePluginMessage) {
  streamDeckClient.onDidReceivePluginMessage.subscribe((ev) => {
    const payload = ev?.payload;
    if (!payload) return;
    logTiming(`onDidReceivePluginMessage: event=${payload.event}, items=${payload.items?.length ?? 0}`);
    if (payload.event === "getGpus" && payload.items) {
      deviceCache.gpus = payload.items;
      populateSelect(document.getElementById("gpu"), payload.items, currentSettings?.gpuIndex ?? "");
    }
    if (payload.event === "getDisks" && payload.items) {
      deviceCache.disks = payload.items;
      populateSelect(document.getElementById("disk"), payload.items, currentSettings?.diskId ?? "");
    }
    if (payload.event === "getNetIfaces" && payload.items) {
      deviceCache.netIfaces = payload.items;
      populateSelect(document.getElementById("net"), payload.items, currentSettings?.netIface ?? "");
    }
  });
}

// ─── Metric sets ─────────────────────────────────────────────────────────
const PERCENT_METRICS = new Set([
  "cpu-total", "cpu-core", "cpu-peak", "gpu-load", "gpu-vram",
  "gpu-encoder", "gpu-decoder", "gpu-fan",
  "mem-total", "disk-activity", "disk-used", "disk-free", "top-mem-pct"
]);

const TOP_PROCESS_METRICS = new Set([
  "top-cpu", "gpu-top-compute", "top-mem", "top-mem-pct", "top-disk"
]);

// ─── Settings helpers ────────────────────────────────────────────────────
const SETTINGS_KEYS = [
  "group", "metric", "cpuPerCore", "cpuCore", "gpuIndex",
  "diskId", "netIface", "netPeriodSec",
  "warnThreshold", "topThreshold"
];

let currentSettings = {};
let suppressEvents = false;

function normalizeSettingValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function settingsEqual(left, right) {
  return SETTINGS_KEYS.every(
    (key) => normalizeSettingValue(left && left[key]) === normalizeSettingValue(right && right[key])
  );
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

function sendPiReady() {
  if (typeof streamDeckClient.sendToPlugin === "function") {
    streamDeckClient.sendToPlugin({ event: "piReady" });
  } else {
    streamDeckClient.send("sendToPlugin", { event: "piReady" });
  }
}

function requestDataSources(group) {
  const events = [];
  if (group === "gpu") events.push("getGpus");
  if (group === "disk") events.push("getDisks");
  if (group === "network") events.push("getNetIfaces");
  for (const event of events) {
    if (typeof streamDeckClient.sendToPlugin === "function") {
      streamDeckClient.sendToPlugin({ event });
    } else if (typeof streamDeckClient.send === "function") {
      streamDeckClient.send("sendToPlugin", { event });
    }
  }
}

// ─── UI helpers ──────────────────────────────────────────────────────────
function setOptions(select, options) {
  while (select.firstChild) select.removeChild(select.firstChild);
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
  if (target && typeof target.value !== "undefined") return target.value;
  return fallbackValue;
}

function readPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

// ─── Wiring helpers ──────────────────────────────────────────────────────
const wiredHosts = new WeakSet();
const wiredButtonTargets = new WeakMap();
const wiredPlainListeners = new WeakMap();

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
    // Bind once to the host element so Stream Deck's custom controls do not
    // double-fire through both the wrapper and their inner shadow DOM input.
    element.addEventListener("change", handler);
    wiredHosts.add(element);
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

function wirePlainListener(element, eventName, handler) {
  if (!element) return;
  const existing = wiredPlainListeners.get(element);
  const previous = existing && existing[eventName];
  if (previous === handler) return;
  if (typeof previous === "function") {
    element.removeEventListener(eventName, previous);
  }
  element.addEventListener(eventName, handler);
  wiredPlainListeners.set(element, { ...(existing || {}), [eventName]: handler });
}

// ─── Common handlers ─────────────────────────────────────────────────────
async function handleWarnThresholdChange(event) {
  if (suppressEvents) return;
  const warnThresholdEl = document.getElementById("warn-threshold");
  const raw = readValueFromEvent(event, warnThresholdEl ? warnThresholdEl.value : "");
  const val = parseInt(raw, 10);
  const next = Number.isFinite(val) && val > 0 ? Math.min(100, val) : 0;
  await setSettings({ warnThreshold: next });
}

async function handleTopThresholdChange(event) {
  if (suppressEvents) return;
  const topThresholdEl = document.getElementById("top-threshold");
  const raw = readValueFromEvent(event, topThresholdEl ? topThresholdEl.value : "");
  const val = parseInt(raw, 10);
  const max = currentSettings.metric === "top-disk" ? 10000 : 100;
  const next = Number.isFinite(val) && val > 0 ? Math.min(max, val) : 0;
  await setSettings({ topThreshold: next });
}

function extractSettings(value) {
  if (value && typeof value === "object") {
    if (value.settings && typeof value.settings === "object") return value.settings;
    return value;
  }
  return {};
}

// ─── initPI entry point ──────────────────────────────────────────────────
// config: { group, metrics, defaultMetric, normalizeSettings, updateVisibility, wireDeviceControls, applyDeviceSettings }
function initPI(config) {
  const metricEl = document.getElementById("metric");
  const warnThresholdEl = document.getElementById("warn-threshold");
  const topThresholdEl = document.getElementById("top-threshold");

  function applySettings(settings) {
    suppressEvents = true;
    loadCacheFromSettings(settings);
    const normalized = config.normalizeSettings(settings);
    setOptions(metricEl, config.metrics);
    metricEl.value = normalized.metric;
    // Apply warn threshold
    if (warnThresholdEl) {
      const rawWarn = settings && settings.warnThreshold !== undefined ? settings.warnThreshold : "";
      const warnVal = parseInt(rawWarn, 10);
      warnThresholdEl.value = Number.isFinite(warnVal) && warnVal > 0 ? String(warnVal) : "";
    }
    // Apply idle threshold
    if (topThresholdEl) {
      const rawTop = settings && settings.topThreshold !== undefined ? settings.topThreshold : 0;
      const topVal = parseInt(rawTop, 10);
      topThresholdEl.value = Number.isFinite(topVal) && topVal > 0 ? String(topVal) : "";
    }
    // Device-specific apply
    if (config.applyDeviceSettings) config.applyDeviceSettings(settings, normalized);
    config.updateVisibility(normalized.metric);
    requestDataSources(config.group);
    wireAll();
    requestAnimationFrame(() => {
      suppressEvents = false;
      sendPiReady();
    });
  }

  async function handleMetricChange(event) {
    if (suppressEvents) return;
    const metric = readValueFromEvent(event, metricEl.value);
    if (config.handleMetricChange) {
      await config.handleMetricChange(metric);
    } else {
      config.updateVisibility(metric);
      await setSettings({ metric });
    }
  }

  function wireAll() {
    wireInput(metricEl, handleMetricChange);
    if (warnThresholdEl) wireInput(warnThresholdEl, handleWarnThresholdChange);
    if (topThresholdEl) wireInput(topThresholdEl, handleTopThresholdChange);
    if (config.wireDeviceControls) config.wireDeviceControls();
  }

  async function init() {
    const settings = extractSettings(await streamDeckClient.getSettings());
    // Inject the fixed group
    settings.group = config.group;
    currentSettings = settings;
    applySettings(currentSettings);
  }

  streamDeckClient.didReceiveSettings.subscribe((ev) => {
    currentSettings = extractSettings(ev.payload);
    currentSettings.group = config.group;
    applySettings(currentSettings);
  });

  init();
}

// Export for per-device PI scripts
window.piCommon = {
  initPI,
  setSettings,
  setVisible,
  setOptions,
  wireInput,
  wireButton,
  wirePlainListener,
  readCheckboxValue,
  readCheckboxValueFromEvent,
  readValueFromEvent,
  readPositiveInt,
  populateSelect,
  PERCENT_METRICS,
  TOP_PROCESS_METRICS,
  get suppressEvents() { return suppressEvents; },
  get currentSettings() { return currentSettings; }
};
