/**
 * Reading and rolling over CHANGELOG.md.
 *
 * The changelog is the release notes. Keeping one source means the notes attached
 * to a GitHub release cannot say something different from the file in the tree, and
 * nobody has to write the same thing twice.
 *
 * The format is Keep a Changelog: an `## [Unreleased]` section at the top collects
 * work as it lands, and cutting a release renames that section to the version and
 * opens a fresh empty one.
 */
const fs = require('node:fs');
const path = require('node:path');

const changelogPath = path.join(path.resolve(__dirname, '..'), 'CHANGELOG.md');

const UNRELEASED_HEADING = '## [Unreleased]';

/** Matches any version heading, so a section ends where the next one begins. */
const HEADING_PATTERN = /^## \[[^\]]+\]/m;

function read() {
  return fs.readFileSync(changelogPath, 'utf8');
}

/**
 * The body of one section, without its heading.
 *
 * `version` is either `Unreleased` or a released version. Returns `null` when the
 * section is absent, which the caller should treat as a failure rather than as an
 * empty release — silently attaching empty notes to a release is how a release ends
 * up looking like nothing changed.
 */
function sectionFor(version, contents = read()) {
  const heading = `## [${version}]`;
  const start = contents.indexOf(heading);
  if (start === -1) return null;

  const afterHeading = contents.indexOf('\n', start);
  if (afterHeading === -1) return '';

  const rest = contents.slice(afterHeading + 1);
  const next = HEADING_PATTERN.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

/** True when a section exists but holds nothing but whitespace. */
function isEmpty(section) {
  return section === null || section.length === 0;
}

/**
 * Moves everything under `[Unreleased]` into a new section for `version`, dated
 * `date`, and leaves `[Unreleased]` in place and empty.
 *
 * Returns the rewritten file and the notes that were moved, so the caller can use
 * the same text for the release body without parsing the result again.
 */
function rollOver(version, date, contents = read()) {
  const unreleased = sectionFor('Unreleased', contents);
  if (unreleased === null) {
    throw new Error(`CHANGELOG.md has no "${UNRELEASED_HEADING}" section to release.`);
  }
  if (isEmpty(unreleased)) {
    throw new Error(
      `CHANGELOG.md's "${UNRELEASED_HEADING}" section is empty. A release needs notes; ` +
        'describe what changed before cutting one.',
    );
  }
  if (sectionFor(version, contents) !== null) {
    throw new Error(`CHANGELOG.md already has a section for ${version}.`);
  }

  const start = contents.indexOf(UNRELEASED_HEADING);
  const before = contents.slice(0, start);
  const after = contents.slice(start + UNRELEASED_HEADING.length);

  return {
    contents: `${before}${UNRELEASED_HEADING}\n\n## [${version}] - ${date}${after}`,
    notes: unreleased,
  };
}

function write(contents) {
  fs.writeFileSync(changelogPath, contents);
}

module.exports = { changelogPath, isEmpty, read, rollOver, sectionFor, write, UNRELEASED_HEADING };
