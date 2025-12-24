#!/usr/bin/env bun
import {
	existsSync,
	mkdirSync,
	readdirSync,
	writeFileSync,
	readFileSync,
	cpSync,
	rmSync,
	statSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import * as tar from "tar";

// --- Configuration ---
const BINARIES_DIR = "src-tauri/binaries";
const HEADERS_DIR = "src-tauri/include";
const ENV_LOCAL_FILE = "src-tauri/.env.local";
const TEMP_DIR = "temp_libvips_setup";
const LIBVIPS_VERSION = "8.17.3";

// Map Node.js platform/arch to Rust targets and Sharp packages
const PLATFORM_MAP: Record<string, { target: string; package: string }> = {
	"win32-x64": {
		target: "x86_64-pc-windows-msvc",
		package: "@img/sharp-libvips-win32-x64",
	},
	"linux-x64": {
		target: "x86_64-unknown-linux-gnu",
		package: "@img/sharp-libvips-linux-x64",
	},
	"darwin-x64": {
		target: "x86_64-apple-darwin",
		package: "@img/sharp-libvips-darwin-x64",
	},
	"darwin-arm64": {
		target: "aarch64-apple-darwin",
		package: "@img/sharp-libvips-darwin-arm64",
	},
};

// --- Helpers ---

function getPlatformConfig() {
	const key = `${process.platform}-${process.arch}`;
	const config = PLATFORM_MAP[key];
	if (!config) {
		throw new Error(`Unsupported platform: ${key}`);
	}
	return config;
}

// Recursively find the directory that contains "vips/vips.h"
function findIncludeRoot(startDir: string): string | null {
	if (!existsSync(startDir)) return null;

	// Check if current dir has vips/vips.h directly (e.g. startDir is 'include')
	if (existsSync(join(startDir, "vips", "vips.h"))) {
		return startDir;
	}

	const files = readdirSync(startDir, { withFileTypes: true });
	for (const file of files) {
		if (file.isDirectory()) {
			const fullPath = join(startDir, file.name);
			const found = findIncludeRoot(fullPath);
			if (found) return found;
		}
	}
	return null;
}

// --- Steps ---

async function downloadTarball(
	packageName: string,
	version: string = "latest"
): Promise<Buffer> {
	const url = `https://registry.npmjs.org/${packageName}`;
	console.log(`📥 Fetching package info for ${packageName}...`);

	const resp = await fetch(url);
	if (!resp.ok)
		throw new Error(`Failed to fetch ${packageName}: ${resp.statusText}`);

	const data = await resp.json();
	const versionData =
		version === "latest" ? data["dist-tags"].latest : version;
	const tarballUrl = data.versions[versionData].dist.tarball;

	console.log(`📦 Downloading tarball from ${tarballUrl}...`);
	const tarResp = await fetch(tarballUrl);
	if (!tarResp.ok)
		throw new Error(`Failed to download tarball: ${tarResp.statusText}`);

	return Buffer.from(await tarResp.arrayBuffer());
}

async function downloadLibvipsHeaders(version: string): Promise<Buffer> {
	// We prioritize the Source Code tarball (.tar.gz) from GitHub
	const urls = [
		`https://github.com/libvips/libvips/archive/refs/tags/v${version}.tar.gz`,
		`https://github.com/libvips/libvips/archive/v${version}.tar.gz`,
	];

	for (const url of urls) {
		console.log(`📥 Trying to fetch headers from ${url}...`);
		try {
			const resp = await fetch(url, {
				headers: {
					"User-Agent": "Bun/1.0 (Development Setup Script)",
					Accept: "application/gzip, application/octet-stream",
				},
				redirect: "follow",
			});

			if (resp.ok) return Buffer.from(await resp.arrayBuffer());
			console.warn(`   ⚠️  HTTP ${resp.status}: ${resp.statusText}`);
		} catch (e) {
			console.warn(`   ⚠️  Network error: ${e}`);
		}
	}
	throw new Error(
		`Failed to download libvips headers. Please check your internet connection.`
	);
}

async function ensureBinaries(config: {
	target: string;
	package: string;
}) {
	const targetLibDir = join(BINARIES_DIR, config.target);

	// Check if binaries exist
	if (existsSync(targetLibDir) && readdirSync(targetLibDir).length > 0) {
		console.log(`✅ Binaries already exist at ${targetLibDir}`);
		// Check if headers exist
		if (existsSync(join(HEADERS_DIR, "vips", "vips.h"))) {
			console.log(`✅ Headers already exist at ${HEADERS_DIR}`);
			return targetLibDir;
		}
		console.log(`⚠️  Headers missing. Proceeding to header setup...`);
	} else {
		console.log(`🚧 Starting setup for ${config.target}...`);
	}

	// Prepare dirs
	mkdirSync(BINARIES_DIR, { recursive: true });
	mkdirSync(HEADERS_DIR, { recursive: true });
	if (existsSync(TEMP_DIR))
		rmSync(TEMP_DIR, { recursive: true, force: true });
	mkdirSync(TEMP_DIR, { recursive: true });

	try {
		// --- 1. Binaries (if needed) ---
		if (
			!existsSync(targetLibDir) ||
			readdirSync(targetLibDir).length === 0
		) {
			const tarBuffer = await downloadTarball(config.package);
			const tarPath = join(TEMP_DIR, "binaries.tar.gz");
			writeFileSync(tarPath, tarBuffer);

			const extractDir = join(TEMP_DIR, "extracted_binaries");
			mkdirSync(extractDir, { recursive: true });

			await tar.extract({ file: tarPath, cwd: extractDir });

			// Find the 'lib' folder
			// Standard sharp packages usually have: /package/lib or /lib
			let libSrcPath = "";

			// Helper to find 'lib' dir containing .so/.dll files
			const findLibDir = (dir: string): string | null => {
				if (!existsSync(dir)) return null;
				const entries = readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isDirectory()) {
						if (entry.name === "lib") {
							// verify it has binaries
							const hasBin = readdirSync(join(dir, entry.name)).some((f) =>
								/\.(so|dll|dylib)/.test(f)
							);
							if (hasBin) return join(dir, entry.name);
						}
						const found = findLibDir(join(dir, entry.name));
						if (found) return found;
					}
				}
				return null;
			};

			libSrcPath = findLibDir(extractDir) || "";

			if (!libSrcPath || !existsSync(libSrcPath)) {
				// Last ditch: look for any folder with shared libs
				throw new Error(
					"Could not locate 'lib' directory in downloaded package"
				);
			}

			console.log(`📚 Installing library files from ${libSrcPath}...`);
			const files = readdirSync(libSrcPath);

			// Filter for shared libraries (.dll, .so, .dylib) including versioned ones (e.g. .so.42.0.0)
			const libFiles = files.filter(
				(f) =>
					/\.(so|dylib|dll|lib)([\.\d]+)?$/i.test(f) &&
					!f.endsWith(".d.ts")
			);

			if (libFiles.length === 0) {
				throw new Error("No library files found in lib directory.");
			}

			mkdirSync(targetLibDir, { recursive: true });

			for (const file of libFiles) {
				const src = join(libSrcPath, file);
				const dst = join(targetLibDir, file);
				if (statSync(src).isDirectory()) continue;
				cpSync(src, dst, { dereference: true });
			}
			console.log(`   ✓ Installed ${libFiles.length} binary files`);
		}

		// --- 2. Headers ---
		if (!existsSync(join(HEADERS_DIR, "vips", "vips.h"))) {
			console.log("📄 Downloading headers...");
			const headerTarBuffer = await downloadLibvipsHeaders(
				LIBVIPS_VERSION
			);
			const headerTarPath = join(TEMP_DIR, "headers.tar.gz");
			writeFileSync(headerTarPath, headerTarBuffer);

			const headerExtractDir = join(TEMP_DIR, "extracted_headers");
			mkdirSync(headerExtractDir, { recursive: true });
			await tar.extract({ file: headerTarPath, cwd: headerExtractDir });

			console.log("   Searching for vips.h...");
			const includeRoot = findIncludeRoot(headerExtractDir);

			if (includeRoot) {
				console.log(`   Found headers at: ${includeRoot}`);
				// Copy contents (recursively) to HEADERS_DIR
				cpSync(includeRoot, HEADERS_DIR, { recursive: true });
				console.log(`   ✓ Headers installed`);
			} else {
				console.warn(
					"⚠️  Could not locate 'vips/vips.h' in downloaded archive."
				);
				console.warn("   Dumping extracted structure for debug:");
				try {
					const dump = (d: string, depth: number) => {
						if (depth > 2) return;
						readdirSync(d, { withFileTypes: true }).forEach((e) => {
							console.log("   " + "  ".repeat(depth) + e.name);
							if (e.isDirectory()) dump(join(d, e.name), depth + 1);
						});
					};
					dump(headerExtractDir, 0);
				} catch {}
				throw new Error("Header setup failed");
			}
		}
	} catch (err) {
		console.error("\n❌ Setup failed:", err);
		throw err;
	} finally {
		console.log("🧹 Cleaning up temp files...");
		if (existsSync(TEMP_DIR))
			rmSync(TEMP_DIR, { recursive: true, force: true });
	}

	return targetLibDir;
}

async function setupRuntimeEnvironment(libDir: string) {
	console.log(`\n⚙️  Configuring runtime environment...`);
	const absoluteLibDir = resolve(libDir);

	// Windows: Copy DLLs to target/debug
	if (process.platform === "win32") {
		const targetDirs = ["target/debug", "src-tauri/target/debug"];
		const files = readdirSync(libDir);
		const dlls = files.filter((f) => f.endsWith(".dll"));

		if (dlls.length === 0) {
			console.warn(`⚠️  No DLL files found in ${libDir}`);
		} else {
			let copiedCount = 0;
			for (const targetDir of targetDirs) {
				if (!existsSync(targetDir))
					mkdirSync(targetDir, { recursive: true });

				for (const dll of dlls) {
					const src = join(libDir, dll);
					const dst = join(targetDir, dll);
					if (!existsSync(dst)) {
						cpSync(src, dst);
						copiedCount++;
					}
				}
			}
			if (copiedCount > 0)
				console.log(`   ✓ Copied ${copiedCount} DLLs to debug targets`);
		}
	}

	if (process.platform !== "win32") {
		const varName =
			process.platform === "darwin"
				? "DYLD_LIBRARY_PATH"
				: "LD_LIBRARY_PATH";
		const absoluteIncludeDir = resolve(HEADERS_DIR); // Resolve the include path

		// We add specific variables that binding generators (bindgen) and pkg-config look for
		const envVars = {
			[varName]: `${absoluteLibDir}:$${varName}`,
			VIPS_LIB_DIR: absoluteLibDir,
			VIPS_INCLUDE_DIR: absoluteIncludeDir,
			// Helper for bindgen if it fails to find headers
			BINDGEN_EXTRA_CLANG_ARGS: `-I${absoluteIncludeDir}`,
			// Prevent pkg-config from interfering if we want to force our bundled libs
			VIPS_NO_PKG_CONFIG: "1",
		};

		try {
			let envContent = "";
			if (existsSync(ENV_LOCAL_FILE)) {
				envContent = readFileSync(ENV_LOCAL_FILE, "utf-8");
			}

			let newContent = envContent;

			for (const [key, value] of Object.entries(envVars)) {
				// Remove old key if exists to prevent duplicates
				newContent = newContent
					.split("\n")
					.filter((line) => !line.startsWith(key))
					.join("\n")
					.trim();

				newContent += `\n${key}=${value}`;
			}

			writeFileSync(ENV_LOCAL_FILE, newContent + "\n");
			console.log(
				`   ✓ Updated ${ENV_LOCAL_FILE} with Library and Include paths`
			);
		} catch (err) {
			console.warn(`   ⚠️  Failed to update ${ENV_LOCAL_FILE}:`, err);
		}
	}
}

async function main() {
	try {
		const config = getPlatformConfig();
		const libDir = await ensureBinaries(config);
		await setupRuntimeEnvironment(libDir);

		console.log("\n✅ libvips development environment ready!");
		console.log(`   Libs:    ${libDir}`);
		console.log(`   Headers: ${HEADERS_DIR}`);
	} catch (error) {
		process.exit(1);
	}
}

main();
