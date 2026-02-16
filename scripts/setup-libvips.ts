import { $ } from "bun";
import { cpSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";

const REPO = "lovell/sharp-libvips";
const ASSET_NAME = "npm-workspace.tar.xz";
const ROOT = join(import.meta.dirname!, "..");
const VENDOR_DIR = join(ROOT, "vendor", "libvips");
const STAGE_DIR = join(ROOT, "src-tauri", "libvips");

function getTargetDouble(): string {
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

async function main() {
  const target = getTargetDouble();
  const sourceLib = join(VENDOR_DIR, target, "lib");

  // Download and extract if not already present
  if (!existsSync(sourceLib)) {
    const { url, tag } = await getLatestDownloadUrl();
    console.log(`Latest release: ${tag}`);

    mkdirSync(VENDOR_DIR, { recursive: true });
    const archivePath = join(VENDOR_DIR, ASSET_NAME);

    console.log(`Downloading ${url}...`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    await Bun.write(archivePath, res);

    console.log(`Extracting to ${VENDOR_DIR}...`);
    await $`tar -xf ${archivePath} -C ${VENDOR_DIR}`;

    unlinkSync(archivePath);
    console.log(`libvips ${tag} downloaded.`);
  } else {
    console.log("libvips already downloaded, skipping.");
  }

  // Stage platform libs to src-tauri/libvips
  mkdirSync(STAGE_DIR, { recursive: true });
  cpSync(sourceLib, STAGE_DIR, { recursive: true });

  console.log(`Target: ${target}`);
  console.log(`Staged libs to ${STAGE_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
