/**
 * Verifies that every file carrying the release version agrees.
 *
 * Run in continuous integration before anything is built, and again by the release
 * preparation workflow after it rewrites the versions, so the writer is checked by
 * the same rules as everything else rather than being trusted.
 *
 * On a tag, this also asserts the tag matches the version, so a mistagged release
 * fails before an installer is attached to it.
 */
const { expectedFor, labels, readVersions, tagFor } = require('./release-version.cjs');

const actual = readVersions();
const version = actual.packageVersion;

let expected;
try {
  expected = expectedFor(version);
} catch (error) {
  console.error(`package.json holds a version this project cannot release.\n${error.message}`);
  process.exit(1);
}

const mismatches = Object.keys(expected).filter((key) => actual[key] !== expected[key]);

if (mismatches.length > 0) {
  console.error(`Release versions are not synchronized with package.json (${version}):`);
  for (const key of Object.keys(expected)) {
    const mark = actual[key] === expected[key] ? ' ' : '✗';
    const detail = actual[key] === expected[key] ? '' : `  (expected ${expected[key]})`;
    console.error(`  ${mark} ${labels[key].padEnd(42)} ${actual[key] ?? '(absent)'}${detail}`);
  }
  console.error('\nRun the Release prep workflow, or `node scripts/prepare-release.cjs <version>`.');
  process.exit(1);
}

if (process.env.GITHUB_REF_TYPE === 'tag') {
  const expectedTag = tagFor(version);
  if (process.env.GITHUB_REF_NAME !== expectedTag) {
    console.error(
      `Release tag ${process.env.GITHUB_REF_NAME} does not match application version ${expectedTag}.`,
    );
    process.exit(1);
  }
  console.log(`Tag ${expectedTag} matches the application version.`);
}

console.log(`Release version ${version} is synchronized across ${Object.keys(expected).length} files.`);
