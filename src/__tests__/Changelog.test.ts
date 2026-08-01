/**
 * Tests for the changelog rollover that cutting a release performs.
 *
 * This runs once per release, by a workflow, against a file nobody reads until
 * afterwards — so a mistake here is both rare and invisible, which is exactly the
 * combination worth testing. `rollOver` takes the contents as an argument, so none of
 * this touches the real CHANGELOG.md.
 */
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// A CommonJS script, shared with the release workflow rather than duplicated here.
const require = createRequire(import.meta.url);
const changelog = require('../../scripts/changelog.cjs');

const COMPARE = 'https://github.com/MadsenDev/localhost-hub/compare';

function fixture(unreleasedBody: string, links = true): string {
  return [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    unreleasedBody,
    '',
    '## [0.8.0] - 2025-12-19',
    '',
    '### Added',
    '- Something older',
    '',
    ...(links
      ? [`[Unreleased]: ${COMPARE}/v0.8.0...HEAD`, `[0.8.0]: ${COMPARE}/v0.7.0...v0.8.0`, '']
      : []),
  ].join('\n');
}

describe('rollOver', () => {
  it('renames [Unreleased] to the version and dates it', () => {
    const { contents } = changelog.rollOver('0.9.0', '2026-08-01', fixture('### Added\n- A thing'));

    expect(contents).toContain('## [0.9.0] - 2026-08-01');
    // The heading stays, so the next cycle has somewhere to collect work.
    expect(contents).toContain('## [Unreleased]');
  });

  it('leaves [Unreleased] empty rather than removing it', () => {
    const { contents } = changelog.rollOver('0.9.0', '2026-08-01', fixture('### Added\n- A thing'));

    expect(changelog.sectionFor('Unreleased', contents)).toBe('');
  });

  it('moves the notes into the new section', () => {
    const body = '### Added\n- A thing\n\n### Fixed\n- Another thing';
    const { contents, notes } = changelog.rollOver('0.9.0', '2026-08-01', fixture(body));

    expect(notes).toBe(body);
    expect(changelog.sectionFor('0.9.0', contents)).toBe(body);
  });

  it('keeps earlier releases untouched', () => {
    const { contents } = changelog.rollOver('0.9.0', '2026-08-01', fixture('### Added\n- A thing'));

    expect(changelog.sectionFor('0.8.0', contents)).toBe('### Added\n- Something older');
  });

  describe('compare links', () => {
    it('repoints [Unreleased] at the new tag', () => {
      const { contents } = changelog.rollOver('0.9.0', '2026-08-01', fixture('### Added\n- A thing'));

      expect(contents).toContain(`[Unreleased]: ${COMPARE}/v0.9.0...HEAD`);
      expect(contents).not.toContain(`[Unreleased]: ${COMPARE}/v0.8.0...HEAD`);
    });

    // Without this the new heading is a reference with no definition, which markdown
    // renders as literal bracketed text instead of a link.
    it('defines the new version over the range just released', () => {
      const { contents } = changelog.rollOver('0.9.0', '2026-08-01', fixture('### Added\n- A thing'));

      expect(contents).toContain(`[0.9.0]: ${COMPARE}/v0.8.0...v0.9.0`);
    });

    it('reports the tag it compared against', () => {
      const { previousTag } = changelog.rollOver(
        '0.9.0',
        '2026-08-01',
        fixture('### Added\n- A thing'),
      );

      expect(previousTag).toBe('v0.8.0');
    });

    it('tags a prerelease the same way', () => {
      const { contents } = changelog.rollOver(
        '0.9.0-alpha.1',
        '2026-08-01',
        fixture('### Added\n- A thing'),
      );

      expect(contents).toContain(`[Unreleased]: ${COMPARE}/v0.9.0-alpha.1...HEAD`);
      expect(contents).toContain(`[0.9.0-alpha.1]: ${COMPARE}/v0.8.0...v0.9.0-alpha.1`);
    });

    it('leaves a changelog with no link definitions alone', () => {
      const { contents, previousTag } = changelog.rollOver(
        '0.9.0',
        '2026-08-01',
        fixture('### Added\n- A thing', false),
      );

      expect(previousTag).toBeNull();
      expect(contents).not.toContain('compare');
      expect(contents).toContain('## [0.9.0] - 2026-08-01');
    });

    // Someone pointing [Unreleased] somewhere other than a `...HEAD` compare meant to,
    // so the shape is left as they wrote it rather than rewritten into this one.
    it('leaves an [Unreleased] link that is not a HEAD compare alone', () => {
      const source = fixture('### Added\n- A thing').replace(
        `[Unreleased]: ${COMPARE}/v0.8.0...HEAD`,
        '[Unreleased]: https://example.invalid/unreleased',
      );
      const { contents, previousTag } = changelog.rollOver('0.9.0', '2026-08-01', source);

      expect(previousTag).toBeNull();
      expect(contents).toContain('[Unreleased]: https://example.invalid/unreleased');
      expect(contents).not.toContain('[0.9.0]: ');
    });
  });

  // The last section in the file has no heading after it. Before the link
  // definitions were treated as an end marker, this ran to the end of the file and
  // returned the whole block of them as part of the notes.
  it('stops the last section before the link definitions', () => {
    const source = [
      '# Changelog',
      '',
      '## [0.1.0] - 2024-12-19',
      '',
      '### Added',
      '- Initial release',
      '',
      `[0.1.0]: ${COMPARE}/v0.1.0`,
      '',
    ].join('\n');

    expect(changelog.sectionFor('0.1.0', source)).toBe('### Added\n- Initial release');
  });

  describe('refusals', () => {
    it('refuses an empty [Unreleased] section', () => {
      expect(() => changelog.rollOver('0.9.0', '2026-08-01', fixture(''))).toThrow(/empty/i);
    });

    it('refuses a version that has already been released', () => {
      expect(() =>
        changelog.rollOver('0.8.0', '2026-08-01', fixture('### Added\n- A thing')),
      ).toThrow(/already has a section for 0\.8\.0/);
    });

    it('refuses a changelog with no [Unreleased] section', () => {
      const source = '# Changelog\n\n## [0.8.0] - 2025-12-19\n\n### Added\n- Something older\n';

      expect(() => changelog.rollOver('0.9.0', '2026-08-01', source)).toThrow(/no "## \[Unreleased\]"/);
    });
  });
});
