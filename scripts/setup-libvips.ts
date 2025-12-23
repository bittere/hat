#!/usr/bin/env bun
import AdmZip from "adm-zip";
import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "child_process";

const VIPS_VERSION = "8.16.0";
const DOWNLOAD_URL = `https://github.com/libvips/build-win64-mxe/releases/download/v${VIPS_VERSION}/vips-dev-w64-all-${VIPS_VERSION}.zip`;
const TEMP_DIR = "temp_vips";
const BINARIES_DIR = "src-tauri/binaries";

// Detect the actual Rust target triple
function getTarget(): string {
  try {
    const output = execSync("rustc -Vv", { encoding: "utf-8" });
    const match = output.match(/host: (\S+)/);
    if (match) {
      return match[1];
    }
  } catch {
    // Fallback
  }
  return "x86_64-pc-windows-gnu"; // Default fallback
}

async function setupLibvips() {
  const TARGET = getTarget();
  console.log(`🔍 Detecting Rust target: ${TARGET}`);
  console.log("🔍 Checking for existing libvips binaries...");
  
  // Check if binaries already exist
  const vipsExePath = join(BINARIES_DIR, `vips-${TARGET}.exe`);
  if (existsSync(vipsExePath)) {
    console.log("✅ libvips binaries already exist, skipping download");
    return;
  }

  console.log(`📥 Downloading libvips v${VIPS_VERSION}...`);
  
  // Create directories
  mkdirSync(BINARIES_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  // Download the zip file
  const response = await fetch(DOWNLOAD_URL);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log("📦 Extracting libvips...");
  
  // Extract using adm-zip
  const zip = new AdmZip(buffer);
  const extractedPath = join(TEMP_DIR, "extracted");
  zip.extractAllTo(extractedPath, true);

  // Find the extracted subfolder (usually named like "vips-dev-8.16")
  const subfolders = readdirSync(extractedPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  if (subfolders.length === 0) {
    throw new Error("No subfolder found in extracted archive");
  }

  const vipsDir = join(extractedPath, subfolders[0], "bin");
  
  console.log("🔧 Setting up sidecar binary...");
  
  // Copy vips.exe
  copyFileSync(join(vipsDir, "vips.exe"), vipsExePath);

  console.log("📚 Copying DLL dependencies...");
  
  // Copy all DLLs
  const files = readdirSync(vipsDir);
  const dlls = files.filter(file => file.endsWith(".dll"));
  
  for (const dll of dlls) {
    copyFileSync(
      join(vipsDir, dll),
      join(BINARIES_DIR, dll)
    );
  }

  console.log("🧹 Cleaning up...");
  rmSync(TEMP_DIR, { recursive: true, force: true });

  console.log(`✅ libvips setup complete for ${TARGET}`);
  
  // Create aliases for both GNU and MSVC targets (Windows vips binary works with both)
  const targets = ["x86_64-pc-windows-gnu", "x86_64-pc-windows-msvc"];
  for (const t of targets) {
    const targetPath = join(BINARIES_DIR, `vips-${t}.exe`);
    if (!existsSync(targetPath) && t !== TARGET) {
      console.log(`📎 Creating link for ${t}...`);
      copyFileSync(vipsExePath, targetPath);
    }
  }
}

setupLibvips().catch((error) => {
  console.error("❌ Failed to setup libvips:", error);
  process.exit(1);
});
