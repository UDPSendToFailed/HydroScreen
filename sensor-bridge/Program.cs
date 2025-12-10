using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LibreHardwareMonitor.Hardware;
using Newtonsoft.Json;
using System.Linq;

namespace SensorBridge
{
    class Program
    {
        static int APP_PORT = 14242;
        static int BRIDGE_PORT = 14243;
        static DateTime lastHeartbeat = DateTime.Now;

        static void Main(string[] args)
        {
            // --- 1. UDP Heartbeat Watchdog ---
            Task.Run(async () =>
            {
                // FIX: Bind STRICTLY to Loopback (127.0.0.1) to avoid Firewall Popup
                var localEp = new IPEndPoint(IPAddress.Loopback, BRIDGE_PORT);
                using (var client = new UdpClient(localEp))
                {
                    while (true)
                    {
                        try 
                        {
                            var result = await client.ReceiveAsync();
                            string msg = Encoding.UTF8.GetString(result.Buffer);
                            if (msg.Trim() == "ping") lastHeartbeat = DateTime.Now;
                        }
                        catch { }
                    }
                }
            });

            // Suicide timer
            Task.Run(async () =>
            {
                await Task.Delay(10000); // 10s Grace period
                while (true)
                {
                    if ((DateTime.Now - lastHeartbeat).TotalSeconds > 5)
                    {
                        Environment.Exit(0);
                    }
                    await Task.Delay(1000);
                }
            });

            var computer = new Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMotherboardEnabled = true,
                IsStorageEnabled = false,
                IsControllerEnabled = true,
                IsMemoryEnabled = true,
                IsPsuEnabled = true
            };

            try { computer.Open(); } catch { }

            // --- 2. Main Loop (UDP Sender) ---
            // FIX: Bind sender to Loopback/0 (Ephemeral) too, just to be safe
            using (var sender = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)))
            {
                var endPoint = new IPEndPoint(IPAddress.Loopback, APP_PORT);

                while (true)
                {
                    try
                    {
                        foreach (var hardware in computer.Hardware) hardware.Update();

                        var data = computer.Hardware.Select(h => new
                        {
                            Id = h.Identifier.ToString(),
                            Name = h.Name,
                            Type = h.HardwareType.ToString(),
                            Sensors = h.Sensors.Select(s => new
                            {
                                Id = s.Identifier.ToString(),
                                Name = s.Name,
                                Type = s.SensorType.ToString(),
                                Value = s.Value
                            }).ToList()
                        }).ToList();

                        string json = JsonConvert.SerializeObject(data, Formatting.None);
                        byte[] bytes = Encoding.UTF8.GetBytes(json);

                        sender.Send(bytes, bytes.Length, endPoint);
                    }
                    catch { }

                    Thread.Sleep(1000);
                }
            }
        }
    }
}