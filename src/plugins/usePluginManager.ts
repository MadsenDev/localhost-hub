import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PluginManifest } from '../types/global';

const PROJECT_PLUGIN_KEY = 'enabledProjectPlugins';

export function usePluginManager(electronAPI?: Window['electronAPI']) {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabledProjectPlugins, setEnabledProjectPlugins] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!electronAPI?.plugins?.list) return;
    setLoading(true);
    setError(null);
    try {
      const list = await electronAPI.plugins.list();
      setPlugins(list);
    } catch (err) {
      console.error('Failed to load plugins', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [electronAPI]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const loadEnabled = async () => {
      if (!electronAPI?.settings?.get) return;
      try {
        const stored = await electronAPI.settings.get(PROJECT_PLUGIN_KEY);
        if (cancelled) return;
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setEnabledProjectPlugins(new Set(parsed));
          }
        }
      } catch (err) {
        console.error('Failed to load enabled plugins', err);
      }
    };
    loadEnabled();
    return () => {
      cancelled = true;
    };
  }, [electronAPI]);

  const persistEnabled = useCallback(
    (next: Set<string>) => {
      if (!electronAPI?.settings?.set) return;
      electronAPI.settings
        .set({ key: PROJECT_PLUGIN_KEY, value: JSON.stringify([...next]) })
        .catch((err) => console.error('Failed to persist enabled plugins', err));
    },
    [electronAPI]
  );

  const setProjectPluginEnabled = useCallback(
    (pluginId: string, enabled: boolean) => {
      setEnabledProjectPlugins((prev) => {
        const next = new Set(prev);
        if (enabled) {
          next.add(pluginId);
        } else {
          next.delete(pluginId);
        }
        persistEnabled(next);
        return next;
      });
    },
    [persistEnabled]
  );

  const pluginMap = useMemo(() => new Map(plugins.map((plugin) => [plugin.id, plugin] as const)), [plugins]);

  const launchPlugin = useCallback(
    (pluginId: string, context?: Record<string, string>) => {
      if (!electronAPI?.plugins?.launchExternal) {
        throw new Error('Plugin launching is unavailable in this build.');
      }
      return electronAPI.plugins.launchExternal(pluginId, context ?? {});
    },
    [electronAPI]
  );

  return {
    plugins,
    pluginMap,
    loading,
    error,
    refresh,
    launchPlugin,
    enabledProjectPlugins,
    setProjectPluginEnabled,
  };
}
