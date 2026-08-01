/**
 * The one definition of where a release version lives and what shape it takes.
 *
 * A release version appears in six files, in four different notations. Both the
 * synchronization check and the release preparation script read this module, so
 * "where the version lives" cannot drift between the thing that writes the
 * versions and the thing that verifies them — which is the failure this exists to
 * prevent, because the writer and the checker disagreeing is silent until a
 * release is already tagged.
 */
const fs = require('node:fs');
const path = require('node:path');
const toml = require('toml');

const root = path.resolve(__dirname, '..');

const files = {
  packageJson: path.join(root, 'package.json'),
  tauriConf: path.join(root, 'src-tauri', 'tauri.conf.json'),
  cargoToml: path.join(root, 'src-tauri', 'Cargo.toml'),
  cargoLock: path.join(root, 'src-tauri', 'Cargo.lock'),
  archPkgbuild: path.join(root, 'packaging', 'arch', 'PKGBUILD'),
  windowsConf: path.join(root, 'src-tauri', 'tauri.windows.conf.json'),
};

/**
 * SemVer, restricted to what this project's packaging can actually express.
 *
 * Build metadata (`+sha`) is rejected rather than ignored: Cargo accepts it, the
 * Arch `pkgver` notation has no room for it, and silently dropping part of a
 * version the caller asked for is worse than refusing.
 */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

function parseVersion(version) {
  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(
      `"${version}" is not a version this project can release. Expected MAJOR.MINOR.PATCH ` +
        'with an optional prerelease such as 0.9.0 or 0.9.0-alpha.1, and no build metadata.',
    );
  }
  const [, major, minor, patch, prerelease] = match;
  return { core: `${major}.${minor}.${patch}`, prerelease: prerelease ?? null };
}

/** The git tag for a version. */
function tagFor(version) {
  return `v${version}`;
}

/**
 * Arch's `pkgver` may not contain a hyphen — that character separates `pkgver`
 * from `pkgrel` — so a prerelease is written with an underscore.
 */
function archVersionFor(version) {
  return version.replaceAll('-', '_');
}

/**
 * WiX rejects textual SemVer prereleases, so the MSI carries a four-part numeric
 * version instead. The fourth part is the prerelease's trailing number when it has
 * one (`0.9.0-alpha.1` → `0.9.0.1`) and `0` otherwise, which keeps a final release
 * ordered above every prerelease that led to it.
 */
function msiVersionFor(version) {
  const { core, prerelease } = parseVersion(version);
  const build = prerelease?.split('.').at(-1);
  return `${core}.${build && /^\d+$/.test(build) ? build : '0'}`;
}

/** Every version string currently on disk, by the file that holds it. */
function readVersions() {
  const packageVersion = JSON.parse(fs.readFileSync(files.packageJson, 'utf8')).version;
  const archPkgbuild = fs.readFileSync(files.archPkgbuild, 'utf8');
  const windowsConfig = JSON.parse(fs.readFileSync(files.windowsConf, 'utf8'));

  return {
    packageVersion,
    tauriVersion: JSON.parse(fs.readFileSync(files.tauriConf, 'utf8')).version,
    cargoVersion: toml.parse(fs.readFileSync(files.cargoToml, 'utf8')).package.version,
    cargoLockVersion: readCargoLockVersion(fs.readFileSync(files.cargoLock, 'utf8')),
    archVersion: archPkgbuild.match(/^pkgver=(.+)$/m)?.[1] ?? null,
    windowsMsiVersion: windowsConfig.bundle?.windows?.wix?.version ?? null,
  };
}

/**
 * The `localhost-hub` package's own version in the lockfile.
 *
 * The lockfile matters as much as the manifest: continuous integration builds with
 * `--locked`, so a manifest bumped without its lockfile fails every Rust job. It is
 * matched positionally — the `version` on the line after this package's `name` —
 * because the lockfile is generated and never hand-edited.
 */
function readCargoLockVersion(contents) {
  const match = /\nname = "localhost-hub"\nversion = "([^"]+)"/.exec(contents);
  return match?.[1] ?? null;
}

/** What each file should contain for `version`, for both writing and checking. */
function expectedFor(version) {
  parseVersion(version);
  return {
    packageVersion: version,
    tauriVersion: version,
    cargoVersion: version,
    cargoLockVersion: version,
    archVersion: archVersionFor(version),
    windowsMsiVersion: msiVersionFor(version),
  };
}

/** How each version is described when a mismatch is reported. */
const labels = {
  packageVersion: 'package.json',
  tauriVersion: 'src-tauri/tauri.conf.json',
  cargoVersion: 'src-tauri/Cargo.toml',
  cargoLockVersion: 'src-tauri/Cargo.lock',
  archVersion: 'packaging/arch/PKGBUILD (pkgver)',
  windowsMsiVersion: 'src-tauri/tauri.windows.conf.json (WiX)',
};

module.exports = {
  archVersionFor,
  expectedFor,
  files,
  labels,
  msiVersionFor,
  parseVersion,
  readCargoLockVersion,
  readVersions,
  root,
  tagFor,
  VERSION_PATTERN,
};
