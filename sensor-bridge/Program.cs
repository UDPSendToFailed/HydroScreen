using System;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Linq;
using System.Collections.Generic;
using System.IO;
using LibreHardwareMonitor.Hardware;
using Newtonsoft.Json;
using HidSharp;
using CorsairLink;
using CorsairLink.Devices;
using CorsairLink.Devices.CommanderCore;
using CorsairLink.Devices.HydroPlatinum;
using CorsairLink.Hid;
using CorsairLink.Synchronization;
using System.Security.Principal;
using System.Runtime.InteropServices;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace SensorBridge
{
    public sealed record BridgeConfig(bool DebugMode, bool IsService);

    class Program
    {
        internal const int APP_PORT = 14242;
        internal const int BRIDGE_PORT = 14243;
        private const uint SEM_FAILCRITICALERRORS = 0x0001;
        private const uint SEM_NOGPFAULTERRORBOX = 0x0002;

        [DllImport("kernel32.dll")]
        private static extern uint SetErrorMode(uint uMode);

        static void Main(string[] args)
        {
            // Suppress Windows HardError/WER modal popups (e.g. NVAPI 0xc0000005 during GPU driver swaps)
            SetErrorMode(SetErrorMode(0) | SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);

            Directory.SetCurrentDirectory(AppDomain.CurrentDomain.BaseDirectory);

            bool isService = args.Any(arg => arg.Equals("--service", StringComparison.OrdinalIgnoreCase));
            bool debugMode = args.Any(arg => arg.Equals("--debug", StringComparison.OrdinalIgnoreCase) || arg.Equals("-d", StringComparison.OrdinalIgnoreCase));

            if (!isService)
            {
                try { Console.OutputEncoding = Encoding.UTF8; } catch { }
            }

            var logger = new FileLogger(debugMode, isService);

            if (!IsAdministrator())
            {
                logger.Error("Startup", "NOT running as Administrator. Exiting immediately.");
                SendError("Administrator Access Required");
                if (!isService) Environment.Exit(5);
                return;
            }

            logger.Info("Startup", $"Running with Administrator privileges (ServiceMode: {isService}).");

            var config = new BridgeConfig(debugMode, isService);

            if (isService)
            {
                Host.CreateDefaultBuilder(args)
                    .UseWindowsService(options =>
                    {
                        options.ServiceName = "HydroScreenSensorBridge";
                    })
                    .ConfigureServices(services =>
                    {
                        services.AddSingleton(config);
                        services.AddSingleton<ILogger>(logger);
                        services.AddHostedService<SensorBridgeWorker>();
                    })
                    .Build()
                    .Run();
            }
            else
            {
                using var cts = new CancellationTokenSource();
                Console.CancelKeyPress += (_, e) =>
                {
                    e.Cancel = true;
                    cts.Cancel();
                };

                var worker = new SensorBridgeWorker(config, logger);
                worker.RunBridgeAsync(cts.Token).GetAwaiter().GetResult();
            }
        }

        internal static void SendError(string errorMsg)
        {
            try
            {
                using (var sender = new UdpClient())
                {
                    string json = $"{{\"error\": \"{errorMsg}\"}}";
                    byte[] bytes = Encoding.UTF8.GetBytes(json);
                    sender.Send(bytes, bytes.Length, new IPEndPoint(IPAddress.Loopback, APP_PORT));
                }
                Thread.Sleep(500);
            }
            catch { }
        }

        static bool IsAdministrator()
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                WindowsPrincipal principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }
    }

    public sealed class SensorBridgeWorker : BackgroundService
    {
        private readonly BridgeConfig _config;
        private readonly ILogger _logger;
        private readonly IDeviceGuardManager _guardManager = new CorsairDevicesGuardManager();
        private readonly List<IDevice> _corsairDevices = new();
        private readonly Dictionary<string, int> _deviceRefreshFailures = new();
        private bool _needsDeviceRescan;
        private bool _siUsbMissing;
        private long _lastRescanTicks;

        public SensorBridgeWorker(BridgeConfig config, ILogger logger)
        {
            _config = config;
            _logger = logger;
        }

        protected override Task ExecuteAsync(CancellationToken stoppingToken)
        {
            return RunBridgeAsync(stoppingToken);
        }

        public async Task RunBridgeAsync(CancellationToken stoppingToken)
        {
            long lastHeartbeatTicks = Stopwatch.GetTimestamp();
            using var wakeSignal = new SemaphoreSlim(0, 1);
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            var ct = linkedCts.Token;

            // 1. UDP Heartbeat Listener
            var heartbeatTask = Task.Run(async () =>
            {
                var localEp = new IPEndPoint(IPAddress.Loopback, Program.BRIDGE_PORT);
                using var client = new UdpClient(localEp);
                while (!ct.IsCancellationRequested)
                {
                    try
                    {
                        var result = await client.ReceiveAsync(ct);
                        string msg = Encoding.UTF8.GetString(result.Buffer);
                        if (msg.Trim() == "ping")
                        {
                            Interlocked.Exchange(ref lastHeartbeatTicks, Stopwatch.GetTimestamp());
                            if (wakeSignal.CurrentCount == 0)
                            {
                                try { wakeSignal.Release(); } catch (SemaphoreFullException) { }
                            }
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                    catch { }
                }
            }, CancellationToken.None);

            // Self-termination watchdog (standalone/console mode only)
            Task? watchdogTask = null;
            if (!_config.IsService)
            {
                watchdogTask = Task.Run(async () =>
                {
                    try
                    {
                        await Task.Delay(10000, ct);
                        while (!ct.IsCancellationRequested)
                        {
                            double elapsed = Stopwatch.GetElapsedTime(Interlocked.Read(ref lastHeartbeatTicks)).TotalSeconds;
                            if (elapsed > 5.0)
                            {
                                _logger.Info("Watchdog", "No heartbeat for >5s in standalone mode. Shutting down.");
                                linkedCts.Cancel();
                                break;
                            }
                            await Task.Delay(1000, ct);
                        }
                    }
                    catch (OperationCanceledException) { }
                }, CancellationToken.None);
            }

            Computer? computer = null;

            try
            {
                try
                {
                    computer = new Computer
                    {
                        IsCpuEnabled = true,
                        IsGpuEnabled = true,
                        IsMotherboardEnabled = true,
                        IsStorageEnabled = false,
                        IsControllerEnabled = true,
                        IsMemoryEnabled = true,
                        IsPsuEnabled = true
                    };

                    _logger.Info("Startup", "Attempting to load LibreHardwareMonitor driver...");
                    computer.Open();
                    _logger.Info("Startup", "LibreHardwareMonitor driver loaded successfully.");
                }
                catch (Exception ex)
                {
                    _logger.Error("Startup", "Failed to load LibreHardwareMonitor driver!", ex);
                    Program.SendError($"Driver Load Failed: {ex.Message}");
                    if (!_config.IsService) Environment.ExitCode = 2;
                    return;
                }

                ReconcileCorsairDevices(logDiscovery: true, ct);

                // 2. Main Loop (UDP Sender)
                using var sender = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
                var endPoint = new IPEndPoint(IPAddress.Loopback, Program.APP_PORT);
                bool wasIdle = false;

                while (!ct.IsCancellationRequested)
                {
                    if (_config.IsService)
                    {
                        double elapsed = Stopwatch.GetElapsedTime(Interlocked.Read(ref lastHeartbeatTicks)).TotalSeconds;
                        if (elapsed > 10.0)
                        {
                            if (!wasIdle)
                            {
                                _logger.Info("MainLoop", "No heartbeat for >10s; entering idle mode.");
                                wasIdle = true;
                            }

                            try
                            {
                                await wakeSignal.WaitAsync(TimeSpan.FromSeconds(5), ct);
                            }
                            catch (OperationCanceledException)
                            {
                                break;
                            }
                            continue;
                        }

                        if (wasIdle)
                        {
                            _logger.Info("MainLoop", "Heartbeat received; resuming sensor polling.");
                            wasIdle = false;
                            _needsDeviceRescan = true;
                        }
                    }

                    if (_needsDeviceRescan && Stopwatch.GetElapsedTime(_lastRescanTicks).TotalSeconds >= 10.0)
                    {
                        ReconcileCorsairDevices(logDiscovery: false, ct);
                    }

                    try
                    {
                        var hardwareList = new List<JsonHardware>();

                        if (computer != null)
                        {
                            foreach (var hardware in computer.Hardware) hardware.Update();

                            hardwareList.AddRange(computer.Hardware.Select(h => new JsonHardware
                            {
                                Id = h.Identifier.ToString(),
                                Name = h.Name,
                                Type = h.HardwareType.ToString().Replace("Cpu", "CPU").Replace("GpuNvidia", "GPU").Replace("GpuAmd", "GPU"),
                                Sensors = h.Sensors.Select(s => new JsonSensor
                                {
                                    Id = s.Identifier.ToString(),
                                    Name = s.Name,
                                    Type = s.SensorType.ToString(),
                                    Value = s.Value ?? 0
                                }).ToList()
                            }));
                        }

                        var disconnectedDevices = new List<IDevice>();
                        foreach (var device in _corsairDevices)
                        {
                            try
                            {
                                device.Refresh(ct);
                                _deviceRefreshFailures[device.UniqueId] = 0;

                                var sensors = new List<JsonSensor>();

                                _logger.Debug("MainLoop", $"{device.Name}: Found {device.TemperatureSensors.Count} temp sensors, {device.SpeedSensors.Count} speed sensors");

                                foreach (var temp in device.TemperatureSensors)
                                {
                                    if (temp.TemperatureCelsius.HasValue)
                                    {
                                        _logger.Debug("MainLoop", $"Adding Temp: {temp.Name} = {temp.TemperatureCelsius.Value}");
                                        sensors.Add(new JsonSensor
                                        {
                                            Id = $"{device.UniqueId}-temp-{temp.Channel}",
                                            Name = temp.Name,
                                            Type = "Temperature",
                                            Value = temp.TemperatureCelsius.Value
                                        });
                                    }
                                }

                                foreach (var fan in device.SpeedSensors)
                                {
                                    if (fan.Rpm.HasValue)
                                    {
                                        _logger.Debug("MainLoop", $"Adding Fan: {fan.Name} = {fan.Rpm.Value}");
                                        sensors.Add(new JsonSensor
                                        {
                                            Id = $"{device.UniqueId}-fan-{fan.Channel}",
                                            Name = fan.Name,
                                            Type = "Fan",
                                            Value = fan.Rpm.Value
                                        });
                                    }
                                    else
                                    {
                                        _logger.Debug("MainLoop", $"Skipping Fan {fan.Name} (No Value)");
                                    }
                                }

                                if (sensors.Count > 0)
                                {
                                    hardwareList.Add(new JsonHardware
                                    {
                                        Id = device.UniqueId,
                                        Name = device.Name,
                                        Type = "Cooler",
                                        Sensors = sensors
                                    });
                                }
                            }
                            catch (OperationCanceledException)
                            {
                                break;
                            }
                            catch (Exception ex)
                            {
                                _logger.Error("MainLoop", $"Error refreshing {device.Name}", ex);
                                int failures = _deviceRefreshFailures.GetValueOrDefault(device.UniqueId) + 1;
                                _deviceRefreshFailures[device.UniqueId] = failures;
                                if (failures >= 3)
                                {
                                    _logger.Warning("MainLoop", $"{device.Name} failed {failures} consecutive refreshes; disconnecting for reconnect.");
                                    disconnectedDevices.Add(device);
                                }
                            }
                        }

                        foreach (var failedDevice in disconnectedDevices)
                        {
                            try { failedDevice.Disconnect(); } catch { }
                            _corsairDevices.Remove(failedDevice);
                            _deviceRefreshFailures.Remove(failedDevice.UniqueId);
                            _needsDeviceRescan = true;
                        }

                        string json = JsonConvert.SerializeObject(hardwareList, Formatting.None);
                        byte[] bytes = Encoding.UTF8.GetBytes(json);
                        sender.Send(bytes, bytes.Length, endPoint);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error("MainLoop", "General Error", ex);
                    }

                    try
                    {
                        await Task.Delay(1000, ct);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }
            finally
            {
                linkedCts.Cancel();
                try { await Task.WhenAll(new[] { heartbeatTask, watchdogTask }.Where(t => t != null)!); } catch { }

                foreach (var device in _corsairDevices)
                {
                    try { device.Disconnect(); } catch { }
                }
                _corsairDevices.Clear();

                try { computer?.Close(); } catch { }
                _logger.Info("Shutdown", "Sensor bridge stopped cleanly.");
            }
        }

        private void ReconcileCorsairDevices(bool logDiscovery, CancellationToken ct)
        {
            _lastRescanTicks = Stopwatch.GetTimestamp();
            if (logDiscovery)
            {
                _logger.Info("Init", "Scanning for Corsair devices using dynamic discovery...");
            }

            bool allConnected = true;

            try
            {
                var supportedDevices = new List<IDevice>();

                try
                {
                    if (logDiscovery) _logger.Info("Init", "Checking HID Devices...");
                    var hidDevices = HidDeviceManager.GetSupportedDevices(_guardManager, _logger, isPassive: true);
                    supportedDevices.AddRange(hidDevices);
                }
                catch (Exception ex)
                {
                    _logger.Error("Init", "Error in HidDeviceManager", ex);
                    allConnected = false;
                }

                if (!_siUsbMissing)
                {
                    try
                    {
                        if (logDiscovery) _logger.Info("Init", "Checking SiUsbXpress Devices...");
                        var siDevices = SiUsbXpressDeviceManager.GetSupportedDevices(_guardManager, _logger, isPassive: true);
                        supportedDevices.AddRange(siDevices);
                    }
                    catch (DllNotFoundException)
                    {
                        _siUsbMissing = true;
                        _logger.Debug("Init", "SiUsbXpress driver DLL not present; skipping SiUsbXpress discovery.");
                    }
                    catch (Exception ex)
                    {
                        _logger.Error("Init", "Error in SiUsbXpressDeviceManager", ex);
                    }
                }

                var connectedIds = _corsairDevices.Select(d => d.UniqueId).ToHashSet(StringComparer.OrdinalIgnoreCase);

                foreach (var device in supportedDevices)
                {
                    if (ct.IsCancellationRequested) break;
                    if (connectedIds.Contains(device.UniqueId)) continue;

                    try
                    {
                        if (device.Connect(ct))
                        {
                            _corsairDevices.Add(device);
                            _deviceRefreshFailures[device.UniqueId] = 0;
                            connectedIds.Add(device.UniqueId);
                            _logger.Info("Init", $"Connected to {device.Name} ({device.UniqueId})");
                        }
                        else
                        {
                            allConnected = false;
                            _logger.Info("Init", $"Failed to connect to {device.Name} ({device.UniqueId}); will retry.");
                            try { device.Disconnect(); } catch { }
                        }
                    }
                    catch (Exception ex)
                    {
                        allConnected = false;
                        _logger.Error("Init", $"Error connecting to {device.Name} ({device.UniqueId}); will retry.", ex);
                        try { device.Disconnect(); } catch { }
                    }
                }
            }
            catch (Exception ex)
            {
                allConnected = false;
                _logger.Error("Init", "Fatal error during device discovery", ex);
            }

            _needsDeviceRescan = !allConnected;
        }
    }

    public class FileLogger : ILogger
    {
        private readonly bool _debugEnabled;
        private readonly string? _logPath;
        private readonly object _lock = new object();

        public bool DebugEnabled => _debugEnabled;

        public FileLogger(bool debugEnabled, bool isService = false)
        {
            _debugEnabled = debugEnabled;

            var baseFolder = isService
                ? Environment.SpecialFolder.CommonApplicationData
                : Environment.SpecialFolder.ApplicationData;
            string appData = Environment.GetFolderPath(baseFolder);
            string logFolder = Path.Combine(appData, "com.hydroscreen.app", "logs");
            
            try
            {
                if (!Directory.Exists(logFolder)) Directory.CreateDirectory(logFolder);
                _logPath = Path.Combine(logFolder, "sensor-bridge.log");

                // Rotate old log
                if (File.Exists(_logPath))
                {
                    string oldPath = _logPath + ".old";
                    if (File.Exists(oldPath)) File.Delete(oldPath);
                    File.Move(_logPath, oldPath);
                }

                Log($"--- Sensor Bridge Started (Debug: {_debugEnabled}) ---");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to initialize logger: {ex.Message}");
                _logPath = null;
            }
        }

        void Log(string msg)
        {
            if (_logPath == null) return;

            try
            {
                lock (_lock)
                {
                    // Check size and rotate if > 10MB
                    try
                    {
                        var info = new FileInfo(_logPath);
                        if (info.Exists && info.Length > 10 * 1024 * 1024)
                        {
                            string oldPath = _logPath + ".old";
                            if (File.Exists(oldPath)) File.Delete(oldPath);
                            File.Move(_logPath, oldPath);
                        }
                    }
                    catch { }

                    File.AppendAllText(_logPath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}: {msg}\n");
                }
            }
            catch { }
        }

        public void Info(string category, string message) => Log($"[INFO] {category}: {message}");
        public void Error(string category, string message) => Log($"[ERROR] {category}: {message}");
        public void Error(string category, Exception exception) => Log($"[ERROR] {category}: {exception}");
        public void Error(string category, string message, Exception exception) => Log($"[ERROR] {category}: {message} - {exception}");
        public void Warning(string category, string message) => Log($"[WARN] {category}: {message}");
        public void Warning(string category, Exception exception) => Log($"[WARN] {category}: {exception}");
        public void Warning(string category, string message, Exception exception) => Log($"[WARN] {category}: {message} - {exception}");
        
        public void Debug(string category, string message) 
        {
            if (_debugEnabled) Log($"[DEBUG] {category}: {message}");
        }

        public void Debug(string category, Exception exception) 
        {
             if (_debugEnabled) Log($"[DEBUG] {category}: {exception}");
        }

        public void Debug(string category, string message, Exception exception) 
        {
             if (_debugEnabled) Log($"[DEBUG] {category}: {message} - {exception}");
        }

        public void Flush() { }
    }

    public class JsonHardware
    {
        public required string Id { get; set; }
        public required string Name { get; set; }
        public required string Type { get; set; }
        public required List<JsonSensor> Sensors { get; set; }
    }

    public class JsonSensor
    {
        public required string Id { get; set; }
        public required string Name { get; set; }
        public required string Type { get; set; }
        public float Value { get; set; }
    }
}