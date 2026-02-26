using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;


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
  string? memIconBase64,
  string? diskName,
  double? diskBps,
  string? diskIconBase64
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

internal sealed class BoundedConcurrentCache<TKey, TValue> where TKey : notnull
{
  private sealed record CacheEntry(TValue Value, long Version);

  private readonly int _maxEntries;
  private readonly ConcurrentDictionary<TKey, CacheEntry> _items;
  private readonly ConcurrentQueue<(TKey Key, long Version)> _order = new();
  private long _nextVersion;

  public BoundedConcurrentCache(int maxEntries, IEqualityComparer<TKey>? comparer = null)
  {
    _maxEntries = Math.Max(1, maxEntries);
    _items = comparer is null
      ? new ConcurrentDictionary<TKey, CacheEntry>()
      : new ConcurrentDictionary<TKey, CacheEntry>(comparer);
  }

  public bool TryGetValue(TKey key, out TValue value)
  {
    if (_items.TryGetValue(key, out var entry))
    {
      value = entry.Value;
      return true;
    }
    value = default!;
    return false;
  }

  public void Set(TKey key, TValue value)
  {
    var version = Interlocked.Increment(ref _nextVersion);
    _items[key] = new CacheEntry(value, version);
    _order.Enqueue((key, version));
    TrimIfNeeded();
  }

  private void TrimIfNeeded()
  {
    while (_items.Count > _maxEntries && _order.TryDequeue(out var queued))
    {
      if (_items.TryGetValue(queued.Key, out var current) && current.Version == queued.Version)
      {
        _items.TryRemove(queued.Key, out _);
      }
    }
  }
}

internal sealed class CpuSampler
{
  [StructLayout(LayoutKind.Sequential)]
  private struct SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION
  {
    public long IdleTime;
    public long KernelTime;  // Includes idle
    public long UserTime;
    public long DpcTime;
    public long InterruptTime;
    public uint InterruptCount;
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetSystemTimes(out long idleTime, out long kernelTime, out long userTime);

  [DllImport("ntdll.dll")]
  private static extern int NtQuerySystemInformation(int systemInformationClass,
    [Out] SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION[] buffer, int bufferSize, out int returnLength);

  private const int SystemProcessorPerformanceInformation = 8;
  private readonly int _processorCount = Environment.ProcessorCount;

  private long _prevIdle, _prevKernel, _prevUser;
  private long[]? _prevCoreIdle, _prevCoreKernel, _prevCoreUser;
  private bool _hasBaseline;

  public CpuPayload? Sample()
  {
    try
    {
      if (!GetSystemTimes(out long idle, out long kernel, out long user))
        return null;

      var coreInfo = new SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION[_processorCount];
      int bufferSize = _processorCount * Marshal.SizeOf<SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION>();
      int status = NtQuerySystemInformation(SystemProcessorPerformanceInformation, coreInfo, bufferSize, out int returnLength);
      int actualCores = status == 0 ? returnLength / Marshal.SizeOf<SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION>() : 0;

      if (!_hasBaseline)
      {
        _hasBaseline = true;
        _prevIdle = idle; _prevKernel = kernel; _prevUser = user;
        if (actualCores > 0)
        {
          _prevCoreIdle = new long[actualCores];
          _prevCoreKernel = new long[actualCores];
          _prevCoreUser = new long[actualCores];
          for (int i = 0; i < actualCores; i++)
          {
            _prevCoreIdle[i] = coreInfo[i].IdleTime;
            _prevCoreKernel[i] = coreInfo[i].KernelTime;
            _prevCoreUser[i] = coreInfo[i].UserTime;
          }
        }
        return new CpuPayload(null, new List<double>());
      }

      // Total CPU
      double? total = ComputeCpuPct(idle - _prevIdle, kernel - _prevKernel, user - _prevUser);

      // Per-core CPU
      var cores = new List<double>();
      if (actualCores > 0 && _prevCoreIdle != null && _prevCoreKernel != null && _prevCoreUser != null)
      {
        int count = Math.Min(actualCores, _prevCoreIdle.Length);
        for (int i = 0; i < count; i++)
        {
          double? corePct = ComputeCpuPct(
            coreInfo[i].IdleTime - _prevCoreIdle[i],
            coreInfo[i].KernelTime - _prevCoreKernel[i],
            coreInfo[i].UserTime - _prevCoreUser[i]);
          cores.Add(corePct ?? 0d);
        }

        // Update per-core baselines (resize if needed)
        if (actualCores != _prevCoreIdle.Length)
        {
          _prevCoreIdle = new long[actualCores];
          _prevCoreKernel = new long[actualCores];
          _prevCoreUser = new long[actualCores];
        }
        for (int i = 0; i < actualCores; i++)
        {
          _prevCoreIdle[i] = coreInfo[i].IdleTime;
          _prevCoreKernel[i] = coreInfo[i].KernelTime;
          _prevCoreUser[i] = coreInfo[i].UserTime;
        }
      }

      _prevIdle = idle; _prevKernel = kernel; _prevUser = user;
      return new CpuPayload(total, cores);
    }
    catch
    {
      return null;
    }
  }

  private static double? ComputeCpuPct(long deltaIdle, long deltaKernel, long deltaUser)
  {
    long deltaTotal = deltaKernel + deltaUser;
    if (deltaTotal <= 0) return null;
    double pct = (deltaTotal - deltaIdle) / (double)deltaTotal * 100.0;
    return Math.Round(Math.Clamp(pct, 0, 100), 1);
  }
}

internal sealed class DiskPerfSampler
{
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct DISK_PERFORMANCE
  {
    public long BytesRead;
    public long BytesWritten;
    public long ReadTime;
    public long WriteTime;
    public long IdleTime;
    public uint ReadCount;
    public uint WriteCount;
    public uint QueueDepth;
    public uint SplitCount;
    public long QueryTime;
    public uint StorageDeviceNumber;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 8)]
    public string StorageManagerName;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct STORAGE_DEVICE_NUMBER
  {
    public uint DeviceType;
    public uint DeviceNumber;
    public int PartitionNumber;
  }

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern IntPtr CreateFileW(string lpFileName, uint dwDesiredAccess,
    uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition,
    uint dwFlagsAndAttributes, IntPtr hTemplateFile);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool DeviceIoControl(IntPtr hDevice, uint dwIoControlCode,
    IntPtr lpInBuffer, uint nInBufferSize, out DISK_PERFORMANCE lpOutBuffer,
    uint nOutBufferSize, out uint lpBytesReturned, IntPtr lpOverlapped);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool DeviceIoControl(IntPtr hDevice, uint dwIoControlCode,
    IntPtr lpInBuffer, uint nInBufferSize, out STORAGE_DEVICE_NUMBER lpOutBuffer,
    uint nOutBufferSize, out uint lpBytesReturned, IntPtr lpOverlapped);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr hObject);

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern uint GetLogicalDriveStringsW(uint nBufferLength, [Out] char[] lpBuffer);

  private const uint FILE_SHARE_READ = 0x01;
  private const uint FILE_SHARE_WRITE = 0x02;
  private const uint OPEN_EXISTING = 3;
  private const uint IOCTL_DISK_PERFORMANCE = 0x00070020;
  private const uint IOCTL_STORAGE_GET_DEVICE_NUMBER = 0x002D1080;
  private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

  // Physical drive # -> list of drive letters ("C:", "D:")
  private Dictionary<uint, List<string>> _driveMap = new();
  private List<uint> _physicalDrives = new();
  private long _lastRescanMs;

  // Previous sample state per physical drive
  private Dictionary<uint, DISK_PERFORMANCE>? _prev;
  private long _prevTickMs;
  private bool _hasBaseline;

  public DiskPerfPayload? Sample(long nowMs)
  {
    if (_physicalDrives.Count == 0 || nowMs - _lastRescanMs > 60000)
    {
      RescanDrives(nowMs);
    }

    if (_physicalDrives.Count == 0) return null;

    // Read current DISK_PERFORMANCE for each physical drive
    var current = new Dictionary<uint, DISK_PERFORMANCE>();
    foreach (var driveNum in _physicalDrives)
    {
      var perf = ReadDiskPerformance(driveNum);
      if (perf.HasValue)
        current[driveNum] = perf.Value;
    }

    if (current.Count == 0) return null;

    if (!_hasBaseline || _prev == null)
    {
      _hasBaseline = true;
      _prev = current;
      _prevTickMs = nowMs;
      return null;
    }

    double elapsedSec = (nowMs - _prevTickMs) / 1000.0;
    if (elapsedSec <= 0) elapsedSec = 1.0;

    var items = new List<DiskPerfItem>();
    long totalDeltaBytesRead = 0, totalDeltaBytesWritten = 0;
    long totalDeltaActive = 0, totalDeltaQuery = 0;

    foreach (var (driveNum, curr) in current)
    {
      if (!_prev.TryGetValue(driveNum, out var prev)) continue;

      long dBytesRead = curr.BytesRead - prev.BytesRead;
      long dBytesWritten = curr.BytesWritten - prev.BytesWritten;
      long dQuery = curr.QueryTime - prev.QueryTime;
      long dIdle = curr.IdleTime - prev.IdleTime;
      long dActive = dQuery > 0 ? dQuery - dIdle : 0;

      double? activePct = dQuery > 0
        ? Math.Round(Math.Clamp(dActive / (double)dQuery * 100.0, 0, 100), 1)
        : 0;
      double readBps = dBytesRead / elapsedSec;
      double writeBps = dBytesWritten / elapsedSec;

      totalDeltaBytesRead += dBytesRead;
      totalDeltaBytesWritten += dBytesWritten;
      totalDeltaActive += dActive;
      totalDeltaQuery += dQuery;

      // Emit one DiskPerfItem per drive letter mapped to this physical drive
      if (_driveMap.TryGetValue(driveNum, out var letters))
      {
        foreach (var letter in letters)
          items.Add(new DiskPerfItem(letter, activePct, readBps, writeBps));
      }
    }

    // _Total across all drives
    double? totalActivePct = totalDeltaQuery > 0
      ? Math.Round(Math.Clamp(totalDeltaActive / (double)totalDeltaQuery * 100.0, 0, 100), 1)
      : 0;
    var totalItem = new DiskPerfItem("_Total", totalActivePct,
      totalDeltaBytesRead / elapsedSec, totalDeltaBytesWritten / elapsedSec);

    _prev = current;
    _prevTickMs = nowMs;
    return new DiskPerfPayload(totalItem, items);
  }

  private void RescanDrives(long nowMs)
  {
    var newMap = new Dictionary<uint, List<string>>();
    var newDrives = new HashSet<uint>();

    try
    {
      // Map drive letters to physical drive numbers
      var buf = new char[1024];
      uint len = GetLogicalDriveStringsW((uint)buf.Length, buf);
      if (len > 0)
      {
        var all = new string(buf, 0, (int)len);
        foreach (var root in all.Split('\0', StringSplitOptions.RemoveEmptyEntries))
        {
          var letter = root.TrimEnd('\\');
          if (letter.Length < 2 || letter[1] != ':') continue;
          var id = letter.ToUpperInvariant();

          var handle = CreateFileW($@"\\.\{id}", 0, FILE_SHARE_READ | FILE_SHARE_WRITE,
            IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
          if (handle == INVALID_HANDLE_VALUE) continue;

          try
          {
            if (DeviceIoControl(handle, IOCTL_STORAGE_GET_DEVICE_NUMBER, IntPtr.Zero, 0,
                out STORAGE_DEVICE_NUMBER sdn, (uint)Marshal.SizeOf<STORAGE_DEVICE_NUMBER>(),
                out _, IntPtr.Zero))
            {
              newDrives.Add(sdn.DeviceNumber);
              if (!newMap.TryGetValue(sdn.DeviceNumber, out var list))
              {
                list = new List<string>();
                newMap[sdn.DeviceNumber] = list;
              }
              if (!list.Contains(id)) list.Add(id);
            }
          }
          finally { CloseHandle(handle); }
        }
      }

      // Also probe PhysicalDrive0..15 for drives without letters
      for (uint i = 0; i <= 15; i++)
      {
        var handle = CreateFileW($@"\\.\PhysicalDrive{i}", 0, FILE_SHARE_READ | FILE_SHARE_WRITE,
          IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
        if (handle == INVALID_HANDLE_VALUE) continue;
        CloseHandle(handle);
        newDrives.Add(i);
      }
    }
    catch { }

    _driveMap = newMap;
    _physicalDrives = newDrives.OrderBy(x => x).ToList();
    _lastRescanMs = nowMs;
  }

  private static DISK_PERFORMANCE? ReadDiskPerformance(uint driveNumber)
  {
    var handle = CreateFileW($@"\\.\PhysicalDrive{driveNumber}", 0,
      FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
    if (handle == INVALID_HANDLE_VALUE) return null;

    try
    {
      if (DeviceIoControl(handle, IOCTL_DISK_PERFORMANCE, IntPtr.Zero, 0,
          out DISK_PERFORMANCE perf, (uint)Marshal.SizeOf<DISK_PERFORMANCE>(),
          out _, IntPtr.Zero))
      {
        return perf;
      }
      return null;
    }
    finally { CloseHandle(handle); }
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
  private readonly Dictionary<uint, Dictionary<string, double>> _gpuComputeScores = new();

  private static string? GetProcessName(uint pid)
  {
    try
    {
      using var proc = Process.GetProcessById((int)pid);
      var name = proc.ProcessName;
      if (string.IsNullOrEmpty(name)) return null;
      var friendly = FriendlyNameHelper.GetFriendlyName((int)pid, name);
      return friendly.Length <= 30 ? friendly : friendly[..30];
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
        // No GPU activity — still apply momentum decay
        if (!_gpuComputeScores.TryGetValue(deviceIndex, out var scores0))
        {
          scores0 = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
          _gpuComputeScores[deviceIndex] = scores0;
        }
        var decayWinner = MomentumHelper.Apply(scores0, null, 0, 100.0);
        if (decayWinner != null && _lastComputeResult.TryGetValue(deviceIndex, out var prev) &&
            prev.name.Equals(decayWinner, StringComparison.OrdinalIgnoreCase))
        {
          return (prev.name, prev.pct, prev.pid);
        }
        _lastComputeResult.Remove(deviceIndex);
        return ("None", 0.0, 0);
      }

      var name = GetProcessName(bestPid);
      if (name == null) return ("None", 0.0, 0);

      // Apply momentum scoring
      if (!_gpuComputeScores.TryGetValue(deviceIndex, out var scores))
      {
        scores = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        _gpuComputeScores[deviceIndex] = scores;
      }
      var stickyName = MomentumHelper.Apply(scores, name, bestSmUtil, 100.0);

      if (stickyName != null && !stickyName.Equals(name, StringComparison.OrdinalIgnoreCase))
      {
        // Sticky winner differs from raw — use cached data if still valid
        if (_lastComputeResult.TryGetValue(deviceIndex, out var cached) &&
            cached.name.Equals(stickyName, StringComparison.OrdinalIgnoreCase))
        {
          return (cached.name, cached.pct, cached.pid);
        }
        // Sticky winner no longer valid, remove and use raw
        scores.Remove(stickyName);
      }

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

internal static class FriendlyNameHelper
{
  private const int MaxCacheEntries = 512;
  private static readonly BoundedConcurrentCache<string, string> s_cache = new(MaxCacheEntries, StringComparer.OrdinalIgnoreCase);
  private static readonly (string Name, string Friendly)[] s_seedFriendlyNames =
  {
    ("Taskmgr", "Task Manager"),
    ("regedit", "Registry Editor"),
    ("mmc", "Management Console"),
    ("devenv", "Visual Studio"),
    ("perfmon", "Performance Monitor"),
    ("resmon", "Resource Monitor"),
    ("dxdiag", "DirectX Diagnostic"),
    ("eventvwr", "Event Viewer"),
    ("compmgmt", "Computer Management"),
    ("diskmgmt", "Disk Management"),
    ("services", "Services"),
    ("msconfig", "System Configuration"),
    ("cmd", "Command Prompt"),
    ("powershell", "PowerShell"),
    ("pwsh", "PowerShell"),
    ("WindowsTerminal", "Windows Terminal"),
    ("explorer", "Explorer"),
    ("SearchHost", "Windows Search"),
    ("SecurityHealthSystray", "Windows Security"),
    ("svchost", "Service Host"),
    ("csrss", "Client Server Runtime"),
    ("dwm", "Desktop Window Mgr"),
  };

  // Well-known exe paths for icon extraction from elevated processes
  private static readonly Dictionary<string, string> s_exePaths = new(StringComparer.OrdinalIgnoreCase)
  {
    ["Taskmgr"] = @"C:\Windows\System32\Taskmgr.exe",
    ["regedit"] = @"C:\Windows\regedit.exe",
    ["mmc"] = @"C:\Windows\System32\mmc.exe",
    ["perfmon"] = @"C:\Windows\System32\perfmon.exe",
    ["resmon"] = @"C:\Windows\System32\resmon.exe",
    ["cmd"] = @"C:\Windows\System32\cmd.exe",
    ["powershell"] = @"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
    ["explorer"] = @"C:\Windows\explorer.exe",
  };

  static FriendlyNameHelper()
  {
    foreach (var (name, friendly) in s_seedFriendlyNames)
      s_cache.Set(name, friendly);
  }

  public static string GetFriendlyName(int pid, string processName)
  {
    if (s_cache.TryGetValue(processName, out var cached)) return cached;
    try
    {
      using var proc = Process.GetProcessById(pid);
      var desc = proc.MainModule?.FileVersionInfo?.FileDescription;
      if (!string.IsNullOrWhiteSpace(desc))
      {
        var friendly = desc.Trim();
        s_cache.Set(processName, friendly);
        return friendly;
      }
    }
    catch { }
    s_cache.Set(processName, processName);
    return processName;
  }

  public static string? GetKnownExePath(string processName)
  {
    s_exePaths.TryGetValue(processName, out var path);
    return path;
  }
}

internal static class MomentumHelper
{
  /// <summary>
  /// Applies value-weighted momentum scoring to stabilize "top process" display.
  /// Decay all scores by 0.8, award the raw winner proportional to its value,
  /// prune low scores, and return the highest scorer.
  /// </summary>
  public static string? Apply(Dictionary<string, double> scores, string? rawWinner, double rawValue, double maxValue)
  {
    // Decay all
    foreach (var key in scores.Keys.ToList())
      scores[key] *= 0.8;
    // Award raw winner proportional to value (0.0 to 1.0)
    if (rawWinner != null && maxValue > 0)
    {
      scores.TryGetValue(rawWinner, out double current);
      scores[rawWinner] = current + Math.Clamp(rawValue / maxValue, 0, 1);
    }
    // Prune entries with negligible score
    foreach (var key in scores.Keys.ToList())
      if (scores[key] < 0.1) scores.Remove(key);
    // Return highest scorer
    string? best = null;
    double bestScore = -1;
    foreach (var (name, score) in scores)
    {
      if (score > bestScore)
      {
        bestScore = score;
        best = name;
      }
    }
    return best;
  }
}

internal sealed class TopProcessSampler
{
  [DllImport("ntdll.dll")]
  private static extern int NtQueryInformationProcess(
    IntPtr processHandle, int processInformationClass,
    out VM_COUNTERS_EX2 processInformation, int processInformationLength, out int returnLength);

  [StructLayout(LayoutKind.Sequential)]
  private struct VM_COUNTERS_EX2
  {
    public nuint PeakVirtualSize, VirtualSize, PageFaultCount, PeakWorkingSetSize, WorkingSetSize;
    public nuint QuotaPeakPagedPoolUsage, QuotaPagedPoolUsage, QuotaPeakNonPagedPoolUsage, QuotaNonPagedPoolUsage;
    public nuint PagefileUsage, PeakPagefileUsage, PrivateUsage;
    public nuint PrivateWorkingSetSize, SharedCommitUsage;
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetProcessIoCounters(IntPtr hProcess, out IO_COUNTERS lpIoCounters);

  [StructLayout(LayoutKind.Sequential)]
  private struct IO_COUNTERS
  {
    public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
    public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
  }

  private static (ulong read, ulong write) GetIoBytes(Process proc)
  {
    try { if (GetProcessIoCounters(proc.Handle, out var c)) return (c.ReadTransferCount, c.WriteTransferCount); }
    catch { }
    return (0, 0);
  }

  private static long GetPrivateWorkingSet(Process proc)
  {
    try
    {
      int status = NtQueryInformationProcess(proc.Handle, 3, out var counters, Marshal.SizeOf<VM_COUNTERS_EX2>(), out _);
      if (status == 0) return (long)counters.PrivateWorkingSetSize;
    }
    catch { }
    return proc.PrivateMemorySize64; // fallback
  }

  private sealed record ProcessSnapshot(int Id, string Name, TimeSpan CpuTime, long MemBytes);

  private static readonly HashSet<string> Excluded = new(StringComparer.OrdinalIgnoreCase)
  {
    "Idle", "System"
  };

  private Dictionary<int, ProcessSnapshot>? _prev;
  private long _prevMs;
  private readonly int _logicalProcessors = Environment.ProcessorCount;
  private readonly Dictionary<string, double> _cpuScores = new(StringComparer.OrdinalIgnoreCase);
  private readonly Dictionary<string, double> _memScores = new(StringComparer.OrdinalIgnoreCase);
  private readonly double _totalMemMB;
  private int _lastCpuId = -1;
  private string? _lastCpuProcessName;
  private string? _lastCpuFriendlyName;
  private string? _lastCpuIconBase64;
  private int _lastMemId = -1;
  private string? _lastMemProcessName;
  private string? _lastMemFriendlyName;
  private string? _lastMemIconBase64;
  private Dictionary<int, (ulong read, ulong write)>? _prevIo;
  private int _lastDiskId = -1;
  private string? _lastDiskProcessName;
  private string? _lastDiskFriendlyName;
  private string? _lastDiskIconBase64;
  private readonly Dictionary<string, double> _diskScores = new(StringComparer.OrdinalIgnoreCase);

  public TopProcessSampler()
  {
    try
    {
      var gcInfo = GC.GetGCMemoryInfo();
      _totalMemMB = gcInfo.TotalAvailableMemoryBytes / (1024.0 * 1024.0);
    }
    catch
    {
      _totalMemMB = 16384; // 16GB fallback
    }
  }

  public TopProcessPayload? Sample(long nowMs)
  {
    var snapshots = new Dictionary<int, ProcessSnapshot>();
    var ioSnapshots = new Dictionary<int, (ulong read, ulong write)>();
    foreach (var proc in Process.GetProcesses())
    {
      try
      {
        if (Excluded.Contains(proc.ProcessName)) { proc.Dispose(); continue; }
        var snap = new ProcessSnapshot(proc.Id, proc.ProcessName, proc.TotalProcessorTime, GetPrivateWorkingSet(proc));
        snapshots[proc.Id] = snap;
        var io = GetIoBytes(proc);
        ioSnapshots[proc.Id] = io;
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

    // Memory: sum by process name, pick name with highest total
    var memSumByName = new Dictionary<string, (double totalMB, int bestId, double bestMB)>(StringComparer.OrdinalIgnoreCase);
    foreach (var snap in snapshots.Values)
    {
      double mb = snap.MemBytes / (1024.0 * 1024.0);
      if (memSumByName.TryGetValue(snap.Name, out var existing))
        memSumByName[snap.Name] = (existing.totalMB + mb, mb > existing.bestMB ? snap.Id : existing.bestId, Math.Max(mb, existing.bestMB));
      else
        memSumByName[snap.Name] = (mb, snap.Id, mb);
    }
    string? topMemName = null;
    double topMemMB = -1;
    int topMemId = -1;
    foreach (var (name, data) in memSumByName)
    {
      if (data.totalMB > topMemMB)
      {
        topMemMB = data.totalMB;
        topMemName = name;
        topMemId = data.bestId;
      }
    }

    // CPU: need two snapshots to compute delta
    // Build per-process CPU% map summed by name for momentum lookup
    string? rawCpuName = null;
    double rawCpuPct = 0;
    var cpuByName = new Dictionary<string, (double pct, int bestId, double bestPct)>(StringComparer.OrdinalIgnoreCase);
    if (_prev != null && nowMs > _prevMs)
    {
      double elapsedMs = nowMs - _prevMs;
      foreach (var (id, curr) in snapshots)
      {
        if (!_prev.TryGetValue(id, out var prev)) continue;
        double cpuMs = (curr.CpuTime - prev.CpuTime).TotalMilliseconds;
        double pct = cpuMs / elapsedMs / _logicalProcessors * 100.0;
        // Sum across PIDs with the same name (matches Task Manager)
        if (!cpuByName.TryGetValue(curr.Name, out var existing))
          cpuByName[curr.Name] = (pct, id, pct);
        else
          cpuByName[curr.Name] = (existing.pct + pct, pct > existing.bestPct ? id : existing.bestId, Math.Max(pct, existing.bestPct));
      }
      // Find name with highest summed CPU%
      foreach (var (name, data) in cpuByName)
      {
        if (data.pct > rawCpuPct)
        {
          rawCpuPct = data.pct;
          rawCpuName = name;
        }
      }
    }

    // Build per-process memory map for momentum lookup (summed by name)
    var memByName = new Dictionary<string, (double mb, int id)>(StringComparer.OrdinalIgnoreCase);
    foreach (var (name, data) in memSumByName)
      memByName[name] = (data.totalMB, data.bestId);

    // Disk I/O: compute per-process bytes/sec delta, sum by name, apply momentum
    string? rawDiskName = null;
    double rawDiskBps = 0;
    var diskByName = new Dictionary<string, (double bps, int bestId, double bestBps)>(StringComparer.OrdinalIgnoreCase);
    if (_prevIo != null && nowMs > _prevMs)
    {
      double elapsedSec = (nowMs - _prevMs) / 1000.0;
      if (elapsedSec > 0)
      {
        foreach (var (id, currIo) in ioSnapshots)
        {
          if (!_prevIo.TryGetValue(id, out var prevIo)) continue;
          if (!snapshots.TryGetValue(id, out var snap)) continue;
          ulong dRead = currIo.read >= prevIo.read ? currIo.read - prevIo.read : 0;
          ulong dWrite = currIo.write >= prevIo.write ? currIo.write - prevIo.write : 0;
          double bps = (dRead + dWrite) / elapsedSec;
          // Sum across PIDs with the same name (matches Task Manager)
          if (!diskByName.TryGetValue(snap.Name, out var existing))
            diskByName[snap.Name] = (bps, id, bps);
          else
            diskByName[snap.Name] = (existing.bps + bps, bps > existing.bestBps ? id : existing.bestId, Math.Max(bps, existing.bestBps));
        }
        // Find name with highest summed I/O
        foreach (var (name, data) in diskByName)
        {
          if (data.bps > rawDiskBps)
          {
            rawDiskBps = data.bps;
            rawDiskName = name;
          }
        }
      }
    }
    _prevIo = ioSnapshots;

    _prev = snapshots;
    _prevMs = nowMs;

    // Apply momentum scoring for CPU
    string? topCpuName = null;
    double? topCpuPct = null;
    int topCpuId = -1;
    if (rawCpuName != null)
    {
      var stickyCpu = MomentumHelper.Apply(_cpuScores, rawCpuName, rawCpuPct, 100.0);
      if (stickyCpu != null && cpuByName.TryGetValue(stickyCpu, out var stickyData))
      {
        topCpuName = stickyCpu;
        topCpuPct = Math.Round(stickyData.pct, 1);
        topCpuId = stickyData.bestId;
      }
      else
      {
        // Sticky winner exited — remove and use raw
        if (stickyCpu != null) _cpuScores.Remove(stickyCpu);
        topCpuName = rawCpuName;
        topCpuPct = Math.Round(rawCpuPct, 1);
        if (cpuByName.TryGetValue(rawCpuName, out var rawData))
          topCpuId = rawData.bestId;
      }
    }

    // Apply momentum scoring for memory
    string? topMemName2 = null;
    double topMemMB2 = -1;
    int topMemId2 = -1;
    if (topMemName != null)
    {
      var stickyMem = MomentumHelper.Apply(_memScores, topMemName, topMemMB, _totalMemMB);
      if (stickyMem != null && memByName.TryGetValue(stickyMem, out var stickyData))
      {
        topMemName2 = stickyMem;
        topMemMB2 = stickyData.mb;
        topMemId2 = stickyData.id;
      }
      else
      {
        if (stickyMem != null) _memScores.Remove(stickyMem);
        topMemName2 = topMemName;
        topMemMB2 = topMemMB;
        topMemId2 = topMemId;
      }
    }

    // Apply momentum scoring for disk I/O
    string? topDiskName = null;
    double topDiskBps = 0;
    int topDiskId = -1;
    if (rawDiskName != null)
    {
      var stickyDisk = MomentumHelper.Apply(_diskScores, rawDiskName, rawDiskBps, 500_000_000.0);
      if (stickyDisk != null && diskByName.TryGetValue(stickyDisk, out var stickyData))
      {
        topDiskName = stickyDisk;
        topDiskBps = stickyData.bps;
        topDiskId = stickyData.bestId;
      }
      else
      {
        if (stickyDisk != null) _diskScores.Remove(stickyDisk);
        topDiskName = rawDiskName;
        topDiskBps = rawDiskBps;
        if (diskByName.TryGetValue(rawDiskName, out var rawData))
          topDiskId = rawData.bestId;
      }
    }

    if (topCpuName == null && topMemName2 == null && topDiskName == null) return null;

    bool cpuWinnerChanged =
      topCpuId != _lastCpuId ||
      !string.Equals(topCpuName, _lastCpuProcessName, StringComparison.OrdinalIgnoreCase);
    if (topCpuName == null)
    {
      _lastCpuId = -1;
      _lastCpuProcessName = null;
      _lastCpuFriendlyName = null;
      _lastCpuIconBase64 = null;
    }
    else if (topCpuId > 0)
    {
      if (cpuWinnerChanged || _lastCpuFriendlyName == null)
      {
        _lastCpuFriendlyName = Truncate(FriendlyNameHelper.GetFriendlyName(topCpuId, topCpuName), 30);
      }
      if (cpuWinnerChanged || _lastCpuIconBase64 == null)
      {
        _lastCpuIconBase64 = IconHelper.GetIconBase64(topCpuId);
      }
      _lastCpuId = topCpuId;
      _lastCpuProcessName = topCpuName;
    }
    else
    {
      _lastCpuId = topCpuId;
      _lastCpuProcessName = topCpuName;
      _lastCpuFriendlyName = Truncate(topCpuName, 30);
      _lastCpuIconBase64 = null;
    }

    bool memWinnerChanged =
      topMemId2 != _lastMemId ||
      !string.Equals(topMemName2, _lastMemProcessName, StringComparison.OrdinalIgnoreCase);
    if (topMemName2 == null)
    {
      _lastMemId = -1;
      _lastMemProcessName = null;
      _lastMemFriendlyName = null;
      _lastMemIconBase64 = null;
    }
    else if (topMemId2 > 0)
    {
      if (memWinnerChanged || _lastMemFriendlyName == null)
      {
        _lastMemFriendlyName = Truncate(FriendlyNameHelper.GetFriendlyName(topMemId2, topMemName2), 30);
      }
      if (memWinnerChanged || _lastMemIconBase64 == null)
      {
        _lastMemIconBase64 = IconHelper.GetIconBase64(topMemId2);
      }
      _lastMemId = topMemId2;
      _lastMemProcessName = topMemName2;
    }
    else
    {
      _lastMemId = topMemId2;
      _lastMemProcessName = topMemName2;
      _lastMemFriendlyName = Truncate(topMemName2, 30);
      _lastMemIconBase64 = null;
    }

    bool diskWinnerChanged =
      topDiskId != _lastDiskId ||
      !string.Equals(topDiskName, _lastDiskProcessName, StringComparison.OrdinalIgnoreCase);
    if (topDiskName == null)
    {
      _lastDiskId = -1;
      _lastDiskProcessName = null;
      _lastDiskFriendlyName = null;
      _lastDiskIconBase64 = null;
    }
    else if (topDiskId > 0)
    {
      if (diskWinnerChanged || _lastDiskFriendlyName == null)
      {
        _lastDiskFriendlyName = Truncate(FriendlyNameHelper.GetFriendlyName(topDiskId, topDiskName), 30);
      }
      if (diskWinnerChanged || _lastDiskIconBase64 == null)
      {
        _lastDiskIconBase64 = IconHelper.GetIconBase64(topDiskId);
      }
      _lastDiskId = topDiskId;
      _lastDiskProcessName = topDiskName;
    }
    else
    {
      _lastDiskId = topDiskId;
      _lastDiskProcessName = topDiskName;
      _lastDiskFriendlyName = Truncate(topDiskName, 30);
      _lastDiskIconBase64 = null;
    }

    string? cpuFriendly = topCpuName == null ? null : _lastCpuFriendlyName ?? Truncate(topCpuName, 30);
    string? memFriendly = topMemName2 == null ? null : _lastMemFriendlyName ?? Truncate(topMemName2, 30);
    string? diskFriendly = topDiskName == null ? null : _lastDiskFriendlyName ?? Truncate(topDiskName, 30);
    string? cpuIcon = topCpuName == null ? null : _lastCpuIconBase64;
    string? memIcon = topMemName2 == null ? null : _lastMemIconBase64;
    string? diskIcon = topDiskName == null ? null : _lastDiskIconBase64;

    return new TopProcessPayload(
      cpuName: cpuFriendly,
      cpuPct: topCpuPct,
      memName: memFriendly,
      memMB: topMemMB2 >= 0 ? Math.Round(topMemMB2, 0) : null,
      cpuIconBase64: cpuIcon,
      memIconBase64: memIcon,
      diskName: diskFriendly,
      diskBps: topDiskBps > 0 ? Math.Round(topDiskBps, 0) : null,
      diskIconBase64: diskIcon
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
  private const int MaxCacheEntries = 512;
  private static readonly BoundedConcurrentCache<string, string?> s_cache = new(MaxCacheEntries, StringComparer.OrdinalIgnoreCase);

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern bool QueryFullProcessImageName(IntPtr hProcess, int flags, StringBuilder buf, ref int size);

  private static string? GetProcessImagePath(Process proc)
  {
    try { var p = proc.MainModule?.FileName; if (!string.IsNullOrEmpty(p)) return p; } catch { }
    try
    {
      var buf = new StringBuilder(1024);
      int size = buf.Capacity;
      if (QueryFullProcessImageName(proc.Handle, 0, buf, ref size))
        return buf.ToString();
    }
    catch { }
    return null;
  }

  public static string? GetIconBase64(int pid)
  {
    try
    {
      using var proc = Process.GetProcessById(pid);
      var name = proc.ProcessName;
      if (string.IsNullOrEmpty(name)) return null;
      if (s_cache.TryGetValue(name, out var cached)) return cached;
      string? path = GetProcessImagePath(proc);
      if (string.IsNullOrEmpty(path))
        path = FriendlyNameHelper.GetKnownExePath(name);
      if (string.IsNullOrEmpty(path)) { s_cache.Set(name, null); return null; }
      using var icon = Icon.ExtractAssociatedIcon(path);
      if (icon == null) { s_cache.Set(name, null); return null; }
      using var bmp = new Bitmap(48, 48);
      using (var g = Graphics.FromImage(bmp))
      {
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        using var largeIcon = new Icon(icon, 48, 48);
        g.DrawIcon(largeIcon, new Rectangle(0, 0, 48, 48));
      }
      using var ms = new MemoryStream();
      bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
      var b64 = Convert.ToBase64String(ms.ToArray());
      s_cache.Set(name, b64);
      return b64;
    }
    catch { return null; }
  }
}

internal static class Program
{
  private const int DefaultIntervalMs = 1000;
  private const int MinIntervalMs = 250;
  private const int DiskCacheRefreshMs = 10 * 60 * 1000;

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

    int forceDiskRefreshFlag = 1;
    var disksCache = new List<DiskItem>();
    long disksCacheAt = 0;

    _ = Task.Run(async () =>
    {
      while (!cts.IsCancellationRequested)
      {
        string? line;
        try
        {
          line = await Console.In.ReadLineAsync();
        }
        catch
        {
          break;
        }

        if (line == null)
        {
          break;
        }

        var command = line.Trim();
        if (command.Equals("rescan_disks", StringComparison.OrdinalIgnoreCase))
        {
          Interlocked.Exchange(ref forceDiskRefreshFlag, 1);
          Console.Error.WriteLine("[SimpleStatsHelper] command rescan_disks");
        }
      }
    }, cts.Token);

    var stdoutWriter = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
    Console.SetOut(stdoutWriter);
    Console.Error.WriteLine($"[SimpleStatsHelper] started interval={intervalMs}ms pid={Environment.ProcessId}");

    while (!cts.IsCancellationRequested)
    {
      long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
      var items = new List<NetItem>();
      var disks = disksCache;

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

      bool forceDiskRefresh = Interlocked.Exchange(ref forceDiskRefreshFlag, 0) == 1;
      bool diskCacheStale = disksCacheAt <= 0 || now - disksCacheAt >= DiskCacheRefreshMs;
      if (forceDiskRefresh || diskCacheStale)
      {
        disksCache = ReadDiskItems();
        disksCacheAt = now;
        disks = disksCache;
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

      try
      {
        var payload = new NetPayload(now, items, disks, cpu, diskPerf, mem, gpus, topProcess);
        Console.WriteLine(JsonSerializer.Serialize(payload, options));
      }
      catch (Exception ex)
      {
        var message = ex.Message ?? string.Empty;
        if (message.Length > 300)
        {
          message = message[..300];
        }
        Console.Error.WriteLine($"[SimpleStatsHelper] serialize error type={ex.GetType().Name} message={message}");
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

    return 0;
  }

  private static List<DiskItem> ReadDiskItems()
  {
    var disks = new List<DiskItem>();
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
    return disks;
  }
}
