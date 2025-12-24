#!/usr/bin/env bun
/**
 * Development setup script for libvips dev environment.
 * 
 * Handles platform-specific setup:
 * - Windows: Copies DLLs to target/debug directories
 * - macOS: Sets DYLD_LIBRARY_PATH via .env.local
 * - Linux: Sets LD_LIBRARY_PATH via .env.local
 */
import { existsSync, readdirSync, cpSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BINARIES_DIR = "src-tauri/binaries";
const ENV_LOCAL_FILE = "src-tauri/.env.local";

// Map Node.js platform/arch to Rust target directory
function getRustTarget(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "win32" && arch === "x64") {
    return "x86_64-pc-windows-gnu";
  } else if (platform === "win32" && arch === "ia32") {
    return "i686-pc-windows-gnu";
  } else if (platform === "linux" && arch === "x64") {
    return "x86_64-unknown-linux-gnu";
  } else if (platform === "linux" && arch === "arm64") {
    return "aarch64-unknown-linux-gnu";
  } else if (platform === "darwin" && arch === "x64") {
    return "x86_64-apple-darwin";
  } else if (platform === "darwin" && arch === "arm64") {
    return "aarch64-apple-darwin";
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

async function setupDevEnvironment() {
  const rustTarget = getRustTarget();
  const libDir = join(BINARIES_DIR, rustTarget);

  if (!existsSync(libDir)) {
    console.warn(`⚠️  Library directory not found: ${libDir}`);
    return;
  }

  console.log(`📍 Rust target: ${rustTarget}`);
  console.log(`📍 Library directory: ${libDir}`);

  // Windows: Copy DLLs to target/debug
  if (process.platform === "win32") {
    const targetDirs = ["target/debug", "src-tauri/target/debug"];
    const files = readdirSync(libDir);
    const dlls = files.filter((f) => f.endsWith(".dll"));

    if (dlls.length === 0) {
      console.warn(`⚠️  No DLL files found in ${libDir}`);
      return;
    }

    let copiedAny = false;
    for (const targetDir of targetDirs) {
      mkdirSync(targetDir, { recursive: true });

      const needsCopy = dlls.filter((dll) => !existsSync(join(targetDir, dll)));

      if (needsCopy.length === 0) {
        console.log(`✅ All DLLs already exist in ${targetDir}`);
      } else {
        console.log(`📚 Copying ${needsCopy.length} DLL(s) to ${targetDir}...`);
        for (const dll of needsCopy) {
          const src = join(libDir, dll);
          const dst = join(targetDir, dll);
          try {
            cpSync(src, dst);
            console.log(`  ✓ ${dll}`);
            copiedAny = true;
          } catch (err) {
            console.warn(`  ⚠️  Failed to copy ${dll}:`, err);
          }
        }
      }
    }
    if (copiedAny) {
      console.log("✅ DLL setup complete");
    }
  }

  // macOS: Create/update .env.local with DYLD_LIBRARY_PATH
  if (process.platform === "darwin") {
    const absoluteLibDir = join(process.cwd(), libDir);
    const envVar = `DYLD_LIBRARY_PATH=${absoluteLibDir}:$DYLD_LIBRARY_PATH`;

    try {
      let envContent = "";
      if (existsSync(ENV_LOCAL_FILE)) {
        envContent = readFileSync(ENV_LOCAL_FILE, "utf-8");
        // Remove existing DYLD_LIBRARY_PATH if present
        envContent = envContent
          .split("\n")
          .filter((line) => !line.startsWith("DYLD_LIBRARY_PATH"))
          .join("\n")
          .trim();
      }

      const newContent = envContent ? `${envContent}\n${envVar}` : envVar;
      writeFileSync(ENV_LOCAL_FILE, newContent + "\n");
      console.log(`✅ Created ${ENV_LOCAL_FILE} with DYLD_LIBRARY_PATH`);
    } catch (err) {
      console.warn(`⚠️  Failed to create ${ENV_LOCAL_FILE}:`, err);
    }
  }

  // Linux: Create/update .env.local with LD_LIBRARY_PATH
  if (process.platform === "linux") {
    const absoluteLibDir = join(process.cwd(), libDir);
    const envVar = `LD_LIBRARY_PATH=${absoluteLibDir}:$LD_LIBRARY_PATH`;

    try {
      let envContent = "";
      if (existsSync(ENV_LOCAL_FILE)) {
        envContent = readFileSync(ENV_LOCAL_FILE, "utf-8");
        // Remove existing LD_LIBRARY_PATH if present
        envContent = envContent
          .split("\n")
          .filter((line) => !line.startsWith("LD_LIBRARY_PATH"))
          .join("\n")
          .trim();
      }

      const newContent = envContent ? `${envContent}\n${envVar}` : envVar;
      writeFileSync(ENV_LOCAL_FILE, newContent + "\n");
      console.log(`✅ Created ${ENV_LOCAL_FILE} with LD_LIBRARY_PATH`);
    } catch (err) {
      console.warn(`⚠️  Failed to create ${ENV_LOCAL_FILE}:`, err);
    }
  }

  console.log("✅ Dev environment setup complete");
}

setupDevEnvironment().catch((error) => {
  console.error("❌ Failed to setup dev environment:", error);
  process.exit(1);
});
