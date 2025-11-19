import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ActiveProcessInfo, ProjectInfo, ScriptInfo } from '../types/global';
import { ConfirmModal } from './ConfirmModal';
import { AlertModal } from './AlertModal';
import { LoadingSkeleton } from './LoadingSkeleton';

interface PortsProcessesPanelProps {
  electronAPI?: Window['electronAPI'];
  selectedProject?: ProjectInfo | null;
}

function formatDuration(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function PortsProcessesPanel({ electronAPI, selectedProject }: PortsProcessesPanelProps) {
  const [processes, setProcesses] = useState<ActiveProcessInfo[]>([]);
  const [expectedPorts, setExpectedPorts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [killingPids, setKillingPids] = useState<Set<number>>(new Set());
  const [editingPorts, setEditingPorts] = useState<Record<string, string>>({});
  const [killConfirm, setKillConfirm] = useState<{ pid: number } | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const inputClass =
    'rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:ring-0';
  const cardClass =
    'rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40';

  const loadProcesses = useCallback(async () => {
    if (!electronAPI?.processes) return;
    try {
      setLoading(true);
      const data = await electronAPI.processes.active();
      setProcesses(data);
    } catch (error) {
      console.error('Error loading processes:', error);
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  }, [electronAPI]);

  const loadExpectedPorts = useCallback(async () => {
    if (!electronAPI?.scripts?.getAllExpectedPorts || !selectedProject) return;
    try {
      const ports = await electronAPI.scripts.getAllExpectedPorts(selectedProject.id);
      setExpectedPorts(ports);
    } catch (error) {
      console.error('Error loading expected ports:', error);
    }
  }, [electronAPI, selectedProject]);

  useEffect(() => {
    loadProcesses();
    // Poll every 2 seconds
    const interval = setInterval(loadProcesses, 2000);
    return () => clearInterval(interval);
  }, [loadProcesses]);

  useEffect(() => {
    loadExpectedPorts();
  }, [loadExpectedPorts]);

  const handleKillClick = useCallback((pid: number) => {
    setKillConfirm({ pid });
  }, []);

  const handleKillConfirm = useCallback(
    async () => {
      if (!electronAPI?.processes?.kill || !killConfirm) return;
      const { pid } = killConfirm;

      setKillingPids((prev) => new Set(prev).add(pid));
      try {
        const result = await electronAPI.processes.kill(pid);
        if (result.success) {
          // Reload processes after a short delay
          setTimeout(loadProcesses, 500);
        } else {
          setAlert({
            title: 'Failed to Kill Process',
            message: result.error || 'Unknown error occurred while trying to kill the process.'
          });
        }
      } catch (error) {
        console.error('Error killing process:', error);
        setAlert({
          title: 'Failed to Kill Process',
          message: 'An error occurred while trying to kill the process.'
        });
      } finally {
        setKillingPids((prev) => {
          const next = new Set(prev);
          next.delete(pid);
          return next;
        });
        setKillConfirm(null);
      }
    },
    [electronAPI, killConfirm, loadProcesses]
  );

  const handleSaveExpectedPort = useCallback(
    async (scriptName: string, portValue: string) => {
      if (!electronAPI?.scripts?.setExpectedPort || !selectedProject) return;
      const port = portValue.trim() === '' ? null : parseInt(portValue, 10);
      if (port !== null && (isNaN(port) || port < 1 || port > 65535)) {
        setAlert({
          title: 'Invalid Port',
          message: 'Port must be a number between 1 and 65535.'
        });
        return;
      }
      try {
        await electronAPI.scripts.setExpectedPort({
          projectId: selectedProject.id,
          scriptName,
          port
        });
        await loadExpectedPorts();
        setEditingPorts((prev) => {
          const next = { ...prev };
          delete next[scriptName];
          return next;
        });
      } catch (error) {
        console.error('Error saving expected port:', error);
        setAlert({
          title: 'Failed to Save Port',
          message: 'An error occurred while saving the expected port.'
        });
      }
    },
    [electronAPI, selectedProject, loadExpectedPorts]
  );

  // Separate internal and external processes
  const internalProcesses = processes.filter((p) => !p.isExternal);
  const externalProcesses = processes.filter((p) => p.isExternal);

  // Get scripts for the selected project
  const projectScripts = selectedProject?.scripts || [];

  // Find processes by script name and port
  const findProcessForScript = (scriptName: string, expectedPort: number | null) => {
    if (!expectedPort) return null;
    return processes.find((p) => p.script === scriptName && p.port === expectedPort);
  };

  if (loading && processes.length === 0 && (!selectedProject || projectScripts.length === 0)) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton lines={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {selectedProject && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Expected Ports
          </h3>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            Define expected ports for your scripts. The app will track when these ports are in use.
          </p>
          {projectScripts.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">No scripts found for this project.</p>
          ) : (
            <div className="space-y-2">
              {projectScripts.map((script) => {
                const expectedPort = expectedPorts[script.name] || null;
                const editingValue = editingPorts[script.name] ?? (expectedPort?.toString() || '');
                const isEditing = editingPorts.hasOwnProperty(script.name);
                const matchingProcess = findProcessForScript(script.name, expectedPort);

                return (
                  <motion.div
                    key={script.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  className={cardClass}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{script.name}</p>
                      <p className="mt-1 text-xs text-slate-600 font-mono truncate dark:text-slate-400">{script.command}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <input
                              type="number"
                              value={editingValue}
                              onChange={(e) =>
                                setEditingPorts((prev) => ({ ...prev, [script.name]: e.target.value }))
                              }
                              placeholder="Port"
                              min="1"
                              max="65535"
                            className={`${inputClass} w-24`}
                            />
                            <button
                              onClick={() => handleSaveExpectedPort(script.name, editingValue)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/30"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingPorts((prev) => {
                                  const next = { ...prev };
                                  delete next[script.name];
                                  return next;
                                });
                              }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {expectedPort ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                    matchingProcess
                                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200'
                                      : 'border border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-300'
                                  }`}
                                >
                                  Port: {expectedPort}
                                  {matchingProcess && ' ✓'}
                                </span>
                                <button
                                  onClick={() => setEditingPorts((prev) => ({ ...prev, [script.name]: editingValue }))}
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleSaveExpectedPort(script.name, '')}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/30"
                                  title="Remove expected port"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingPorts((prev) => ({ ...prev, [script.name]: '' }))}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                + Set Port
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Active Processes
        </h3>
        {internalProcesses.length > 0 || externalProcesses.length > 0 ? (
          <>
            {internalProcesses.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Internal Processes
              </h3>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {internalProcesses.map((process, index) => (
                <motion.div
                  key={process.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="rounded-xl border border-emerald-100 bg-white/95 p-4 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                        <p className="text-base font-semibold text-slate-900 dark:text-white">{process.script}</p>
                        {process.pid && (
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-mono text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                            PID: {process.pid}
                          </span>
                        )}
                        {process.port && (
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200">
                            Port: {process.port}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 font-mono truncate dark:text-slate-300">{process.command}</p>
                      <p className="mt-1 text-xs text-slate-500 truncate dark:text-slate-400">{process.projectPath}</p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                        <span>Started: {formatTimestamp(process.startedAt)}</span>
                        <span>•</span>
                        <span>Running: {formatDuration(process.startedAt)}</span>
                      </div>
                    </div>
                    {process.pid && (
                      <button
                        onClick={() => handleKillClick(process.pid!)}
                        disabled={killingPids.has(process.pid!)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/30"
                      >
                        {killingPids.has(process.pid!) ? 'Killing...' : 'Kill'}
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            </div>
          </div>
          )}

          {externalProcesses.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                External Processes
              </h3>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {externalProcesses.map((process, index) => (
                <motion.div
                  key={process.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="rounded-xl border border-purple-100 bg-white/95 p-4 shadow-sm dark:border-purple-500/30 dark:bg-purple-500/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                        <p className="text-base font-semibold text-slate-900 dark:text-white">{process.script}</p>
                        <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:border-purple-500/40 dark:bg-purple-500/20 dark:text-purple-200">
                          External
                        </span>
                        {process.pid && (
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-mono text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                            PID: {process.pid}
                          </span>
                        )}
                        {process.port && (
                          <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:border-purple-500/40 dark:bg-purple-500/20 dark:text-purple-200">
                            Port: {process.port}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 font-mono truncate dark:text-slate-300">{process.command}</p>
                      <p className="mt-1 text-xs text-slate-500 truncate dark:text-slate-400">{process.projectPath}</p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                        <span>Started: {formatTimestamp(process.startedAt)}</span>
                        <span>•</span>
                        <span>Running: {formatDuration(process.startedAt)}</span>
                      </div>
                    </div>
                    {process.pid && (
                      <button
                        onClick={() => handleKillClick(process.pid!)}
                        disabled={killingPids.has(process.pid!)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/30"
                      >
                        {killingPids.has(process.pid!) ? 'Killing...' : 'Kill'}
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            </div>
          </div>
          )}
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white/95 p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-sm text-slate-600 dark:text-slate-400">No active processes detected.</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Start a script or dev server to see it here.</p>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={killConfirm !== null}
        onClose={() => setKillConfirm(null)}
        onConfirm={handleKillConfirm}
        title="Kill Process"
        message={`Are you sure you want to kill process ${killConfirm?.pid}? This action cannot be undone.`}
        confirmLabel="Kill"
        confirmVariant="danger"
      />

      <AlertModal
        isOpen={alert !== null}
        onClose={() => setAlert(null)}
        title={alert?.title || ''}
        message={alert?.message || ''}
        variant="error"
      />
    </div>
  );
}

export default PortsProcessesPanel;

