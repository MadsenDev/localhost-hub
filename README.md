# Localhost Hub

Localhost Hub is an Electron + React desktop workspace for discovering, organizing, and running your local development projects. The app is still in the early scaffold stage, but it already ships with a modern renderer shell that reflects the core layout described in `PROJECT.md` and a secure preload layer for IPC experiments.

## Getting started

```bash
npm install
npm run dev
```

Running `npm run dev` starts Vite in development mode and boots Electron with live reloading for the main, preload, and renderer processes. The UI renders a sidebar with sample projects plus script/activity/log panels so we can iterate on real layouts before wiring up data.

### Packaging

Build renderer + main bundles:

```bash
npm run build
```

Generate platform installers (requires `npm run build` first):

| Command | Notes |
| --- | --- |
| `npm run build:linux` | AppImage + .deb |
| `npm run build:mac` | universal macOS dmg |
| `npm run build:win` | Windows NSIS installer (expects signing env vars if `WIN_SIGN=true`) |
| `npm run build:win:unsigned` | Windows ZIP (no signing, works on Linux CI) |
| `npm run build:all` | mac + linux + signed Windows |
| `npm run build:all:unsigned` | mac + linux + unsigned Windows |

All installers land in `release/`.
