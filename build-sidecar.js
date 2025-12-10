import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRIDGE_DIR = path.join(__dirname, 'sensor-bridge');
const TARGET_DIR = path.join(__dirname, 'src-tauri', 'binaries');
const SOURCE_EXE = path.join(TARGET_DIR, 'sensor-bridge.exe');

const FINAL_EXE = path.join(TARGET_DIR, 'lhm-bridge-x86_64-pc-windows-msvc.exe');

console.log('🚀 Building C# Sidecar (Self-Contained)...');

try {
    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    const cmd = `dotnet publish -c Release -r win-x64 /p:PublishSingleFile=true --self-contained true -o "${TARGET_DIR}"`;
    execSync(cmd, { cwd: BRIDGE_DIR, stdio: 'inherit' });

    if (fs.existsSync(FINAL_EXE)) {
        fs.unlinkSync(FINAL_EXE); 
    }

    if (fs.existsSync(SOURCE_EXE)) {
        fs.renameSync(SOURCE_EXE, FINAL_EXE);
        console.log(`✅ Sidecar built and renamed to ${path.basename(FINAL_EXE)}`);
    } else {
        console.error('❌ Build failed: sensor-bridge.exe not found');
        process.exit(1);
    }

} catch (error) {
    console.error('❌ Error building sidecar:', error.message);
    process.exit(1);
}