import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRIDGE_DIR = path.join(__dirname, 'sensor-bridge');
const TARGET_DIR = path.join(__dirname, 'src-tauri', 'binaries');
const SOURCE_EXE = path.join(TARGET_DIR, 'sensor-bridge.exe');
const FINAL_EXE = path.join(TARGET_DIR, 'lhm-bridge.exe');

console.log('🚀 Building C# Sidecar (Self-Contained)...');

try {
    // 1. Ensure target directory exists
    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    // 2. Run Dotnet Publish
    // Note: --self-contained true fixes the DLL dependency issues
    const cmd = `dotnet publish -c Release -r win-x64 /p:PublishSingleFile=true --self-contained true -o "${TARGET_DIR}"`;
    execSync(cmd, { cwd: BRIDGE_DIR, stdio: 'inherit' });

    // 3. Rename sensor-bridge.exe to lhm-bridge.exe
    if (fs.existsSync(FINAL_EXE)) {
        fs.unlinkSync(FINAL_EXE); // Delete old one to prevent lock errors
    }

    if (fs.existsSync(SOURCE_EXE)) {
        fs.renameSync(SOURCE_EXE, FINAL_EXE);
        console.log('✅ Sidecar built and renamed to lhm-bridge.exe');
    } else {
        console.error('❌ Build failed: sensor-bridge.exe not found');
        process.exit(1);
    }

} catch (error) {
    console.error('❌ Error building sidecar:', error.message);
    process.exit(1);
}