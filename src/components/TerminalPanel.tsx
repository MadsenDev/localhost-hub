import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectInfo } from '../types/global';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

type TerminalSessionMeta = {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
  exited?: boolean;
  exitCode?: number | null;
};

type TerminalResource = {
  terminal: Terminal;
  fit: FitAddon;
  opened: boolean;
  resizeObserver?: ResizeObserver;
};

interface TerminalPanelProps {
  project: ProjectInfo;
  electronAPI?: Window['electronAPI'];
}

export function TerminalPanel({ project, electronAPI }: TerminalPanelProps) {
  const [sessions, setSessions] = useState<TerminalSessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const resourcesRef = useRef<Map<string, TerminalResource>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const hasTerminalApi = Boolean(electronAPI?.terminal);

  const handleCreateSession = useCallback(async () => {
    if (!electronAPI?.terminal) {
      return;
    }
    try {
      const response = await electronAPI.terminal.createSession({ cwd: project.path });
      const sessionId = response.id;

    const terminal = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        cursorAccent: '#0f172a'
      }
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);

    terminal.onData((data) => {
      electronAPI.terminal?.sendInput({ id: sessionId, data });
    });

    resourcesRef.current.set(sessionId, {
      terminal,
      fit,
      opened: false
    });

      setSessions((prev) => [
        ...prev,
        {
          id: sessionId,
          title: `Terminal ${prev.length + 1}`,
          cwd: project.path,
          createdAt: Date.now()
        }
      ]);
      setActiveSessionId(sessionId);
      setError(null);
    } catch (err) {
      console.error('Failed to create terminal session', err);
      setError(err instanceof Error ? err.message : 'Unable to start terminal session.');
    }
  }, [electronAPI, project.path]);

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      const resource = resourcesRef.current.get(sessionId);
      resource?.resizeObserver?.disconnect();
      resource?.terminal.dispose();
      resourcesRef.current.delete(sessionId);
      await electronAPI?.terminal?.dispose(sessionId);
      setSessions((prev) => {
        const remaining = prev.filter((session) => session.id !== sessionId);
        setActiveSessionId((current) => {
          if (current !== sessionId) {
            return current;
          }
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        });
        return remaining;
      });
    },
    [electronAPI]
  );

  const attachTerminal = useCallback(
    (sessionId: string, node: HTMLDivElement | null) => {
      const resource = resourcesRef.current.get(sessionId);
      if (!resource) {
        return;
      }

      resource.resizeObserver?.disconnect();
      resource.resizeObserver = undefined;

      if (node && !resource.opened) {
        resource.terminal.open(node);
        resource.opened = true;
        resource.fit.fit();
        electronAPI?.terminal?.resize({
          id: sessionId,
          columns: resource.terminal.cols,
          rows: resource.terminal.rows
        });
      }

      if (node) {
        const observer = new ResizeObserver(() => {
          resource.fit.fit();
          electronAPI?.terminal?.resize({
            id: sessionId,
            columns: resource.terminal.cols,
            rows: resource.terminal.rows
          });
        });
        observer.observe(node);
        resource.resizeObserver = observer;
      }
    },
    [electronAPI]
  );

  useEffect(() => {
    if (!electronAPI?.terminal) {
      return;
    }
    const offData = electronAPI.terminal.onData(({ id, data }) => {
      const resource = resourcesRef.current.get(id);
      resource?.terminal.write(data);
    });
    const offExit = electronAPI.terminal.onExit(({ id, exitCode }) => {
      const resource = resourcesRef.current.get(id);
      if (resource) {
        resource.terminal.write(`\r\n[process exited with code ${exitCode ?? 0}]\r\n`);
      }
      setSessions((prev) =>
        prev.map((session) => (session.id === id ? { ...session, exited: true, exitCode } : session))
      );
    });
    return () => {
      offData?.();
      offExit?.();
    };
  }, [electronAPI]);

  useEffect(() => {
    return () => {
      resourcesRef.current.forEach((resource, id) => {
        resource.resizeObserver?.disconnect();
        resource.terminal.dispose();
        electronAPI?.terminal?.dispose(id);
      });
      resourcesRef.current.clear();
    };
  }, [electronAPI]);

  useEffect(() => {
    if (activeSessionId && !sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions.length > 0 ? sessions[sessions.length - 1].id : null);
    }
  }, [activeSessionId, sessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Embedded terminal</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Runs inside {project.path}</p>
        </div>
        <button
          onClick={handleCreateSession}
          disabled={!hasTerminalApi}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-indigo-500/40"
        >
          + New terminal
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
          {error}
        </div>
      )}

      {!hasTerminalApi && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          Embedded terminals require the Electron bridge. Reopen the desktop app to use this feature.
        </div>
      )}

      {sessions.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                  session.id === activeSessionId
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
                }`}
              >
                <button onClick={() => setActiveSessionId(session.id)} className="font-semibold">
                  {session.title}
                </button>
                {session.exited && (
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    exited {session.exitCode ?? 0}
                  </span>
                )}
                <button
                  onClick={() => handleCloseSession(session.id)}
                  className="text-slate-400 hover:text-rose-500"
                  title="Close terminal"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-950/90 p-3 dark:border-slate-800">
            {sessions.map((session) => (
              <div key={session.id} className={session.id === activeSessionId ? 'h-96' : 'hidden'}>
                <div
                  ref={(node) => attachTerminal(session.id, node)}
                  className="h-full w-full rounded-xl bg-slate-900"
                />
              </div>
            ))}
            {!activeSession && <div className="h-96 rounded-xl border border-dashed border-slate-800" />}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
          No terminals yet. Use “New terminal” to start an interactive shell in this project directory.
        </div>
      )}
    </div>
  );
}

export default TerminalPanel;

