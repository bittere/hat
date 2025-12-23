import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const bumpType = process.argv[2] as "major" | "minor" | "patch";

if (!["major", "minor", "patch"].includes(bumpType)) {
  console.error("Usage: bun scripts/bump-version.ts [major|minor|patch]");
  process.exit(1);
}

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map(Number);
  return [parts[0], parts[1], parts[2]];
}

function bumpVersion(
  version: string,
  type: "major" | "minor" | "patch"
): string {
  const [major, minor, patch] = parseVersion(version);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

// Read current version from package.json
const packageJsonPath = resolve("./package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const currentVersion = packageJson.version;
const newVersion = bumpVersion(currentVersion, bumpType);

console.log(`Bumping version from ${currentVersion} to ${newVersion}...`);

// Update package.json
packageJson.version = newVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
console.log("✓ Updated package.json");

// Update src-tauri/tauri.conf.json
const tauriConfPath = resolve("./src-tauri/tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
tauriConf.version = newVersion;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
console.log("✓ Updated src-tauri/tauri.conf.json");

// Update src-tauri/Cargo.toml
const cargoTomlPath = resolve("./src-tauri/Cargo.toml");
let cargoToml = readFileSync(cargoTomlPath, "utf-8");
cargoToml = cargoToml.replace(
  /^version = "[\d.]+"/m,
  `version = "${newVersion}"`
);
writeFileSync(cargoTomlPath, cargoToml);
console.log("✓ Updated src-tauri/Cargo.toml");

console.log(`\n✓ Version bumped to ${newVersion}`);
