using System.Diagnostics;
using System.Drawing;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SimpleStatsHelper;

public sealed record NetItem(
  string iface,
  string name,
  string id,
  long rxBytes,
  long txBytes,
  string status,
  string type
);

public sealed record DiskItem(
  string id,
  string mount,
  string fs,
  long totalBytes,
  long freeBytes,
  string label
);

public sealed record CpuPayload(double? total, List<double> cores);

public sealed record DiskPerfItem(string id, double? activePct, double? readBps, double? writeBps);

public sealed record DiskPerfPayload(DiskPerfItem? total, List<DiskPerfItem> items);

public sealed record MemoryPayload(long totalBytes, long usedBytes);

public sealed record GpuItem(
  int index,
  string name,
  double? loadPct,
  long? vramTotalBytes,
  long? vramUsedBytes,
  double? tempC,
  double? powerW,
  string? topComputeName,
  double? topComputePct,
  string? topComputeIconBase64
);

public sealed record TopProcessPayload(
  string? cpuName,
  double? cpuPct,
  string? memName,
  double? memMB,
  string? cpuIconBase64,
  string? memIconBase64
);

public sealed record NetPayload(
  long t,
  List<NetItem> items,
  List<DiskItem> disks,
  CpuPayload? cpu,
  DiskPerfPayload? diskPerf,
  MemoryPayload? mem,
  List<GpuItem>? gpus,
  TopProcessPayload? topProcess
);

internal sealed class CpuSampler
{
  private PerformanceCounter? _total;
  private readonly List<(int index, PerformanceCounter counter)> _cores = new();
  private bool _initialized;

  public CpuPayload? Sample()
  {
    if (!EnsureInitialized()) return null;
    double? total = TryNextValue(_total);
    var cores = new List<double>();
    foreach (var entry in _cores)
    {
      var value = TryNextValue(entry.counter);
      cores.Add(value ?? 0d);
    }
    return new CpuPayload(total, cores);
  }

  private bool EnsureInitialized()
  {
    if (_initialized) return _total != null;
    _initialized = true;
    try
    {
      var category = new PerformanceCounterCategory("Processor");
      var instances = category.GetInstanceNames();
      foreach (var instance in instances)
      {
        if (string.Equals(instance, "_Total", StringComparison.OrdinalIgnoreCase))
        {
          _total = new PerformanceCounter("Processor", "% Processor Time", instance, true);
          continue;
        }
        if (int.TryParse(instance, out int index))
        {
          _cores.Add((index, new PerformanceCounter("Processor", "% Processor Time", instance, true)));
        }
      }
      _cores.Sort((a, b) => a.index.CompareTo(b.index));
      return _total != null;
    }
    catch
    {
      return false;
    }
  }

  public void Warmup()
  {
    if (!EnsureInitialized()) return;
    TryNextValue(_total);
    foreach (var (_, counter) in _cores)
      TryNextValue(counter);
  }

  private static double? TryNextValue(PerformanceCounter? counter)
  {
    if (counter == null) return null;
    try
    {
      return counter.NextValue();
    }
    catch
    {
      return null;
    }
  }
}

internal sealed class DiskPerfSampler
{
  private sealed class DiskCounters
  {
    public DiskCounters(string instance, List<string> ids, PerformanceCounter active, PerformanceCounter read, PerformanceCounter write)
    {
      Instance = instance;
      Ids = ids;
      Active = active;
      Read = read;
      Write = write;
    }

    public string Instance { get; }
    public List<string> Ids { get; }
    public PerformanceCounter Active { get; }
    public PerformanceCounter Read { get; }
    public PerformanceCounter Write { get; }

    public void Dispose()
    {
      try { Active.Dispose(); } catch { }
      try { Read.Dispose(); } catch { }
      try { Write.Dispose(); } catch { }
    }
  }

  private readonly List<DiskCounters> _items = new();
  private DiskCounters? _total;
  private long _lastRescanMs;

  public DiskPerfPayload? Sample(long nowMs)
  {
    if (_items.Count == 0 || nowMs - _lastRescanMs > 60000)
    {
      Refresh(nowMs);
    }

    if (_items.Count == 0 && _total == null) return null;

    var list = new List<DiskPerfItem>();
    DiskPerfItem? totalItem = null;

    if (_total != null)
    {
      totalItem = ReadCounter(_total, "_Total");
    }

    foreach (var counter in _items)
    {
      var item = ReadCounter(counter, counter.Ids.Count > 0 ? counter.Ids[0] : counter.Instance);
      if (item == null) continue;
      if (counter.Ids.Count <= 1)
      {
        list.Add(item);
      }
      else
      {
        foreach (var id in counter.Ids)
        {
          list.Add(item with { id = id });
        }
      }
    }

    return new DiskPerfPayload(totalItem, list);
  }

  public void Warmup(long nowMs)
  {
    Refresh(nowMs);
    if (_total != null)
    {
      TryNextValue(_total.Active);
      TryNextValue(_total.Read);
      TryNextValue(_total.Write);
    }
    foreach (var item in _items)
    {
      TryNextValue(item.Active);
      TryNextValue(item.Read);
      TryNextValue(item.Write);
    }
  }

  private void Refresh(long nowMs)
  {
    foreach (var item in _items)
    {
      item.Dispose();
    }
    _items.Clear();
    _total?.Dispose();
    _total = null;

    try
    {
      var category = new PerformanceCounterCategory("PhysicalDisk");
      var instances = category.GetInstanceNames();
      foreach (var instance in instances)
      {
        if (string.Equals(instance, "_Total", StringComparison.OrdinalIgnoreCase))
        {
          _total = CreateCounters(instance, new List<string> { "_Total" });
          continue;
        }

        var ids = ExtractDriveIds(instance);
        if (ids.Count == 0)
        {
          continue;
        }
        var counters = CreateCounters(instance, ids);
        _items.Add(counters);
      }
    }
    catch
    {
      // Ignore perf counter errors.
    }

    _lastRescanMs = nowMs;
  }

  private static DiskCounters CreateCounters(string instance, List<string> ids)
  {
    var active = new PerformanceCounter("PhysicalDisk", "% Disk Time", instance, true);
    var read = new PerformanceCounter("PhysicalDisk", "Disk Read Bytes/sec", instance, true);
    var write = new PerformanceCounter("PhysicalDisk", "Disk Write Bytes/sec", instance, true);
    return new DiskCounters(instance, ids, active, read, write);
  }

  private static DiskPerfItem? ReadCounter(DiskCounters counter, string id)
  {
    double? active = TryNextValue(counter.Active);
    double? read = TryNextValue(counter.Read);
    double? write = TryNextValue(counter.Write);
    if (active == null && read == null && write == null) return null;
    return new DiskPerfItem(id, active, read, write);
  }

  private static double? TryNextValue(PerformanceCounter counter)
  {
    try
    {
      return counter.NextValue();
    }
    catch
    {
      return null;
    }
  }

  private static List<string> ExtractDriveIds(string instance)
  {
    var ids = new List<string>();
    foreach (Match match in Regex.Matches(instance, "[A-Z]:", RegexOptions.IgnoreCase))
    {
      var value = match.Value.ToUpperInvariant();
      if (!ids.Contains(value))
      {
        ids.Add(value);
      }
    }
    return ids;
  }
}

internal sealed class MemorySampler
{
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  private struct MEMORYSTATUSEX
  {
    public uint dwLength;
    public uint dwMemoryLoad;
    public ulong ullTotalPhys;
    public ulong ullAvailPhys;
    public ulong ullTotalPageFile;
    public ulong ullAvailPageFile;
    public ulong ullTotalVirtual;
    public ulong ullAvailVirtual;
    public ulong ullAvailExtendedVirtual;
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

  public MemoryPayload? Sample()
  {
    try
    {
      var status = new MEMORYSTATUSEX
      {
        dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>()
      };
      if (!GlobalMemoryStatusEx(ref status))
      {
        return null;
      }
      long total = ToLong(status.ullTotalPhys);
      long available = ToLong(status.ullAvailPhys);
      long used = Math.Max(0, total - available);
      return new MemoryPayload(total, used);
    }
    catch
    {
      return null;
    }
  }

  private static long ToLong(ulong value)
  {
    return value > long.MaxValue ? long.MaxValue : (long)value;
  }
}

internal sealed class NvidiaGpuSampler
{
  private const int NVML_SUCCESS = 0;
  private const int NVML_ERROR_INSUFFICIENT_SIZE = 7;
  private const uint NVML_TEMPERATURE_GPU = 0;

  [StructLayout(LayoutKind.Sequential)]
  private struct NvmlUtilization
  {
    public uint gpu;
    public uint memory;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct NvmlMemory
  {
    public ulong total;
    public ulong free;
    public ulong used;
  }

  [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int nvmlInit_v2();

  [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int nvmlDeviceGetCount_v2(out uint deviceCount);

  [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int nvmlDeviceGetHandleByIndex_v2(uint index, out IntPtr device);

  [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int nvmlDeviceGetName(IntPtr device, StringBuilder name, uint length);

  [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int nvmlDeviceGetUtilizationRates(IntPtr device, out NvmlUtilization utilization);

  [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int nvmlDeviceGetMemoryInfo(IntPtr device, out NvmlMemory memory);

  [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int nvmlDeviceGetTemperature(IntPtr device, uint sensorType, out uint temp);

  [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int nvmlDeviceGetPowerUsage(IntPtr device, out uint milliwatts);

  [StructLayout(LayoutKind.Sequential)]
  private struct NvmlProcessUtilizationSample
  {
    public uint pid;
    public ulong timeStamp;
    public uint smUtil;
    public uint memUtil;
    public uint encUtil;
    public uint decUtil;
  }

  [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern int nvmlDeviceGetProcessUtilization(IntPtr device, [In, Out] NvmlProcessUtilizationSample[]? utilizations, ref uint processSamplesCount, ulong lastSeenTimeStamp);

  private sealed record Device(uint Index, IntPtr Handle, string Name);

  private readonly List<Device> _devices = new();
  private bool _initialized;
  private bool _available;
  private readonly Dictionary<uint, ulong> _lastSeenTimestamp = new();
  private readonly Dictionary<uint, (string name, double pct, long tickMs, uint pid)> _lastComputeResult = new();

  private static string? GetProcessName(uint pid)
  {
    try
    {
      using var proc = Process.GetProcessById((int)pid);
      var name = proc.ProcessName;
      if (string.IsNullOrEmpty(name)) return null;
      return name.Length <= 12 ? name : name[..12];
    }
    catch
    {
      return null;
    }
  }

  private (string? name, double? pct, uint pid) TryGetTopComputeProcess(IntPtr handle, uint deviceIndex)
  {
    try
    {
      _lastSeenTimestamp.TryGetValue(deviceIndex, out ulong lastTs);

      var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

      uint sampleCount = 0;
      int rc = nvmlDeviceGetProcessUtilization(handle, null, ref sampleCount, lastTs);
      // No new samples since last poll — return cached result with 5s hold
      if (sampleCount == 0)
      {
        if (_lastComputeResult.TryGetValue(deviceIndex, out var cached))
        {
          if (now - cached.tickMs <= 5000)
            return (cached.name, cached.pct, cached.pid);
          _lastComputeResult.Remove(deviceIndex);
          return ("None", 0.0, 0);
        }
        return ("None", 0.0, 0);
      }

      var samples = new NvmlProcessUtilizationSample[sampleCount];
      rc = nvmlDeviceGetProcessUtilization(handle, samples, ref sampleCount, lastTs);
      if (rc != NVML_SUCCESS || sampleCount == 0)
      {
        if (_lastComputeResult.TryGetValue(deviceIndex, out var cached))
        {
          if (now - cached.tickMs <= 5000)
            return (cached.name, cached.pct, cached.pid);
          _lastComputeResult.Remove(deviceIndex);
          return ("None", 0.0, 0);
        }
        return ("None", 0.0, 0);
      }

      // Update last seen timestamp
      ulong maxTs = lastTs;
      uint bestPid = 0;
      uint bestSmUtil = 0;
      for (int i = 0; i < sampleCount; i++)
      {
        var s = samples[i];
        if (s.timeStamp > maxTs) maxTs = s.timeStamp;
        if (s.smUtil > bestSmUtil)
        {
          bestSmUtil = s.smUtil;
          bestPid = s.pid;
        }
      }
      _lastSeenTimestamp[deviceIndex] = maxTs;

      if (bestPid == 0 || bestSmUtil == 0)
      {
        _lastComputeResult.Remove(deviceIndex);
        return ("None", 0.0, 0);
      }

      var name = GetProcessName(bestPid);
      if (name == null) return ("None", 0.0, 0);
      _lastComputeResult[deviceIndex] = (name, (double)bestSmUtil, now, bestPid);
      return (name, (double)bestSmUtil, bestPid);
    }
    catch (EntryPointNotFoundException)
    {
      return (null, null, 0);
    }
    catch
    {
      return (null, null, 0);
    }
  }

  public List<GpuItem>? Sample()
  {
    if (!EnsureInitialized()) return null;
    var list = new List<GpuItem>();
    foreach (var device in _devices)
    {
      double? loadPct = TryGetUtilization(device.Handle);
      var (totalBytes, usedBytes) = TryGetMemory(device.Handle);
      double? tempC = TryGetTemperature(device.Handle);
      double? powerW = TryGetPower(device.Handle);
      var (topComputeName, topComputePct, topComputePid) = TryGetTopComputeProcess(device.Handle, device.Index);
      string? topComputeIcon = topComputePid > 0 ? IconHelper.GetIconBase64((int)topComputePid) : null;
      list.Add(new GpuItem(
        index: (int)device.Index,
        name: device.Name,
        loadPct: loadPct,
        vramTotalBytes: totalBytes,
        vramUsedBytes: usedBytes,
        tempC: tempC,
        powerW: powerW,
        topComputeName: topComputeName,
        topComputePct: topComputePct,
        topComputeIconBase64: topComputeIcon
      ));
    }
    return list;
  }

  private bool EnsureInitialized()
  {
    if (_initialized) return _available;
    _initialized = true;
    try
    {
      if (nvmlInit_v2() != NVML_SUCCESS) return _available = false;
      if (nvmlDeviceGetCount_v2(out uint count) != NVML_SUCCESS) return _available = false;
      if (count == 0) return _available = false;
      for (uint i = 0; i < count; i++)
      {
        if (nvmlDeviceGetHandleByIndex_v2(i, out IntPtr handle) != NVML_SUCCESS) continue;
        var name = GetName(handle, i);
        _devices.Add(new Device(i, handle, name));
      }
      _available = _devices.Count > 0;
      return _available;
    }
    catch (DllNotFoundException)
    {
      return _available = false;
    }
    catch (EntryPointNotFoundException)
    {
      return _available = false;
    }
    catch
    {
      return _available = false;
    }
  }

  private static string GetName(IntPtr handle, uint index)
  {
    var name = new StringBuilder(96);
    if (nvmlDeviceGetName(handle, name, (uint)name.Capacity) == NVML_SUCCESS)
    {
      var text = name.ToString().Trim();
      if (!string.IsNullOrEmpty(text)) return text;
    }
    return $"GPU {index + 1}";
  }

  private static double? TryGetUtilization(IntPtr handle)
  {
    if (nvmlDeviceGetUtilizationRates(handle, out var utilization) != NVML_SUCCESS) return null;
    return utilization.gpu;
  }

  private static (long? totalBytes, long? usedBytes) TryGetMemory(IntPtr handle)
  {
    if (nvmlDeviceGetMemoryInfo(handle, out var memory) != NVML_SUCCESS) return (null, null);
    return (ToLong(memory.total), ToLong(memory.used));
  }

  private static double? TryGetTemperature(IntPtr handle)
  {
    if (nvmlDeviceGetTemperature(handle, NVML_TEMPERATURE_GPU, out var temp) != NVML_SUCCESS) return null;
    return temp;
  }

  private static double? TryGetPower(IntPtr handle)
  {
    if (nvmlDeviceGetPowerUsage(handle, out var milliwatts) != NVML_SUCCESS) return null;
    return milliwatts / 1000.0;
  }

  private static long? ToLong(ulong value)
  {
    return value > long.MaxValue ? long.MaxValue : (long)value;
  }
}

internal sealed class TopProcessSampler
{
  private sealed record ProcessSnapshot(int Id, string Name, TimeSpan CpuTime, long MemBytes);

  private static readonly HashSet<string> Excluded = new(StringComparer.OrdinalIgnoreCase)
  {
    "Idle", "System"
  };

  private Dictionary<int, ProcessSnapshot>? _prev;
  private long _prevMs;
  private readonly int _logicalProcessors = Environment.ProcessorCount;

  public TopProcessPayload? Sample(long nowMs)
  {
    var snapshots = new Dictionary<int, ProcessSnapshot>();
    foreach (var proc in Process.GetProcesses())
    {
      try
      {
        if (Excluded.Contains(proc.ProcessName)) { proc.Dispose(); continue; }
        var snap = new ProcessSnapshot(proc.Id, proc.ProcessName, proc.TotalProcessorTime, proc.WorkingSet64);
        snapshots[proc.Id] = snap;
      }
      catch
      {
        // Process may have exited
      }
      finally
      {
        proc.Dispose();
      }
    }

    if (snapshots.Count == 0) { _prev = snapshots; _prevMs = nowMs; return null; }

    // Memory: can always determine top from a single snapshot
    string? topMemName = null;
    double topMemMB = -1;
    int topMemId = -1;
    foreach (var snap in snapshots.Values)
    {
      double mb = snap.MemBytes / (1024.0 * 1024.0);
      if (mb > topMemMB)
      {
        topMemMB = mb;
        topMemName = snap.Name;
        topMemId = snap.Id;
      }
    }

    // CPU: need two snapshots to compute delta
    string? topCpuName = null;
    double? topCpuPct = null;
    int topCpuId = -1;
    if (_prev != null && nowMs > _prevMs)
    {
      double elapsedMs = nowMs - _prevMs;
      double bestCpuPct = -1;
      foreach (var (id, curr) in snapshots)
      {
        if (!_prev.TryGetValue(id, out var prev)) continue;
        double cpuMs = (curr.CpuTime - prev.CpuTime).TotalMilliseconds;
        double pct = cpuMs / elapsedMs / _logicalProcessors * 100.0;
        if (pct > bestCpuPct)
        {
          bestCpuPct = pct;
          topCpuName = curr.Name;
          topCpuId = id;
        }
      }
      if (topCpuName != null)
      {
        topCpuPct = Math.Round(bestCpuPct, 1);
      }
    }

    _prev = snapshots;
    _prevMs = nowMs;

    if (topCpuName == null && topMemName == null) return null;

    string? cpuIcon = topCpuId > 0 ? IconHelper.GetIconBase64(topCpuId) : null;
    string? memIcon = topMemId > 0 ? IconHelper.GetIconBase64(topMemId) : null;

    return new TopProcessPayload(
      cpuName: Truncate(topCpuName, 12),
      cpuPct: topCpuPct,
      memName: Truncate(topMemName, 12),
      memMB: topMemMB >= 0 ? Math.Round(topMemMB, 0) : null,
      cpuIconBase64: cpuIcon,
      memIconBase64: memIcon
    );
  }

  private static string? Truncate(string? value, int maxLength)
  {
    if (value == null) return null;
    return value.Length <= maxLength ? value : value[..maxLength];
  }
}

internal static class IconHelper
{
  private static readonly Dictionary<string, string?> s_cache = new(StringComparer.OrdinalIgnoreCase);

  public static string? GetIconBase64(int pid)
  {
    try
    {
      using var proc = Process.GetProcessById(pid);
      var name = proc.ProcessName;
      if (string.IsNullOrEmpty(name)) return null;
      if (s_cache.TryGetValue(name, out var cached)) return cached;
      string? path = null;
      try { path = proc.MainModule?.FileName; } catch { }
      if (string.IsNullOrEmpty(path)) { s_cache[name] = null; return null; }
      using var icon = Icon.ExtractAssociatedIcon(path);
      if (icon == null) { s_cache[name] = null; return null; }
      using var bmp = new Bitmap(24, 24);
      using (var g = Graphics.FromImage(bmp))
      {
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        g.DrawIcon(icon, new Rectangle(0, 0, 24, 24));
      }
      using var ms = new MemoryStream();
      bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
      var b64 = Convert.ToBase64String(ms.ToArray());
      s_cache[name] = b64;
      return b64;
    }
    catch { return null; }
  }
}

internal static class Program
{
  private const int DefaultIntervalMs = 1000;
  private const int MinIntervalMs = 250;

  public static async Task<int> Main(string[] args)
  {
    int intervalMs = DefaultIntervalMs;
    for (int i = 0; i < args.Length; i++)
    {
      if (args[i].Equals("--interval", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
      {
        if (int.TryParse(args[i + 1], out int parsed))
        {
          intervalMs = Math.Max(MinIntervalMs, parsed);
        }
      }
    }

    var options = new JsonSerializerOptions { WriteIndented = false };
    using var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) =>
    {
      e.Cancel = true;
      cts.Cancel();
    };

    var cpuSampler = new CpuSampler();
    var diskSampler = new DiskPerfSampler();
    var memSampler = new MemorySampler();
    var gpuSampler = new NvidiaGpuSampler();
    var topProcessSampler = new TopProcessSampler();
    var cpuLock = new object();
    var diskLock = new object();
    var gpuLock = new object();
    var topProcessLock = new object();
    CpuPayload? cpuLatest = null;
    DiskPerfPayload? diskLatest = null;
    List<GpuItem>? gpuLatest = null;
    TopProcessPayload? topProcessLatest = null;
    bool cpuReady = false, gpuReady = false, diskReady = false, topProcessReady = false;

    _ = Task.Run(async () =>
    {
      while (!cts.IsCancellationRequested)
      {
        try
        {
          var cpu = cpuSampler.Sample();
          lock (cpuLock)
          {
            cpuLatest = cpu;
          }
          if (!cpuReady && cpu != null) { cpuReady = true; Console.Error.WriteLine("[SimpleStatsHelper] cpu sampler ready"); }
        }
        catch
        {
          // Ignore CPU sampling errors.
        }

        try
        {
          await Task.Delay(intervalMs, cts.Token);
        }
        catch (TaskCanceledException)
        {
          break;
        }
      }
    }, cts.Token);

    _ = Task.Run(async () =>
    {
      while (!cts.IsCancellationRequested)
      {
        try
        {
          var gpus = gpuSampler.Sample();
          lock (gpuLock)
          {
            gpuLatest = gpus;
          }
          if (!gpuReady && gpus != null && gpus.Count > 0) { gpuReady = true; Console.Error.WriteLine("[SimpleStatsHelper] gpu sampler ready"); }
        }
        catch
        {
          // Ignore GPU sampling errors.
        }

        try
        {
          await Task.Delay(intervalMs, cts.Token);
        }
        catch (TaskCanceledException)
        {
          break;
        }
      }
    }, cts.Token);

    _ = Task.Run(async () =>
    {
      while (!cts.IsCancellationRequested)
      {
        try
        {
          var disk = diskSampler.Sample(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
          lock (diskLock)
          {
            diskLatest = disk;
          }
          if (!diskReady && disk != null) { diskReady = true; Console.Error.WriteLine("[SimpleStatsHelper] disk sampler ready"); }
        }
        catch
        {
          // Ignore disk perf errors.
        }

        try
        {
          await Task.Delay(intervalMs, cts.Token);
        }
        catch (TaskCanceledException)
        {
          break;
        }
      }
    }, cts.Token);

    _ = Task.Run(async () =>
    {
      int topProcessIntervalMs = Math.Max(2000, intervalMs * 2);
      while (!cts.IsCancellationRequested)
      {
        try
        {
          var tp = topProcessSampler.Sample(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
          lock (topProcessLock)
          {
            topProcessLatest = tp;
          }
          if (!topProcessReady && tp != null) { topProcessReady = true; Console.Error.WriteLine("[SimpleStatsHelper] topProcess sampler ready"); }
        }
        catch
        {
          // Ignore top process sampling errors.
        }

        try
        {
          await Task.Delay(topProcessIntervalMs, cts.Token);
        }
        catch (TaskCanceledException)
        {
          break;
        }
      }
    }, cts.Token);

    var stdoutWriter = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
    Console.SetOut(stdoutWriter);
    Console.Error.WriteLine($"[SimpleStatsHelper] started interval={intervalMs}ms pid={Environment.ProcessId}");

    bool firstLoop = true;
    while (!cts.IsCancellationRequested)
    {
      long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
      var items = new List<NetItem>();
      var disks = new List<DiskItem>();

      try
      {
        foreach (var iface in NetworkInterface.GetAllNetworkInterfaces())
        {
          try
          {
            var stats = iface.GetIPStatistics();
            items.Add(new NetItem(
              iface: iface.Name ?? string.Empty,
              name: iface.Description ?? string.Empty,
              id: iface.Id ?? string.Empty,
              rxBytes: stats.BytesReceived,
              txBytes: stats.BytesSent,
              status: iface.OperationalStatus.ToString(),
              type: iface.NetworkInterfaceType.ToString()
            ));
          }
          catch
          {
            // Skip interfaces that fail to report stats.
          }
        }
      }
      catch
      {
        // Ignore enumeration errors.
      }

      if (!firstLoop)
      {
        try
        {
          foreach (var drive in DriveInfo.GetDrives())
          {
            try
            {
              if (!drive.IsReady)
              {
                continue;
              }

              var name = drive.Name ?? string.Empty;
              var mount = name.TrimEnd('\\');
              var id = mount;
              var fs = drive.DriveFormat ?? string.Empty;
              var label = drive.VolumeLabel ?? string.Empty;
              disks.Add(new DiskItem(
                id: id,
                mount: mount,
                fs: fs,
                totalBytes: drive.TotalSize,
                freeBytes: drive.AvailableFreeSpace,
                label: label
              ));
            }
            catch
            {
              // Skip drives that fail to report stats.
            }
          }
        }
        catch
        {
          // Ignore drive enumeration errors.
        }
      }

      CpuPayload? cpu;
      DiskPerfPayload? diskPerf;
      List<GpuItem>? gpus;
      TopProcessPayload? topProcess;
      lock (cpuLock)
      {
        cpu = cpuLatest;
      }
      lock (diskLock)
      {
        diskPerf = diskLatest;
      }
      lock (gpuLock)
      {
        gpus = gpuLatest;
      }
      lock (topProcessLock)
      {
        topProcess = topProcessLatest;
      }

      var mem = memSampler.Sample();

      var payload = new NetPayload(now, items, disks, cpu, diskPerf, mem, gpus, topProcess);
      Console.WriteLine(JsonSerializer.Serialize(payload, options));
      firstLoop = false;

      try
      {
        await Task.Delay(intervalMs, cts.Token);
      }
      catch (TaskCanceledException)
      {
        break;
      }
    }

    return 0;
  }
}
