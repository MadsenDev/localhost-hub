# Localhost Hub

Localhost Hub is an Electron + React desktop workspace for discovering, organizing, and running your local development projects. The app is still in the early scaffold stage, but it already ships with a modern renderer shell that reflects the core layout described in `PROJECT.md` and a secure preload layer for IPC experiments.

## Getting started

```bash
npm install
npm run dev
```

Running `npm run dev` starts Vite in development mode and boots Electron with live reloading for the main, preload, and renderer processes. The UI renders a sidebar with sample projects plus script/activity/log panels so we can iterate on real layouts before wiring up data.

To produce a production build run:

```bash
npm run build
```

The command emits bundled renderer assets to `dist/renderer` along with compiled Electron entry points in `dist-electron` via `vite-plugin-electron`.
