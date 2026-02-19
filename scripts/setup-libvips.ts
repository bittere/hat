import { $ } from "bun";
import { cpSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

const REPO = "lovell/sharp-libvips";
const ASSET_NAME = "npm-workspace.tar.xz";
const ROOT = join(import.meta.dirname!, "..");
const VENDOR_DIR = join(ROOT, "vendor", "libvips");
const STAGE_DIR = join(ROOT, "src-tauri", "libvips");

function getTargetDouble(): string {
  // Allow override via environment variable (e.g., "darwin-x64", "linux-x64")
  if (process.env.LIBVIPS_TARGET) {
    return process.env.LIBVIPS_TARGET;
  }

  const platformMap: Record<string, string> = {
    win32: "win32",
    darwin: "darwin",
    linux: "linux",
  };
  const archMap: Record<string, string> = {
    x64: "x64",
    arm64: "arm64",
    arm: "arm",
    ia32: "ia32",
    ppc64: "ppc64",
    s390x: "s390x",
    riscv64: "riscv64",
  };
  const platform = platformMap[process.platform];
  const arch = archMap[process.arch];
  if (!platform || !arch) {
    throw new Error(`Unsupported platform/arch: ${process.platform}/${process.arch}`);
  }
  return `${platform}-${arch}`;
}

async function getLatestDownloadUrl(): Promise<{ url: string; tag: string }> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    { headers },
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const release = (await res.json()) as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
  const asset = release.assets.find((a) => a.name === ASSET_NAME);
  if (!asset) throw new Error(`Asset "${ASSET_NAME}" not found in release ${release.tag_name}`);
  return { url: asset.browser_download_url, tag: release.tag_name };
}

async function downloadWithProgress(url: string, outputPath: string): Promise<void> {
  console.log(`Fetching ${url}...`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  
  const contentLength = res.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  if (!res.body) throw new Error("Response body is null");
  
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    chunks.push(value);
    received += value.length;
    
    if (total > 0) {
      const percent = ((received / total) * 100).toFixed(1);
      const mb = (received / 1024 / 1024).toFixed(1);
      const totalMb = (total / 1024 / 1024).toFixed(1);
      console.log(`Downloaded: ${mb}MB / ${totalMb}MB (${percent}%)`);
    }
  }
  
  console.log(`Download complete, writing to disk...`);
  const blob = new Blob(chunks);
  await Bun.write(outputPath, blob);
  console.log(`Written to ${outputPath}`);
}

async function main() {
  const target = getTargetDouble();
  console.log(`Platform: ${process.platform}, Arch: ${process.arch}`);
  console.log(`Target: ${target}`);
  
  const sourceLib = join(VENDOR_DIR, target, "lib");

  // Download and extract if not already present
  if (!existsSync(sourceLib)) {
    const { url, tag } = await getLatestDownloadUrl();
    console.log(`Latest release: ${tag}`);

    mkdirSync(VENDOR_DIR, { recursive: true });
    const archivePath = join(VENDOR_DIR, ASSET_NAME);

    console.log(`Downloading ${url}...`);
    await downloadWithProgress(url, archivePath);

    console.log(`Extracting to ${VENDOR_DIR}...`);
    console.log(`Archive path: ${archivePath}`);
    console.log(`Archive exists: ${existsSync(archivePath)}`);
    
    try {
      // Use spawn-style execution for better control
      const proc = Bun.spawn(["tar", "-xJf", archivePath, "-C", VENDOR_DIR], {
        stdout: "inherit",
        stderr: "inherit",
      });
      
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error(`tar command failed with exit code ${exitCode}`);
      }
      console.log(`Extraction completed successfully`);
    } catch (error) {
      console.error(`Tar extraction failed:`, error);
      // Clean up the archive on failure
      if (existsSync(archivePath)) {
        console.log(`Cleaning up failed download...`);
        unlinkSync(archivePath);
      }
      throw error;
    }

    unlinkSync(archivePath);
    console.log(`libvips ${tag} downloaded and extracted.`);
    
    // Verify the extraction was successful
    if (!existsSync(sourceLib)) {
      console.error(`Expected directory ${sourceLib} not found after extraction.`);
      console.error(`Available directories in ${VENDOR_DIR}:`);
      try {
        const result = await $`ls -la ${VENDOR_DIR}`.quiet();
        console.error(result.stdout.toString());
      } catch (e) {
        console.error("Could not list directory:", e);
      }
      throw new Error(`Expected directory ${sourceLib} not found after extraction. Check tar archive structure.`);
    }
  } else {
    console.log("libvips already downloaded, skipping.");
  }

  // Stage platform libs to src-tauri/libvips
  console.log(`Staging libs from ${sourceLib} to ${STAGE_DIR}...`);
  mkdirSync(STAGE_DIR, { recursive: true });
  cpSync(sourceLib, STAGE_DIR, { recursive: true });

  console.log(`Successfully staged libs to ${STAGE_DIR}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});