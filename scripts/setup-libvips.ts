#!/usr/bin/env bun
import { existsSync, mkdirSync, rmSync, readdirSync, writeFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path"; // Added dirname import
import * as tar from "tar";

const BINARIES_DIR = "src-tauri/binaries";
const HEADERS_DIR = "src-tauri/include";
const TEMP_DIR = "temp_libvips";

// Only supported distribution targets
const PLATFORM_MAP: Record<string, { target: string; package: string }> = {
  "win32-x64": { target: "x86_64-pc-windows-gnu", package: "@img/sharp-libvips-win32-x64" },
  "linux-x64": { target: "x86_64-unknown-linux-gnu", package: "@img/sharp-libvips-linux-x64" },
  "darwin-x64": { target: "x86_64-apple-darwin", package: "@img/sharp-libvips-darwin-x64" },
  "darwin-arm64": { target: "aarch64-apple-darwin", package: "@img/sharp-libvips-darwin-arm64" },
};

function getCurrentPlatform(): { target: string; package: string } {
  const platform = process.platform;
  const arch = process.arch;
  const key = `${platform}-${arch}`;
  
  const config = PLATFORM_MAP[key];
  if (!config) {
    throw new Error(`Unsupported platform: ${key}`);
  }
  return config;
}

async function downloadTarball(packageName: string, version: string = "latest"): Promise<Buffer> {
  const url = `https://registry.npmjs.org/${packageName}`;
  
  console.log(`📥 Fetching package info for ${packageName}...`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${packageName}: ${resp.statusText}`);
  
  const data = await resp.json();
  const versionData = version === "latest" ? data["dist-tags"].latest : version;
  const tarballUrl = data.versions[versionData].dist.tarball;
  
  console.log(`📦 Downloading from ${tarballUrl}...`);
  const tarResp = await fetch(tarballUrl);
  if (!tarResp.ok) throw new Error(`Failed to download tarball: ${tarResp.statusText}`);
  
  return Buffer.from(await tarResp.arrayBuffer());
}

async function downloadLibvipsHeaders(version: string = "8.17.3"): Promise<Buffer> {
  // Try multiple URLs as github might have different formats
  const urls = [
    `https://github.com/libvips/libvips/releases/download/v${version}/libvips-${version}.tar.gz`,
    `https://github.com/libvips/libvips/archive/refs/tags/v${version}.tar.gz`,
  ];
  
  for (const url of urls) {
    console.log(`📥 Trying ${url}...`);
    const resp = await fetch(url);
    if (resp.ok) {
      console.log(`✓ Found libvips headers`);
      return Buffer.from(await resp.arrayBuffer());
    }
  }
  
  throw new Error(`Failed to download libvips headers from all URLs`);
}

async function extractLibvips() {
  const { target, package: packageName } = getCurrentPlatform();
  
  console.log(`🔍 Current platform: ${process.platform}-${process.arch}`);
  console.log(`📦 Target: ${target}`);
  console.log(`📦 Package: ${packageName}`);
  
  // Check if binaries already exist
  const targetLibDir = join(BINARIES_DIR, target);
  if (existsSync(targetLibDir)) {
    const files = readdirSync(targetLibDir);
    const hasLibs = files.some((f) => /\.(so|dylib|dll|lib)$/.test(f));
    if (hasLibs) {
      console.log(`✅ libvips binaries already exist for ${target}, skipping download`);
      return;
    }
  }

  // Check if headers already exist
  if (existsSync(HEADERS_DIR)) {
    const files = readdirSync(HEADERS_DIR);
    const hasHeaders = files.some((f) => f.endsWith(".h"));
    if (hasHeaders) {
      console.log(`✅ libvips headers already exist, skipping download`);
      return;
    }
  }
  
  mkdirSync(BINARIES_DIR, { recursive: true });
  mkdirSync(HEADERS_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  const extractDir = join(TEMP_DIR, packageName.replace("/", "-"));
  
  try {
    const tarballBuffer = await downloadTarball(packageName);
    const tarPath = join(TEMP_DIR, `${packageName.replace("/", "-")}.tar.gz`);
    
    writeFileSync(tarPath, tarballBuffer);
    
    mkdirSync(extractDir, { recursive: true });
    
    console.log(`📂 Extracting...`);
    await tar.extract({
      file: tarPath,
      cwd: extractDir,
    });
    
    // Find lib files - could be in multiple places
    let libPath = join(extractDir, "package", "lib");
    if (!existsSync(libPath)) {
      libPath = join(extractDir, "lib");
    }
    if (!existsSync(libPath)) {
      // Try to find lib in subdirs
      const extractedContents = readdirSync(extractDir);
      const subdir = extractedContents.find(d => {
        const p = join(extractDir, d, "lib");
        return existsSync(p);
      });
      if (subdir) {
        libPath = join(extractDir, subdir, "lib");
      }
    }
    
    if (existsSync(libPath)) {
      const files = readdirSync(libPath, { recursive: true }) as (string | any)[];
      
      const libFiles = files.filter(f => {
        const name = typeof f === "string" ? f : (f.name as string || "");
        return /\.(so|dylib|dll|lib)(\.\d+)?$/i.test(name);
      });
      
      console.log(`📚 Found ${libFiles.length} library files`);
      
      // Create target-specific directory
      const targetLibDir = join(BINARIES_DIR, target);
      mkdirSync(targetLibDir, { recursive: true });
      
      // Copy library files
      for (const libFile of libFiles) {
        const filename = typeof libFile === "string" ? libFile : (libFile.name as string);
        const src = join(libPath, filename);
        const basename = filename.split("/").pop() || filename.split("\\").pop() || filename;
        const dst = join(targetLibDir, basename);
        
        // FIX: Use dirname() instead of string manipulation
        const dstDir = dirname(dst);
        mkdirSync(dstDir, { recursive: true });
        
        cpSync(src, dst);
        console.log(`  ✓ Copied ${filename}`);
      }
    } else {
      throw new Error(`lib directory not found at ${libPath}`);
    }
    
    // Also copy include files for vips-sys
    let includePath = join(extractDir, "package", "include");
    if (!existsSync(includePath)) {
      includePath = join(extractDir, "include");
    }
    
    if (existsSync(includePath)) {
      const includeFiles = readdirSync(includePath, { recursive: true }) as (string | any)[];
      console.log(`📄 Copying header files from package...`);
      
      for (const file of includeFiles) {
        const filename = typeof file === "string" ? file : (file.name as string);
        if (filename.endsWith(".h")) {
          const src = join(includePath, filename);
          const dst = join(HEADERS_DIR, filename);
          
          // FIX: Use dirname() instead of string manipulation
          const dstDir = dirname(dst);
          mkdirSync(dstDir, { recursive: true });
          
          cpSync(src, dst);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Failed to download libvips:`, error);
    throw error;
  }


  // Download and extract headers from main libvips release
  try {
    console.log("\n📥 Downloading libvips headers...");
    const headersTarball = await downloadLibvipsHeaders();
    const headersTarPath = join(TEMP_DIR, "libvips-headers.tar.gz");
    writeFileSync(headersTarPath, headersTarball);
    
    const headersExtractDir = join(TEMP_DIR, "libvips-headers");
    mkdirSync(headersExtractDir, { recursive: true });
    
    console.log(`📂 Extracting headers...`);
    await tar.extract({
      file: headersTarPath,
      cwd: headersExtractDir,
    });
    
    // Find vips.h and copy headers
    const possiblePaths = [
      join(headersExtractDir, "libvips-8.17.3", "libvips"),
      join(headersExtractDir, "libvips-8.17.3", "include"),
      join(headersExtractDir, "libvips", "include"),
    ];
    
    let foundHeaderPath: string | null = null;
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        foundHeaderPath = p;
        break;
      }
    }
    
    if (foundHeaderPath) {
      const headerFiles = readdirSync(foundHeaderPath, { recursive: true }) as (string | any)[];
      console.log(`📄 Copying ${headerFiles.length} header files...`);
      
      for (const file of headerFiles) {
        const filename = typeof file === "string" ? file : (file.name as string);
        if (filename.endsWith(".h")) {
          const src = join(foundHeaderPath, filename);
          const dst = join(HEADERS_DIR, filename);
          
          // FIX: Use dirname() instead of string manipulation
          // This was the specific location failing in your second error log
          const dstDir = dirname(dst);
          mkdirSync(dstDir, { recursive: true });
          
          cpSync(src, dst);
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️  Could not download headers:`, err);
  }

  console.log(`\n🧹 Cleaning up...`);
  rmSync(TEMP_DIR, { recursive: true, force: true });
  
  console.log("\n✅ libvips setup complete!");
  console.log(`📍 Libraries: ${BINARIES_DIR}/${target}`);
  console.log(`📍 Headers: ${HEADERS_DIR}`);
}

extractLibvips().catch((error) => {
  console.error("❌ Failed to download libvips:", error);
  process.exit(1);
});
