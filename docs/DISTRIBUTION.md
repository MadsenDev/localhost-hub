# Desktop Distribution

Localhost Hub is built natively for Linux, macOS, and Windows by GitHub Actions.
Packaging is driven by Releases: publishing a GitHub release builds every platform
and attaches the installers to that release. Every run also keeps its installers as
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

## Workflow Behavior

`.github/workflows/desktop-builds.yml` runs:

- when a GitHub release is **published** — all three platforms, with the installers
  attached to that release;
- manually through **Actions → Desktop builds → Run workflow** — all three
  platforms, workflow artifacts only;
- for pull requests that change the packaging definition itself, meaning the bundle
  configuration, build resources, distro packaging, or icon generation — Linux only,
  workflow artifacts only.

A pull request that only touches application code does not trigger packaging;
`ci.yml` covers those. Building one platform on packaging changes is enough to catch
a broken bundle definition without spending three runners per pull request.

The release tag must exactly match the synchronized application version. The version
check runs before anything is attached, so a mistagged release fails rather than
publishing mismatched installers:

```text
package.json                 0.9.0-alpha.0
src-tauri/tauri.conf.json    0.9.0-alpha.0
src-tauri/Cargo.toml         0.9.0-alpha.0
packaging/arch/PKGBUILD      0.9.0_alpha.0
Git tag                      v0.9.0-alpha.0
```

WiX/MSI does not accept textual SemVer prerelease identifiers. Its
platform-specific Tauri configuration therefore uses the numeric MSI version
`0.9.0.0`. The synchronization check derives and validates this mapping; it
does not change the public application version.

Because builds attach to a release rather than create one, the ordering is: draft the
release with its notes, publish it, and the installers arrive as the matrix finishes.
Keeping it a draft until the packages land leaves room for signing checks and manual
smoke testing before anyone can download it.

## Signing

Current CI artifacts are unsigned development builds.

- macOS users may need to approve the app through Privacy & Security until
  Apple signing and notarization are configured.
- Windows may show a SmartScreen warning until Authenticode signing is
  configured.
- Linux packages are not yet published through a signed package repository.

Signing credentials must be provided through GitHub Actions secrets and should
never be committed to the repository.
