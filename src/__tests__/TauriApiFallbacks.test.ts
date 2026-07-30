import { describe, expect, it } from 'vitest';
import { tauriApi, listenToServiceEvents } from '../tauri-api';
import { buildProjectRuntimeServices } from '../project-runtime';

// These tests run in jsdom, where `window.__TAURI_INTERNALS__` is absent, so the
// module takes its no-backend path — the same path used by plain `vite` dev and
// by the Electron shell.

describe('tauri-api without a native backend', () => {
  it('resolves read commands to type-correct empty values, never null', async () => {
    const [ports, processes, managed, groups, roots, repos, health, conflicts] =
      await Promise.all([
        tauriApi.scanPorts(),
        tauriApi.getProcesses(),
        tauriApi.listManagedServices(),
        tauriApi.scanWorkspaceGroups(['/tmp']),
        tauriApi.findDefaultWorkspaceRoots(),
        tauriApi.listGitHubRepos(),
        tauriApi.analyzeRepositoryHealth(['/tmp']),
        tauriApi.checkPortConflicts([3000]),
      ]);

    for (const value of [ports, processes, managed, groups, roots, repos, health, conflicts]) {
      expect(Array.isArray(value)).toBe(true);
      expect(value).toHaveLength(0);
    }
  });

  it('returns a usable SystemStats shape rather than null', async () => {
    const stats = await tauriApi.getSystemStats();
    expect(stats).not.toBeNull();
    expect(stats.load_avg).toHaveLength(3);
    expect(stats.memory_total_mb).toBe(0);
  });

  it('keeps getGitStatus nullable, as its signature declares', async () => {
    await expect(tauriApi.getGitStatus('/tmp')).resolves.toBeNull();
  });

  it('rejects commands that cannot be faked, instead of resolving null', async () => {
    await expect(tauriApi.startService('s', '/tmp', 'true', { inherit_system: true, vars: [] }, [], false))
      .rejects.toThrow(/unavailable outside the desktop app/);
    await expect(tauriApi.commitGitChanges('/tmp', 'msg'))
      .rejects.toThrow(/unavailable outside the desktop app/);
    await expect(tauriApi.openUrl('http://localhost:3000'))
      .rejects.toThrow(/unavailable outside the desktop app/);
  });

  it('yields a no-op unsubscribe from the event listener', async () => {
    const unlisten = await listenToServiceEvents(() => {});
    expect(() => unlisten()).not.toThrow();
  });

  it('feeds the runtime builder without throwing — the regression this guards', async () => {
    // Previously every command resolved `null as T`, so the polling tick in
    // App.tsx passed null into this builder and threw
    // "Cannot read properties of null (reading 'map')".
    const [processes, ports, managed] = await Promise.all([
      tauriApi.getProcesses(),
      tauriApi.scanPorts(),
      tauriApi.listManagedServices(),
    ]);

    expect(() =>
      buildProjectRuntimeServices([], [], managed, processes, ports),
    ).not.toThrow();
  });
});
