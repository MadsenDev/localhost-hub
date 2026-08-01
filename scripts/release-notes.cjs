#!/usr/bin/env node
/**
 * Prints one version's changelog section, for a release body.
 *
 * Usage: node scripts/release-notes.cjs <version>
 *
 * Run at the tagged commit, where the changelog already contains the section that
 * `prepare-release.cjs` wrote — so the notes on the GitHub release are the same text
 * as the notes in the tree, and there is nothing to keep in step by hand.
 */
const { sectionFor } = require('./changelog.cjs');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/release-notes.cjs <version>');
  process.exit(1);
}

const section = sectionFor(version);
if (section === null) {
  console.error(
    `CHANGELOG.md has no section for ${version}. Releases are cut by the Release prep ` +
      'workflow, which writes that section; a tag without one was not prepared by it.',
  );
  process.exit(1);
}
if (section.length === 0) {
  console.error(`CHANGELOG.md's section for ${version} is empty.`);
  process.exit(1);
}

// A release body is capped at 125,000 characters. Checked here so an oversized
// section fails while it can still be shortened, rather than when the release is
// being created and the tag already exists.
const BODY_LIMIT = 125_000;
if (section.length > BODY_LIMIT) {
  console.error(
    `The changelog section for ${version} is ${section.length} characters, over the ` +
      `${BODY_LIMIT}-character limit for a release body. Summarize it, and keep the detail ` +
      'in CHANGELOG.md.',
  );
  process.exit(1);
}

process.stdout.write(`${section}\n`);
