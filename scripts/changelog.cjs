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

const { tagFor } = require('./release-version.cjs');

const changelogPath = path.join(path.resolve(__dirname, '..'), 'CHANGELOG.md');

const UNRELEASED_HEADING = '## [Unreleased]';

/** Matches any version heading, so a section ends where the next one begins. */
const HEADING_PATTERN = /^## \[[^\]]+\]/m;

/**
 * A link definition at the foot of the file, such as `[0.8.0]: https://…`.
 *
 * The last section in the file has no heading after it, so without this it would run
 * to the end and swallow the whole block of link definitions — which would then end
 * up in a release body. The definitions are the end of the prose, so they end the
 * section too.
 */
const LINK_DEFINITION_PATTERN = /^\[[^\]]+\]: \S/m;

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
  const ends = [HEADING_PATTERN.exec(rest), LINK_DEFINITION_PATTERN.exec(rest)]
    .filter((match) => match !== null)
    .map((match) => match.index);
  const end = ends.length > 0 ? Math.min(...ends) : rest.length;
  return rest.slice(0, end).trim();
}

/** True when a section exists but holds nothing but whitespace. */
function isEmpty(section) {
  return section === null || section.length === 0;
}

/**
 * The `[Unreleased]` link definition at the foot of the file, in Keep a Changelog's
 * usual shape: a compare against the last released tag, ending at `HEAD`.
 *
 * Captured in two parts so the base tag can be read out of it. That tag is where the
 * previous release's name comes from — the file itself is the record of what was
 * released last, so nothing needs to be passed in or guessed at.
 */
const UNRELEASED_LINK = /^\[Unreleased\]: (\S*\/compare\/)(\S+?)\.\.\.HEAD$/m;

/**
 * Repoints the link definitions at the bottom of the file.
 *
 * Renaming the heading alone leaves `## [0.9.0]` as a reference with no definition,
 * which markdown renders as literal bracketed text rather than a link, and leaves
 * `[Unreleased]` comparing against the release before last. So the `[Unreleased]`
 * compare moves up to the new tag, and a definition for the new version is inserted
 * covering the range that was just released.
 *
 * A changelog with no link definitions is perfectly valid, and one whose
 * `[Unreleased]` line is not a `...HEAD` compare is somebody's deliberate choice. In
 * both cases this leaves the file alone rather than inventing a URL.
 */
function rollOverLinks(contents, version) {
  const match = UNRELEASED_LINK.exec(contents);
  if (!match) return { contents, previousTag: null };

  const [line, compareUrl, previousTag] = match;
  const tag = tagFor(version);
  return {
    contents: contents.replace(
      line,
      `[Unreleased]: ${compareUrl}${tag}...HEAD\n[${version}]: ${compareUrl}${previousTag}...${tag}`,
    ),
    previousTag,
  };
}

/**
 * Moves everything under `[Unreleased]` into a new section for `version`, dated
 * `date`, leaves `[Unreleased]` in place and empty, and repoints the compare links.
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
  const withHeading = `${before}${UNRELEASED_HEADING}\n\n## [${version}] - ${date}${after}`;

  const { contents: withLinks, previousTag } = rollOverLinks(withHeading, version);

  return { contents: withLinks, notes: unreleased, previousTag };
}

function write(contents) {
  fs.writeFileSync(changelogPath, contents);
}

module.exports = {
  changelogPath,
  isEmpty,
  read,
  rollOver,
  rollOverLinks,
  sectionFor,
  write,
  UNRELEASED_HEADING,
};
