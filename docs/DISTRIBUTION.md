# Desktop Distribution

Localhost Hub is built natively for Linux, macOS, and Windows by GitHub Actions.
Packaging is driven by tags: pushing a `v*` tag builds every platform, drafts the
release, and attaches the installers to it. Every run also keeps its installers as
downloadable workflow artifacts.

## Supported Packages

| Platform | Artifacts | Intended systems |
| --- | --- | --- |
| Linux | AppImage | Broad distro coverage, including Arch, EndeavourOS, CachyOS, and distributions without a matching native package |
| Linux | DEB | Debian, Ubuntu, Linux Mint, Pop!_OS, Zorin OS, and derivatives |
| Linux | RPM | Fedora, RHEL-family distributions, openSUSE, and derivatives |
| Arch Linux | `.pkg.tar.zst` | Arch Linux, EndeavourOS, CachyOS, Manjaro, and compatible derivatives |
| macOS | Universal DMG and app bundle | Intel and Apple Silicon Macs |
| Windows | MSI and NSIS setup executable | 64-bit Windows |

Linux packages use the system WebKitGTK runtime. The AppImage reduces packaging
differences but is not a container or an emulator; the host still needs a
compatible desktop stack. Native packages are preferred when one matches the
distribution.

The Arch artifact can be installed directly:

```bash
sudo pacman -U localhost-hub-*.pkg.tar.zst
```

It is built with a maintained `PKGBUILD` inside an Arch Linux container. The
package currently ships as a GitHub artifact/release asset; publishing the same
recipe to AUR is a separate distribution step because AUR requires its own
repository and maintainer credentials.

Flatpak, Snap, and AUR publication are not claimed yet. They require separate
store/repository maintenance and should be added only when there is capacity to
test and maintain those channels.

## Cutting a Release

Releases are cut by the **Release prep** workflow — Actions → Release prep → Run
workflow — with the version to release, without a leading `v`.

It defaults to a dry run: the version is set everywhere, the changelog rolls over, the
gate runs, and the diff and release notes appear in the run summary, but nothing is
committed. Read that summary, then run it again with the dry-run box unchecked to
commit, tag, and push.

Pushing the tag is what starts packaging. The ordering is therefore:

1. **Release prep** sets the version, rolls `[Unreleased]` into a dated section, runs
   lint, both typechecks, the tests and a production build, commits, and pushes the
   tag.
   - The rollover renames the `## [Unreleased]` heading to `## [0.9.0] - 2026-08-01`
     and leaves a fresh empty `[Unreleased]` above it. It also repoints the compare
     links at the foot of the file: `[Unreleased]` moves up to the new tag, and a
     `[0.9.0]:` definition is added for the range just released — without which the
     new heading would be a reference with no definition, rendering as bracketed text
     rather than a link. The previous tag is read out of the existing `[Unreleased]`
     link, so the file is its own record of what shipped last.
2. **Desktop builds** runs against the tag, drafts the release with that changelog
   section as its notes, builds all three platforms, and attaches every installer to
   the draft.
   - Release prep starts it explicitly rather than relying on the tag push to do it.
     GitHub does not start workflows from events created with the default
     `GITHUB_TOKEN` — the rule that stops a workflow triggering itself forever — so a
     tag pushed by a workflow fires no `push` trigger. `workflow_dispatch` is one of
     the two events exempt from that rule, so it is used instead, against the tag. The
     alternative is a personal access token stored in the repository purely to work
     around the rule, which is a long-lived credential for no benefit.
   - This is why the jobs key off `github.ref_type == 'tag'` rather than the event
     name: a real tag push and a dispatch against a tag are the same thing here.
3. **You** review the draft — with the packages already on it — and publish.

Nothing is downloadable until step 3, which is the point: a release is never public
without its installers, and there is room for signing checks and manual smoke testing
in between.

Publishing a release by hand still builds and still attaches, because that was the
only trigger before this workflow existed. It skips step 1, so the versions in the
tree are whatever they already were.

### Tag Convention

Tags are the version with a `v` prefix: `v0.9.0`, `v0.9.0-alpha.1`. The synchronized
version check enforces it on every tag, so a mistagged release fails before an
installer is attached.

Three tags predate this convention and do not follow it — `0.3.0`, `0.4.0`, and
`beta` for `0.1.0`, all from the Electron era. They are left as they are: retagging
published releases breaks links that already exist and buys nothing. `v`-prefixed is
the convention from `0.9.0` onward.

### Where the Version Lives

Six files, in four notations. The bump is scripted rather than manual because missing
one is silent until something downstream fails:

| File | Notation | For |
| --- | --- | --- |
| `package.json` | `0.9.0-alpha.1` | The interface, and the source of truth |
| `src-tauri/tauri.conf.json` | `0.9.0-alpha.1` | The bundle |
| `src-tauri/Cargo.toml` | `0.9.0-alpha.1` | The crate |
| `src-tauri/Cargo.lock` | `0.9.0-alpha.1` | `--locked` builds |
| `packaging/arch/PKGBUILD` | `0.9.0_alpha.1` | `pkgver` may not contain a hyphen |
| `src-tauri/tauri.windows.conf.json` | `0.9.0.1` | WiX rejects textual prereleases |
| Git tag | `v0.9.0-alpha.1` | The release |

`Cargo.lock` is the one that used to bite: continuous integration builds `--locked`, so
a manifest bumped without its lockfile fails every Rust job — at a point where the tag
already exists. `scripts/prepare-release.cjs` writes all six, and
`scripts/check-version-sync.cjs` verifies them from a separate entry point using the
same shared rules, so the writer is checked rather than trusted.

> [!NOTE]
> The MSI version's fourth field carries the prerelease number, but MSI compares only
> the first three fields. `0.9.0-alpha.0` and `0.9.0` therefore both present as
> `0.9.0` to Windows Installer, so upgrading from that alpha to the release is not
> seen as an upgrade. No Windows package has shipped yet, so nothing is broken in the
> field; it needs a decision before one does.

## Workflow Behavior

`.github/workflows/desktop-builds.yml` runs:

- when a `v*` tag is **pushed**, or the workflow is **dispatched against a tag** —
  all three platforms, drafting the release and attaching the installers to it. Release
  prep uses the second form; see above for why;
- when a GitHub release is **published** by hand — all three platforms, attached to
  that release;
- manually through **Actions → Desktop builds → Run workflow** — all three
  platforms, workflow artifacts only;
- for pull requests that change the packaging definition itself, meaning the bundle
  configuration, build resources, distro packaging, or icon generation — Linux only,
  workflow artifacts only.

A pull request that only touches application code does not trigger packaging;
`ci.yml` covers those. Building one platform on packaging changes is enough to catch
a broken bundle definition without spending three runners per pull request.

The draft is created once, by its own job, before the matrix fans out — three jobs
each creating their own release would leave three drafts holding a third of the
installers each. Re-running the workflow for a tag reuses the existing draft rather
than adding another.

## Signing

Current CI artifacts are unsigned development builds.

- macOS users may need to approve the app through Privacy & Security until
  Apple signing and notarization are configured.
- Windows may show a SmartScreen warning until Authenticode signing is
  configured.
- Linux packages are not yet published through a signed package repository.

Signing credentials must be provided through GitHub Actions secrets and should
never be committed to the repository.
