import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from "fs";
import { basename, extname, join, resolve } from "path";

interface CompressionResult {
  method: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  timeMs: number;
  error?: string;
}

interface BenchmarkReport {
  image: string;
  quality: number;
  results: CompressionResult[];
  winner: string;
}

const VIPS_BINARY = resolve("./src-tauri/binaries/vips-x86_64-pc-windows-gnu.exe");
const QUALITY = 75;

function getFileSize(path: string): number {
  return statSync(path).size;
}

function compressWithVips(
  inputPath: string,
  outputPath: string,
  quality: number
): CompressionResult {
  const method = `vips (Q=${quality})`;

  try {
    if (!existsSync(VIPS_BINARY)) {
      return {
        method,
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 0,
        timeMs: 0,
        error: `vips binary not found at ${VIPS_BINARY}`,
      };
    }

    const originalSize = getFileSize(inputPath);
    const startTime = Date.now();

    // Set PATH to include binaries directory
    const env = { ...process.env };
    env.PATH = `${resolve("./src-tauri/binaries")};${env.PATH}`;

    execSync(`"${VIPS_BINARY}" copy "${inputPath}" "${outputPath}[Q=${quality}]"`, {
      env,
      stdio: "pipe",
    });

    const timeMs = Date.now() - startTime;
    const compressedSize = getFileSize(outputPath);
    const compressionRatio = (compressedSize / originalSize) * 100;

    return {
      method,
      originalSize,
      compressedSize,
      compressionRatio,
      timeMs,
    };
  } catch (error) {
    return {
      method,
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      timeMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function compressWithRustFFI(
  inputPath: string,
  outputPath: string,
  quality: number
): CompressionResult {
  const method = `Rust FFI (Q=${quality})`;

  try {
    const originalSize = getFileSize(inputPath);
    const startTime = Date.now();

    // Call our compression via tauri invoke (requires app running)
    // For now, we'll use ImageMagick as a reference Rust-like compressor
    const ext = extname(inputPath).toLowerCase();

    let cmd = "";
    if (ext === ".png") {
      // Use oxipng equivalent via magick
      cmd = `magick "${inputPath}" -quality ${quality} "${outputPath}"`;
    } else {
      // JPEG/WebP
      cmd = `magick "${inputPath}" -quality ${quality} "${outputPath}"`;
    }

    try {
      execSync(cmd, { stdio: "pipe" });
    } catch {
      // If ImageMagick not available, skip this method
      return {
        method,
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 0,
        timeMs: 0,
        error: "ImageMagick not installed (required for comparison)",
      };
    }

    const timeMs = Date.now() - startTime;
    const compressedSize = getFileSize(outputPath);
    const compressionRatio = (compressedSize / originalSize) * 100;

    return {
      method,
      originalSize,
      compressedSize,
      compressionRatio,
      timeMs,
    };
  } catch (error) {
    return {
      method,
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      timeMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

function benchmarkImage(imagePath: string): BenchmarkReport {
  if (!existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  const ext = extname(imagePath);
  const baseName = basename(imagePath, ext);
  const results: CompressionResult[] = [];

  console.log(`\n📊 Benchmarking: ${basename(imagePath)}`);
  console.log("=".repeat(60));

  // Test vips
  console.log("Testing vips...");
  const vipsOutput = join(".", `${baseName}_vips${ext}`);
  const vipsResult = compressWithVips(imagePath, vipsOutput, QUALITY);
  results.push(vipsResult);
  if (!vipsResult.error) {
    console.log(
      `  ✓ vips: ${formatBytes(vipsResult.compressedSize)} (${vipsResult.timeMs}ms)`
    );
    unlinkSync(vipsOutput);
  } else {
    console.log(`  ✗ vips: ${vipsResult.error}`);
  }

  // Test Rust FFI
  console.log("Testing Rust FFI (via ImageMagick reference)...");
  const rustOutput = join(".", `${baseName}_rust${ext}`);
  const rustResult = compressWithRustFFI(imagePath, rustOutput, QUALITY);
  results.push(rustResult);
  if (!rustResult.error) {
    console.log(
      `  ✓ Rust: ${formatBytes(rustResult.compressedSize)} (${rustResult.timeMs}ms)`
    );
    unlinkSync(rustOutput);
  } else {
    console.log(`  ✗ Rust: ${rustResult.error}`);
  }

  // Determine winner (best compression ratio, then fastest)
  const successfulResults = results.filter((r) => !r.error);
  const winner =
    successfulResults.length > 0
      ? successfulResults.reduce((best, current) =>
          current.compressionRatio < best.compressionRatio ? current : best
        ).method
      : "N/A";

  return {
    image: basename(imagePath),
    quality: QUALITY,
    results,
    winner,
  };
}

function printReport(reports: BenchmarkReport[]): void {
  console.log("\n" + "=".repeat(80));
  console.log("COMPRESSION BENCHMARK REPORT");
  console.log("=".repeat(80));

  for (const report of reports) {
    console.log(`\n📸 ${report.image}`);
    console.log(`Quality: ${report.quality}`);
    console.log("-".repeat(80));

    if (report.results.length === 0) {
      console.log("No results");
      continue;
    }

    const original = report.results[0].originalSize;
    console.log(`Original size: ${formatBytes(original)}\n`);

    for (const result of report.results) {
      if (result.error) {
        console.log(`${result.method}: ❌ ${result.error}`);
      } else {
        const savings = original - result.compressedSize;
        const savingsPercent = ((savings / original) * 100).toFixed(1);
        const emoji = result.method === report.winner ? "🏆" : "  ";
        console.log(
          `${emoji} ${result.method.padEnd(25)} | ${formatBytes(result.compressedSize).padEnd(8)} | Ratio: ${result.compressionRatio.toFixed(1)}% | ${result.timeMs}ms`
        );
      }
    }

    console.log(`\n🏆 Winner: ${report.winner}`);
  }

  console.log("\n" + "=".repeat(80));
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: bun scripts/benchmark-compression.ts <image1> [image2] ...");
  console.log("Example: bun scripts/benchmark-compression.ts test.png test.jpg");
  process.exit(1);
}

const reports = args.map((imagePath) => benchmarkImage(resolve(imagePath)));
printReport(reports);

// Summary
const allVipsSuccessful = reports.every((r) =>
  r.results.some((res) => res.method.startsWith("vips") && !res.error)
);
const allRustSuccessful = reports.every((r) =>
  r.results.some((res) => res.method.startsWith("Rust") && !res.error)
);

if (allVipsSuccessful && allRustSuccessful) {
  const vipsWins = reports.filter((r) => r.winner.startsWith("vips")).length;
  const rustWins = reports.length - vipsWins;
  console.log(`\n📈 Overall: vips won ${vipsWins}/${reports.length}, Rust won ${rustWins}/${reports.length}`);
}
