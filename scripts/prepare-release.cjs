#!/usr/bin/env node
/**
 * Sets the release version everywhere it appears, and rolls the changelog over.
 *
 * Usage: node scripts/prepare-release.cjs <version> [--notes-out <path>]
 *
 * This does not commit, tag, or push. It only edits the tree, so the same script is
 * usable by hand and by the Release prep workflow, and so the diff can be read
 * before anything is published. `check-version-sync.cjs` verifies the result using
 * the same rules from a separate entry point.
 *
 * Six files carry the version, in four notations. Doing this by hand reliably missed
 * one: `Cargo.lock` holds it too, and continuous integration builds `--locked`, so a
 * manifest bumped without its lockfile fails every Rust job at a point where the tag
 * already exists.
 */
const fs = require('node:fs');

const changelog = require('./changelog.cjs');
const { archVersionFor, files, msiVersionFor, parseVersion, readCargoLockVersion, tagFor } =
  require('./release-version.cjs');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const version = args.find((arg) => !arg.startsWith('--'));
const notesOutIndex = args.indexOf('--notes-out');
const notesOut = notesOutIndex === -1 ? null : args[notesOutIndex + 1];

if (!version) {
  fail('Usage: node scripts/prepare-release.cjs <version> [--notes-out <path>]');
}

try {
  parseVersion(version);
} catch (error) {
  fail(error.message);
}

/**
 * Replaces exactly one match, and fails loudly rather than writing nothing.
 *
 * The count is taken with a global copy of the pattern, because a non-global
 * `String.match` returns the capture groups rather than the matches and would make
 * every pattern here look ambiguous.
 */
function replaceOnce(filePath, pattern, replacement, description) {
  const contents = fs.readFileSync(filePath, 'utf8');
  const occurrences = contents.match(new RegExp(pattern.source, `${pattern.flags}g`));
  if (!occurrences) {
    fail(`Could not find ${description} in ${filePath}. The file's format has changed.`);
  }
  if (occurrences.length > 1) {
    fail(
      `Found ${occurrences.length} candidates for ${description} in ${filePath}; expected one. ` +
        'Refusing to guess which one is the release version.',
    );
  }
  fs.writeFileSync(filePath, contents.replace(pattern, replacement));
}

// Everything that can be rejected is rejected before a single file is written.
//
// `rollOver` is pure, so computing the new changelog up front validates that there
// is an `[Unreleased]` section, that it is not empty, and that this version has not
// already been released — while the tree is still untouched. Doing this after the
// version files were written left a half-prepared tree on any of those failures,
// which is worse than doing nothing: the versions no longer match the changelog, and
// the next run refuses because `[Unreleased]` is still there.
const date = new Date().toISOString().slice(0, 10);
let rolled;
try {
  rolled = changelog.rollOver(version, date, changelog.read());
} catch (error) {
  fail(error.message);
}

// package.json and the Tauri configuration are JSON with a top-level "version".
// Edited textually rather than through JSON.parse so formatting, key order and
// trailing newline survive untouched — a reformatted config is a diff nobody asked
// for in the middle of a release.
for (const [filePath, label] of [
  [files.packageJson, 'package.json version'],
  [files.tauriConf, 'tauri.conf.json version'],
]) {
  replaceOnce(filePath, /^(\s*"version"\s*:\s*")[^"]+(")/m, `$1${version}$2`, label);
}

replaceOnce(
  files.cargoToml,
  /^(version = ")[^"]+(")/m,
  `$1${version}$2`,
  'the [package] version',
);

replaceOnce(
  files.cargoLock,
  /(\nname = "localhost-hub"\nversion = ")[^"]+(")/,
  `$1${version}$2`,
  "the localhost-hub package's locked version",
);

replaceOnce(
  files.archPkgbuild,
  /^(pkgver=).+$/m,
  `$1${archVersionFor(version)}`,
  'pkgver',
);

replaceOnce(
  files.windowsConf,
  /^(\s*"version"\s*:\s*")[^"]+(")/m,
  `$1${msiVersionFor(version)}$2`,
  'the WiX version',
);

// The changelog is written last, now that every version file has landed.
changelog.write(rolled.contents);

if (notesOut) {
  fs.writeFileSync(notesOut, `${rolled.notes}\n`);
}

// Read back rather than trusting the writes, since the point of this script is that
// nothing about the version is left to assumption.
const lockVersion = readCargoLockVersion(fs.readFileSync(files.cargoLock, 'utf8'));
if (lockVersion !== version) {
  fail(`Cargo.lock still reports ${lockVersion} after the rewrite.`);
}

console.log(`Prepared ${version} (tag ${tagFor(version)}, MSI ${msiVersionFor(version)}).`);
console.log(`Changelog section "[${version}] - ${date}" holds ${rolled.notes.split('\n').length} lines.`);
if (notesOut) console.log(`Release notes written to ${notesOut}.`);
