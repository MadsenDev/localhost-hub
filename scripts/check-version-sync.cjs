const fs = require("node:fs");
const path = require("node:path");
const toml = require("toml");

const root = path.resolve(__dirname, "..");
const packageVersion = require(path.join(root, "package.json")).version;
const tauriVersion = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
).version;
const cargoVersion = toml.parse(
  fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8"),
).package.version;
const archPkgbuild = fs.readFileSync(path.join(root, "packaging", "arch", "PKGBUILD"), "utf8");
const archVersion = archPkgbuild.match(/^pkgver=(.+)$/m)?.[1]?.replaceAll("_", "-");

const versions = {
  "package.json": packageVersion,
  "src-tauri/tauri.conf.json": tauriVersion,
  "src-tauri/Cargo.toml": cargoVersion,
  "packaging/arch/PKGBUILD": archVersion,
};
const mismatches = Object.entries(versions).filter(([, version]) => version !== packageVersion);

if (mismatches.length > 0) {
  console.error("Release versions are not synchronized:");
  for (const [file, version] of Object.entries(versions)) {
    console.error(`  ${file}: ${version}`);
  }
  process.exit(1);
}

if (process.env.GITHUB_REF_TYPE === "tag") {
  const expectedTag = `v${packageVersion}`;
  if (process.env.GITHUB_REF_NAME !== expectedTag) {
    console.error(
      `Release tag ${process.env.GITHUB_REF_NAME} does not match application version ${expectedTag}.`,
    );
    process.exit(1);
  }
}

console.log(`Release version ${packageVersion} is synchronized.`);
