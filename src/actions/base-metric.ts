import fs from "node:fs";
import path from "node:path";
import streamDeck, {
  SingletonAction,
  Target,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type PropertyInspectorDidAppearEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent
} from "@elgato/streamdeck";
import {
  statsPoller,
  type DiskPerf,
  type DiskSnapshot,
  type GpuSnapshot,
  type NetInterfaceSnapshot,
  type PerfSummarySnapshot,
  type StatsSnapshot
} from "../stats";

const log = streamDeck.logger.createScope("MetricAction");
const ALWAYS_DEBUG = false;
const DEBUG_LOG_ROTATE_BYTES = 100 * 1024 * 1024;
const DEBUG_LOG_ROTATE_CHECK_MS = 10 * 1000;
const DEBUG_LOG_FLUSH_INTERVAL_MS = 250;
const DEBUG_LOG_QUEUE_MAX_LINES = 4000;
const ENABLE_PI_TIMING_LOGS = process.env.SIMPLESTATS_PI_DEBUG_TIMING === "1";
let debugLogRotateAt = 0;
const debugLogPaths = (() => {
  const paths: string[] = [];
  // Try plugin installation directory first (production)
  const pluginDir = path.resolve(__dirname, "..");
  paths.push(path.join(pluginDir, "debug.log"));
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  if (appData) {
    paths.push(path.join(appData, "Elgato", "StreamDeck", "Plugins", "com.crest.simplestats.sdPlugin", "debug.log"));
  }
  if (process.env.USERPROFILE) {
    paths.push(path.join(process.env.USERPROFILE, "SimpleStats-debug.log"));
  }
  paths.push(path.join(process.cwd(), "debug.log"));
  return paths;
})();
let activeDebugLogPath: string | null = null;
let debugLogQueue: string[] = [];
let debugLogDroppedLines = 0;
let debugLogFlushTimer: ReturnType<typeof setTimeout> | null = null;
let debugLogFlushInProgress = false;

function rotateDebugLogIfNeeded(candidate: string): void {
  const now = Date.now();
  if (now - debugLogRotateAt < DEBUG_LOG_ROTATE_CHECK_MS) return;
  debugLogRotateAt = now;
  try {
    if (!fs.existsSync(candidate)) return;
    const stats = fs.statSync(candidate);
    if (stats.size < DEBUG_LOG_ROTATE_BYTES) return;
    fs.truncateSync(candidate, 0);
  } catch {
    // Ignore rotation errors.
  }
}

function scheduleDebugLogFlush(): void {
  if (debugLogFlushTimer) return;
  debugLogFlushTimer = setTimeout(() => {
    debugLogFlushTimer = null;
    void flushDebugLogQueue();
  }, DEBUG_LOG_FLUSH_INTERVAL_MS);
  if (typeof debugLogFlushTimer.unref === "function") {
    debugLogFlushTimer.unref();
  }
}

async function flushDebugLogQueue(): Promise<void> {
  if (debugLogFlushInProgress) return;
  debugLogFlushInProgress = true;
  try {
    if (debugLogDroppedLines > 0) {
      const droppedLine = `${new Date().toISOString()} debugLogDropped {"count":${debugLogDroppedLines}}\n`;
      debugLogQueue.unshift(droppedLine);
      debugLogDroppedLines = 0;
    }
    while (debugLogQueue.length > 0) {
      const lines = debugLogQueue;
      debugLogQueue = [];
      const payload = lines.join("");
      const candidates = activeDebugLogPath ? [activeDebugLogPath] : debugLogPaths;
      let wrote = false;
      for (const candidate of candidates) {
        try {
          const dir = path.dirname(candidate);
          await fs.promises.mkdir(dir, { recursive: true });
          rotateDebugLogIfNeeded(candidate);
          await fs.promises.appendFile(candidate, payload, "utf8");
          activeDebugLogPath = candidate;
          wrote = true;
          break;
        } catch {
          // Try the next path.
        }
      }
      if (!wrote) {
        debugLogQueue = lines.concat(debugLogQueue);
        break;
      }
    }
  } catch {
    // Swallow logging errors to avoid impacting the plugin.
  } finally {
    debugLogFlushInProgress = false;
    if (debugLogQueue.length > 0) {
      scheduleDebugLogFlush();
    }
  }
}

function writeDebugLog(message: string, data?: unknown): void {
  try {
    const stamp = new Date().toISOString();
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    debugLogQueue.push(`${stamp} ${message}${payload}\n`);
    if (debugLogQueue.length > DEBUG_LOG_QUEUE_MAX_LINES) {
      const dropCount = debugLogQueue.length - DEBUG_LOG_QUEUE_MAX_LINES;
      debugLogQueue.splice(0, dropCount);
      debugLogDroppedLines += dropCount;
    }
    scheduleDebugLogFlush();
  } catch {
    // Swallow logging errors to avoid impacting the plugin.
  }
}

writeDebugLog("loggerInit", { paths: debugLogPaths });

export type MetricGroup = "cpu" | "gpu" | "memory" | "disk" | "network" | "system";
export type MetricId =
  | "cpu-total"
  | "cpu-core"
  | "cpu-peak"
  | "gpu-load"
  | "gpu-vram"
  | "gpu-vram-used"
  | "gpu-temp"
  | "gpu-power"
  | "gpu-top-compute"
  | "mem-total"
  | "mem-used"
  | "disk-activity"
  | "disk-used"
  | "disk-free"
  | "disk-use"
  | "disk-read"
  | "disk-write"
  | "net-up"
  | "net-down"
  | "net-total"
  | "top-cpu"
  | "top-mem"
  | "top-mem-pct"
  | "top-disk"
  | "clock"
  | "perf";

export type Settings = {
  group?: MetricGroup;
  metric?: MetricId;
  cpuPerCore?: boolean;
  cpuCore?: number | string;
  gpuIndex?: number | string;
  diskId?: string;
  netIface?: string;
  netPeriodSec?: number | string;
  pollIntervalSec?: number | string;
  warnThreshold?: number | string;
  topThreshold?: number | string;
};

type NormalizedSettings = {
  group: MetricGroup;
  metric: MetricId;
  cpuPerCore: boolean;
  cpuCore: number;
  gpuIndex: number;
  diskId: string;
  netIface: string;
  netPeriodSec: number;
  pollIntervalSec: number;
  warnThreshold: number;
  topThreshold: number;
};

type ActionState = {
  settings: NormalizedSettings;
  settingsKey: string;
  cacheKeyBase: string;
  cacheKey: string;
  settingsReady: boolean;
  history: HistorySeries;
  lastCacheAt?: number;
  unsubscribe?: () => void;
  debugLogRemaining?: number;
  lastRawMetric?: string;
  lastRawGroup?: string;
  lastRenderAt?: number;
  diskSpaceWarmupComplete?: boolean;
  lastEffectiveDiskId?: string;
  diskHistories?: Map<string, HistorySeries>;
};

type MetricDisplay = {
  label: string;
  value: string;
  graphValue: number | null;
  graphMax: number | null;
  graphMinMax: number | null;
  graphMin: number | null;
  processName?: string | null;
  processIcon?: string | null;
  labelArrow?: string | null;
  perfSummary?: PerfSummarySnapshot | null;
  idle?: boolean;
};

type DataSourceItem = {
  label: string;
  value: string;
};

type DataSourcePayload = {
  event?: string;
  settings?: Settings;
  message?: string;
};

type HistoryCacheEntry = {
  values: Array<number | null>;
  settingsKey: string;
  lastSeen: number;
};

const HISTORY_WINDOW_SEC = 60;
const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;
const HISTORY_CACHE_MAX = 200;
const historyCache = new Map<string, HistoryCacheEntry>();
const BACKGROUND_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours — keeps history alive across realistic Stream Deck sessions

type BackgroundState = {
  settings: NormalizedSettings;
  settingsKey: string;
  history: HistorySeries;
  lastRenderAt?: number;
  expiresAt: number;
  bgId: string;
  cacheKey: string;
  lastEffectiveDiskId?: string;
  diskHistories?: Map<string, HistorySeries>;
};

const backgroundStates = new Map<string, BackgroundState>();
let backgroundUnsubscribe: (() => void) | null = null;

const METRICS_BY_GROUP: Record<MetricGroup, MetricId[]> = {
  cpu: ["cpu-total", "cpu-core", "cpu-peak", "top-cpu"],
  gpu: ["gpu-load", "gpu-vram", "gpu-vram-used", "gpu-temp", "gpu-power", "gpu-top-compute"],
  memory: ["mem-total", "mem-used", "top-mem", "top-mem-pct"],
  disk: ["disk-activity", "disk-used", "disk-free", "disk-read", "disk-write", "top-disk"],
  network: ["net-down", "net-up", "net-total"],
  system: ["clock", "perf"]
};

const DEFAULT_METRIC: Record<MetricGroup, MetricId> = {
  cpu: "cpu-total",
  gpu: "gpu-load",
  memory: "mem-total",
  disk: "disk-activity",
  network: "net-down",
  system: "clock"
};

const DEFAULT_SETTINGS: NormalizedSettings = {
  group: "cpu",
  metric: "cpu-total",
  cpuPerCore: false,
  cpuCore: 1,
  gpuIndex: 0,
  diskId: "",
  netIface: "",
  netPeriodSec: 60,
  pollIntervalSec: 1,
  warnThreshold: 0,
  topThreshold: 0
};

const KEY_SIZE = 72;
const LABEL_Y = 9;
const VALUE_Y = 25;
const USE_GRADIENT_FILL = true; // set to false for flat 0.18 opacity fill
const GRAPH_LEFT = 2;
const GRAPH_RIGHT = KEY_SIZE - 2;
const GRAPH_TOP = 30;
const GRAPH_BOTTOM = KEY_SIZE - 5;
const TEXT_LEFT = 5;
const TEXT_WIDTH = KEY_SIZE - TEXT_LEFT * 2;

type GraphStyle = {
  line: string;
  fill: string;
  label: string;
  value: string;
  background: string;
};

const GROUP_STYLE: Record<MetricGroup, GraphStyle> = {
  cpu: {
    line: "#27D4FF",
    fill: "#27D4FF",
    label: "#8FE7FF",
    value: "#FFFFFF",
    background: "#0B0D10"
  },
  gpu: {
    line: "#A06CFF",
    fill: "#A06CFF",
    label: "#C6A7FF",
    value: "#FFFFFF",
    background: "#0B0D10"
  },
  memory: {
    line: "#2A6DFF",
    fill: "#2A6DFF",
    label: "#8FB4FF",
    value: "#FFFFFF",
    background: "#0B0D10"
  },
  disk: {
    line: "#4CFF8A",
    fill: "#4CFF8A",
    label: "#A6FFC7",
    value: "#FFFFFF",
    background: "#0B0D10"
  },
  network: {
    line: "#FF6FB1",
    fill: "#FF6FB1",
    label: "#FFC1DD",
    value: "#FFFFFF",
    background: "#0B0D10"
  },
  system: {
    line: "#FFD166",
    fill: "#FFD166",
    label: "#FFE2A3",
    value: "#FFFFFF",
    background: "#0B0D10"
  }
};

class HistorySeries {
  private values: Array<number | null> = [];
  private maxPoints: number;

  constructor(maxPoints: number) {
    this.maxPoints = Math.max(1, Math.round(maxPoints));
  }

  push(value: number | null) {
    const safe = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
    this.values.push(safe);
    if (this.values.length > this.maxPoints) {
      this.values.shift();
    }
  }

  setMaxPoints(maxPoints: number): boolean {
    const next = Math.max(1, Math.round(maxPoints));
    if (next === this.maxPoints) return false;
    this.maxPoints = next;
    if (this.values.length > this.maxPoints) {
      this.values = this.values.slice(-this.maxPoints);
    }
    return true;
  }

  clear() {
    this.values = [];
  }

  getValues(): Array<number | null> {
    return [...this.values];
  }

  last(): number | null {
    return this.values.length > 0 ? this.values[this.values.length - 1] : null;
  }

  getMaxPoints(): number {
    return this.maxPoints;
  }

  setValues(values: Array<number | null>): void {
    this.values = values
      .map((value) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null))
      .slice(-this.maxPoints);
  }
}

function historyPointsForInterval(intervalSec: number): number {
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) return 1;
  return Math.max(1, Math.round(HISTORY_WINDOW_SEC / intervalSec));
}

function intervalMsForSettings(settings: NormalizedSettings): number {
  return settings.group === "disk" && (settings.metric === "disk-used" || settings.metric === "disk-free")
    ? 60_000
    : Math.max(1, settings.pollIntervalSec) * 1000;
}

function isDiskSpaceMetric(settings: NormalizedSettings): boolean {
  return settings.group === "disk" && (settings.metric === "disk-used" || settings.metric === "disk-free");
}

function diskGraphValue(snapshot: StatsSnapshot, metric: MetricId, diskId: string): number | null {
  switch (metric) {
    case "disk-activity": {
      const perf = selectDiskPerf(snapshot, diskId);
      return perf?.activePct ?? null;
    }
    case "disk-used": {
      const disk = selectDisk(snapshot, diskId);
      return disk?.usePct ?? null;
    }
    case "disk-free": {
      const disk = selectDisk(snapshot, diskId);
      return typeof disk?.usePct === "number" ? 100 - disk.usePct : null;
    }
    case "disk-read": {
      const perf = selectDiskPerf(snapshot, diskId);
      return bytesToMB(perf?.readBps ?? null);
    }
    case "disk-write": {
      const perf = selectDiskPerf(snapshot, diskId);
      return bytesToMB(perf?.writeBps ?? null);
    }
    default:
      return null;
  }
}

function swapDiskHistoryIfNeeded(
  state: { history: HistorySeries; lastEffectiveDiskId?: string; diskHistories?: Map<string, HistorySeries> },
  settings: NormalizedSettings,
  snapshot: StatsSnapshot
): void {
  if (settings.diskId !== "" || settings.group !== "disk" || settings.metric === "top-disk") return;
  const effectiveId = selectBusiestDiskId(snapshot);
  if (!effectiveId) return;
  if (!state.diskHistories) state.diskHistories = new Map();

  // Ensure all known disks have a history series
  const maxPts = state.history.getMaxPoints();
  for (const key of Object.keys(snapshot.diskPerfById)) {
    if (key === "_TOTAL") continue;
    if (!state.diskHistories.has(key)) {
      state.diskHistories.set(key, key === (state.lastEffectiveDiskId || effectiveId) ? state.history : new HistorySeries(maxPts));
    }
  }

  // Push current metric value to all inactive disk histories
  for (const [diskId, series] of state.diskHistories) {
    if (diskId === effectiveId) continue; // active disk is pushed by the caller
    series.push(diskGraphValue(snapshot, settings.metric, diskId));
  }

  // Swap active history if the busiest disk changed
  if (state.lastEffectiveDiskId && effectiveId !== state.lastEffectiveDiskId) {
    state.diskHistories.set(state.lastEffectiveDiskId, state.history);
    const existing = state.diskHistories.get(effectiveId);
    if (existing) {
      state.history = existing;
    } else {
      state.history = new HistorySeries(maxPts);
      state.diskHistories.set(effectiveId, state.history);
    }
  }

  state.lastEffectiveDiskId = effectiveId;
}

function historyCacheBaseKey(action: KeyAction<Settings>): string {
  const coords = action.coordinates ? `${action.coordinates.row},${action.coordinates.column}` : "na";
  const manifest = action.manifestId ?? "unknown";
  return `${manifest}|${coords}`;
}

function historyCacheKey(baseKey: string, settingsKeyValue: string): string {
  return `${baseKey}|${settingsKeyValue}`;
}

function pruneHistoryCache(now = Date.now()): void {
  for (const [key, entry] of historyCache.entries()) {
    if (now - entry.lastSeen > HISTORY_CACHE_TTL_MS) {
      historyCache.delete(key);
    }
  }
  if (historyCache.size <= HISTORY_CACHE_MAX) return;
  const entries = [...historyCache.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  while (entries.length > HISTORY_CACHE_MAX) {
    const entry = entries.shift();
    if (entry) historyCache.delete(entry[0]);
  }
}

function saveHistoryToCache(state: ActionState, actionId: string, force = false): void {
  const now = Date.now();
  if (!force && typeof state.lastCacheAt === "number" && now - state.lastCacheAt < 5000) {
    return;
  }
  historyCache.set(state.cacheKey, {
    values: state.history.getValues(),
    settingsKey: state.settingsKey,
    lastSeen: now
  });
  state.lastCacheAt = now;
  pruneHistoryCache(now);
  if (force) {
    writeDebugLog("historyCacheStore", { actionId, cacheKey: state.cacheKey });
  }
}

function stopBackgroundState(cacheKey: string, state: BackgroundState): void {
  backgroundStates.delete(cacheKey);
  statsPoller.clearInterest(state.bgId);
  if (backgroundStates.size === 0 && backgroundUnsubscribe) {
    backgroundUnsubscribe();
    backgroundUnsubscribe = null;
  }
}

function updateBackgroundState(state: BackgroundState, snapshot: StatsSnapshot, now: number): void {
  if (!snapshot.osSupported) return;
  const intervalMs = intervalMsForSettings(state.settings);
  if (state.lastRenderAt && now - state.lastRenderAt < intervalMs) return;
  state.lastRenderAt = now;
  state.history.setMaxPoints(historyPointsForInterval(intervalMs / 1000));
  const display = buildMetricDisplay(snapshot, state.settings);
  swapDiskHistoryIfNeeded(state, state.settings, snapshot);
  state.history.push(display.graphValue);
  historyCache.set(state.cacheKey, {
    values: state.history.getValues(),
    settingsKey: state.settingsKey,
    lastSeen: now
  });
  pruneHistoryCache(now);
}

function ensureBackgroundSubscription(): void {
  if (backgroundUnsubscribe) return;
  backgroundUnsubscribe = statsPoller.subscribe((snapshot) => {
    const now = Date.now();
    for (const [key, state] of backgroundStates.entries()) {
      if (now > state.expiresAt) {
        stopBackgroundState(key, state);
        continue;
      }
      updateBackgroundState(state, snapshot, now);
    }
  });
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function computeGraphPaths(
  values: Array<number | null>,
  maxPoints: number,
  fixedMax?: number | null,
  minMax?: number | null,
  fixedMin?: number | null
): { line: string; area: string; hasData: boolean } {
  const plotValues = values.length === 1 ? [values[0], values[0]] : values;
  const numeric = plotValues.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : 0));
  const smoothed = numeric.length > 4
    ? numeric.map((value, index) => {
        if (index < 2 || index > numeric.length - 3) return value;
        return (numeric[index - 2] + numeric[index - 1] + 2 * value + numeric[index + 1] + numeric[index + 2]) / 6;
      })
    : numeric;
  const computedMax = Math.max(...smoothed, 0);
  const computedMin = Math.min(...smoothed, 0);
  let max =
    typeof fixedMax === "number" && Number.isFinite(fixedMax) && fixedMax > 0 ? fixedMax : computedMax;
  if (typeof minMax === "number" && Number.isFinite(minMax) && minMax > 0) {
    max = Math.max(max, minMax);
  }
  let min =
    typeof fixedMin === "number" && Number.isFinite(fixedMin) ? fixedMin : computedMin;
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max) || max <= min) {
    max = min + 1;
  }
  const graphWidth = GRAPH_RIGHT - GRAPH_LEFT;
  const graphHeight = GRAPH_BOTTOM - GRAPH_TOP;
  const n = plotValues.length;
  const step = maxPoints > 1 ? graphWidth / (maxPoints - 1) : 0;

  if (!Number.isFinite(max) || max <= min) {
    const baseline = `M${GRAPH_LEFT} ${GRAPH_BOTTOM} L${GRAPH_RIGHT} ${GRAPH_BOTTOM}`;
    return { line: baseline, area: "", hasData: false };
  }

  const points = smoothed.map((value, index) => {
    const clamped = Math.min(Math.max(value, min), max);
    const x = GRAPH_RIGHT - (n - 1 - index) * step;
    const y = GRAPH_BOTTOM - ((clamped - min) / (max - min)) * graphHeight;
    return { x, y };
  });

  const fmt = (num: number) => num.toFixed(2);
  let line = "";
  if (points.length > 0) {
    line = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
    if (points.length === 2) {
      line += ` L${fmt(points[1].x)} ${fmt(points[1].y)}`;
    } else if (points.length > 2) {
      for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        line += ` Q${fmt(prev.x)} ${fmt(prev.y)} ${fmt(midX)} ${fmt(midY)}`;
      }
      const last = points[points.length - 1];
      line += ` T${fmt(last.x)} ${fmt(last.y)}`;
    }
  }

  const last = points[points.length - 1];
  const first = points[0];
  const area = line
    ? `${line} L${fmt(last.x)} ${GRAPH_BOTTOM} L${fmt(first.x)} ${GRAPH_BOTTOM} Z`
    : "";
  return { line, area, hasData: true };
}

function valueFontSize(text: string): number {
  if (text.length <= 4) return 15;
  if (text.length <= 6) return 13;
  if (text.length <= 8) return 12;
  return 11;
}

const UNIT_SIZE_RATIO = 0.77; // unit suffix rendered at 77% of value font size
function renderValueWithUnit(value: string, fontSize: number, color: string): string {
  if (value === "--" || value === "IDLE") return value;
  const match = value.match(/^([\d.]+)(.+)$/);
  if (!match) return value;
  const [, num, unit] = match;
  const unitSize = Math.round(fontSize * UNIT_SIZE_RATIO);
  return `${num}<tspan font-size="${unitSize}" fill="${color}">${unit}</tspan>`;
}

function textLengthAttrs(text: string): string {
  if (text.length <= 6) return "";
  return ` textLength="${TEXT_WIDTH}" lengthAdjust="spacingAndGlyphs"`;
}

function procTextLengthAttrs(text: string): string {
  if (text.length <= 4) return "";
  return ` textLength="${TEXT_WIDTH}" lengthAdjust="spacingAndGlyphs"`;
}

function wordBreak(text: string, targetIdx: number): number {
  let breakIdx = text.lastIndexOf(" ", targetIdx);
  if (breakIdx <= 0) breakIdx = text.indexOf(" ", targetIdx);
  if (breakIdx <= 0) breakIdx = targetIdx;
  return breakIdx;
}

function renderProcessName(name: string, color: string): string {
  const base = `font-family="Segoe UI, Arial, sans-serif" font-weight="600" text-anchor="middle"`;
  const shadowed = (x: number, y: number, fs: number, attrs: string, content: string) =>
    `<text x="${x-1}" y="${y-1}" ${base} font-size="${fs}" fill="#000000"${attrs}>${content}</text>
    <text x="${x+1}" y="${y-1}" ${base} font-size="${fs}" fill="#000000"${attrs}>${content}</text>
    <text x="${x-1}" y="${y+1}" ${base} font-size="${fs}" fill="#000000"${attrs}>${content}</text>
    <text x="${x+1}" y="${y+1}" ${base} font-size="${fs}" fill="#000000"${attrs}>${content}</text>
    <text x="${x}" y="${y}" ${base} font-size="${fs}" fill="${color}"${attrs}>${content}</text>`;
  if (name.length <= 12) {
    return shadowed(36, 48, 9, procTextLengthAttrs(name), escapeSvg(name));
  }
  if (name.length <= 24) {
    const brk = wordBreak(name, Math.ceil(name.length / 2));
    const l1 = name.slice(0, brk).trim();
    const l2 = name.slice(brk).trim();
    return `${shadowed(36, 44, 8, procTextLengthAttrs(l1), escapeSvg(l1))}
    ${shadowed(36, 54, 8, procTextLengthAttrs(l2), escapeSvg(l2))}`;
  }
  // 3-line layout for very long names
  const third = Math.ceil(name.length / 3);
  const brk1 = wordBreak(name, third);
  const brk2 = wordBreak(name, brk1 + 1 + Math.ceil((name.length - brk1) / 2));
  const l1 = name.slice(0, brk1).trim();
  const l2 = name.slice(brk1, brk2).trim();
  const l3 = name.slice(brk2).trim();
  return `${shadowed(36, 41, 7, procTextLengthAttrs(l1), escapeSvg(l1))}
    ${shadowed(36, 50, 7, procTextLengthAttrs(l2), escapeSvg(l2))}
    ${shadowed(36, 59, 7, procTextLengthAttrs(l3), escapeSvg(l3))}`;
}

const PERCENT_METRICS: Set<MetricId> = new Set([
  "cpu-total", "cpu-core", "cpu-peak", "gpu-load", "gpu-vram",
  "mem-total", "disk-activity", "disk-used", "disk-free", "top-mem-pct"
]);

const WARN_COLOR = "#FF3333";

function getThresholdOverride(
  value: number | null,
  metric: MetricId,
  settings: NormalizedSettings
): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (!PERCENT_METRICS.has(metric)) return null;
  if (settings.warnThreshold > 0 && value >= settings.warnThreshold) return WARN_COLOR;
  return null;
}

function buildKeySvg(display: MetricDisplay, history: HistorySeries, group: MetricGroup, settings?: NormalizedSettings): string {
  const baseStyle = GROUP_STYLE[group] ?? GROUP_STYLE.system;
  const warnColor = settings ? getThresholdOverride(display.graphValue, settings.metric, settings) : null;
  const labelColor = baseStyle.label;
  const valueColor = warnColor ?? baseStyle.value;

  const label = escapeSvg(display.label);
  const value = escapeSvg(display.value);
  const valueSize = valueFontSize(display.value);

  // Idle state: faded label + value, no graph or icon
  if (display.idle) {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">
      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="10" fill="${baseStyle.background}" />
      <text x="${TEXT_LEFT}" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="600" fill="${labelColor}"${textLengthAttrs(display.label)}>${label}</text>
      <text x="${TEXT_LEFT}" y="${VALUE_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="${valueSize}" font-weight="700" fill="${baseStyle.value}" opacity="0.25"${textLengthAttrs(display.value)}>${renderValueWithUnit(value, valueSize, baseStyle.value)}</text>
    </svg>
    `.trim();
  }

  // Top-process layout: icon inline with value, process name centered below
  if (display.processName != null) {
    const procName = display.processName || "";
    const iconMarkup = display.processIcon
      ? `<image x="16" y="28" width="40" height="40" opacity="0.4" href="data:image/png;base64,${display.processIcon}" />`
      : "";
    const nameMarkup = renderProcessName(procName, labelColor);
    return `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">


      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="10" fill="${baseStyle.background}" />
      <text x="${TEXT_LEFT}" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="600" fill="${labelColor}"${textLengthAttrs(display.label)}>${label}</text>
      <text x="${TEXT_LEFT}" y="${VALUE_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="13" font-weight="700" fill="${valueColor}"${textLengthAttrs(display.value)}>${renderValueWithUnit(value, 13, valueColor)}</text>
      ${iconMarkup}
      ${nameMarkup}
    </svg>
    `.trim();
  }

  if (display.perfSummary) {
    const perf = display.perfSummary;
    const cpuPct = perf.cpuPct;
    const cpuReady = cpuPct !== null && Number.isFinite(cpuPct);
    const avgValue = `${perf.tickAvgMs.toFixed(1)}ms`;
    const maxValue = `${perf.tickMaxMs.toFixed(1)}ms`;
    const cpuValue = cpuReady ? `${cpuPct.toFixed(1)}%` : "--";
    const memValue = cpuReady ? `${Math.round(perf.heapMb)}MB` : "--";
    const rowLabelColor = baseStyle.value;
    const rowValueColor = baseStyle.value;
    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">
      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="10" fill="${baseStyle.background}" />
      <text x="${TEXT_LEFT}" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="600" fill="${labelColor}">PERF</text>
      <text x="${TEXT_LEFT}" y="24" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" fill="${rowLabelColor}" opacity="0.4">AVG</text>
      <text x="68" y="24" text-anchor="end" font-family="Segoe UI, Arial, sans-serif"
        font-size="10" font-weight="700" fill="${rowValueColor}">${escapeSvg(avgValue)}</text>
      <text x="${TEXT_LEFT}" y="36" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" fill="${rowLabelColor}" opacity="0.4">MAX</text>
      <text x="68" y="36" text-anchor="end" font-family="Segoe UI, Arial, sans-serif"
        font-size="10" font-weight="700" fill="${rowValueColor}">${escapeSvg(maxValue)}</text>
      <text x="${TEXT_LEFT}" y="48" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" fill="${rowLabelColor}" opacity="0.4">CPU</text>
      <text x="68" y="48" text-anchor="end" font-family="Segoe UI, Arial, sans-serif"
        font-size="10" font-weight="700" fill="${rowValueColor}">${escapeSvg(cpuValue)}</text>
      <text x="${TEXT_LEFT}" y="60" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" fill="${rowLabelColor}" opacity="0.4">MEM</text>
      <text x="68" y="60" text-anchor="end" font-family="Segoe UI, Arial, sans-serif"
        font-size="10" font-weight="700" fill="${rowValueColor}">${escapeSvg(memValue)}</text>
    </svg>
    `.trim();
  }

  // No-graph layout: label + value only (e.g. net-total)
  if (display.graphValue === null && !history.getValues().some((v) => v !== null)) {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">
      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="10" fill="${baseStyle.background}" />
      <text x="${TEXT_LEFT}" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="600" fill="${labelColor}"${textLengthAttrs(display.label)}>${label}</text>
      <text x="${TEXT_LEFT}" y="${VALUE_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="${valueSize}" font-weight="700" fill="${valueColor}"${textLengthAttrs(display.value)}>${renderValueWithUnit(value, valueSize, valueColor)}</text>
    </svg>
    `.trim();
  }

  const lineColor = warnColor ?? baseStyle.line;
  const fillColor = baseStyle.fill;

  const values = history.getValues();
  const graph = computeGraphPaths(values, history.getMaxPoints(), display.graphMax, display.graphMinMax, display.graphMin);

  const fadeL = GRAPH_LEFT;
  const fadeR = GRAPH_RIGHT;
  const fadePx = 8;
  const fadeFrac = fadePx / (fadeR - fadeL) * 100;
  const fadeMid = fadeFrac * 0.4; // ease-out: reach 80% opacity at 40% of fade distance
  const fadeEnd = 100 - fadeFrac;
  const fadeMidR = 100 - fadeMid;
  const defParts = [
    `<linearGradient id="ef" gradientUnits="userSpaceOnUse" x1="${fadeL}" y1="0" x2="${fadeR}" y2="0">
      <stop offset="0%" stop-color="white" stop-opacity="0" />
      <stop offset="${fadeMid.toFixed(1)}%" stop-color="white" stop-opacity="0.8" />
      <stop offset="${fadeFrac.toFixed(1)}%" stop-color="white" stop-opacity="1" />
      <stop offset="${fadeEnd.toFixed(1)}%" stop-color="white" stop-opacity="1" />
      <stop offset="${fadeMidR.toFixed(1)}%" stop-color="white" stop-opacity="0.8" />
      <stop offset="100%" stop-color="white" stop-opacity="0" />
    </linearGradient>
    <mask id="em"><rect x="${fadeL}" y="0" width="${fadeR - fadeL}" height="${KEY_SIZE}" fill="url(#ef)" /></mask>`
  ];
  if (USE_GRADIENT_FILL) {
    defParts.push(`<linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${fillColor}" stop-opacity="0.25" />
      <stop offset="100%" stop-color="${fillColor}" stop-opacity="0.05" />
    </linearGradient>`);
  }
  const defBlock = `<defs>${defParts.join("")}</defs>`;
  const areaFill = USE_GRADIENT_FILL ? `fill="url(#gf)"` : `fill="${fillColor}" fill-opacity="0.18"`;
  const graphInner = graph.hasData
    ? `<path d="${graph.area}" ${areaFill} />
       <path d="${graph.line}" fill="none" stroke="${lineColor}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />`
    : `<path d="${graph.line}" fill="none" stroke="${lineColor}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 3" opacity="0.45" />`;
  const graphMarkup = `${defBlock}<g mask="url(#em)">${graphInner}</g>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">
      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="10" fill="${baseStyle.background}" />
      <text x="${TEXT_LEFT}" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="600" fill="${labelColor}"${textLengthAttrs(display.label)}>${label}</text>${display.labelArrow === "up" ? `
      <path d="M29 2 L32.5 6 L30.5 6 L30.5 9 L27.5 9 L27.5 6 L25.5 6 Z" fill="${labelColor}" />
      <text x="35" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="600" fill="${labelColor}">UP</text>` : ""}${display.labelArrow === "down" ? `
      <path d="M29 9 L32.5 5 L30.5 5 L30.5 2 L27.5 2 L27.5 5 L25.5 5 Z" fill="${labelColor}" />
      <text x="35" y="${LABEL_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="9" font-weight="600" fill="${labelColor}">DOWN</text>` : ""}
      <text x="${TEXT_LEFT}" y="${VALUE_Y}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif"
        font-size="${valueSize}" font-weight="700" fill="${valueColor}"${textLengthAttrs(display.value)}>${renderValueWithUnit(value, valueSize, valueColor)}</text>
      ${graphMarkup}
    </svg>
  `.trim();
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function normalizeSettings(settings: Settings | undefined): NormalizedSettings {
  const group = isMetricGroup(settings?.group) ? settings?.group : DEFAULT_SETTINGS.group;
  const requestedMetric = isMetricId(settings?.metric) ? settings.metric : undefined;
  const mappedMetric =
    group === "disk" && requestedMetric === "disk-use" ? "disk-used" : requestedMetric;
  const cpuPerCore =
    typeof settings?.cpuPerCore === "boolean" ? settings.cpuPerCore : mappedMetric === "cpu-core";
  const metric =
    group === "cpu"
      ? (mappedMetric === "cpu-peak" || mappedMetric === "top-cpu" ||
         mappedMetric === "cpu-core" || mappedMetric === "cpu-total")
        ? mappedMetric
        : cpuPerCore ? "cpu-core" : "cpu-total"
      : mappedMetric && METRICS_BY_GROUP[group].includes(mappedMetric)
        ? mappedMetric
        : DEFAULT_METRIC[group];

  return {
    group,
    metric,
    cpuPerCore,
    cpuCore: Math.max(1, toInt(settings?.cpuCore, DEFAULT_SETTINGS.cpuCore)),
    gpuIndex: toInt(settings?.gpuIndex, DEFAULT_SETTINGS.gpuIndex),
    diskId: typeof settings?.diskId === "string" ? settings.diskId : DEFAULT_SETTINGS.diskId,
    netIface: typeof settings?.netIface === "string" ? settings.netIface : DEFAULT_SETTINGS.netIface,
    netPeriodSec: toInt(settings?.netPeriodSec, DEFAULT_SETTINGS.netPeriodSec),
    pollIntervalSec: clampPollInterval(toInt(settings?.pollIntervalSec, DEFAULT_SETTINGS.pollIntervalSec)),
    warnThreshold: Math.max(0, Math.min(100, toInt(settings?.warnThreshold, DEFAULT_SETTINGS.warnThreshold))),
    topThreshold: Math.max(0, Math.min(metric === "top-disk" ? 10000 : 100, toInt(settings?.topThreshold, DEFAULT_SETTINGS.topThreshold)))
  };
}

function settingsKey(settings: NormalizedSettings): string {
  return [
    settings.group,
    settings.metric,
    settings.cpuPerCore ? "1" : "0",
    settings.cpuCore,
    settings.gpuIndex,
    settings.diskId,
    settings.netIface,
    settings.netPeriodSec,
    settings.pollIntervalSec,
    settings.warnThreshold,
    settings.topThreshold
  ].join("|");
}

function toInt(value: number | string | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampPollInterval(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.pollIntervalSec;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function isMetricGroup(value: unknown): value is MetricGroup {
  return (
    value === "cpu" ||
    value === "gpu" ||
    value === "memory" ||
    value === "disk" ||
    value === "network" ||
    value === "system"
  );
}

function isMetricId(value: unknown): value is MetricId {
  return (
    value === "cpu-total" ||
    value === "cpu-core" ||
    value === "cpu-peak" ||
    value === "gpu-load" ||
    value === "gpu-vram" ||
    value === "gpu-vram-used" ||
    value === "gpu-temp" ||
    value === "gpu-power" ||
    value === "gpu-top-compute" ||
    value === "mem-total" ||
    value === "mem-used" ||
    value === "disk-activity" ||
    value === "disk-used" ||
    value === "disk-free" ||
    value === "disk-use" ||
    value === "disk-read" ||
    value === "disk-write" ||
    value === "net-up" ||
    value === "net-down" ||
    value === "net-total" ||
    value === "top-cpu" ||
    value === "top-mem" ||
    value === "top-mem-pct" ||
    value === "top-disk" ||
    value === "clock" ||
    value === "perf"
  );
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function formatTempC(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${Math.round(value)}°C`;
}

function formatPower(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${rounded}W`;
}

function formatRateMbit(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const formatted = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${formatted}Mbps`;
}

function formatRateMB(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const formatted = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${formatted}MB/s`;
}

function formatTopCpu(name: string | null, pct: number | null): string {
  if (!name || pct === null || !Number.isFinite(pct)) return "--";
  return `${name} ${Math.round(pct)}%`;
}

function formatTopMem(name: string | null, mb: number | null): string {
  if (!name || mb === null || !Number.isFinite(mb)) return "--";
  if (mb >= 1024) return `${name} ${formatGigabytes(mb / 1024)}`;
  return `${name} ${Math.round(mb)}MB`;
}

function formatClock(value: Date): string {
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function formatBytesShort(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Math.max(0, value);
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const formatted = size < 10 && unitIndex > 0 ? size.toFixed(1) : Math.round(size).toString();
  return `${formatted}${units[unitIndex]}`;
}

function toGibFromBytes(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value / (1024 * 1024 * 1024);
}

function toGibFromMaybeMb(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value > 1024 * 1024) {
    return value / (1024 * 1024 * 1024);
  }
  return value / 1024;
}

function formatGigabytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  if (value >= 100) return `${Math.round(value)}GB`;
  return `${value.toFixed(1)}GB`;
}

function normalizeDiskId(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return `${upper}:`;
  return upper;
}

function labelWithIndex(base: string, index: number): string {
  if (index > 0) return `${base}${index + 1}`;
  return base;
}

function selectGpu(snapshot: StatsSnapshot, index: number): GpuSnapshot | null {
  if (snapshot.gpus.length === 0) return null;
  if (index < 0 || index >= snapshot.gpus.length) return snapshot.gpus[0];
  return snapshot.gpus[index];
}

function selectDisk(snapshot: StatsSnapshot, diskId: string): DiskSnapshot | null {
  if (snapshot.disks.length === 0) return null;
  if (diskId) {
    const match = snapshot.disks.find((disk) => disk.id === diskId || disk.mount === diskId || disk.fs === diskId);
    if (match) return match;
  }
  const preferred = snapshot.disks.find((disk) => (disk.mount || "").toLowerCase().startsWith("c:"));
  return preferred || snapshot.disks[0];
}

function selectDiskPerf(snapshot: StatsSnapshot, diskId: string): DiskPerf | null {
  const perfMap = snapshot.diskPerfById;
  if (!perfMap || Object.keys(perfMap).length === 0) return null;
  const candidates: Array<string | null | undefined> = [];
  if (diskId) candidates.push(diskId);
  const disk = selectDisk(snapshot, diskId);
  if (disk) {
    candidates.push(disk.id, disk.mount, disk.fs);
  }
  for (const candidate of candidates) {
    const key = normalizeDiskId(candidate ?? "");
    if (!key) continue;
    const match = perfMap[key];
    if (match) return match;
  }
  return null;
}

function selectBusiestDiskId(snapshot: StatsSnapshot): string {
  let bestKey = "";
  let bestPct = -1;
  for (const [key, perf] of Object.entries(snapshot.diskPerfById)) {
    if (key === "_TOTAL") continue;
    const pct = perf.activePct ?? -1;
    if (pct > bestPct) { bestPct = pct; bestKey = key; }
  }
  return bestKey;
}

function selectNet(snapshot: StatsSnapshot, iface: string): NetInterfaceSnapshot | null {
  if (iface) {
    const match = snapshot.net.interfaces.find((net) => net.iface === iface);
    if (match) return match;
  }
  return snapshot.net.total;
}

function diskShortLabel(disk: DiskSnapshot | null): string {
  if (!disk) return "DSK";
  const mount = (disk.mount || disk.fs || "").toUpperCase();
  if (mount.length > 0 && mount.length <= 3) {
    return mount;
  }
  return "DSK";
}

function periodLabel(periodSec: number): string {
  if (periodSec >= 86400) return "24H";
  if (periodSec >= 3600) return "1H";
  return "60S";
}

function bytesToMbit(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return (value * 8) / 1_000_000;
}

function bytesToMB(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value / 1_000_000;
}

function buildMetricDisplay(snapshot: StatsSnapshot, settings: NormalizedSettings): MetricDisplay {
  switch (settings.metric) {
    case "cpu-total": {
      return {
        label: "CPU TOTAL",
        value: formatPercent(snapshot.cpu.total),
        graphValue: snapshot.cpu.total,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "cpu-core": {
      const cores = snapshot.cpu.cores || [];
      const coreIndex = Math.min(Math.max(settings.cpuCore - 1, 0), Math.max(cores.length - 1, 0));
      const value = cores.length > 0 ? cores[coreIndex] : null;
      return {
        label: `CPU C${coreIndex + 1}`,
        value: formatPercent(value),
        graphValue: value,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "cpu-peak": {
      const cores = snapshot.cpu.cores || [];
      const peak = cores.length > 0 ? Math.max(...cores) : null;
      return {
        label: "CPU PEAK",
        value: formatPercent(peak),
        graphValue: peak,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "gpu-load": {
      const gpu = selectGpu(snapshot, settings.gpuIndex);
      return {
        label: labelWithIndex("GPU", gpu ? gpu.index : 0),
        value: formatPercent(gpu?.loadPct ?? null),
        graphValue: gpu?.loadPct ?? null,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "gpu-vram": {
      const gpu = selectGpu(snapshot, settings.gpuIndex);
      return {
        label: labelWithIndex("VRAM", gpu ? gpu.index : 0),
        value: formatPercent(gpu?.vramPct ?? null),
        graphValue: gpu?.vramPct ?? null,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "gpu-vram-used": {
      const gpu = selectGpu(snapshot, settings.gpuIndex);
      const vramTotal = toGibFromMaybeMb(gpu?.vramTotal ?? null);
      let vramUsed = toGibFromMaybeMb(gpu?.vramUsed ?? null);
      if (vramUsed === null && vramTotal !== null && typeof gpu?.vramPct === "number") {
        vramUsed = vramTotal * (gpu.vramPct / 100);
      }
      return {
        label: labelWithIndex("VRAM", gpu ? gpu.index : 0),
        value: formatGigabytes(vramUsed),
        graphValue: vramUsed,
        graphMax: vramTotal ?? null,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "gpu-temp": {
      const gpu = selectGpu(snapshot, settings.gpuIndex);
      return {
        label: gpu && gpu.index > 0 ? `GPU TEMP ${gpu.index + 1}` : "GPU TEMP",
        value: formatTempC(gpu?.tempC ?? null),
        graphValue: gpu?.tempC ?? null,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 20
      };
    }
    case "gpu-power": {
      const gpu = selectGpu(snapshot, settings.gpuIndex);
      return {
        label: labelWithIndex("GPU", gpu ? gpu.index : 0),
        value: formatPower(gpu?.powerW ?? null),
        graphValue: gpu?.powerW ?? null,
        graphMax: null,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "gpu-top-compute": {
      const gpu = selectGpu(snapshot, settings.gpuIndex);
      const computePct = gpu?.topComputePct ?? null;
      if (settings.topThreshold > 0 && (computePct === null || !Number.isFinite(computePct) || computePct < settings.topThreshold)) {
        return { label: labelWithIndex("GPU TOP", gpu ? gpu.index : 0), value: "IDLE", graphValue: null, graphMax: 100, graphMinMax: null, graphMin: 0, idle: true };
      }
      return {
        label: labelWithIndex("GPU TOP", gpu ? gpu.index : 0),
        value: computePct !== null && Number.isFinite(computePct) ? `${Math.round(computePct)}%` : "--",
        graphValue: computePct,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0,
        processName: gpu?.topComputeName ?? null,
        processIcon: gpu?.topComputeIconBase64 ?? null
      };
    }
    case "mem-total": {
      return {
        label: "MEM",
        value: formatPercent(snapshot.memUsedPct),
        graphValue: snapshot.memUsedPct,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "mem-used": {
      const memUsed = toGibFromBytes(snapshot.memUsedBytes);
      const memTotal = toGibFromBytes(snapshot.memTotalBytes);
      return {
        label: "MEM",
        value: formatGigabytes(memUsed),
        graphValue: memUsed,
        graphMax: memTotal ?? null,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "disk-activity": {
      const effectiveDiskId = settings.diskId === "" ? selectBusiestDiskId(snapshot) : settings.diskId;
      const perf = selectDiskPerf(snapshot, effectiveDiskId);
      const activity = perf?.activePct ?? snapshot.diskActivityPct;
      const disk = selectDisk(snapshot, effectiveDiskId);
      return {
        label: `${diskShortLabel(disk)} ACTIVE %`,
        value: formatPercent(activity),
        graphValue: activity,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "disk-used": {
      const effectiveDiskId = settings.diskId === "" ? selectBusiestDiskId(snapshot) : settings.diskId;
      const disk = selectDisk(snapshot, effectiveDiskId);
      return {
        label: `${diskShortLabel(disk)} % USED`,
        value: formatPercent(disk?.usePct ?? null),
        graphValue: disk?.usePct ?? null,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "disk-free": {
      const effectiveDiskId = settings.diskId === "" ? selectBusiestDiskId(snapshot) : settings.diskId;
      const disk = selectDisk(snapshot, effectiveDiskId);
      const freePct = typeof disk?.usePct === "number" ? 100 - disk.usePct : null;
      return {
        label: `${diskShortLabel(disk)} % FREE`,
        value: formatPercent(freePct),
        graphValue: freePct,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "disk-read": {
      const effectiveDiskId = settings.diskId === "" ? selectBusiestDiskId(snapshot) : settings.diskId;
      const perf = selectDiskPerf(snapshot, effectiveDiskId);
      const readMB = bytesToMB(perf?.readBps ?? snapshot.diskThroughput.readBps);
      const disk = selectDisk(snapshot, effectiveDiskId);
      return {
        label: `${diskShortLabel(disk)} READ`,
        value: formatRateMB(readMB),
        graphValue: readMB,
        graphMax: null,
        graphMinMax: 10,
        graphMin: 0
      };
    }
    case "disk-write": {
      const effectiveDiskId = settings.diskId === "" ? selectBusiestDiskId(snapshot) : settings.diskId;
      const perf = selectDiskPerf(snapshot, effectiveDiskId);
      const writeMB = bytesToMB(perf?.writeBps ?? snapshot.diskThroughput.writeBps);
      const disk = selectDisk(snapshot, effectiveDiskId);
      return {
        label: `${diskShortLabel(disk)} WRITE`,
        value: formatRateMB(writeMB),
        graphValue: writeMB,
        graphMax: null,
        graphMinMax: 10,
        graphMin: 0
      };
    }
    case "net-up": {
      const net = selectNet(snapshot, settings.netIface);
      const upMbit = bytesToMbit(net?.txBps ?? null);
      return {
        label: "NET",
        labelArrow: "up",
        value: formatRateMbit(upMbit),
        graphValue: upMbit,
        graphMax: null,
        graphMinMax: 10,
        graphMin: 0
      };
    }
    case "net-down": {
      const net = selectNet(snapshot, settings.netIface);
      const downMbit = bytesToMbit(net?.rxBps ?? null);
      return {
        label: "NET",
        labelArrow: "down",
        value: formatRateMbit(downMbit),
        graphValue: downMbit,
        graphMax: null,
        graphMinMax: 10,
        graphMin: 0
      };
    }
    case "net-total": {
      const transfer = statsPoller.getNetworkTransfer(settings.netPeriodSec, settings.netIface);
      return {
        label: `NET ${periodLabel(settings.netPeriodSec)}`,
        value: formatBytesShort(transfer.totalBytes),
        graphValue: null,
        graphMax: null,
        graphMinMax: null,
        graphMin: 0
      };
    }
    case "top-cpu": {
      const tp = snapshot.topProcess;
      if (settings.topThreshold > 0 && (tp.cpuPct === null || !Number.isFinite(tp.cpuPct) || tp.cpuPct < settings.topThreshold)) {
        return { label: "TOP CPU", value: "IDLE", graphValue: null, graphMax: 100, graphMinMax: null, graphMin: 0, idle: true };
      }
      return {
        label: "TOP CPU",
        value: tp.cpuPct !== null && Number.isFinite(tp.cpuPct) ? `${Math.round(tp.cpuPct)}%` : "--",
        graphValue: tp.cpuPct,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0,
        processName: tp.cpuName,
        processIcon: tp.cpuIconBase64
      };
    }
    case "top-mem": {
      const tp = snapshot.topProcess;
      if (settings.topThreshold > 0) {
        const totalMBCheck = (snapshot.memTotalBytes ?? 0) / (1024 * 1024);
        const pctCheck = tp.memMB !== null && totalMBCheck > 0 ? (tp.memMB / totalMBCheck) * 100 : null;
        if (pctCheck === null || pctCheck < settings.topThreshold) {
          return { label: "TOP MEM", value: "IDLE", graphValue: null, graphMax: null, graphMinMax: null, graphMin: 0, idle: true };
        }
      }
      const memVal = tp.memMB !== null && Number.isFinite(tp.memMB)
        ? (tp.memMB >= 1024 ? formatGigabytes(tp.memMB / 1024) : `${Math.round(tp.memMB)}MB`)
        : "--";
      return {
        label: "TOP MEM",
        value: memVal,
        graphValue: tp.memMB,
        graphMax: null,
        graphMinMax: null,
        graphMin: 0,
        processName: tp.memName,
        processIcon: tp.memIconBase64
      };
    }
    case "top-mem-pct": {
      const tp = snapshot.topProcess;
      const totalMB = (snapshot.memTotalBytes ?? 0) / (1024 * 1024);
      const pct = tp.memMB !== null && totalMB > 0 ? (tp.memMB / totalMB) * 100 : null;
      if (settings.topThreshold > 0 && (pct === null || pct < settings.topThreshold)) {
        return { label: "TOP MEM %", value: "IDLE", graphValue: null, graphMax: 100, graphMinMax: null, graphMin: 0, idle: true };
      }
      return {
        label: "TOP MEM %",
        value: pct !== null && Number.isFinite(pct) ? `${Math.round(pct)}%` : "--",
        graphValue: pct,
        graphMax: 100,
        graphMinMax: null,
        graphMin: 0,
        processName: tp.memName,
        processIcon: tp.memIconBase64
      };
    }
    case "top-disk": {
      const tp = snapshot.topProcess;
      const diskMB = bytesToMB(tp.diskBps);
      if (settings.topThreshold > 0 && (diskMB === null || diskMB < settings.topThreshold)) {
        return { label: "TOP DISK", value: "IDLE", graphValue: null, graphMax: null, graphMinMax: 10, graphMin: 0, idle: true };
      }
      return {
        label: "TOP DISK",
        value: formatRateMB(diskMB),
        graphValue: diskMB,
        graphMax: null,
        graphMinMax: 10,
        graphMin: 0,
        processName: tp.diskName,
        processIcon: tp.diskIconBase64
      };
    }
    case "clock": {
      const now = new Date();
      return {
        label: "TIME",
        value: formatClock(now),
        graphValue: null,
        graphMax: null,
        graphMinMax: null,
        graphMin: null
      };
    }
    case "perf": {
      const perf = statsPoller.getPerfSummary();
      return {
        label: "PERF",
        value: "",
        graphValue: null,
        graphMax: null,
        graphMinMax: null,
        graphMin: null,
        perfSummary: perf
      };
    }
    default:
      return {
        label: "STAT",
        value: "--",
        graphValue: null,
        graphMax: null,
        graphMinMax: null,
        graphMin: null
      };
  }
}

function buildGpuItems(snapshot: StatsSnapshot): DataSourceItem[] {
  if (snapshot.gpus.length === 0) {
    return [{ label: "GPU 1", value: "0" }];
  }
  return snapshot.gpus.map((gpu) => ({
    label: gpu.name || labelWithIndex("GPU", gpu.index),
    value: String(gpu.index)
  }));
}

function formatDiskSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const size = bytes / (1024 * 1024 * 1024 * 1024);
  if (size < 10) return `${size.toFixed(1)}TB`;
  return `${Math.round(size)}TB`;
}

function buildDiskItems(snapshot: StatsSnapshot): DataSourceItem[] {
  const autoItem: DataSourceItem = { label: "Auto (Most Active)", value: "" };
  if (snapshot.disks.length === 0) {
    return [autoItem];
  }
  const items = snapshot.disks.map((disk, index) => {
    const volume = disk.mount || disk.fs || "Disk";
    const labelParts = [`Disk ${index + 1}`, volume];
    const size = formatDiskSize(disk.size);
    if (size) {
      labelParts.push(size);
    }
    return {
      label: labelParts.join(" "),
      value: disk.id
    };
  });
  return [autoItem, ...items];
}

function buildNetItems(snapshot: StatsSnapshot): DataSourceItem[] {
  const items: DataSourceItem[] = [{ label: "All Interfaces", value: "" }];
  const interfaces = snapshot.netIfaces.length > 0 ? snapshot.netIfaces : [];
  for (const iface of interfaces) {
    if (iface.internal) continue;
    items.push({
      label: iface.ifaceName || iface.iface,
      value: iface.iface
    });
  }
  if (items.length === 1) {
    return [{ label: "All Interfaces", value: "" }];
  }
  return items;
}

function buildDataSourceItems(event: string, snapshot: StatsSnapshot): DataSourceItem[] | null {
  switch (event) {
    case "getGpus":
      return buildGpuItems(snapshot);
    case "getDisks":
      return buildDiskItems(snapshot);
    case "getNetIfaces":
      return buildNetItems(snapshot);
    default:
      return null;
  }
}

export class BaseMetricAction extends SingletonAction<Settings> {
  private readonly states = new WeakMap<object, ActionState>();
  private readonly statesById = new Map<string, ActionState>();

  protected getDeviceGroup(): MetricGroup | null {
    return null;
  }

  override onWillAppear(ev: WillAppearEvent<Settings>): void {
    if (!ev.action.isKey()) return;
    const action = ev.action;
    const preGroup = normalizeSettings(this.mergeDeviceGroup(ev.payload.settings)).group;
    statsPoller.setInterest(action.id, preGroup);
    const { state } = this.getState(action, ev.payload.settings);
    this.bumpDebug(state);
    log.info("willAppear", {
      manifestId: action.manifestId,
      settings: state.settings
    });
    writeDebugLog("willAppear", { actionId: action.id, manifestId: action.manifestId, settings: state.settings });
    statsPoller.setInterest(action.id, state.settings.group);
    if (state.unsubscribe) state.unsubscribe();
    state.unsubscribe = statsPoller.subscribe((snapshot) => {
      this.updateAction(action, state, snapshot);
    });
    if (isDiskSpaceMetric(state.settings)) {
      void statsPoller.refreshNow({ forceGroups: ["disk"] })
        .then((snapshot) => {
          this.updateAction(action, state, snapshot, true);
        })
        .catch(() => undefined);
    } else {
      this.updateAction(action, state, statsPoller.getSnapshot(), true);
    }
    void this.refreshSettings(action);
  }

  override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
    const state = this.statesById.get(ev.action.id) ?? this.states.get(ev.action);
    if (state) {
      saveHistoryToCache(state, ev.action.id, true);
      if (state.settingsReady) {
        const cacheKey = state.cacheKey;
        const bgId = `bg:${cacheKey}`;
        const existing = backgroundStates.get(cacheKey);
        if (existing) {
          stopBackgroundState(cacheKey, existing);
        }
        backgroundStates.set(cacheKey, {
          settings: state.settings,
          settingsKey: state.settingsKey,
          history: state.history,
          lastRenderAt: state.lastRenderAt,
          expiresAt: Date.now() + BACKGROUND_TTL_MS,
          bgId,
          cacheKey: state.cacheKey
        });
        statsPoller.setInterest(bgId, state.settings.group);
        ensureBackgroundSubscription();
      }
    }
    if (state?.unsubscribe) {
      state.unsubscribe();
    }
    this.states.delete(ev.action);
    this.statesById.delete(ev.action.id);
    statsPoller.clearInterest(ev.action.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
    if (!ev.action.isKey()) return;
    const action = ev.action;
    const { state, changed } = this.getState(action, ev.payload.settings);
    this.bumpDebug(state);
    log.info("didReceiveSettings", {
      manifestId: action.manifestId,
      settings: state.settings
    });
    writeDebugLog("didReceiveSettings", { actionId: action.id, manifestId: action.manifestId, settings: state.settings });
    statsPoller.setInterest(action.id, state.settings.group);
    this.updateAction(action, state, statsPoller.getSnapshot(), changed);
  }

  override async onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<Settings>): Promise<void> {
    // Don't send data here - wait for piReady signal from PI
    // This avoids race condition where PI listeners aren't ready yet
  }

  override onSendToPlugin(ev: SendToPluginEvent<DataSourcePayload, Settings>): void {
    const payload = ev.payload;
    if (!payload || typeof payload !== "object" || !payload.event) return;

    if (payload.event === "applySettings" && ev.action.isKey()) {
      if (payload.settings && typeof payload.settings === "object") {
        const { state, changed } = this.getState(ev.action, payload.settings);
        this.bumpDebug(state);
        log.info("applySettings", {
          manifestId: ev.action.manifestId,
          settings: state.settings
        });
        writeDebugLog("applySettings", {
          actionId: ev.action.id,
          manifestId: ev.action.manifestId,
          settings: state.settings
        });
        statsPoller.setInterest(ev.action.id, state.settings.group);
        this.updateAction(ev.action, state, statsPoller.getSnapshot(), changed);
      }
      return;
    }

    // PI signals it's ready to receive data - send cached snapshot and save to settings
    if (payload.event === "piReady") {
      const snapshot = statsPoller.getSnapshot();
      this.sendDataSources(snapshot);
      // Also save device cache to settings so PI can load it instantly next time
      if (ev.action.isKey()) {
        void this.saveDeviceCacheToSettings(ev.action, snapshot);
      }
      return;
    }

    // PI logging - forward to debug.log
    if (payload.event === "piLog" && typeof payload.message === "string") {
      if (ENABLE_PI_TIMING_LOGS) {
        writeDebugLog("PI", payload.message);
      }
      return;
    }

    if (payload.event === "getGpus" || payload.event === "getDisks" || payload.event === "getNetIfaces") {
      const groups: Array<"gpu" | "disk" | "network"> =
        payload.event === "getGpus" ? ["gpu"] : payload.event === "getDisks" ? ["disk"] : ["network"];
      void statsPoller.refreshNow({ forceGroups: groups })
        .then((snapshot) => {
          this.sendDataSources(snapshot, payload.event);
        })
        .catch((err) => {
          log.error("Failed to refresh data sources:", err);
        });
      return;
    }

    this.sendDataSources(statsPoller.getSnapshot(), payload.event);
  }

  private mergeDeviceGroup(settings: Settings | undefined): Settings | undefined {
    const fixedGroup = this.getDeviceGroup();
    if (!fixedGroup) return settings;
    return { ...settings, group: fixedGroup };
  }

  private getState(
    actionInstance: KeyAction<Settings>,
    settings: Settings | undefined
  ): { state: ActionState; changed: boolean } {
    const mergedSettings = this.mergeDeviceGroup(settings);
    const normalized = normalizeSettings(mergedSettings);
    const nextKey = settingsKey(normalized);
    const existing = this.states.get(actionInstance);
    if (!existing) {
      pruneHistoryCache();
      const cacheKeyBase = historyCacheBaseKey(actionInstance);
      const cacheKey = historyCacheKey(cacheKeyBase, nextKey);
      let background = backgroundStates.get(cacheKey) ?? null;
      let backgroundKey = cacheKey;
      if (!background) {
        for (const [key, bg] of backgroundStates) {
          if (bg.settingsKey === nextKey) {
            background = bg;
            backgroundKey = key;
            break;
          }
        }
      }
      if (background) {
        stopBackgroundState(backgroundKey, background);
      }
      const cached = historyCache.get(cacheKey) ?? null;
      const reuseValues = cached && cached.settingsKey === nextKey ? cached.values : null;
      const state: ActionState = {
        settings: normalized,
        settingsKey: nextKey,
        cacheKeyBase,
        cacheKey,
        settingsReady: true,
        history: new HistorySeries(historyPointsForInterval(normalized.pollIntervalSec)),
        diskSpaceWarmupComplete: false
      };
      if (background && background.settingsKey === nextKey) {
        state.history = background.history;
        state.history.setMaxPoints(historyPointsForInterval(normalized.pollIntervalSec));
        writeDebugLog("historyBackgroundRestore", { actionId: actionInstance.id, cacheKey });
      } else if (reuseValues) {
        state.history.setValues(reuseValues);
        historyCache.delete(cacheKey);
        writeDebugLog("historyCacheRestore", { actionId: actionInstance.id, cacheKey });
      }
      if (settings?.metric !== undefined) state.lastRawMetric = String(settings.metric);
      if (settings?.group !== undefined) state.lastRawGroup = String(settings.group);
      this.states.set(actionInstance, state);
      this.statesById.set(actionInstance.id, state);
      return { state, changed: true };
    }

    const changed = existing.settingsKey !== nextKey;
    const prevSettings = existing.settings;
    if (existing.settingsKey !== nextKey) {
      existing.settings = normalized;
      existing.settingsKey = nextKey;
      existing.diskHistories = undefined;
      const nextCacheKey = historyCacheKey(existing.cacheKeyBase, nextKey);
      const background = backgroundStates.get(nextCacheKey) ?? null;
      if (background) {
        stopBackgroundState(nextCacheKey, background);
        existing.history = background.history;
        existing.history.setMaxPoints(historyPointsForInterval(normalized.pollIntervalSec));
        writeDebugLog("historyBackgroundRestore", { actionId: actionInstance.id, cacheKey: nextCacheKey });
      } else {
        const cached = historyCache.get(nextCacheKey) ?? null;
        if (cached && cached.settingsKey === nextKey) {
          existing.history = new HistorySeries(historyPointsForInterval(normalized.pollIntervalSec));
          existing.history.setValues(cached.values);
          historyCache.delete(nextCacheKey);
          writeDebugLog("historyCacheRestore", { actionId: actionInstance.id, cacheKey: nextCacheKey });
        } else {
          existing.history.setMaxPoints(historyPointsForInterval(normalized.pollIntervalSec));
          existing.history.clear();
        }
      }
      existing.cacheKey = nextCacheKey;
      writeDebugLog("settingsChanged", {
        actionId: actionInstance.id,
        manifestId: actionInstance.manifestId,
        from: prevSettings,
        to: normalized
      });
    }
    existing.settingsReady = true;
    if (!isDiskSpaceMetric(existing.settings)) {
      existing.diskSpaceWarmupComplete = false;
    }
    if (settings?.metric !== undefined) existing.lastRawMetric = String(settings.metric);
    if (settings?.group !== undefined) existing.lastRawGroup = String(settings.group);
    this.statesById.set(actionInstance.id, existing);

    return { state: existing, changed };
  }

  private updateAction(
    actionInstance: KeyAction<Settings>,
    state: ActionState,
    snapshot: StatsSnapshot,
    force = false
  ): void {
    if (!snapshot.osSupported) {
      void actionInstance.setTitle("WIN10+\nREQ");
      void actionInstance.setImage(undefined, { target: Target.HardwareAndSoftware });
      return;
    }
    if (!state.settingsReady) {
      return;
    }

    const now = Date.now();
    const intervalMs = intervalMsForSettings(state.settings);
    const diskSpaceMetric = isDiskSpaceMetric(state.settings);
    const allowDiskWarmupRender =
      !force &&
      diskSpaceMetric &&
      !state.diskSpaceWarmupComplete &&
      (() => {
        const disk = selectDisk(snapshot, state.settings.diskId);
        return typeof disk?.usePct === "number" && Number.isFinite(disk.usePct);
      })();
    if (state.history.setMaxPoints(historyPointsForInterval(intervalMs / 1000))) {
      state.history.clear();
    }
    if (!force && !allowDiskWarmupRender) {
      if (typeof state.lastRenderAt === "number" && now - state.lastRenderAt < intervalMs) {
        return;
      }
    }
    const display = buildMetricDisplay(snapshot, state.settings);
    const isNetRate = state.settings.metric === "net-up" || state.settings.metric === "net-down";
    if (isNetRate && display.graphValue === null) return;
    if (isNetRate && display.graphValue === 0) {
      const prev = state.history.last();
      if (typeof prev === "number" && prev > 0) return;
    }

    state.lastRenderAt = now;
    if (diskSpaceMetric && typeof display.graphValue === "number" && Number.isFinite(display.graphValue)) {
      state.diskSpaceWarmupComplete = true;
    }
    swapDiskHistoryIfNeeded(state, state.settings, snapshot);
    state.history.push(display.graphValue);
    saveHistoryToCache(state, actionInstance.id);
    const showDebug = ALWAYS_DEBUG;
    const image = svgToDataUri(buildKeySvg(display, state.history, state.settings.group, state.settings));
    void actionInstance.setImage(image, { target: Target.HardwareAndSoftware });
    void actionInstance.setTitle(showDebug ? `${display.label}\n${display.value}` : "", {
      target: Target.HardwareAndSoftware
    });

    if (state.debugLogRemaining && state.debugLogRemaining > 0) {
      log.info("render", {
        metric: state.settings.metric,
        group: state.settings.group,
        display,
        gpuIndex: state.settings.gpuIndex
      });
      writeDebugLog("render", {
        actionId: actionInstance.id,
        manifestId: actionInstance.manifestId,
        metric: state.settings.metric,
        group: state.settings.group,
        display,
        gpuIndex: state.settings.gpuIndex
      });
      if (state.settings.group === "gpu") {
        const gpu = selectGpu(snapshot, state.settings.gpuIndex);
        log.info("gpuSnapshot", {
          gpuIndex: state.settings.gpuIndex,
          loadPct: gpu?.loadPct ?? null,
          vramPct: gpu?.vramPct ?? null,
          vramUsed: gpu?.vramUsed ?? null,
          vramTotal: gpu?.vramTotal ?? null,
          tempC: gpu?.tempC ?? null,
          powerW: gpu?.powerW ?? null,
          name: gpu?.name ?? null
        });
        writeDebugLog("gpuSnapshot", {
          actionId: actionInstance.id,
          manifestId: actionInstance.manifestId,
          gpuIndex: state.settings.gpuIndex,
          loadPct: gpu?.loadPct ?? null,
          vramPct: gpu?.vramPct ?? null,
          vramUsed: gpu?.vramUsed ?? null,
          vramTotal: gpu?.vramTotal ?? null,
          tempC: gpu?.tempC ?? null,
          powerW: gpu?.powerW ?? null,
          name: gpu?.name ?? null
        });
      }
      if (state.settings.group === "disk") {
        const disk = selectDisk(snapshot, state.settings.diskId);
        const perf = selectDiskPerf(snapshot, state.settings.diskId);
        const tp = snapshot.topProcess;
        writeDebugLog("diskSnapshot", {
          actionId: actionInstance.id,
          manifestId: actionInstance.manifestId,
          diskId: state.settings.diskId,
          disk: disk
            ? { id: disk.id, mount: disk.mount, fs: disk.fs, size: disk.size, usePct: disk.usePct }
            : null,
          perfKeys: Object.keys(snapshot.diskPerfById || {}),
          perf,
          totalActivityPct: snapshot.diskActivityPct,
          totalThroughput: snapshot.diskThroughput,
          topDisk: { name: tp.diskName, bps: tp.diskBps, hasIcon: tp.diskIconBase64 != null }
        });
      }
      state.debugLogRemaining -= 1;
    }
  }

  private bumpDebug(state: ActionState): void {
    state.debugLogRemaining = 3;
  }

  private async refreshSettings(actionInstance: KeyAction<Settings>): Promise<void> {
    try {
      const settings = await actionInstance.getSettings();
      const { state, changed } = this.getState(actionInstance, settings);
      this.updateAction(actionInstance, state, statsPoller.getSnapshot(), changed);
    } catch (err) {
      log.error("Settings refresh failed, using cached state:", err);
    }
  }

  private sendDataSources(snapshot: StatsSnapshot, event?: string) {
    if (event) {
      const items = buildDataSourceItems(event, snapshot);
      if (items) {
        void streamDeck.ui.sendToPropertyInspector({ event, items });
      }
      return;
    }

    const group = this.getDeviceGroup();
    const events: string[] = [];
    if (!group || group === "gpu") events.push("getGpus");
    if (!group || group === "disk") events.push("getDisks");
    if (!group || group === "network") events.push("getNetIfaces");
    for (const name of events) {
      const items = buildDataSourceItems(name, snapshot);
      if (items) {
        void streamDeck.ui.sendToPropertyInspector({ event: name, items });
      }
    }
  }

  private async saveDeviceCacheToSettings(action: KeyAction<Settings>, snapshot: StatsSnapshot): Promise<void> {
    try {
      const gpus = buildDataSourceItems("getGpus", snapshot);
      const disks = buildDataSourceItems("getDisks", snapshot);
      const netIfaces = buildDataSourceItems("getNetIfaces", snapshot);

      const currentSettings = await action.getSettings();
      const newSettings = {
        ...currentSettings,
        _deviceCache: { gpus, disks, netIfaces }
      };
      await action.setSettings(newSettings);
      writeDebugLog("savedDeviceCache", {
        gpus: gpus?.length ?? 0,
        disks: disks?.length ?? 0,
        netIfaces: netIfaces?.length ?? 0
      });
    } catch (err) {
      log.error("Failed to save device cache to settings:", err);
    }
  }
}
