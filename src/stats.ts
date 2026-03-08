import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

export type GpuSnapshot = {
  index: number;
  name: string;
  loadPct: number | null;
  vramPct: number | null;
  tempC: number | null;
  vramTotal: number | null;
  vramUsed: number | null;
  powerW: number | null;
  topComputeName: string | null;
  topComputePct: number | null;
  topComputeIconBase64: string | null;
  clockMHz: number | null;
  memClockMHz: number | null;
  encoderPct: number | null;
  decoderPct: number | null;
  fanPct: number | null;
  pcieRxKBps: number | null;
  pcieTxKBps: number | null;
  throttleReasons: number | null;
};

export type DiskSnapshot = {
  id: string;
  mount: string;
  fs: string;
  size: number;
  usePct: number | null;
};

export type DiskThroughput = {
  readBps: number | null;
  writeBps: number | null;
};

export type DiskPerf = {
  activePct: number | null;
  readBps: number | null;
  writeBps: number | null;
};

export type NetInterfaceInfo = {
  iface: string;
  ifaceName: string;
  internal: boolean;
  virtual: boolean;
};

export type NetInterfaceSnapshot = {
  iface: string;
  rxBps: number | null;
  txBps: number | null;
  rxBytes: number | null;
  txBytes: number | null;
};

type NetStatsSample = {
  iface: string;
  rx_sec: number | null;
  tx_sec: number | null;
  rx_bytes: number | null;
  tx_bytes: number | null;
};

export type NetSnapshot = {
  interfaces: NetInterfaceSnapshot[];
  total: NetInterfaceSnapshot;
};

export type TopProcessSnapshot = {
  cpuName: string | null;
  cpuPct: number | null;
  memName: string | null;
  memMB: number | null;
  cpuIconBase64: string | null;
  memIconBase64: string | null;
  diskName: string | null;
  diskBps: number | null;
  diskIconBase64: string | null;
};

export type StatsSnapshot = {
  osSupported: boolean;
  cpu: {
    total: number | null;
    cores: number[] | null;
    frequencyMhz: number | null;
  };
  memUsedPct: number | null;
  memUsedBytes: number | null;
  memTotalBytes: number | null;
  gpus: GpuSnapshot[];
  disks: DiskSnapshot[];
  diskThroughput: DiskThroughput;
  diskActivityPct: number | null;
  diskPerfById: Record<string, DiskPerf>;
  netIfaces: NetInterfaceInfo[];
  net: NetSnapshot;
  topProcess: TopProcessSnapshot;
};

const WINDOWS_10_BUILD = 10240;
const isWindows = process.platform === "win32";
const windowsBuild = isWindows ? parseInt(os.release().split(".")[2] || "0", 10) : 0;
const osSupported = isWindows && windowsBuild >= WINDOWS_10_BUILD;

const POLL_INTERVAL_MS = 1000;
const CPU_MEM_INTERVAL_MS = POLL_INTERVAL_MS;
const DISK_PERF_INTERVAL_MS = 1000;
const FS_SIZE_CACHE_MS = 60 * 1000; // 60 seconds - disk space updates slowly
const NET_IFACE_CACHE_MS = 60 * 60 * 1000; // 1 hour - NICs rarely change
const GPU_CACHE_MS = 1000;
const NET_STATS_CACHE_MS = 1000;
const MAX_NET_HISTORY_SECONDS_MS = 60 * 1000;
const MAX_COMPLETED_MINUTES = 59;
const MAX_COMPLETED_HOURS = 23;

const NET_HISTORY_PERSIST_MS = 60 * 1000;
const NET_HISTORY_PATHS = (() => {
  const pluginDir = path.resolve(__dirname, "..");
  return [path.join(pluginDir, "net-history.json")];
})();
let activeNetHistoryPath: string | null = null;

const PERF_LOG_INTERVAL_MS = 30 * 1000;
const PERF_SLOW_TICK_MS = 200;
const PERF_LOG_ROTATE_BYTES = 100 * 1024 * 1024;
const PERF_LOG_ROTATE_CHECK_MS = 10 * 1000;
const PERF_LOG_FLUSH_INTERVAL_MS = 250;
const PERF_LOG_QUEUE_MAX_LINES = 4000;
let perfLogRotateAt = 0;
const HELPER_INTERVAL_MS = 1000;
const HELPER_STALE_MS = 5000;
const HELPER_STARTUP_MS = 15000;
const HELPER_RETRY_DELAY_MS = 5000;
const HELPER_STOP_TIMEOUT_MS = 5000;
const HELPER_EXE_NAME = "SimpleStatsHelper.exe";
const HELPER_CMD_RESCAN_DISKS = "rescan_disks";
const HELPER_PATHS = (() => {
  const paths: string[] = [];
  const pluginDir = path.resolve(__dirname, "..");
  paths.push(path.join(pluginDir, "bin", HELPER_EXE_NAME));
  paths.push(path.join(process.cwd(), "bin", HELPER_EXE_NAME));
  paths.push(path.join(process.cwd(), HELPER_EXE_NAME));
  return paths;
})();
const perfLogPaths = (() => {
  const pluginDir = path.resolve(__dirname, "..");
  return [path.join(pluginDir, "debug.log")];
})();
const perfHistoryLogPaths = (() => perfLogPaths.map((candidate) => path.join(path.dirname(candidate), "perf.log")))();
let activePerfLogPath: string | null = null;
let activePerfHistoryLogPath: string | null = null;
let perfLogQueue: string[] = [];
let perfLogDroppedLines = 0;
let perfLogFlushTimer: ReturnType<typeof setTimeout> | null = null;
let perfLogFlushInProgress = false;
let perfHistoryLogRotateAt = 0;

function rotatePerfLogIfNeeded(candidate: string): void {
  const now = Date.now();
  if (now - perfLogRotateAt < PERF_LOG_ROTATE_CHECK_MS) return;
  perfLogRotateAt = now;
  try {
    if (!fs.existsSync(candidate)) return;
    const stats = fs.statSync(candidate);
    if (stats.size < PERF_LOG_ROTATE_BYTES) return;
    fs.truncateSync(candidate, 0);
  } catch {
    // Ignore rotation errors.
  }
}

function rotatePerfHistoryLogIfNeeded(candidate: string): void {
  const now = Date.now();
  if (now - perfHistoryLogRotateAt < PERF_LOG_ROTATE_CHECK_MS) return;
  perfHistoryLogRotateAt = now;
  try {
    if (!fs.existsSync(candidate)) return;
    const stats = fs.statSync(candidate);
    if (stats.size < PERF_LOG_ROTATE_BYTES) return;
    fs.truncateSync(candidate, 0);
  } catch {
    // Ignore rotation errors.
  }
}

function schedulePerfLogFlush(): void {
  if (perfLogFlushTimer) return;
  perfLogFlushTimer = setTimeout(() => {
    perfLogFlushTimer = null;
    void flushPerfLogQueue();
  }, PERF_LOG_FLUSH_INTERVAL_MS);
  if (typeof perfLogFlushTimer.unref === "function") {
    perfLogFlushTimer.unref();
  }
}

async function flushPerfLogQueue(): Promise<void> {
  if (perfLogFlushInProgress) return;
  perfLogFlushInProgress = true;
  try {
    if (perfLogDroppedLines > 0) {
      const droppedLine = `${new Date().toISOString()} perfLogDropped {"count":${perfLogDroppedLines}}\n`;
      perfLogQueue.unshift(droppedLine);
      perfLogDroppedLines = 0;
    }
    while (perfLogQueue.length > 0) {
      const lines = perfLogQueue;
      perfLogQueue = [];
      const payload = lines.join("");
      const candidates = activePerfLogPath ? [activePerfLogPath] : perfLogPaths;
      let wrote = false;
      for (const candidate of candidates) {
        try {
          const dir = path.dirname(candidate);
          await fs.promises.mkdir(dir, { recursive: true });
          rotatePerfLogIfNeeded(candidate);
          await fs.promises.appendFile(candidate, payload, "utf8");
          activePerfLogPath = candidate;
          wrote = true;
          break;
        } catch {
          // Try the next path.
        }
      }
      if (!wrote) {
        perfLogQueue = lines.concat(perfLogQueue);
        break;
      }
    }
  } catch {
    // Swallow logging errors to avoid impacting the plugin.
  } finally {
    perfLogFlushInProgress = false;
    if (perfLogQueue.length > 0) {
      schedulePerfLogFlush();
    }
  }
}

function writePerfLog(message: string, data?: unknown): void {
  try {
    const stamp = new Date().toISOString();
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    perfLogQueue.push(`${stamp} ${message}${payload}\n`);
    if (perfLogQueue.length > PERF_LOG_QUEUE_MAX_LINES) {
      const dropCount = perfLogQueue.length - PERF_LOG_QUEUE_MAX_LINES;
      perfLogQueue.splice(0, dropCount);
      perfLogDroppedLines += dropCount;
    }
    schedulePerfLogFlush();
  } catch {
    // Swallow logging errors to avoid impacting the plugin.
  }
}

function writePerfHistoryLog(entry: {
  t: string;
  tickAvgMs: number;
  tickMaxMs: number;
  cpuPct: number | null;
  heapMb: number;
}): void {
  try {
    const line = `${JSON.stringify(entry)}\n`;
    const candidates = activePerfHistoryLogPath ? [activePerfHistoryLogPath] : perfHistoryLogPaths;
    for (const candidate of candidates) {
      try {
        const dir = path.dirname(candidate);
        fs.mkdirSync(dir, { recursive: true });
        rotatePerfHistoryLogIfNeeded(candidate);
        fs.appendFileSync(candidate, line, "utf8");
        activePerfHistoryLogPath = candidate;
        break;
      } catch {
        // Try the next path.
      }
    }
  } catch {
    // Swallow logging errors to avoid impacting the plugin.
  }
}

type TransferCascade = {
  secondDeltas: Array<{ t: number; rx: number; tx: number }>;
  currentMinute: { epoch: number; rx: number; tx: number };
  completedMinutes: Array<{ epoch: number; rx: number; tx: number }>;
  completedHours: Array<{ epoch: number; rx: number; tx: number }>;
  prevCounter: { rx: number; tx: number } | null;
};

type CascadePersisted = {
  version: number;
  savedAt: number;
  cascades: Record<string, {
    hours: Array<[number, number, number]>;
    minutes: Array<[number, number, number]>;
    currentMinute: [number, number, number];
  }>;
};

function readCascadePersisted(): CascadePersisted | null {
  for (const candidate of NET_HISTORY_PATHS) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const text = fs.readFileSync(candidate, "utf8");
      const raw = JSON.parse(text) as { version?: unknown; savedAt?: unknown; cascades?: unknown };
      if (typeof raw?.version !== "number" || raw.version !== 2) continue;
      if (!raw.cascades || typeof raw.cascades !== "object" || Array.isArray(raw.cascades)) continue;
      activeNetHistoryPath = candidate;
      return raw as CascadePersisted;
    } catch {
      // Try the next path.
    }
  }
  return null;
}

async function writeCascadePersisted(payload: CascadePersisted): Promise<boolean> {
  const text = JSON.stringify(payload);
  const candidates = activeNetHistoryPath ? [activeNetHistoryPath] : NET_HISTORY_PATHS;
  for (const candidate of candidates) {
    try {
      const dir = path.dirname(candidate);
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = candidate + ".tmp";
      await fs.promises.writeFile(tmp, text, "utf8");
      await fs.promises.rename(tmp, candidate);
      activeNetHistoryPath = candidate;
      return true;
    } catch {
      // Try the next path.
    }
  }
  return false;
}

type HelperItem = {
  iface: string;
  name?: string;
  id?: string;
  rxBytes: number;
  txBytes: number;
  status?: string;
  type?: string;
};
type HelperDisk = {
  id: string;
  mount: string;
  fs: string;
  totalBytes: number;
  freeBytes: number;
  label?: string;
};
type HelperCpu = {
  total: number | null;
  cores: number[] | null;
  frequencyMhz: number | null;
};
type HelperMem = {
  totalBytes: number;
  usedBytes: number;
};
type HelperGpu = {
  index: number;
  name: string;
  loadPct: number | null;
  vramTotalBytes: number | null;
  vramUsedBytes: number | null;
  tempC: number | null;
  powerW: number | null;
  topComputeName: string | null;
  topComputePct: number | null;
  topComputeIconBase64: string | null;
  clockMHz: number | null;
  memClockMHz: number | null;
  encoderPct: number | null;
  decoderPct: number | null;
  fanPct: number | null;
  pcieRxKBps: number | null;
  pcieTxKBps: number | null;
  throttleReasons: number | null;
};
type HelperDiskPerfItem = {
  id: string;
  activePct: number | null;
  readBps: number | null;
  writeBps: number | null;
};
type HelperDiskPerf = {
  total: HelperDiskPerfItem | null;
  items: HelperDiskPerfItem[];
};
type HelperTopProcess = {
  cpuName: string | null;
  cpuPct: number | null;
  memName: string | null;
  memMB: number | null;
  cpuIconBase64: string | null;
  memIconBase64: string | null;
  diskName: string | null;
  diskBps: number | null;
  diskIconBase64: string | null;
};
type HelperSnapshot = {
  t: number;
  items: HelperItem[];
  disks: HelperDisk[];
  cpu: HelperCpu | null;
  diskPerf: HelperDiskPerf | null;
  mem: HelperMem | null;
  gpus: HelperGpu[] | null;
  topProcess: HelperTopProcess | null;
};
type FsSizeSample = {
  fs: string;
  mount: string;
  size: number;
  use: number | null;
};
type WindowsDiskPerf = { total: DiskPerf; byId: Record<string, DiskPerf> };
type PerfAggregate = { count: number; totalMs: number; maxMs: number; lastMs: number };
export type PerfSummarySnapshot = {
  tickAvgMs: number;
  tickMaxMs: number;
  cpuPct: number | null;
  heapMb: number;
};
type MetricGroup = "cpu" | "gpu" | "memory" | "disk" | "network" | "system";
type RefreshOptions = {
  forceGroups?: MetricGroup[];   // Bypass cache and fetch fresh data
  ensureGroups?: MetricGroup[];  // Ensure data is fetched, but use cache if available
};

const METRIC_GROUPS: MetricGroup[] = ["cpu", "gpu", "memory", "disk", "network", "system"];

function isMetricGroup(value: string): value is MetricGroup {
  return (METRIC_GROUPS as string[]).includes(value);
}

function emptySnapshot(): StatsSnapshot {
  return {
    osSupported,
    cpu: {
      total: null,
      cores: null,
      frequencyMhz: null
    },
    memUsedPct: null,
    memUsedBytes: null,
    memTotalBytes: null,
    gpus: [],
    disks: [],
    diskThroughput: {
      readBps: null,
      writeBps: null
    },
    diskActivityPct: null,
    diskPerfById: {},
    netIfaces: [],
    net: {
      interfaces: [],
      total: {
        iface: "total",
        rxBps: null,
        txBps: null,
        rxBytes: null,
        txBytes: null
      }
    },
    topProcess: {
      cpuName: null,
      cpuPct: null,
      memName: null,
      memMB: null,
      cpuIconBase64: null,
      memIconBase64: null,
      diskName: null,
      diskBps: null,
      diskIconBase64: null
    }
  };
}

function toPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function toNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}

function parseNumberFromText(value: string | undefined | null): number | null {
  if (!value) return null;
  const cleaned = value.toString().trim();
  if (cleaned.length === 0) return null;
  const num = parseFloat(cleaned.replace(/[^\d.+-]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function parseNumberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parseNumberFromText(value);
  return null;
}

type StopReason = "manual" | "startup-timeout" | "stale-timeout" | "child-error" | "spawn-failed" | "unexpected-exit" | "system-exit";
type HelperLifecycleState = "idle" | "starting" | "running" | "stopping" | "backoff" | "disabled";
let helperInvalidItemsTypeLogged = false;

class SimpleStatsHelper {
  private static readonly MAX_BUFFER_SIZE = 65536;
  private static readonly MAX_RETRY_DELAY_MS = 60_000;
  private static readonly MAX_PARSE_ERROR_LOGS = 3;
  private child: ReturnType<typeof spawn> | null = null;
  private buffer = "";
  private disabled = false;
  private latest: HelperSnapshot | null = null;
  private lastSampleAt = 0;
  private startedAt = 0;
  private isPrimed = false;
  private helperPath: string | null = null;
  private retryAfter = 0;
  private snapshotCount = 0;
  private failureCount = 0;
  private expectedExitPid: number | null = null;
  private lastStopReason: StopReason = "manual";
  private parseErrorCount = 0;
  private lifecycleState: HelperLifecycleState = "idle";
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  ensureRunning(): boolean {
    if (this.disabled) {
      this.setLifecycleState("disabled", "disabled");
      return false;
    }
    if (this.lifecycleState === "stopping") return false;
    if (this.child) return true;
    const now = Date.now();
    if (this.retryAfter > 0 && now < this.retryAfter) {
      this.setLifecycleState("backoff", "retry-window");
      return false;
    }
    this.retryAfter = 0;
    if (this.lifecycleState === "backoff") {
      this.setLifecycleState("idle", "retry-window-ended");
    }

    if (!this.helperPath) {
      this.helperPath = this.findHelperPath();
    }
    if (!this.helperPath) {
      this.disabled = true;
      this.setLifecycleState("disabled", "helper-missing");
      writePerfLog("helperMissing", { paths: HELPER_PATHS });
      return false;
    }

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        this.helperPath,
        ["--interval", String(HELPER_INTERVAL_MS)],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
      );
    } catch (err) {
      this.child = null;
      this.scheduleRetry("spawn-failed");
      writePerfLog("helperProcessError", {
        reason: "spawn-failed",
        error: String(err),
        retryDelayMs: this.retryAfter > 0 ? this.retryAfter - Date.now() : 0,
        failureCount: this.failureCount
      });
      return false;
    }

    this.child = child;
    this.startedAt = now;
    this.snapshotCount = 0;
    this.parseErrorCount = 0;
    this.buffer = "";
    this.lastSampleAt = 0;
    this.lastStopReason = "manual";
    this.expectedExitPid = null;
    this.setLifecycleState("starting", "spawn");
    writePerfLog("helperStarted", { path: this.helperPath, pid: child.pid });

    child.on("error", (err) => {
      if (this.child !== child) return;
      if (this.lifecycleState === "stopping") return;
      this.scheduleRetry("child-error");
      writePerfLog("helperProcessError", {
        reason: "child-error",
        pid: child.pid,
        error: String(err),
        retryDelayMs: this.retryAfter > 0 ? this.retryAfter - Date.now() : 0,
        failureCount: this.failureCount
      });
      this.stop("child-error");
    });
    child.on("exit", (code, signal) => {
      const pid = child.pid ?? null;
      const expectedByPid = pid !== null && this.expectedExitPid === pid;
      const systemExit = code === 0x40010004; // STATUS_LOG_HARD_ERROR (logoff/sleep/console close)
      const expected = expectedByPid || this.lifecycleState === "stopping" || systemExit;
      const reason = expected
        ? (this.lastStopReason || (systemExit ? "system-exit" : "unexpected-exit"))
        : "unexpected-exit";
      if (expectedByPid) {
        this.expectedExitPid = null;
      }
      this.clearStopTimer();
      if (this.child === child) {
        this.child = null;
      }
      const exitAt = Date.now();
      if (!expected) {
        this.scheduleRetry("unexpected-exit", exitAt);
      } else if (this.disabled) {
        this.setLifecycleState("disabled", `exit:${reason}`);
      } else if (this.retryAfter > 0 && exitAt < this.retryAfter) {
        this.setLifecycleState("backoff", `exit:${reason}`);
      } else {
        this.setLifecycleState("idle", `exit:${reason}`);
      }
      writePerfLog("helperExit", {
        pid,
        code,
        signal,
        expected,
        reason,
        retryDelayMs: !expected && this.retryAfter > 0 ? this.retryAfter - exitAt : 0,
        failureCount: this.failureCount,
        snapshotCount: this.snapshotCount,
        lifecycleState: this.lifecycleState
      });
    });

    if (!child.stdout) {
      this.scheduleRetry("spawn-failed");
      writePerfLog("helperProcessError", {
        reason: "spawn-failed",
        error: "stdout unavailable",
        retryDelayMs: this.retryAfter > 0 ? this.retryAfter - Date.now() : 0,
        failureCount: this.failureCount
      });
      this.stop("spawn-failed");
      return false;
    }

    child.stdout.on("data", (chunk) => this.handleChunk(chunk));
    child.stderr?.on("data", (chunk) => {
      writePerfLog("helperStderr", { message: chunk.toString().trim() });
    });

    return true;
  }

  requestDiskRescan(allowStart = false): boolean {
    if (allowStart && !this.child && !this.ensureRunning()) {
      return false;
    }
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) {
      return false;
    }
    try {
      stdin.write(`${HELPER_CMD_RESCAN_DISKS}\n`);
      return true;
    } catch (err) {
      writePerfLog("helperCommandError", {
        command: HELPER_CMD_RESCAN_DISKS,
        error: String(err)
      });
      return false;
    }
  }

  stop(reason: StopReason = "manual"): void {
    const proc = this.child;
    if (!proc) return;

    this.lastStopReason = reason;
    this.expectedExitPid = proc.pid ?? null;
    this.setLifecycleState("stopping", `stop:${reason}`);
    this.clearStopTimer();
    try {
      proc.kill();
      writePerfLog("helperStopped", { pid: proc.pid, reason, mode: "graceful" });
    } catch (err) {
      writePerfLog("helperStopSignalError", {
        pid: proc.pid,
        reason,
        error: String(err)
      });
    }
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      this.forceTerminate(proc, reason);
    }, HELPER_STOP_TIMEOUT_MS);
    if (typeof this.stopTimer.unref === "function") {
      this.stopTimer.unref();
    }
  }

  getSnapshot(): HelperSnapshot | null {
    if (!this.isPrimed) return null;
    return this.latest;
  }

  shouldFallback(now = Date.now()): boolean {
    if (this.disabled) return true;
    if (this.lifecycleState === "stopping") return true;
    if (!this.child) return true;
    if (this.lastSampleAt > 0) {
      if (now - this.lastSampleAt > HELPER_STALE_MS) {
        const lastSampleAgeMs = now - this.lastSampleAt;
        this.latest = null;
        this.isPrimed = false;
        this.lastSampleAt = 0;
        this.startedAt = 0;
        this.scheduleRetry("stale-timeout", now);
        writePerfLog("helperStaleTimeout", {
          lastSampleAgeMs,
          snapshotCount: this.snapshotCount,
          retryDelayMs: this.retryAfter - now,
          failureCount: this.failureCount
        });
        this.stop("stale-timeout");
        return true;
      }
      return false;
    }
    if (this.startedAt > 0 && now - this.startedAt > HELPER_STARTUP_MS) {
      const startupElapsedMs = now - this.startedAt;
      this.latest = null;
      this.isPrimed = false;
      this.lastSampleAt = 0;
      this.startedAt = 0;
      this.scheduleRetry("startup-timeout", now);
      writePerfLog("helperStartupTimeout", {
        startupElapsedMs,
        snapshotCount: this.snapshotCount,
        retryDelayMs: this.retryAfter - now,
        failureCount: this.failureCount
      });
      this.stop("startup-timeout");
      return true;
    }
    return false;
  }

  private nextRetryDelayMs(): number {
    const exp = Math.max(0, this.failureCount - 1);
    const delay = HELPER_RETRY_DELAY_MS * (2 ** exp);
    return Math.min(SimpleStatsHelper.MAX_RETRY_DELAY_MS, delay);
  }

  private resetFailureBackoff(): void {
    this.failureCount = 0;
    this.retryAfter = 0;
  }

  private scheduleRetry(reason: StopReason, now = Date.now()): void {
    this.lastStopReason = reason;
    this.failureCount += 1;
    this.retryAfter = now + this.nextRetryDelayMs();
    this.setLifecycleState("backoff", `retry:${reason}`);
  }

  private clearStopTimer(): void {
    if (!this.stopTimer) return;
    clearTimeout(this.stopTimer);
    this.stopTimer = null;
  }

  private forceTerminate(proc: ReturnType<typeof spawn>, reason: StopReason): void {
    if (this.child !== proc) return;
    const pid = proc.pid ?? null;
    writePerfLog("helperStopTimeout", {
      pid,
      reason,
      timeoutMs: HELPER_STOP_TIMEOUT_MS
    });
    if (pid && process.platform === "win32") {
      try {
        const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore"
        });
        killer.on("error", (err) => {
          writePerfLog("helperStopForceError", {
            pid,
            reason,
            mode: "taskkill",
            error: String(err)
          });
        });
        killer.unref();
        writePerfLog("helperStopForced", { pid, reason, mode: "taskkill" });
      } catch (err) {
        writePerfLog("helperStopForceError", {
          pid,
          reason,
          mode: "taskkill",
          error: String(err)
        });
      }
      return;
    }
    try {
      proc.kill("SIGKILL");
      writePerfLog("helperStopForced", { pid, reason, mode: "sigkill" });
    } catch (err) {
      writePerfLog("helperStopForceError", {
        pid,
        reason,
        mode: "sigkill",
        error: String(err)
      });
    }
  }

  private setLifecycleState(next: HelperLifecycleState, context: string): void {
    if (this.lifecycleState === next) return;
    const previous = this.lifecycleState;
    this.lifecycleState = next;
    writePerfLog("helperState", { from: previous, to: next, context });
  }

  private findHelperPath(): string | null {
    for (const candidate of HELPER_PATHS) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // Ignore filesystem errors.
      }
    }
    return null;
  }

  private handleChunk(chunk: Buffer | string): void {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    this.buffer += text;

    if (this.buffer.length > SimpleStatsHelper.MAX_BUFFER_SIZE) {
      writePerfLog(`helperBufferExceeded ${SimpleStatsHelper.MAX_BUFFER_SIZE}`);
      this.buffer = this.buffer.slice(-SimpleStatsHelper.MAX_BUFFER_SIZE);
    }

    let idx = this.buffer.indexOf("\n");
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line.length > 0) {
        this.handleLine(line.replace(/\r$/, ""));
      }
      idx = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    try {
      const payload = JSON.parse(line);
      const parsed = parseHelperSnapshot(payload);
      if (parsed) {
        this.latest = parsed;
        this.lastSampleAt = Date.now();
        this.snapshotCount++;
        if (!this.isPrimed) {
          this.resetFailureBackoff();
          this.isPrimed = true;
          this.setLifecycleState("running", "primed");
          writePerfLog("helperPrimed", { elapsedMs: Date.now() - this.startedAt });
        } else if (this.lifecycleState !== "running") {
          this.setLifecycleState("running", "snapshot");
        }
        if (this.snapshotCount <= 5) {
          writePerfLog("helperSnapshot", {
            seq: this.snapshotCount,
            hasCpu: !!parsed.cpu,
            hasMem: !!parsed.mem,
            hasGpus: !!parsed.gpus && parsed.gpus.length > 0,
            hasDiskPerf: !!parsed.diskPerf,
            hasTopProcess: !!parsed.topProcess,
            itemCount: parsed.items.length
          });
        }
      }
    } catch {
      if (this.parseErrorCount < SimpleStatsHelper.MAX_PARSE_ERROR_LOGS) {
        this.parseErrorCount += 1;
        writePerfLog("helperParseError", {
          count: this.parseErrorCount,
          lineLength: line.length,
          linePreview: line.slice(0, 120)
        });
      }
    }
  }
}

function parseHelperSnapshot(payload: unknown): HelperSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const tRaw = (payload as { t?: unknown }).t;
  const itemsRaw = (payload as { items?: unknown }).items;
  const disksRaw = (payload as { disks?: unknown }).disks;
  const cpuRaw = (payload as { cpu?: unknown }).cpu;
  const diskPerfRaw = (payload as { diskPerf?: unknown }).diskPerf;
  const memRaw = (payload as { mem?: unknown }).mem;
  const gpusRaw = (payload as { gpus?: unknown }).gpus;
  const topProcessRaw = (payload as { topProcess?: unknown }).topProcess;
  const t = typeof tRaw === "number" && Number.isFinite(tRaw) ? tRaw : Date.now();
  const itemList = Array.isArray(itemsRaw) ? itemsRaw : [];
  if (!Array.isArray(itemsRaw) && !helperInvalidItemsTypeLogged) {
    helperInvalidItemsTypeLogged = true;
    writePerfLog("helperInvalidItemsType", {
      valueType: itemsRaw === null ? "null" : typeof itemsRaw
    });
  }
  const items: HelperItem[] = [];
  for (const item of itemList) {
    if (!item || typeof item !== "object") continue;
    const iface = typeof (item as { iface?: unknown }).iface === "string" ? (item as { iface: string }).iface : "";
    const rxBytes = Number((item as { rxBytes?: unknown }).rxBytes);
    const txBytes = Number((item as { txBytes?: unknown }).txBytes);
    if (!iface || !Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
    items.push({
      iface,
      name: typeof (item as { name?: unknown }).name === "string" ? (item as { name: string }).name : undefined,
      id: typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : undefined,
      rxBytes,
      txBytes,
      status: typeof (item as { status?: unknown }).status === "string" ? (item as { status: string }).status : undefined,
      type: typeof (item as { type?: unknown }).type === "string" ? (item as { type: string }).type : undefined
    });
  }
  const disks: HelperDisk[] = [];
  if (Array.isArray(disksRaw)) {
    for (const item of disksRaw) {
      if (!item || typeof item !== "object") continue;
      const id = typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : "";
      const mount = typeof (item as { mount?: unknown }).mount === "string" ? (item as { mount: string }).mount : "";
      const fs = typeof (item as { fs?: unknown }).fs === "string" ? (item as { fs: string }).fs : "";
      const totalBytes = Number((item as { totalBytes?: unknown }).totalBytes);
      const freeBytes = Number((item as { freeBytes?: unknown }).freeBytes);
      if (!id || !Number.isFinite(totalBytes) || !Number.isFinite(freeBytes)) continue;
      disks.push({
        id,
        mount: mount || id,
        fs,
        totalBytes,
        freeBytes,
        label: typeof (item as { label?: unknown }).label === "string" ? (item as { label: string }).label : undefined
      });
    }
  }
  let cpu: HelperCpu | null = null;
  if (cpuRaw && typeof cpuRaw === "object") {
    const total = parseNumberFromUnknown((cpuRaw as { total?: unknown }).total);
    const coresRaw = (cpuRaw as { cores?: unknown }).cores;
    let cores: number[] | null = null;
    if (Array.isArray(coresRaw)) {
      cores = coresRaw.map((value) => parseNumberFromUnknown(value) ?? 0);
    }
    const frequencyMhz = parseNumberFromUnknown((cpuRaw as { frequencyMhz?: unknown }).frequencyMhz);
    cpu = { total, cores, frequencyMhz };
  }

  let mem: HelperMem | null = null;
  if (memRaw && typeof memRaw === "object") {
    const totalBytes = parseNumberFromUnknown((memRaw as { totalBytes?: unknown }).totalBytes);
    const usedBytes = parseNumberFromUnknown((memRaw as { usedBytes?: unknown }).usedBytes);
    if (typeof totalBytes === "number" && typeof usedBytes === "number") {
      mem = { totalBytes, usedBytes };
    }
  }

  let gpus: HelperGpu[] | null = null;
  if (Array.isArray(gpusRaw)) {
    const list: HelperGpu[] = [];
    for (let i = 0; i < gpusRaw.length; i += 1) {
      const raw = gpusRaw[i];
      if (!raw || typeof raw !== "object") continue;
      const index = parseNumberFromUnknown((raw as { index?: unknown }).index) ?? i;
      const name =
        typeof (raw as { name?: unknown }).name === "string" ? (raw as { name: string }).name : `GPU ${index + 1}`;
      const topComputeName = typeof (raw as { topComputeName?: unknown }).topComputeName === "string"
        ? (raw as { topComputeName: string }).topComputeName : null;
      const topComputeIconBase64 = typeof (raw as { topComputeIconBase64?: unknown }).topComputeIconBase64 === "string"
        ? (raw as { topComputeIconBase64: string }).topComputeIconBase64 : null;
      list.push({
        index,
        name,
        loadPct: parseNumberFromUnknown((raw as { loadPct?: unknown }).loadPct),
        vramTotalBytes: parseNumberFromUnknown((raw as { vramTotalBytes?: unknown }).vramTotalBytes),
        vramUsedBytes: parseNumberFromUnknown((raw as { vramUsedBytes?: unknown }).vramUsedBytes),
        tempC: parseNumberFromUnknown((raw as { tempC?: unknown }).tempC),
        powerW: parseNumberFromUnknown((raw as { powerW?: unknown }).powerW),
        topComputeName,
        topComputePct: parseNumberFromUnknown((raw as { topComputePct?: unknown }).topComputePct),
        topComputeIconBase64,
        clockMHz: parseNumberFromUnknown((raw as { clockMHz?: unknown }).clockMHz),
        memClockMHz: parseNumberFromUnknown((raw as { memClockMHz?: unknown }).memClockMHz),
        encoderPct: parseNumberFromUnknown((raw as { encoderPct?: unknown }).encoderPct),
        decoderPct: parseNumberFromUnknown((raw as { decoderPct?: unknown }).decoderPct),
        fanPct: parseNumberFromUnknown((raw as { fanPct?: unknown }).fanPct),
        pcieRxKBps: parseNumberFromUnknown((raw as { pcieRxKBps?: unknown }).pcieRxKBps),
        pcieTxKBps: parseNumberFromUnknown((raw as { pcieTxKBps?: unknown }).pcieTxKBps),
        throttleReasons: parseNumberFromUnknown((raw as { throttleReasons?: unknown }).throttleReasons)
      });
    }
    gpus = list;
  }

  let diskPerf: HelperDiskPerf | null = null;
  if (diskPerfRaw && typeof diskPerfRaw === "object") {
    const totalRaw = (diskPerfRaw as { total?: unknown }).total;
    const itemsRawPerf = (diskPerfRaw as { items?: unknown }).items;
    const parseItem = (raw: unknown): HelperDiskPerfItem | null => {
      if (!raw || typeof raw !== "object") return null;
      const id = typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : "";
      if (!id) return null;
      return {
        id,
        activePct: parseNumberFromUnknown((raw as { activePct?: unknown }).activePct),
        readBps: parseNumberFromUnknown((raw as { readBps?: unknown }).readBps),
        writeBps: parseNumberFromUnknown((raw as { writeBps?: unknown }).writeBps)
      };
    };

    const totalItem = totalRaw ? parseItem(totalRaw) : null;
    const items: HelperDiskPerfItem[] = [];
    if (Array.isArray(itemsRawPerf)) {
      for (const item of itemsRawPerf) {
        const parsed = parseItem(item);
        if (parsed) items.push(parsed);
      }
    }
    diskPerf = { total: totalItem, items };
  }

  let topProcess: HelperTopProcess | null = null;
  if (topProcessRaw && typeof topProcessRaw === "object") {
    const cpuName = typeof (topProcessRaw as { cpuName?: unknown }).cpuName === "string"
      ? (topProcessRaw as { cpuName: string }).cpuName : null;
    const cpuPct = parseNumberFromUnknown((topProcessRaw as { cpuPct?: unknown }).cpuPct);
    const memName = typeof (topProcessRaw as { memName?: unknown }).memName === "string"
      ? (topProcessRaw as { memName: string }).memName : null;
    const memMB = parseNumberFromUnknown((topProcessRaw as { memMB?: unknown }).memMB);
    const cpuIconBase64 = typeof (topProcessRaw as { cpuIconBase64?: unknown }).cpuIconBase64 === "string"
      ? (topProcessRaw as { cpuIconBase64: string }).cpuIconBase64 : null;
    const memIconBase64 = typeof (topProcessRaw as { memIconBase64?: unknown }).memIconBase64 === "string"
      ? (topProcessRaw as { memIconBase64: string }).memIconBase64 : null;
    const diskName = typeof (topProcessRaw as { diskName?: unknown }).diskName === "string"
      ? (topProcessRaw as { diskName: string }).diskName : null;
    const diskBps = parseNumberFromUnknown((topProcessRaw as { diskBps?: unknown }).diskBps);
    const diskIconBase64 = typeof (topProcessRaw as { diskIconBase64?: unknown }).diskIconBase64 === "string"
      ? (topProcessRaw as { diskIconBase64: string }).diskIconBase64 : null;
    topProcess = { cpuName, cpuPct, memName, memMB, cpuIconBase64, memIconBase64, diskName, diskBps, diskIconBase64 };
  }

  return { t, items, disks, cpu, diskPerf, mem, gpus, topProcess };
}

function normalizeDiskId(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return `${upper}:`;
  return upper;
}

function mapNetStatsSample(stat: NetStatsSample): NetInterfaceSnapshot {
  return {
    iface: stat.iface,
    rxBps: toNumber(stat.rx_sec),
    txBps: toNumber(stat.tx_sec),
    rxBytes: toNumber(stat.rx_bytes),
    txBytes: toNumber(stat.tx_bytes)
  };
}

function sumNet(stats: NetInterfaceSnapshot[]): NetInterfaceSnapshot {
  let rxBps = 0;
  let txBps = 0;
  let rxBytes = 0;
  let txBytes = 0;
  let has = false;

  for (const item of stats) {
    if (typeof item.rxBps === "number") {
      rxBps += item.rxBps;
      has = true;
    }
    if (typeof item.txBps === "number") {
      txBps += item.txBps;
      has = true;
    }
    if (typeof item.rxBytes === "number") {
      rxBytes += item.rxBytes;
      has = true;
    }
    if (typeof item.txBytes === "number") {
      txBytes += item.txBytes;
      has = true;
    }
  }

  return {
    iface: "total",
    rxBps: has ? rxBps : null,
    txBps: has ? txBps : null,
    rxBytes: has ? rxBytes : null,
    txBytes: has ? txBytes : null
  };
}

interface SubscriptionMetadata {
  callback: (snapshot: StatsSnapshot) => void;
  lastCalledAt: number;
}

class StatsPoller {
  private readonly subscribers = new Map<(snapshot: StatsSnapshot) => void, SubscriptionMetadata>();
  private timer: NodeJS.Timeout | undefined;
  private lastSubscriptionCleanupAt = 0;
  private snapshot: StatsSnapshot = emptySnapshot();
  private readonly netCascades = new Map<string, TransferCascade>();
  private netHistoryDirty = false;
  private netHistoryPersistAt = 0;
  private netHistoryWritePending = false;
  private netHistoryWriteTimer: NodeJS.Timeout | undefined;
  private readonly perfStats = new Map<string, PerfAggregate>();
  private readonly recentTickMs: number[] = [];
  private static readonly ROLLING_TICK_WINDOW = 60;
  private perfLastLogAt = 0;
  private perfProcessLastAt = 0;
  private perfProcessLastCpu: NodeJS.CpuUsage | null = null;
  private perfProcessSnapshot: { cpuPct: number | null; heapMb: number } | null = null;
  private cpuMemAt = 0;
  private cpuMemInFlight: Promise<void> | null = null;
  private gpuPollInFlight: Promise<void> | null = null;
  private diskPerfAt = 0;
  private diskPerfInFlight: Promise<void> | null = null;
  private diskSizeInFlight: Promise<void> | null = null;
  private netStatsInFlight: Promise<void> | null = null;
  private netIfacesInFlight: Promise<void> | null = null;
  private readonly actionGroups = new Map<string, MetricGroup>();
  private readonly groupCounts: Record<MetricGroup, number> = {
    cpu: 0,
    gpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    system: 0
  };
  private fsSizeCache: FsSizeSample[] | null = null;
  private fsSizeAt = 0;
  private netIfacesCache: NetInterfaceInfo[] | null = null;
  private netIfacesAt = 0;
  private netStatsCache: NetStatsSample[] | null = null;
  private netStatsAt = 0;
  private helperSampleAt = 0;
  private readonly helperLastByIface = new Map<string, { rxBytes: number; txBytes: number; t: number }>();
  private helperFailed = false;
  private helperCpuMissing = false;
  private helperDiskPerfMissing = false;
  private helperMemMissing = false;
  private helperGpuMissing = false;
  private helperAllowed = false;
  private gpuPollAt = 0;
  private readonly helper = new SimpleStatsHelper();

  constructor() {
    this.loadNetHistory();
  }

  subscribe(handler: (snapshot: StatsSnapshot) => void): () => void {
    const metadata: SubscriptionMetadata = {
      callback: handler,
      lastCalledAt: Date.now()
    };
    this.subscribers.set(handler, metadata);
    if (this.subscribers.size === 1) {
      this.start();
    }
    handler(this.snapshot);
    return () => {
      this.subscribers.delete(handler);
      if (this.subscribers.size === 0) {
        this.stop();
      }
    };
  }

  getSnapshot(): StatsSnapshot {
    return this.snapshot;
  }

  getPerfSummary(): PerfSummarySnapshot {
    const recent = this.recentTickMs;
    let avgMs = 0;
    let maxMs = 0;
    if (recent.length > 0) {
      let sum = 0;
      for (const ms of recent) {
        sum += ms;
        if (ms > maxMs) maxMs = ms;
      }
      avgMs = sum / recent.length;
    }
    return {
      tickAvgMs: Math.round(avgMs * 10) / 10,
      tickMaxMs: Math.round(maxMs * 10) / 10,
      cpuPct: this.perfProcessSnapshot?.cpuPct ?? null,
      heapMb: this.perfProcessSnapshot?.heapMb ?? 0
    };
  }

  setInterest(actionId: string, group: string): void {
    if (!isMetricGroup(group)) return;
    const prev = this.actionGroups.get(actionId);
    if (prev === group) return;
    this.actionGroups.set(actionId, group);
    this.updateGroupCount(group, 1);
    if (prev) {
      this.updateGroupCount(prev, -1);
    }
  }

  clearInterest(actionId: string): void {
    const prev = this.actionGroups.get(actionId);
    if (!prev) return;
    this.actionGroups.delete(actionId);
    this.updateGroupCount(prev, -1);
    this.stopHelperIfIdle();
  }

  async refreshNow(options?: RefreshOptions): Promise<StatsSnapshot> {
    const forceGroups = options?.forceGroups ?? [];
    if (forceGroups.includes("disk")) {
      const started = this.helper.requestDiskRescan(this.hasActionInterest());
      if (!started) {
        writePerfLog("helperCommandSkipped", {
          command: HELPER_CMD_RESCAN_DISKS,
          hasActionInterest: this.hasActionInterest()
        });
      }
    }
    await this.tick(options);
    return this.snapshot;
  }

  getNetworkTransfer(periodSec: number, iface?: string): { rxBytes: number | null; txBytes: number | null; totalBytes: number | null } {
    const key = iface && iface.length > 0 ? iface : "total";
    const cascade = this.netCascades.get(key);
    if (!cascade) return { rxBytes: null, txBytes: null, totalBytes: null };

    // 60s = sum of secondDeltas (rolling 60s ring of per-poll deltas)
    const rx60s = cascade.secondDeltas.reduce((sum, d) => sum + d.rx, 0);
    const tx60s = cascade.secondDeltas.reduce((sum, d) => sum + d.tx, 0);

    // 1H = sum(completedMinutes) + currentMinute, floored to >= 60s
    let rxMinutes = cascade.currentMinute.rx;
    let txMinutes = cascade.currentMinute.tx;
    for (const m of cascade.completedMinutes) {
      rxMinutes += m.rx;
      txMinutes += m.tx;
    }
    const rx1H = Math.max(rxMinutes, rx60s);
    const tx1H = Math.max(txMinutes, tx60s);

    // 24H = sum(completedHours) + 1H
    let rxHours = 0;
    let txHours = 0;
    for (const h of cascade.completedHours) {
      rxHours += h.rx;
      txHours += h.tx;
    }
    const rx24H = rxHours + rx1H;
    const tx24H = txHours + tx1H;

    if (periodSec <= 60) {
      return { rxBytes: rx60s, txBytes: tx60s, totalBytes: rx60s + tx60s };
    }
    if (periodSec <= 3600) {
      return { rxBytes: rx1H, txBytes: tx1H, totalBytes: rx1H + tx1H };
    }
    return { rxBytes: rx24H, txBytes: tx24H, totalBytes: rx24H + tx24H };
  }

  private updateGroupCount(group: MetricGroup, delta: number): void {
    const prev = this.groupCounts[group];
    const next = Math.max(0, prev + delta);
    this.groupCounts[group] = next;
    if (prev === 0 && next > 0) {
      this.onGroupActivated(group);
    } else if (prev > 0 && next === 0) {
      this.onGroupDeactivated(group);
    }
  }

  private isHelperBackedGroup(group: MetricGroup): boolean {
    return group !== "system";
  }

  private hasActionInterest(): boolean {
    return this.actionGroups.size > 0;
  }

  private hasHelperBackedInterest(): boolean {
    return this.groupCounts.cpu > 0 ||
      this.groupCounts.gpu > 0 ||
      this.groupCounts.memory > 0 ||
      this.groupCounts.disk > 0 ||
      this.groupCounts.network > 0;
  }

  private resetHelperStatusFlags(): void {
    this.helperFailed = false;
    this.helperCpuMissing = false;
    this.helperDiskPerfMissing = false;
    this.helperMemMissing = false;
    this.helperGpuMissing = false;
  }

  private clearHelperCaches(): void {
    this.netStatsCache = null;
    this.netIfacesCache = null;
    this.fsSizeCache = null;
    this.helperLastByIface.clear();
    this.helperSampleAt = 0;
    for (const cascade of this.netCascades.values()) {
      cascade.prevCounter = null;
    }
  }

  private stopHelperIfIdle(): void {
    if (this.hasHelperBackedInterest()) return;
    this.helperAllowed = false;
    this.helper.stop();
    this.clearHelperCaches();
  }

  private onGroupActivated(group: MetricGroup): void {
    if (group === "disk") {
      this.fsSizeAt = 0;
    }
    if (group === "network") {
      this.netIfacesAt = 0;
      this.netStatsAt = 0;
    }
    if (this.isHelperBackedGroup(group)) {
      this.resetHelperStatusFlags();
    }
  }

  private onGroupDeactivated(group: MetricGroup): void {
    if (this.isHelperBackedGroup(group)) {
      this.stopHelperIfIdle();
    }
  }

  private isGroupActive(group: MetricGroup): boolean {
    if (this.groupCounts[group] > 0) return true;
    // Poll all helper-backed groups whenever the helper is running so that
    // data accumulates for keys on other pages before they become visible.
    return this.isHelperBackedGroup(group) && this.hasHelperBackedInterest();
  }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    void this.tick();
  }

  private stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    void this.persistNetHistory(true);
    this.helperAllowed = false;
    this.helper.stop();
    this.clearHelperCaches();
  }

  private emit(snapshot: StatsSnapshot) {
    const now = Date.now();
    for (const metadata of this.subscribers.values()) {
      try {
        metadata.callback(snapshot);
      } catch (err) {
        writePerfLog("subscriberCallbackError", { error: String(err) });
      }
      metadata.lastCalledAt = now;
    }

    // Periodic subscription cleanup (every 5 minutes)
    if (now - this.lastSubscriptionCleanupAt > 5 * 60 * 1000) {
      this.cleanupStaleSubscriptions(now);
      this.lastSubscriptionCleanupAt = now;
    }
  }

  private cleanupStaleSubscriptions(now: number): void {
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    const deadSubs: Array<(snapshot: StatsSnapshot) => void> = [];

    for (const [handler, metadata] of this.subscribers.entries()) {
      if (now - metadata.lastCalledAt > staleThreshold) {
        deadSubs.push(handler);
      }
    }

    if (deadSubs.length > 0) {
      writePerfLog(`Cleaning up ${deadSubs.length} stale subscription(s)`);
      for (const handler of deadSubs) {
        this.subscribers.delete(handler);
      }
    }
  }

  private getHelperSnapshot(): HelperSnapshot | null {
    if (!this.helperAllowed) {
      return null;
    }
    if (!this.helper.ensureRunning()) {
      this.markHelperFailed("helperUnavailable");
      return null;
    }
    const snapshot = this.helper.getSnapshot();
    if (!snapshot) {
      if (this.helper.shouldFallback()) {
        this.markHelperFailed("helperNoData");
      }
      return null;
    }
    return snapshot;
  }

  private markHelperFailed(message: string): void {
    if (!this.helperFailed) {
      this.helperFailed = true;
      writePerfLog(message);
    }
  }

  private getFsSizeCached(force = false): FsSizeSample[] | null {
    const now = Date.now();
    const snapshot = this.getHelperSnapshot();
    if (!snapshot) {
      this.fsSizeCache = null;
      this.fsSizeAt = 0;
      return null;
    }

    if (!force && this.fsSizeCache && snapshot.t <= this.helperSampleAt && now - this.fsSizeAt < FS_SIZE_CACHE_MS) {
      return this.fsSizeCache;
    }

    const next = this.buildFsSizeFromHelper(snapshot);
    if (next.length === 0) {
      if (this.fsSizeCache && this.fsSizeCache.length > 0) {
        return this.fsSizeCache;
      }
      // Treat empty helper disk payloads as warmup so we retry quickly.
      this.fsSizeCache = null;
      this.fsSizeAt = 0;
      return null;
    }
    this.fsSizeCache = next;
    this.fsSizeAt = now;
    return next;
  }

  private getNetIfacesCached(force = false): NetInterfaceInfo[] | null {
    const now = Date.now();
    if (!force && this.netIfacesCache && now - this.netIfacesAt < NET_IFACE_CACHE_MS) {
      return this.netIfacesCache;
    }

    const snapshot = this.getHelperSnapshot();
    if (!snapshot) {
      this.netIfacesCache = null;
      return null;
    }

    const next = this.buildNetIfacesFromHelper(snapshot);
    this.netIfacesCache = next;
    this.netIfacesAt = now;
    return next;
  }

  private getNetStatsCached(force = false): NetStatsSample[] | null {
    const now = Date.now();
    const snapshot = this.getHelperSnapshot();
    if (!snapshot) {
      this.netStatsCache = null;
      return null;
    }

    if (!force && this.netStatsCache && snapshot.t <= this.helperSampleAt && now - this.netStatsAt < NET_STATS_CACHE_MS) {
      return this.netStatsCache;
    }

    const next = this.buildNetStatsFromHelper(snapshot);
    this.netStatsCache = next;
    this.netStatsAt = now;
    return next;
  }

  private buildNetStatsFromHelper(snapshot: HelperSnapshot): NetStatsSample[] {
    const stats: NetStatsSample[] = [];
    const now = snapshot.t;
    const seen = new Set<string>();

    for (const item of snapshot.items) {
      const iface = item.iface;
      seen.add(iface);
      const prev = this.helperLastByIface.get(iface);
      let rx_sec: number | null = null;
      let tx_sec: number | null = null;
      if (prev && now > prev.t) {
        const deltaMs = now - prev.t;
        const rxDelta = item.rxBytes - prev.rxBytes;
        const txDelta = item.txBytes - prev.txBytes;
        if (rxDelta >= 0) {
          rx_sec = rxDelta / (deltaMs / 1000);
        }
        if (txDelta >= 0) {
          tx_sec = txDelta / (deltaMs / 1000);
        }
      }
      stats.push({
        iface,
        rx_sec,
        tx_sec,
        rx_bytes: item.rxBytes,
        tx_bytes: item.txBytes
      });
      this.helperLastByIface.set(iface, { rxBytes: item.rxBytes, txBytes: item.txBytes, t: now });
    }

    for (const key of this.helperLastByIface.keys()) {
      if (!seen.has(key)) {
        this.helperLastByIface.delete(key);
      }
    }

    this.helperSampleAt = now;
    return stats;
  }

  private buildFsSizeFromHelper(snapshot: HelperSnapshot): FsSizeSample[] {
    const disks: FsSizeSample[] = [];
    for (const disk of snapshot.disks) {
      const total = Number(disk.totalBytes);
      const free = Number(disk.freeBytes);
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) continue;
      const used = Math.max(0, total - free);
      const usePct = total > 0 ? (used / total) * 100 : null;
      const mount = disk.mount || disk.id;
      const fs = disk.fs || mount;
      disks.push({
        fs,
        mount,
        size: total,
        use: usePct
      });
    }
    this.helperSampleAt = snapshot.t;
    return disks;
  }

  private buildNetIfacesFromHelper(snapshot: HelperSnapshot): NetInterfaceInfo[] {
    const items: NetInterfaceInfo[] = [];
    for (const item of snapshot.items) {
      const name = item.name || item.iface;
      const type = (item.type || "").toLowerCase();
      const nameLower = name.toLowerCase();
      const internal = type.includes("loopback");
      const virtual =
        type.includes("tunnel") ||
        nameLower.includes("virtual") ||
        nameLower.includes("hyper-v") ||
        nameLower.includes("vmware") ||
        nameLower.includes("loopback");
      items.push({
        iface: item.iface,
        ifaceName: name,
        internal,
        virtual
      });
    }
    this.helperSampleAt = snapshot.t;
    return items;
  }

  private getCpuFromHelper(): HelperCpu | null {
    const snapshot = this.getHelperSnapshot();
    if (!snapshot || !snapshot.cpu) {
      if (!this.helperCpuMissing) {
        this.helperCpuMissing = true;
        writePerfLog("helperCpuMissing");
      }
      return null;
    }
    if (this.helperCpuMissing) {
      this.helperCpuMissing = false;
      writePerfLog("helperCpuAvailable");
    }
    return snapshot.cpu;
  }

  private getMemFromHelper(): HelperMem | null {
    const snapshot = this.getHelperSnapshot();
    if (!snapshot || !snapshot.mem) {
      if (!this.helperMemMissing) {
        this.helperMemMissing = true;
        writePerfLog("helperMemMissing");
      }
      return null;
    }
    if (this.helperMemMissing) {
      this.helperMemMissing = false;
      writePerfLog("helperMemAvailable");
    }
    return snapshot.mem;
  }

  private getGpuFromHelper(): HelperGpu[] | null {
    const snapshot = this.getHelperSnapshot();
    if (!snapshot || !snapshot.gpus || snapshot.gpus.length === 0) {
      if (!this.helperGpuMissing) {
        this.helperGpuMissing = true;
        writePerfLog("helperGpuMissing");
      }
      return null;
    }
    if (this.helperGpuMissing) {
      this.helperGpuMissing = false;
      writePerfLog("helperGpuAvailable");
    }
    return snapshot.gpus;
  }

  private getTopProcessFromHelper(): HelperTopProcess | null {
    const snapshot = this.getHelperSnapshot();
    if (!snapshot || !snapshot.topProcess) return null;
    return snapshot.topProcess;
  }

  private getDiskPerfFromHelper(): WindowsDiskPerf | null {
    const snapshot = this.getHelperSnapshot();
    if (!snapshot || !snapshot.diskPerf) {
      if (!this.helperDiskPerfMissing) {
        this.helperDiskPerfMissing = true;
        writePerfLog("helperDiskPerfMissing");
      }
      return null;
    }
    if (this.helperDiskPerfMissing) {
      this.helperDiskPerfMissing = false;
      writePerfLog("helperDiskPerfAvailable");
    }

    const total = snapshot.diskPerf.total;
    const totalPerf: DiskPerf = {
      activePct: toPercent(total?.activePct ?? null),
      readBps: toNumber(total?.readBps ?? null),
      writeBps: toNumber(total?.writeBps ?? null)
    };

    const byId: Record<string, DiskPerf> = {};
    for (const item of snapshot.diskPerf.items) {
      const key = normalizeDiskId(item.id);
      if (!key) continue;
      byId[key] = {
        activePct: toPercent(item.activePct ?? null),
        readBps: toNumber(item.readBps ?? null),
        writeBps: toNumber(item.writeBps ?? null)
      };
    }

    return { total: totalPerf, byId };
  }

  private loadNetHistory() {
    const persisted = readCascadePersisted();
    if (!persisted) return;

    const now = Date.now();
    const currentMinuteEpoch = Math.floor(now / 60000);
    const currentHourEpoch = Math.floor(now / 3600000);
    const oldestHourEpoch = currentHourEpoch - MAX_COMPLETED_HOURS;

    for (const [key, data] of Object.entries(persisted.cascades)) {
      if (!data || typeof data !== "object") continue;
      const cascade = this.getOrCreateCascade(key);

      // Load completedHours — drop entries older than 23 hours
      if (Array.isArray(data.hours)) {
        for (const entry of data.hours) {
          if (!Array.isArray(entry) || entry.length < 3) continue;
          const epoch = Number(entry[0]);
          const rx = Number(entry[1]);
          const tx = Number(entry[2]);
          if (!Number.isFinite(epoch) || !Number.isFinite(rx) || !Number.isFinite(tx)) continue;
          if (epoch < oldestHourEpoch) continue;
          if (epoch >= currentHourEpoch) continue;
          cascade.completedHours.push({ epoch, rx, tx });
        }
        cascade.completedHours.sort((a, b) => a.epoch - b.epoch);
      }

      // Load completedMinutes — roll up any belonging to a completed hour epoch
      if (Array.isArray(data.minutes)) {
        for (const entry of data.minutes) {
          if (!Array.isArray(entry) || entry.length < 3) continue;
          const epoch = Number(entry[0]);
          const rx = Number(entry[1]);
          const tx = Number(entry[2]);
          if (!Number.isFinite(epoch) || !Number.isFinite(rx) || !Number.isFinite(tx)) continue;
          cascade.completedMinutes.push({ epoch, rx, tx });
        }
        this.rollupCascadeHours(cascade, currentHourEpoch);
        while (cascade.completedHours.length > MAX_COMPLETED_HOURS) {
          cascade.completedHours.shift();
        }
      }

      // Load currentMinute
      if (Array.isArray(data.currentMinute) && data.currentMinute.length >= 3) {
        const epoch = Number(data.currentMinute[0]);
        const rx = Number(data.currentMinute[1]);
        const tx = Number(data.currentMinute[2]);
        if (Number.isFinite(epoch) && Number.isFinite(rx) && Number.isFinite(tx)) {
          if (epoch === currentMinuteEpoch) {
            // Same minute — resume accumulating
            cascade.currentMinute = { epoch, rx, tx };
          } else if (epoch > 0) {
            // Past minute — complete it and start fresh
            cascade.completedMinutes.push({ epoch, rx, tx });
            this.rollupCascadeHours(cascade, currentHourEpoch);
            while (cascade.completedHours.length > MAX_COMPLETED_HOURS) {
              cascade.completedHours.shift();
            }
            cascade.currentMinute = { epoch: currentMinuteEpoch, rx: 0, tx: 0 };
          }
        }
      }

      // secondDeltas and prevCounter are in-memory only — left empty
    }

    this.netHistoryPersistAt = now;
  }

  private async persistNetHistory(force = false): Promise<void> {
    const now = Date.now();

    if (!force) {
      if (!this.netHistoryDirty) return;

      const timeSinceLastWrite = now - this.netHistoryPersistAt;
      if (timeSinceLastWrite < NET_HISTORY_PERSIST_MS) {
        if (!this.netHistoryWritePending) {
          this.netHistoryWritePending = true;
          const delay = NET_HISTORY_PERSIST_MS - timeSinceLastWrite;

          if (this.netHistoryWriteTimer) {
            clearTimeout(this.netHistoryWriteTimer);
          }

          this.netHistoryWriteTimer = setTimeout(() => {
            this.netHistoryWritePending = false;
            this.netHistoryWriteTimer = undefined;
            void this.persistNetHistory();
          }, delay);
        }
        return;
      }
    }

    if (this.netCascades.size === 0) return;

    const cascades: CascadePersisted["cascades"] = {};
    for (const [key, cascade] of this.netCascades.entries()) {
      cascades[key] = {
        hours: cascade.completedHours.map((h) => [h.epoch, h.rx, h.tx]),
        minutes: cascade.completedMinutes.map((m) => [m.epoch, m.rx, m.tx]),
        currentMinute: [cascade.currentMinute.epoch, cascade.currentMinute.rx, cascade.currentMinute.tx]
      };
    }

    try {
      const success = await writeCascadePersisted({ version: 2, savedAt: now, cascades });
      if (success) {
        this.netHistoryPersistAt = now;
        this.netHistoryDirty = false;
      }
    } catch (err) {
      writePerfLog("Failed to persist network history", { error: String(err) });
    }
  }

  private getOrCreateCascade(key: string): TransferCascade {
    let cascade = this.netCascades.get(key);
    if (!cascade) {
      cascade = {
        secondDeltas: [],
        currentMinute: { epoch: 0, rx: 0, tx: 0 },
        completedMinutes: [],
        completedHours: [],
        prevCounter: null
      };
      this.netCascades.set(key, cascade);
    }
    return cascade;
  }

  private feedNetCascades(netInterfaces: NetInterfaceSnapshot[], now: number): void {
    let totalRxDelta = 0;
    let totalTxDelta = 0;

    for (const net of netInterfaces) {
      if (net.rxBytes === null || net.txBytes === null) continue;
      const cascade = this.getOrCreateCascade(net.iface);
      const delta = this.computeAndFeedDelta(cascade, net.rxBytes, net.txBytes, now);
      totalRxDelta += delta.rx;
      totalTxDelta += delta.tx;
    }

    // Feed total from summed per-interface deltas (not cumulative total)
    const totalCascade = this.getOrCreateCascade("total");
    this.feedCascadeDelta(totalCascade, totalRxDelta, totalTxDelta, now);
  }

  private computeAndFeedDelta(
    cascade: TransferCascade,
    rxBytes: number,
    txBytes: number,
    now: number
  ): { rx: number; tx: number } {
    let rxDelta = 0;
    let txDelta = 0;

    if (cascade.prevCounter) {
      const rxRaw = rxBytes - cascade.prevCounter.rx;
      const txRaw = txBytes - cascade.prevCounter.tx;
      rxDelta = rxRaw >= 0 ? rxRaw : 0;
      txDelta = txRaw >= 0 ? txRaw : 0;
    }
    cascade.prevCounter = { rx: rxBytes, tx: txBytes };

    this.feedCascadeDelta(cascade, rxDelta, txDelta, now);
    return { rx: rxDelta, tx: txDelta };
  }

  private feedCascadeDelta(cascade: TransferCascade, rxDelta: number, txDelta: number, now: number): void {
    // Push to secondDeltas ring, evict entries older than 60s
    cascade.secondDeltas.push({ t: now, rx: rxDelta, tx: txDelta });
    const secondCutoff = now - MAX_NET_HISTORY_SECONDS_MS;
    while (cascade.secondDeltas.length > 0 && cascade.secondDeltas[0].t < secondCutoff) {
      cascade.secondDeltas.shift();
    }

    // Check minute epoch — if changed, trigger rollup
    const minuteEpoch = Math.floor(now / 60000);
    if (cascade.currentMinute.epoch !== minuteEpoch) {
      this.rollupCascadeMinute(cascade, minuteEpoch);
    }

    // Accumulate into current minute
    cascade.currentMinute.rx += rxDelta;
    cascade.currentMinute.tx += txDelta;
    this.netHistoryDirty = true;
  }

  private rollupCascadeMinute(cascade: TransferCascade, newEpoch: number): void {
    // Push completed currentMinute to completedMinutes (skip initial epoch 0)
    if (cascade.currentMinute.epoch > 0) {
      cascade.completedMinutes.push({ ...cascade.currentMinute });
    }

    // Roll up any completed minutes from previous hours
    const currentHourEpoch = Math.floor(newEpoch / 60);
    this.rollupCascadeHours(cascade, currentHourEpoch);

    // Trim completedHours to max 23
    while (cascade.completedHours.length > MAX_COMPLETED_HOURS) {
      cascade.completedHours.shift();
    }

    // Reset current minute
    cascade.currentMinute = { epoch: newEpoch, rx: 0, tx: 0 };
  }

  private rollupCascadeHours(cascade: TransferCascade, currentHourEpoch: number): void {
    const remaining: Array<{ epoch: number; rx: number; tx: number }> = [];
    const hourBuckets = new Map<number, { rx: number; tx: number }>();

    for (const m of cascade.completedMinutes) {
      const hourEpoch = Math.floor(m.epoch / 60);
      if (hourEpoch < currentHourEpoch) {
        const bucket = hourBuckets.get(hourEpoch) ?? { rx: 0, tx: 0 };
        bucket.rx += m.rx;
        bucket.tx += m.tx;
        hourBuckets.set(hourEpoch, bucket);
      } else {
        remaining.push(m);
      }
    }

    cascade.completedMinutes = remaining;

    // Trim to max 59 completed minutes
    while (cascade.completedMinutes.length > MAX_COMPLETED_MINUTES) {
      cascade.completedMinutes.shift();
    }

    for (const [hourEpoch, bucket] of hourBuckets) {
      cascade.completedHours.push({ epoch: hourEpoch, rx: bucket.rx, tx: bucket.tx });
    }
    cascade.completedHours.sort((a, b) => a.epoch - b.epoch);
  }

  private shouldPoll(
    now: number,
    lastAt: number,
    intervalMs: number,
    hasCache: boolean,
    force: boolean,
    ensure: boolean
  ): boolean {
    if (force) return true;
    if (!hasCache && ensure) return true;
    if (!hasCache) return true;
    return now - lastAt >= intervalMs;
  }

  private queueCpuMemoryPoll(
    now: number,
    needCpu: boolean,
    needMemory: boolean,
    force: boolean,
    ensure: boolean
  ): Promise<void> | null {
    if (!needCpu && !needMemory) return null;
    if (this.cpuMemInFlight) return this.cpuMemInFlight;
    const hasCache = this.cpuMemAt > 0;
    if (!this.shouldPoll(now, this.cpuMemAt, CPU_MEM_INTERVAL_MS, hasCache, force, ensure)) {
      return null;
    }
    this.cpuMemInFlight = this.pollCpuMemory(needCpu, needMemory)
      .catch(() => undefined)
      .finally(() => {
        this.cpuMemInFlight = null;
      });
    return this.cpuMemInFlight;
  }

  private async pollCpuMemory(needCpu: boolean, needMemory: boolean): Promise<void> {
    const pollStart = performance.now();
    try {
      const helperCpu = needCpu ? this.getCpuFromHelper() : null;
      const helperMem = needMemory ? this.getMemFromHelper() : null;

      let cpuTotal = this.snapshot.cpu.total;
      let cpuCores = this.snapshot.cpu.cores;
      let cpuFrequencyMhz = this.snapshot.cpu.frequencyMhz;
      if (needCpu) {
        if (helperCpu) {
          cpuTotal = toPercent(helperCpu.total);
          cpuCores = helperCpu.cores ? helperCpu.cores.map((value) => toPercent(value) ?? 0) : null;
          cpuFrequencyMhz = toNumber(helperCpu.frequencyMhz);
        } else {
          cpuTotal = null;
          cpuCores = null;
          cpuFrequencyMhz = null;
        }
      }

      let memUsedBytes = this.snapshot.memUsedBytes;
      let memTotalBytes = this.snapshot.memTotalBytes;
      let memUsedPct = this.snapshot.memUsedPct;
      if (needMemory) {
        if (helperMem && helperMem.totalBytes > 0) {
          memUsedBytes = helperMem.usedBytes;
          memTotalBytes = helperMem.totalBytes;
          memUsedPct = toPercent((helperMem.usedBytes / helperMem.totalBytes) * 100);
        } else {
          memUsedBytes = null;
          memTotalBytes = null;
          memUsedPct = null;
        }
      }

      const helperTopProcess = this.getTopProcessFromHelper();
      const topProcess: TopProcessSnapshot = helperTopProcess
        ? {
            cpuName: helperTopProcess.cpuName,
            cpuPct: toNumber(helperTopProcess.cpuPct),
            memName: helperTopProcess.memName,
            memMB: toNumber(helperTopProcess.memMB),
            cpuIconBase64: helperTopProcess.cpuIconBase64,
            memIconBase64: helperTopProcess.memIconBase64,
            diskName: helperTopProcess.diskName,
            diskBps: toNumber(helperTopProcess.diskBps),
            diskIconBase64: helperTopProcess.diskIconBase64
          }
        : this.snapshot.topProcess;

      this.cpuMemAt = Date.now();
      this.snapshot = {
        ...this.snapshot,
        cpu: {
          total: cpuTotal,
          cores: cpuCores,
          frequencyMhz: cpuFrequencyMhz
        },
        memUsedPct,
        memUsedBytes,
        memTotalBytes,
        topProcess
      };
      this.emit(this.snapshot);
    } catch {
      // Ignore polling errors to keep tick loop alive.
    } finally {
      this.recordPerf("cpuMem", performance.now() - pollStart);
    }
  }

  private queueGpuPoll(now: number, needGpu: boolean, force: boolean, ensure: boolean): Promise<void> | null {
    if (!needGpu) return null;
    if (this.gpuPollInFlight) return this.gpuPollInFlight;
    const hasCache = this.gpuPollAt > 0;
    if (!this.shouldPoll(now, this.gpuPollAt, GPU_CACHE_MS, hasCache, force, ensure)) {
      return null;
    }
    this.gpuPollInFlight = this.pollGpu(force)
      .catch(() => undefined)
      .finally(() => {
        this.gpuPollInFlight = null;
      });
    return this.gpuPollInFlight;
  }

  private async pollGpu(force: boolean): Promise<void> {
    const pollStart = performance.now();
    try {
      let gpus = this.snapshot.gpus;
      const helperGpus = this.getGpuFromHelper();
      if (helperGpus && helperGpus.length > 0) {
        gpus = helperGpus.map((gpu) => {
          const vramTotal = typeof gpu.vramTotalBytes === "number" ? gpu.vramTotalBytes / (1024 * 1024) : null;
          const vramUsed = typeof gpu.vramUsedBytes === "number" ? gpu.vramUsedBytes / (1024 * 1024) : null;
          const vramPct =
            vramTotal && vramTotal > 0 && typeof vramUsed === "number"
              ? toPercent((vramUsed / vramTotal) * 100)
              : null;
          return {
            index: gpu.index,
            name: gpu.name || `GPU ${gpu.index + 1}`,
            loadPct: toPercent(gpu.loadPct),
            vramPct,
            tempC: toNumber(gpu.tempC),
            vramTotal,
            vramUsed,
            powerW: toNumber(gpu.powerW),
            topComputeName: gpu.topComputeName,
            topComputePct: toNumber(gpu.topComputePct),
            topComputeIconBase64: gpu.topComputeIconBase64,
            clockMHz: toNumber(gpu.clockMHz),
            memClockMHz: toNumber(gpu.memClockMHz),
            encoderPct: toPercent(gpu.encoderPct),
            decoderPct: toPercent(gpu.decoderPct),
            fanPct: toPercent(gpu.fanPct),
            pcieRxKBps: toNumber(gpu.pcieRxKBps),
            pcieTxKBps: toNumber(gpu.pcieTxKBps),
            throttleReasons: toNumber(gpu.throttleReasons)
          };
        });
      } else {
        gpus = [];
      }

      this.gpuPollAt = Date.now();
      this.snapshot = {
        ...this.snapshot,
        gpus
      };
      this.emit(this.snapshot);
    } catch {
      // Ignore polling errors.
    } finally {
      this.recordPerf("gpu", performance.now() - pollStart);
    }
  }

  private queueDiskPerfPoll(now: number, needDisk: boolean, force: boolean, ensure: boolean): Promise<void> | null {
    if (!needDisk) return null;
    if (this.diskPerfInFlight) return this.diskPerfInFlight;
    const hasCache = this.diskPerfAt > 0;
    if (!this.shouldPoll(now, this.diskPerfAt, DISK_PERF_INTERVAL_MS, hasCache, force, ensure)) {
      return null;
    }
    this.diskPerfInFlight = this.pollDiskPerf(needDisk, force)
      .catch(() => undefined)
      .finally(() => {
        this.diskPerfInFlight = null;
      });
    return this.diskPerfInFlight;
  }

  private async pollDiskPerf(needDisk: boolean, force: boolean): Promise<void> {
    if (!needDisk) return;
    const pollStart = performance.now();
    try {
      let diskThroughput = this.snapshot.diskThroughput;
      let diskActivityPct = this.snapshot.diskActivityPct;
      let diskPerfById = this.snapshot.diskPerfById;

      const winDisk = this.getDiskPerfFromHelper();
      if (winDisk) {
        diskThroughput = {
          readBps: toNumber(winDisk.total.readBps),
          writeBps: toNumber(winDisk.total.writeBps)
        };
        diskActivityPct = toPercent(winDisk.total.activePct ?? null);
        diskPerfById = winDisk.byId;
      } else if (!this.diskPerfAt || force) {
        diskThroughput = { readBps: null, writeBps: null };
        diskActivityPct = null;
        diskPerfById = {};
      }

      this.diskPerfAt = Date.now();
      this.snapshot = {
        ...this.snapshot,
        diskThroughput,
        diskActivityPct,
        diskPerfById
      };
      this.emit(this.snapshot);
    } catch {
      // Ignore polling errors.
    } finally {
      this.recordPerf("diskPerf", performance.now() - pollStart);
    }
  }

  private queueDiskSizePoll(now: number, needDisk: boolean, force: boolean, ensure: boolean): Promise<void> | null {
    if (!needDisk) return null;
    if (this.diskSizeInFlight) return this.diskSizeInFlight;
    const hasCache = !!this.fsSizeCache && this.fsSizeAt > 0;
    if (!this.shouldPoll(now, this.fsSizeAt, FS_SIZE_CACHE_MS, hasCache, force, ensure)) {
      return null;
    }
    this.diskSizeInFlight = this.pollDiskSize(force)
      .catch(() => undefined)
      .finally(() => {
        this.diskSizeInFlight = null;
      });
    return this.diskSizeInFlight;
  }

  private async pollDiskSize(force: boolean): Promise<void> {
    const pollStart = performance.now();
    try {
      const fsSize = await this.getFsSizeCached(force);
      if (!fsSize) return;
      const disks = fsSize.map((disk) => {
        const mount = disk.mount || disk.fs || "";
        const fs = disk.fs || mount;
        const id = mount || fs;
        return {
          id,
          mount,
          fs,
          size: disk.size,
          usePct: toPercent(disk.use)
        };
      });
      this.snapshot = {
        ...this.snapshot,
        disks
      };
      this.emit(this.snapshot);
    } catch {
      // Ignore polling errors.
    } finally {
      this.recordPerf("diskSize", performance.now() - pollStart);
    }
  }

  private queueNetStatsPoll(now: number, needNetwork: boolean, force: boolean, ensure: boolean): Promise<void> | null {
    if (!needNetwork) return null;
    if (this.netStatsInFlight) return this.netStatsInFlight;
    const hasCache = !!this.netStatsCache && this.netStatsAt > 0;
    if (!this.shouldPoll(now, this.netStatsAt, NET_STATS_CACHE_MS, hasCache, force, ensure)) {
      return null;
    }
    this.netStatsInFlight = this.pollNetStats(force)
      .catch(() => undefined)
      .finally(() => {
        this.netStatsInFlight = null;
      });
    return this.netStatsInFlight;
  }

  private async pollNetStats(force: boolean): Promise<void> {
    const pollStart = performance.now();
    try {
      const netStats = await this.getNetStatsCached(force);
      if (!netStats) {
        if (!this.netStatsAt && force) {
          this.snapshot = {
            ...this.snapshot,
            net: {
              interfaces: [],
              total: {
                iface: "total",
                rxBps: null,
                txBps: null,
                rxBytes: null,
                txBytes: null
              }
            }
          };
          this.emit(this.snapshot);
        }
        return;
      }

      const netInterfaces = netStats.map(mapNetStatsSample);
      const netTotal = netInterfaces.length > 0 ? sumNet(netInterfaces) : this.snapshot.net.total;

      const now = Date.now();
      this.feedNetCascades(netInterfaces, now);
      void this.persistNetHistory();

      this.snapshot = {
        ...this.snapshot,
        net: {
          interfaces: netInterfaces,
          total: netTotal
        }
      };
      this.emit(this.snapshot);
    } catch {
      // Ignore polling errors.
    } finally {
      this.recordPerf("netStats", performance.now() - pollStart);
    }
  }

  private queueNetIfacesPoll(now: number, needNetwork: boolean, force: boolean, ensure: boolean): Promise<void> | null {
    if (!needNetwork) return null;
    if (this.netIfacesInFlight) return this.netIfacesInFlight;
    const hasCache = !!this.netIfacesCache && this.netIfacesAt > 0;
    if (!this.shouldPoll(now, this.netIfacesAt, NET_IFACE_CACHE_MS, hasCache, force, ensure)) {
      return null;
    }
    this.netIfacesInFlight = this.pollNetIfaces(force)
      .catch(() => undefined)
      .finally(() => {
        this.netIfacesInFlight = null;
      });
    return this.netIfacesInFlight;
  }

  private async pollNetIfaces(force: boolean): Promise<void> {
    const pollStart = performance.now();
    try {
      const netIfaces = await this.getNetIfacesCached(force);
      if (!netIfaces) return;
      this.snapshot = {
        ...this.snapshot,
        netIfaces
      };
      this.emit(this.snapshot);
    } catch {
      // Ignore polling errors.
    } finally {
      this.recordPerf("netIfaces", performance.now() - pollStart);
    }
  }

  private async tick(options?: RefreshOptions) {
    if (!this.snapshot.osSupported) {
      this.emit(this.snapshot);
      return;
    }

    const forceGroups = options?.forceGroups ?? [];
    const ensureGroups = options?.ensureGroups ?? [];
    const needCpu = this.isGroupActive("cpu") || forceGroups.includes("cpu") || ensureGroups.includes("cpu");
    const needMemory = this.isGroupActive("memory") || forceGroups.includes("memory") || ensureGroups.includes("memory");
    const needGpu = this.isGroupActive("gpu") || forceGroups.includes("gpu") || ensureGroups.includes("gpu");
    const needDisk = this.isGroupActive("disk") || forceGroups.includes("disk") || ensureGroups.includes("disk");
    const needNetwork = this.isGroupActive("network") || forceGroups.includes("network") || ensureGroups.includes("network");
    const forceCpuMem = forceGroups.includes("cpu") || forceGroups.includes("memory");
    const ensureCpuMem = ensureGroups.includes("cpu") || ensureGroups.includes("memory");
    const forceGpu = forceGroups.includes("gpu");
    const ensureGpu = ensureGroups.includes("gpu");
    const forceDisk = forceGroups.includes("disk");
    const ensureDisk = ensureGroups.includes("disk");
    const forceNetwork = forceGroups.includes("network");
    const ensureNetwork = ensureGroups.includes("network");
    const helperDemand = needCpu || needMemory || needGpu || needDisk || needNetwork;
    this.helperAllowed = helperDemand && this.hasActionInterest();
    if (!this.helperAllowed) {
      this.stopHelperIfIdle();
    }

    const tickStart = performance.now();
    try {
      const now = Date.now();
      const awaitables: Promise<void>[] = [];

      const cpuMemPromise = this.queueCpuMemoryPoll(now, needCpu, needMemory, forceCpuMem, ensureCpuMem);
      if (cpuMemPromise && (forceCpuMem || ensureCpuMem)) awaitables.push(cpuMemPromise);

      const gpuPromise = this.queueGpuPoll(now, needGpu, forceGpu, ensureGpu);
      if (gpuPromise && (forceGpu || ensureGpu)) awaitables.push(gpuPromise);

      const diskPerfPromise = this.queueDiskPerfPoll(now, needDisk, forceDisk, ensureDisk);
      if (diskPerfPromise && (forceDisk || ensureDisk)) awaitables.push(diskPerfPromise);

      const diskSizePromise = this.queueDiskSizePoll(now, needDisk, forceDisk, ensureDisk);
      if (diskSizePromise && (forceDisk || ensureDisk)) awaitables.push(diskSizePromise);

      const netStatsPromise = this.queueNetStatsPoll(now, needNetwork, forceNetwork, ensureNetwork);
      if (netStatsPromise && (forceNetwork || ensureNetwork)) awaitables.push(netStatsPromise);

      const netIfacesPromise = this.queueNetIfacesPoll(now, needNetwork, forceNetwork, ensureNetwork);
      if (netIfacesPromise && (forceNetwork || ensureNetwork)) awaitables.push(netIfacesPromise);

      const shouldAwait = forceGroups.length > 0 || ensureGroups.length > 0;
      if (!shouldAwait) {
        this.emit(this.snapshot);
      } else if (awaitables.length > 0) {
        await Promise.allSettled(awaitables);
        this.emit(this.snapshot);
      } else {
        this.emit(this.snapshot);
      }
    } catch {
      this.emit(this.snapshot);
    } finally {
      const tickMs = performance.now() - tickStart;
      this.recordPerf("tick", tickMs);
      this.maybeLogPerf(tickMs);
    }
  }

  private recordPerf(label: string, elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs)) return;
    const entry = this.perfStats.get(label) ?? { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
    entry.count += 1;
    entry.totalMs += elapsedMs;
    entry.lastMs = elapsedMs;
    if (elapsedMs > entry.maxMs) {
      entry.maxMs = elapsedMs;
    }
    this.perfStats.set(label, entry);
    if (label === "tick") {
      this.recentTickMs.push(elapsedMs);
      if (this.recentTickMs.length > StatsPoller.ROLLING_TICK_WINDOW) {
        this.recentTickMs.shift();
      }
    }
  }

  private maybeLogPerf(tickMs: number): void {
    const now = Date.now();
    const due = now - this.perfLastLogAt >= PERF_LOG_INTERVAL_MS;
    const slow = tickMs >= PERF_SLOW_TICK_MS;
    if (!due && !slow) return;

    const summary: Record<string, { avgMs: number; maxMs: number; lastMs: number; count: number }> = {};
    for (const [label, entry] of this.perfStats) {
      const avg = entry.count > 0 ? entry.totalMs / entry.count : 0;
      summary[label] = {
        avgMs: Math.round(avg * 10) / 10,
        maxMs: Math.round(entry.maxMs * 10) / 10,
        lastMs: Math.round(entry.lastMs * 10) / 10,
        count: entry.count
      };
    }

    const processStats = this.sampleProcessUsage(now);
    this.perfProcessSnapshot = { cpuPct: processStats.cpuPct, heapMb: processStats.heapMb };
    const perfSummary = this.getPerfSummary();
    writePerfHistoryLog({
      t: new Date(now).toISOString(),
      tickAvgMs: perfSummary.tickAvgMs,
      tickMaxMs: perfSummary.tickMaxMs,
      cpuPct: perfSummary.cpuPct,
      heapMb: perfSummary.heapMb
    });
    writePerfLog("perfSummary", {
      reason: slow ? "slowTick" : "interval",
      tickMs: Math.round(tickMs * 10) / 10,
      subscribers: this.subscribers.size,
      summary,
      process: processStats
    });
    this.perfLastLogAt = now;
  }

  private sampleProcessUsage(now: number): {
    cpuPct: number | null;
    cpuMs: number | null;
    rssMb: number;
    heapMb: number;
    extMb: number;
  } {
    const memory = process.memoryUsage();
    const toMb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
    let cpuPct: number | null = null;
    let cpuMs: number | null = null;
    if (this.perfProcessLastAt > 0 && this.perfProcessLastCpu) {
      const elapsedMs = now - this.perfProcessLastAt;
      if (elapsedMs > 0) {
        const delta = process.cpuUsage(this.perfProcessLastCpu);
        cpuMs = (delta.user + delta.system) / 1000;
        cpuPct = Math.round((cpuMs / elapsedMs) * 1000) / 10;
      }
    }
    this.perfProcessLastAt = now;
    this.perfProcessLastCpu = process.cpuUsage();
    return {
      cpuPct,
      cpuMs,
      rssMb: toMb(memory.rss),
      heapMb: toMb(memory.heapUsed),
      extMb: toMb(memory.external)
    };
  }
}

export const statsPoller = new StatsPoller();
