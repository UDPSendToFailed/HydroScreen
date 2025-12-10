<div align="center">
  <img src="https://github.com/UDPSendToFailed/HydroScreen/blob/main/static/icon.png?raw=true" alt="HydroScreen Icon" width="128" height="128">
  <h1>HydroScreen</h1>
</div>

A lightweight, open-source alternative for controlling Corsair AIO LCD screens.

I built this because I was tired of the official software using significant resources just to update a small screen. HydroScreen runs the UI as a standard user process, uses a lightweight C# bridge for hardware access, and renders everything via a web-based canvas engine.

**Note:** This project is **not** affiliated with, endorsed by, or connected to Corsair Gaming, Inc.

## Features

-   **Lightweight:** The UI is separate from the hardware worker. The renderer is capped at 30 FPS to match the screen's native refresh rate, ensuring minimal CPU usage.
-   **Hardware Support:** Supports Elite LCD, Elite LCD Upgrade Kit, and iCUE LINK/Titan LCDs (PIDs: 0x0C39, 0x0C33, 0x0C4E).
-   **Modern UI:** Built with Tauri v2, Svelte 5, and Tailwind v4.
-   **Theming Engine:**
    -   Comes with built-in themes (Hydro Gauge, Terminal Zero, Deep Liquid, etc.).
    -   **Scriptable:** You can write your own themes in JavaScript and import them without recompiling the app.
    -   Supports Images and GIFs with pan/zoom controls.
-   **Privacy:** No telemetry, no accounts, no cloud sync. It just displays your temps.

## Prerequisites

This app uses a custom fork of LibreHardwareMonitor that replaces the vulnerable `WinRing0` driver with **PawnIO**. This is required to read CPU/GPU sensors safely without triggering Anti-Cheats or Windows Kernel Protection features.

1.  Download and install **PawnIO** from [pawnio.eu](https://pawnio.eu/).
    *   *Note: If you don't install this, the app will likely show 0 values for CPU/GPU.*

## Installation

1.  Go to the **Releases** page.
2.  Download the `.exe` installer.
3.  Run it.
    *   *Note:* You might get a SmartScreen warning because I haven't paid Microsoft for a signing certificate. You'll have to click "More Info" -> "Run Anyway."
4.  On first launch, Windows will ask for **Admin permissions** for the `lhm-bridge`. This is required to access sensor data. The UI itself runs safely as a standard user.

## Development

If you want to hack on this or build it yourself:

**Requirements:**
-   Node.js (20+)
-   Rust (latest stable)
-   .NET 8.0 SDK (for the sensor bridge)
-   Microsoft C++ Build Tools (standard requirement for compiling Rust on Windows)

**Setup:**

```bash
# Install JS dependencies
npm install

# Run in dev mode 
# This automatically compiles the C# bridge and the Rust backend
npm run tauri dev
```

**Building for Release:**

```bash
npm run tauri build
```
This generates an installer in `src-tauri/target/release/bundle/nsis`.

## Custom Themes

You can extend the app by writing a `.js` file that returns a Theme object. Check `src/lib/themes/library/` for examples of how the built-in themes utilize the Canvas API.

**Basic structure:**

```javascript
return {
    id: 'my-theme',
    name: 'My Custom Theme',
    author: 'Me',
    description: 'A simple example',
    slots: [{ id: 'temp', label: 'Temperature', type: 'number' }],
    options: [{ id: 'color', label: 'Color', type: 'color', default: '#ff0000' }],
    
    renderFn: (ctx, w, h, values, formatted, config, tick) => {
        // Standard HTML5 Canvas API
        ctx.fillStyle = config.color;
        ctx.fillRect(0, 0, w, h);
        
        ctx.fillStyle = 'white';
        ctx.font = '50px Arial';
        ctx.fillText(formatted['temp'] || '0°C', 240, 240);
    }
};
```

## Credits & Acknowledgements

*   **[LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor):** The backbone of the sensor reading logic.
*   **[namazso](https://github.com/namazso/LibreHardwareMonitor/):** For the custom fork of LHM that adds PawnIO support.
*   **[PawnIO](https://pawnio.eu/):** For the signed kernel driver that makes hardware access safe.

## License & Liability

**Mozilla Public License 2.0**

This software is provided "as is", without warranty of any kind. I am not responsible if your pump stops running, your CPU overheats, or your AIO screen turns into a brick. Use at your own risk.

By using this software, you acknowledge that you are using third-party tools to interact with hardware in ways not officially supported by the manufacturer.