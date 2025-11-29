
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiRefreshCcw, FiX, FiCpu, FiExternalLink } from 'react-icons/fi';
import type { PluginManifest } from '../types/global';

type PluginGalleryProps = {
  isOpen: boolean;
  onClose: () => void;
  plugins: PluginManifest[];
  onLaunch: (plugin: PluginManifest, context?: Record<string, string>) => void;
  onRefresh: () => void;
  loading?: boolean;
  error?: string | null;
  selectedProjectPath?: string | null;
  enabledProjectPlugins: Set<string>;
  onToggleProjectPlugin: (pluginId: string, enabled: boolean) => void;
};

export function PluginGallery({
  isOpen,
  onClose,
  plugins,
  onLaunch,
  onRefresh,
  loading,
  error,
  selectedProjectPath,
  enabledProjectPlugins,
  onToggleProjectPlugin,
}: PluginGalleryProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return plugins;
    return plugins.filter(
      (plugin) =>
        plugin.name.toLowerCase().includes(needle) ||
        (plugin.description ?? '').toLowerCase().includes(needle) ||
        (plugin.author ?? '').toLowerCase().includes(needle)
    );
  }, [plugins, query]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-end bg-slate-950/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="h-full w-full max-w-3xl border-l border-slate-800 bg-slate-900 text-slate-100 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Plugin marketplace</p>
                <h2 className="text-2xl font-semibold text-white">Installed plugins</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onRefresh}
                  disabled={loading}
                  className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FiRefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="border-b border-slate-800 px-6 py-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search plugins"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
              />
              {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
            </div>
            <div className="h-[calc(100%-140px)] space-y-4 overflow-auto px-6 py-6">
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
                  {plugins.length === 0
                    ? 'No plugins discovered yet. Drop plugin folders into the plugins directory to get started.'
                    : 'No plugins matched your search.'}
                </div>
              ) : (
                filtered.map((plugin) => {
                  const hasProjectActions = (plugin.launch?.projectActions?.length ?? 0) > 0;
                  const requiresProject = plugin.launch?.requiredContext?.includes('projectPath');
                  const missingProject = requiresProject && !selectedProjectPath;
                  const galleryEnabled = plugin.launch?.gallery !== false && Boolean(plugin.launch?.targets);
                  const launchDisabled = !galleryEnabled || missingProject;
                  const buttonLabel = missingProject ? 'Select a project' : 'Launch';
                  const projectIntegrationEnabled = enabledProjectPlugins.has(plugin.id);
                  return (
                    <div
                      key={plugin.id}
                      className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-inner shadow-slate-950/40 md:flex-row md:items-center"
                    >
                      <div className="flex items-center gap-4">
                        {plugin.iconDataUrl ? (
                          <img
                            src={plugin.iconDataUrl}
                            alt=""
                            className="h-14 w-14 rounded-xl border border-slate-800 bg-slate-900 object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-500">
                            <FiCpu className="h-5 w-5" />
                          </div>
                        )}
                        <div>
                          <p className="text-lg font-semibold text-white">{plugin.name}</p>
                          <p className="text-xs text-slate-400">
                            {plugin.version ?? '0.0.0'} · {plugin.source === 'builtin' ? 'Built-in' : 'User'}
                          </p>
                        </div>
                      </div>
                      <p className="flex-1 text-sm text-slate-300">{plugin.description || 'No description provided.'}</p>
                      <div className="flex flex-col gap-2 md:w-60">
                        {galleryEnabled && (
                          <button
                            onClick={() =>
                              onLaunch(
                                plugin,
                                missingProject || !selectedProjectPath ? undefined : { projectPath: selectedProjectPath }
                              )
                            }
                            disabled={launchDisabled}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-800/40 disabled:text-slate-500"
                          >
                            <FiExternalLink className="h-4 w-4" />
                            {buttonLabel}
                          </button>
                        )}
                        {missingProject && (
                          <p className="text-[11px] text-amber-300">Select a project with a path to enable launching.</p>
                        )}
                        {plugin.capabilities && plugin.capabilities.length > 0 && (
                          <p className="text-[11px] text-slate-500">
                            Needs {plugin.capabilities.map((cap) => cap.replace(/_/g, ' ')).join(', ')}
                          </p>
                        )}
                        {hasProjectActions && (
                          <label className="mt-1 flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 px-3 py-2 text-xs">
                            <span className="text-slate-300">Show in project menu</span>
                            <input
                              type="checkbox"
                              checked={projectIntegrationEnabled}
                              onChange={(event) => onToggleProjectPlugin(plugin.id, event.target.checked)}
                              className="h-4 w-4 accent-emerald-400"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
