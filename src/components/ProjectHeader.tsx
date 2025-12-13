import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiCpu, FiExternalLink, FiZap } from 'react-icons/fi';
import type {
  ProjectInfo,
  ActiveProcessInfo,
  GitStatusInfo,
  PluginManifest,
  PluginProjectAction,
} from '../types/global';

type ProjectPluginMenuEntry = {
  plugin: PluginManifest;
  action: PluginProjectAction;
  context: Record<string, string>;
};

interface ProjectHeaderProps {
  project: ProjectInfo;
  projectPluginActions?: ProjectPluginMenuEntry[];
  scriptInFlight: string | null;
  activeProcesses: ActiveProcessInfo[];
  expectedPorts: Record<string, number>;
  detectedUrl: string | null;
  currentRunId: string | null;
  gitStatus: GitStatusInfo | null;
  gitStatusLoading?: boolean;
  onRefreshGit?: () => void;
  onOpenInBrowser: (url: string) => void;
  onInstall: (packageManager: string) => void;
  onStopScript: () => void;
  onForceStopScript: () => void;
  onRestartScript: () => void;
  electronAPI?: Window['electronAPI'];
  forceStopReady: boolean;
  onLaunchPlugin?: (plugin: PluginManifest, context: Record<string, string>) => void;
}

function formatDuration(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

const CONTEXT_LABELS: Record<string, string> = {
  projectPath: 'Project path',
};

function formatContextLabel(key: string): string {
  if (CONTEXT_LABELS[key]) {
    return CONTEXT_LABELS[key];
  }
  const withSpaces = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
  if (!withSpaces) return key;
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

export function ProjectHeader({
  project,
  projectPluginActions = [],
  scriptInFlight,
  activeProcesses,
  expectedPorts,
  detectedUrl,
  currentRunId,
  gitStatus,
  gitStatusLoading,
  onRefreshGit,
  onOpenInBrowser,
  onInstall,
  onStopScript,
  onForceStopScript,
  onRestartScript,
  electronAPI,
  forceStopReady,
  onLaunchPlugin,
}: ProjectHeaderProps) {
  const [packageManager, setPackageManager] = useState<'npm' | 'pnpm' | 'yarn' | 'bun' | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [pluginMenuOpen, setPluginMenuOpen] = useState(false);
  const pluginMenuRef = useRef<HTMLDivElement | null>(null);
  const pluginActionGroups = useMemo(() => {
    if (!projectPluginActions.length) return [];
    const grouped = new Map<string, { plugin: PluginManifest; actions: ProjectPluginMenuEntry[] }>();
    projectPluginActions.forEach((entry) => {
      const existing = grouped.get(entry.plugin.id);
      if (existing) {
        existing.actions.push(entry);
        return;
      }
      grouped.set(entry.plugin.id, { plugin: entry.plugin, actions: [entry] });
    });
    return Array.from(grouped.values());
  }, [projectPluginActions]);
  const pluginActionCount = projectPluginActions.length;

  useEffect(() => {
    if (!electronAPI?.scripts?.detectPackageManager) return;
    setIsDetecting(true);
    electronAPI.scripts
      .detectPackageManager(project.path)
      .then((pm) => {
        setPackageManager(pm);
        setIsDetecting(false);
      })
      .catch(() => {
        setIsDetecting(false);
      });
  }, [electronAPI, project.path]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (pluginMenuRef.current && !pluginMenuRef.current.contains(event.target as Node)) {
        setPluginMenuOpen(false);
      }
    }
    if (!pluginMenuOpen) {
      return undefined;
    }
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [pluginMenuOpen]);
  useEffect(() => {
    if (!pluginMenuOpen) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPluginMenuOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pluginMenuOpen]);
  const handlePluginLaunch = useCallback(
    (entry: ProjectPluginMenuEntry) => {
      onLaunchPlugin?.(entry.plugin, entry.context);
      setPluginMenuOpen(false);
    },
    [onLaunchPlugin]
  );
  // Find processes running for this project
  const projectProcesses = useMemo(() => {
    return activeProcesses.filter((p) => p.projectPath === project.path && !p.isExternal);
  }, [activeProcesses, project.path]);

  // Find the primary running process (the one matching scriptInFlight or first one)
  const primaryProcess = useMemo(() => {
    if (scriptInFlight) {
      return projectProcesses.find((p) => p.script === scriptInFlight) || projectProcesses[0];
    }
    return projectProcesses[0];
  }, [projectProcesses, scriptInFlight]);

  // Determine if we can open in browser (has a port or script name suggests dev server)
  const browserUrl = useMemo(() => {
    if (detectedUrl) {
      return detectedUrl;
    }
    const buildUrl = (port: number | undefined | null) => (port ? `http://localhost:${port}` : null);

    const processesToScan = activeProcesses.filter((p) => p.projectPath === project.path);
    const allPorts = [
      primaryProcess?.port,
      ...projectProcesses.map((proc) => proc.port),
      ...processesToScan.filter((proc) => proc.isExternal).map((proc) => proc.port)
    ].filter((port): port is number => Boolean(port));
    if (allPorts.length > 0) {
      return buildUrl(allPorts[0]);
    }

    if (primaryProcess?.script) {
      const scriptExpected = expectedPorts[primaryProcess.script];
      if (scriptExpected) {
        return buildUrl(scriptExpected);
      }
    }

    const runningExpected = projectProcesses
      .map((proc) => (proc.script ? expectedPorts[proc.script] : null))
      .filter((port): port is number => Boolean(port));
    if (runningExpected.length > 0) {
      return buildUrl(runningExpected[0]);
    }

    const anyExpected = Object.values(expectedPorts).find(Boolean);
    if (anyExpected) {
      return buildUrl(anyExpected);
    }

    if (primaryProcess?.command?.toLowerCase().includes('vite')) {
      const vitePorts = [primaryProcess.port, 5173, 5174, 5175].filter(Boolean) as number[];
      const portFromActive = vitePorts.find((port) =>
        activeProcesses.some((proc) => proc.port === port && proc.projectPath === project.path)
      );
      return buildUrl(portFromActive ?? 5173);
    }

    return null;
  }, [detectedUrl, primaryProcess, projectProcesses, expectedPorts, activeProcesses, project.path]);

  // Get expected port for the running script
  const expectedPort = useMemo(() => {
    if (!primaryProcess?.script) return null;
    return expectedPorts[primaryProcess.script] || null;
  }, [primaryProcess, expectedPorts]);

  const hasRunningScript = Boolean(primaryProcess);
  const isPortMatch = primaryProcess?.port && expectedPort && primaryProcess.port === expectedPort;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/40 p-6 shadow-sm dark:shadow-inner">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white truncate">{project.name}</h2>
            {hasRunningScript && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2"
              >
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
                </span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">Running</span>
              </motion.div>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-mono truncate mb-4">{project.path}</p>

          {gitStatusLoading && !gitStatus && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
              <span className="inline-flex h-4 w-4 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-transparent animate-spin" />
              <span>Checking git status…</span>
            </div>
          )}

          {gitStatus && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {gitStatus.isRepo ? (
                <>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 px-3 py-1.5">
                    <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Git</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{gitStatus.branch ?? 'detached'}</span>
                    {typeof gitStatus.ahead === 'number' && gitStatus.ahead > 0 && (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">↑{gitStatus.ahead}</span>
                    )}
                    {typeof gitStatus.behind === 'number' && gitStatus.behind > 0 && (
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-300">↓{gitStatus.behind}</span>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      gitStatus.dirty
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-200 border border-amber-200 dark:border-amber-400/40'
                        : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-400/40'
                    }`}
                  >
                    {gitStatus.dirty ? 'Uncommitted changes' : 'Clean working tree'}
                  </span>
                  {gitStatus.lastCommit && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {gitStatus.lastCommit.hash}{' '}
                      <span className="text-slate-400 dark:text-slate-500">•</span> {gitStatus.lastCommit.message}
                      <span className="text-slate-400 dark:text-slate-500"> ({gitStatus.lastCommit.relativeTime})</span>
                    </div>
                  )}
                  {onRefreshGit && (
                    <button
                      onClick={onRefreshGit}
                      disabled={gitStatusLoading}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:opacity-50"
                    >
                      {gitStatusLoading ? 'Refreshing…' : 'Refresh git status'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm text-slate-500 dark:text-slate-400">Git repo not detected for this project.</span>
                  {onRefreshGit && (
                    <button
                      onClick={onRefreshGit}
                      disabled={gitStatusLoading}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:opacity-50"
                    >
                      {gitStatusLoading ? 'Checking…' : 'Check again'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {hasRunningScript && primaryProcess && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5">
                <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-200">{primaryProcess.script}</span>
                {primaryProcess.pid && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">PID: {primaryProcess.pid}</span>
                )}
                {primaryProcess.port && (
                  <span className="text-xs text-indigo-600 dark:text-indigo-300 font-mono">Port: {primaryProcess.port}</span>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400">•</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Running: {formatDuration(primaryProcess.startedAt)}</span>
              </div>
              {isPortMatch && (
                <span className="rounded-lg bg-emerald-100 dark:bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                  Expected port ✓
                </span>
              )}
            </div>
          )}

          {project.scripts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {project.scripts.map((script) => {
                const isRunning = projectProcesses.some((p) => p.script === script.name);
                const scriptExpectedPort = expectedPorts[script.name];
                return (
                  <div
                    key={script.name}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${
                      isRunning
                        ? 'border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {script.name}
                    {scriptExpectedPort && (
                      <span className="ml-1.5 text-slate-500 dark:text-slate-500">({scriptExpectedPort})</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {pluginActionCount > 0 && (
            <div
              className="relative"
              onMouseEnter={() => setPluginMenuOpen(true)}
              onMouseLeave={() => setPluginMenuOpen(false)}
              ref={pluginMenuRef}
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPluginMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-emerald-300 dark:hover:border-emerald-400/60 whitespace-nowrap"
                aria-expanded={pluginMenuOpen}
                aria-label="Project plugins menu"
              >
                <span aria-hidden="true">🔌</span>
                Plugins
                <span className="rounded-full bg-slate-100 px-2 py-[1px] text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-100">
                  {pluginActionCount > 99 ? '99+' : pluginActionCount}
                </span>
              </motion.button>
              <AnimatePresence>
                {pluginMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[90vw] rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-2xl dark:border-slate-700/80 dark:bg-slate-900/95"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                          Project plugins
                        </p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">Launch contextual tools</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                        {pluginActionCount} {pluginActionCount === 1 ? 'action' : 'actions'}
                      </span>
                    </div>
                    <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                      {pluginActionGroups.map(({ plugin, actions }) => (
                        <div
                          key={plugin.id}
                          className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/40"
                        >
                          <div className="flex items-start gap-3">
                            {plugin.iconDataUrl ? (
                              <img
                                src={plugin.iconDataUrl}
                                alt=""
                                className="h-10 w-10 rounded-xl border border-slate-200 bg-white object-cover dark:border-slate-700 dark:bg-slate-900"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                                <FiCpu className="h-4 w-4" />
                              </div>
                            )}
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{plugin.name}</p>
                              {plugin.description && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{plugin.description}</p>
                              )}
                            </div>
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              {actions.length === 1 ? '1 action' : `${actions.length} actions`}
                            </span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {actions.map((entry) => {
                              const contextKeys = Object.keys(entry.context ?? {});
                              return (
                                <button
                                  key={`${entry.plugin.id}-${entry.action.id}`}
                                  onClick={() => handlePluginLaunch(entry)}
                                  className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-emerald-300 hover:bg-emerald-50/70 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-emerald-400/40 dark:hover:bg-emerald-500/10"
                                >
                                  <span className="mt-1 text-emerald-500 dark:text-emerald-300">
                                    <FiZap className="h-4 w-4" />
                                  </span>
                                  <div className="flex-1">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                      {entry.action.label}
                                    </p>
                                    {entry.action.description && (
                                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                        {entry.action.description}
                                      </p>
                                    )}
                                    {contextKeys.length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-1.5">
                                        {contextKeys.map((ctx) => (
                                          <span
                                            key={ctx}
                                            className="rounded-full bg-emerald-100 px-2 py-[2px] text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                                          >
                                            {formatContextLabel(ctx)}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <FiExternalLink className="mt-0.5 h-4 w-4 text-slate-400 transition group-hover:text-emerald-500 dark:text-slate-500" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {hasRunningScript && primaryProcess && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onStopScript}
                disabled={!currentRunId}
                className="rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-600 dark:text-rose-300 transition hover:bg-rose-100 dark:hover:bg-rose-500/30 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                ⏹ Stop
              </motion.button>
              {forceStopReady && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onForceStopScript}
                  className="rounded-lg border border-rose-500/60 dark:border-rose-400/60 bg-rose-600 text-white dark:bg-rose-500 px-4 py-2 text-sm font-semibold transition hover:bg-rose-700 dark:hover:bg-rose-400 whitespace-nowrap"
                >
                  ⚠ Force Stop
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onRestartScript}
                disabled={!currentRunId}
                className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-600 dark:text-amber-300 transition hover:bg-amber-100 dark:hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                🔄 Restart
              </motion.button>
              </div>
              {forceStopReady && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">Process is taking longer than expected. Force stop is available.</p>
              )}
            </div>
          )}
          {browserUrl && (
            <motion.button
              data-tour="open-in-browser"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onOpenInBrowser(browserUrl)}
              className="rounded-lg border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-700 dark:text-indigo-200 transition hover:bg-indigo-100 dark:hover:bg-indigo-500/30 whitespace-nowrap"
            >
              🌐 Open in Browser
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              if (electronAPI?.shell?.openPath) {
                await electronAPI.shell.openPath(project.path);
              }
            }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-indigo-300 dark:hover:bg-slate-800 whitespace-nowrap"
            title="Open project folder in file explorer"
          >
            📁 Open Folder
          </motion.button>
          {packageManager && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onInstall(packageManager)}
              disabled={scriptInFlight === 'install'}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-indigo-300 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {scriptInFlight === 'install' ? 'Installing...' : `📦 ${packageManager} install`}
            </motion.button>
          )}
          {primaryProcess && (
            <div className="text-right">
              <p className="text-xs text-slate-500">Started {new Date(primaryProcess.startedAt).toLocaleTimeString()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectHeader;

