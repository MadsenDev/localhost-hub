import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectInfo, ScriptInfo } from './types/global';

type RunHistory = {
  id: string;
  script: string;
  status: 'Success' | 'Failed';
  startedAt: number;
  finishedAt: number;
  exitCode: number | null;
};

const statusColor: Record<RunHistory['status'], string> = {
  Success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  Failed: 'bg-rose-500/10 text-rose-200 border-rose-500/40'
};

const STORAGE_KEY = 'localhost-hub:scan-directories';

const mockProjects: ProjectInfo[] = [
  {
    id: 'mock-app',
    name: 'Localhost Hub (preview)',
    path: '/Users/dev/projects/localhost-hub',
    type: 'React + Vite',
    tags: ['TypeScript'],
    scripts: [
      {
        name: 'dev',
        command: 'vite dev',
        description: 'Starts the Vite development server.'
      },
      {
        name: 'build',
        command: 'vite build',
        description: 'Creates an optimized production build.'
      }
    ]
  },
  {
    id: 'mock-api',
    name: 'Payments API',
    path: '/Users/dev/projects/payments-api',
    type: 'Node Project',
    tags: ['TypeScript'],
    scripts: [
      { name: 'dev', command: 'npm run dev', description: 'Run API in watch mode.' },
      { name: 'test', command: 'npm run test', description: 'Execute unit tests.' }
    ]
  }
];

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        {action ?? null}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-inner">{children}</div>
    </section>
  );
}

function parseDirectories(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function App() {
  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const isMockMode = !electronAPI;

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [pingResponse, setPingResponse] = useState<string>('…');
  const [query, setQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scriptInFlight, setScriptInFlight] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<RunHistory[]>([]);
  const [logOutput, setLogOutput] = useState('Select a script to run and view logs.');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanDirectories, setScanDirectories] = useState<string[] | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as string[];
    } catch {
      return null;
    }
  });
  const [showSetup, setShowSetup] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !window.localStorage.getItem(STORAGE_KEY);
  });
  const [setupInput, setSetupInput] = useState(() => (scanDirectories ?? []).join('\n'));
  const [setupError, setSetupError] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState<{ id: string; script: string } | null>(null);

  const logContainerRef = useRef<HTMLPreElement | null>(null);
  const currentRunRef = useRef<string | null>(null);

  useEffect(() => {
    currentRunRef.current = currentRun?.id ?? null;
  }, [currentRun]);

  useEffect(() => {
    const element = logContainerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [logOutput]);

  useEffect(() => {
    if (!electronAPI) {
      setPingResponse('mock');
      return;
    }
    let ignore = false;
    electronAPI
      .ping()
      .then((result) => !ignore && setPingResponse(result))
      .catch(() => !ignore && setPingResponse('offline'));
    return () => {
      ignore = true;
    };
  }, [electronAPI]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (scanDirectories) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scanDirectories));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [scanDirectories]);

  useEffect(() => {
    if (isMockMode) {
      setProjects(mockProjects);
      setSelectedProjectId(mockProjects[0]?.id ?? null);
      setScanError('Electron bridge not detected. Showing preview data only.');
      setIsScanning(false);
      return;
    }
    if (!electronAPI) {
      return;
    }
    if (scanDirectories === null) {
      setProjects([]);
      setScanError('Choose one or more directories to begin scanning.');
      return;
    }

    let ignore = false;
    const performScan = async () => {
      setIsScanning(true);
      try {
        const result = await electronAPI.projects.scan(scanDirectories);
        if (ignore) return;
        setProjects(result);
        setSelectedProjectId((current) => current ?? result[0]?.id ?? null);
        setScanError(result.length === 0 ? 'No package.json files detected in the configured directories.' : null);
      } catch (error) {
        if (!ignore) {
          setScanError(error instanceof Error ? error.message : 'Failed to scan for projects.');
        }
      } finally {
        if (!ignore) {
          setIsScanning(false);
        }
      }
    };

    performScan();
    return () => {
      ignore = true;
    };
  }, [electronAPI, isMockMode, scanDirectories]);

  useEffect(() => {
    if (!electronAPI) {
      return;
    }
    const offLog = electronAPI.scripts.onLog((payload) => {
      if (currentRunRef.current !== payload.runId) {
        return;
      }
      setLogOutput((current) => `${current}${payload.chunk}`);
    });
    const offExit = electronAPI.scripts.onExit((payload) => {
      const entry: RunHistory = {
        id: payload.runId,
        script: payload.script,
        status: payload.exitCode === 0 ? 'Success' : 'Failed',
        startedAt: payload.startedAt,
        finishedAt: payload.finishedAt,
        exitCode: payload.exitCode
      };
      setRunHistory((history) => [entry, ...history].slice(0, 5));
      if (currentRunRef.current === payload.runId) {
        setCurrentRun(null);
        setScriptInFlight(null);
      }
    });
    const offError = electronAPI.scripts.onError((payload) => {
      if (currentRunRef.current !== payload.runId) {
        return;
      }
      const entry: RunHistory = {
        id: `${payload.runId}-error`,
        script: payload.script,
        status: 'Failed',
        startedAt: payload.startedAt,
        finishedAt: Date.now(),
        exitCode: null
      };
      setRunHistory((history) => [entry, ...history].slice(0, 5));
      setLogOutput((current) => `${current}\n[error] ${payload.message}`);
      setCurrentRun(null);
      setScriptInFlight(null);
    });

    return () => {
      offLog?.();
      offExit?.();
      offError?.();
    };
  }, [electronAPI]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const filteredProjects = useMemo(() => {
    if (!query) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.path} ${project.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [projects, query]);

  const projectScripts = selectedProject?.scripts ?? [];

  const handleRescan = useCallback(async () => {
    if (!electronAPI || scanDirectories === null) {
      setShowSetup(true);
      return;
    }
    setIsScanning(true);
    try {
      const result = await electronAPI.projects.scan(scanDirectories);
      setProjects(result);
      setSelectedProjectId((current) => {
        if (current && result.some((project) => project.id === current)) {
          return current;
        }
        return result[0]?.id ?? null;
      });
      setScanError(result.length === 0 ? 'No package.json files detected in the configured directories.' : null);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Failed to scan for projects.');
    } finally {
      setIsScanning(false);
    }
  }, [electronAPI, scanDirectories]);

  const handleRunScript = useCallback(
    async (script: ScriptInfo) => {
      if (!selectedProject) return;
      if (!electronAPI) {
        setLogOutput('Script execution is available when running the desktop app.');
        return;
      }
      try {
        setScriptInFlight(script.name);
        setLogOutput(`Running ${script.name}...\n`);
        const run = await electronAPI.scripts.run({
          projectPath: selectedProject.path,
          script: script.name
        });
        if (!run) return;
        setCurrentRun({ id: run.runId, script: script.name });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run script.';
        setLogOutput(message);
        const failureEntry: RunHistory = {
          id: `${Date.now()}-${script.name}`,
          script: script.name,
          status: 'Failed',
          startedAt: Date.now(),
          finishedAt: Date.now(),
          exitCode: null
        };
        setRunHistory((current) => [failureEntry, ...current].slice(0, 5));
        setScriptInFlight(null);
        setCurrentRun(null);
      }
    },
    [electronAPI, selectedProject]
  );

  const handleStopScript = useCallback(async () => {
    if (!electronAPI || !currentRun) return;
    try {
      await electronAPI.scripts.stop(currentRun.id);
      setLogOutput((current) => `${current}\nStopping process…`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to stop process.';
      setLogOutput((current) => `${current}\n${message}`);
    }
  }, [currentRun, electronAPI]);

  const handleSaveDirectories = useCallback(() => {
    const directories = parseDirectories(setupInput);
    if (directories.length === 0) {
      setSetupError('Enter at least one directory path.');
      return;
    }
    setScanDirectories(directories);
    setShowSetup(false);
    setSetupError(null);
  }, [setupInput]);

  const handleUseRepoRoot = useCallback(() => {
    setScanDirectories(['.']);
    setShowSetup(false);
    setSetupInput('.');
    setSetupError(null);
  }, []);

  const handleOpenSetup = useCallback(() => {
    setSetupInput((scanDirectories ?? []).join('\n'));
    setSetupError(null);
    setShowSetup(true);
  }, [scanDirectories]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-72 flex-col border-r border-slate-900 bg-slate-950/80 p-5">
        <div className="mb-4 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">Localhost</p>
          <h1 className="text-xl font-semibold">Hub</h1>
        </div>
        <div className="relative mb-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 text-xs">⌘K</span>
        </div>
        <div className="space-y-4 overflow-y-auto pr-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Projects</p>
            <div className="mt-3 space-y-2 text-sm">
              {isScanning && <p className="text-xs text-slate-500">Scanning directories…</p>}
              {filteredProjects.length === 0 && !isScanning ? (
                <p className="text-xs text-slate-500">No projects discovered yet.</p>
              ) : (
                <ul className="space-y-2">
                  {filteredProjects.map((project) => (
                    <li
                      key={project.id}
                      className={`cursor-pointer rounded-xl border border-transparent px-3 py-2 hover:border-slate-800 hover:bg-slate-900/70 ${
                        project.id === selectedProjectId ? 'bg-slate-900/80 border-indigo-400/50' : ''
                      }`}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{project.name}</span>
                        {project.tags.length > 0 && (
                          <span className="text-[10px] uppercase tracking-widest text-slate-500">{project.tags[0]}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{project.path}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">System</p>
              <p>IPC ping: {pingResponse}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Scan roots</p>
              {scanDirectories && scanDirectories.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {scanDirectories.map((dir) => (
                    <li key={dir} className="truncate text-slate-300">
                      {dir}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">Configure directories to begin scanning.</p>
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col gap-6 p-8">
        <header className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-sm text-slate-400">{selectedProject?.path ?? 'No project selected'}</p>
            <h1 className="text-3xl font-semibold text-white">{selectedProject?.name ?? 'Localhost Hub'}</h1>
          </div>
          <div className="ml-auto flex flex-wrap gap-3">
            <button
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-indigo-400 hover:text-white"
              onClick={handleOpenSetup}
            >
              {scanDirectories ? 'Edit scan directories' : 'Choose directories'}
            </button>
            <button
              className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/30 disabled:opacity-40"
              disabled={isScanning || scanDirectories === null}
              onClick={handleRescan}
            >
              {isScanning ? 'Scanning…' : 'Rescan directories'}
            </button>
          </div>
        </header>

        {scanDirectories === null && (
          <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-4 text-sm text-indigo-100">
            Add directories to scan so Localhost Hub knows where to discover projects.
          </div>
        )}

        {scanError && (
          <div className="rounded-xl border border-rose-500/60 bg-rose-500/5 p-4 text-sm text-rose-200">{scanError}</div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Scripts">
            {projectScripts.length === 0 ? (
              <p className="text-sm text-slate-400">No scripts detected for this project.</p>
            ) : (
              <div className="space-y-3">
                {projectScripts.map((script) => {
                  const isRunning = scriptInFlight === script.name;
                  return (
                    <div
                      key={script.name}
                      className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-indigo-400/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold">{script.name}</p>
                          <p className="text-xs uppercase tracking-wide text-slate-500">npm run</p>
                        </div>
                        <button
                          className={`rounded-full border px-4 py-1 text-xs font-semibold transition ${
                            isRunning
                              ? 'border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/30'
                              : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/30'
                          }`}
                          onClick={() => (isRunning ? handleStopScript() : handleRunScript(script))}
                          disabled={Boolean(scriptInFlight && !isRunning)}
                        >
                          {isRunning ? 'Stop' : 'Run'}
                        </button>
                      </div>
                      {script.description && <p className="mt-2 text-sm text-slate-400">{script.description}</p>}
                      <code className="mt-3 block rounded-lg bg-slate-950/80 px-3 py-2 text-xs text-slate-300">{script.command}</code>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Activity">
            {runHistory.length === 0 ? (
              <p className="text-sm text-slate-400">No scripts have been run yet.</p>
            ) : (
              <div className="space-y-4">
                {runHistory.map((process) => (
                  <div key={process.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-400">Script</p>
                        <p className="text-lg font-semibold text-white">{process.script}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusColor[process.status]}`}>
                        {process.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div>
                        <p className="text-slate-500">Started</p>
                        <p>{formatTimestamp(process.startedAt)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Ended</p>
                        <p>{formatTimestamp(process.finishedAt)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Exit code</p>
                        <p>{process.exitCode ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Logs"
            action={
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {scriptInFlight ? `${scriptInFlight} • running` : runHistory[0] ? 'Last run' : 'Idle'}
              </span>
            }
          >
            <div className="space-y-3 text-sm text-slate-300">
              <pre
                ref={logContainerRef}
                className="h-64 overflow-y-auto rounded-xl bg-black/60 p-4 font-mono text-xs text-emerald-300 whitespace-pre-wrap"
              >
                {logOutput}
              </pre>
              <button className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs font-semibold text-slate-200">
                Export log (coming soon)
              </button>
            </div>
          </Section>
        </div>
      </main>

      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6">
          <div className="w-full max-w-xl space-y-5 rounded-3xl border border-slate-800 bg-slate-950 p-8 shadow-2xl">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-400">First-time setup</p>
              <h2 className="text-2xl font-semibold text-white">Choose directories to scan</h2>
              <p className="text-sm text-slate-400">
                Localhost Hub looks for package.json files within the directories you provide. Add folders like ~/dev or
                ~/work to auto-discover projects.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Directories</label>
              <textarea
                value={setupInput}
                onChange={(event) => setSetupInput(event.target.value)}
                placeholder="/Users/you/dev\n~/workspaces"
                rows={4}
                className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
              />
              {setupError && <p className="text-sm text-rose-300">{setupError}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/30"
                onClick={handleSaveDirectories}
              >
                Save & scan
              </button>
              <button
                className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-700"
                onClick={handleUseRepoRoot}
              >
                Use current workspace
              </button>
              <button
                className="rounded-2xl border border-transparent px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-200"
                onClick={() => setShowSetup(false)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
