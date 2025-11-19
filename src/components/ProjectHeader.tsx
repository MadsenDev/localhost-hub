import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { ProjectInfo, ActiveProcessInfo, GitStatusInfo } from '../types/global';

interface ProjectHeaderProps {
  project: ProjectInfo;
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
  onRestartScript: () => void;
  electronAPI?: Window['electronAPI'];
}

function formatDuration(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function ProjectHeader({
  project,
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
  onRestartScript,
  electronAPI
}: ProjectHeaderProps) {
  const [packageManager, setPackageManager] = useState<'npm' | 'pnpm' | 'yarn' | 'bun' | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

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
          {hasRunningScript && primaryProcess && (
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
          )}
          {browserUrl && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onOpenInBrowser(browserUrl)}
              className="rounded-lg border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-700 dark:text-indigo-200 transition hover:bg-indigo-100 dark:hover:bg-indigo-500/30 whitespace-nowrap"
            >
              🌐 Open in Browser
            </motion.button>
          )}
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

