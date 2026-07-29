# Desktop Distribution

Localhost Hub is built natively for Linux, macOS, and Windows by GitHub Actions.
Every desktop packaging run keeps its installers as downloadable workflow
artifacts. A version tag also creates a draft GitHub release and attaches the
same packages.

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

- for pull requests that change desktop code or packaging;
- manually through **Actions → Desktop builds → Run workflow**;
- for tags matching `v*`.

Pull-request and manual runs produce workflow artifacts without publishing a
release. Version tags must exactly match the synchronized application version,
for example:

```text
package.json                 0.9.0-alpha.0
src-tauri/tauri.conf.json    0.9.0-alpha.0
src-tauri/Cargo.toml         0.9.0-alpha.0
packaging/arch/PKGBUILD      0.9.0_alpha.0
Git tag                      v0.9.0-alpha.0
```

Tag builds create or update a **draft** GitHub release. This leaves room for
release notes, signing checks, and manual smoke testing before publication.

## Signing

Current CI artifacts are unsigned development builds.

- macOS users may need to approve the app through Privacy & Security until
  Apple signing and notarization are configured.
- Windows may show a SmartScreen warning until Authenticode signing is
  configured.
- Linux packages are not yet published through a signed package repository.

Signing credentials must be provided through GitHub Actions secrets and should
never be committed to the repository.
