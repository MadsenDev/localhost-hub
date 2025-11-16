import { useCallback, useEffect, useMemo, useState } from 'react';
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

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <button className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
          View all
        </button>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-inner">
        {children}
      </div>
    </section>
  );
}

function App() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [pingResponse, setPingResponse] = useState<string>('…');
  const [query, setQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scriptInFlight, setScriptInFlight] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<RunHistory[]>([]);
  const [logOutput, setLogOutput] = useState('Select a script to run and view logs.');
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    window.electronAPI
      ?.ping()
      .then((result) => mounted && setPingResponse(result))
      .catch(() => mounted && setPingResponse('offline'));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    const bootstrap = async () => {
      setIsScanning(true);
      try {
        const result = await window.electronAPI?.projects.scan();
        if (!ignore && result) {
          setProjects(result);
          setSelectedProjectId((current) => current ?? result[0]?.id ?? null);
          setScanError(result.length === 0 ? 'No package.json files detected in the configured directories.' : null);
        }
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
    bootstrap();
    return () => {
      ignore = true;
    };
  }, []);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const filteredProjects = useMemo(() => {
    if (!query) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.path} ${project.tags.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [projects, query]);

  const projectScripts = selectedProject?.scripts ?? [];

  const handleRescan = useCallback(async () => {
    setIsScanning(true);
    try {
      const result = await window.electronAPI?.projects.scan();
      if (result) {
        setProjects(result);
        setSelectedProjectId((current) => {
          if (current && result.some((project) => project.id === current)) {
            return current;
          }
          return result[0]?.id ?? null;
        });
        setScanError(result.length === 0 ? 'No package.json files detected in the configured directories.' : null);
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Failed to scan for projects.');
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleRunScript = useCallback(
    async (script: ScriptInfo) => {
      if (!selectedProject) return;
      try {
        setScriptInFlight(script.name);
        setLogOutput(`Running ${script.name}...\n`);
        const result = await window.electronAPI?.scripts.run({
          projectPath: selectedProject.path,
          script: script.name
        });
        if (!result) return;
        setLogOutput(result.output || '(no output)');
        const status: RunHistory['status'] = result.exitCode === 0 ? 'Success' : 'Failed';
        setRunHistory((current) =>
          [
            {
              id: `${result.startedAt}-${script.name}`,
              script: script.name,
              status,
              startedAt: result.startedAt,
              finishedAt: result.finishedAt,
              exitCode: result.exitCode
            },
            ...current
          ].slice(0, 5)
        );
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
      } finally {
        setScriptInFlight(null);
      }
    },
    [selectedProject]
  );

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
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 text-xs">
            ⌘K
          </span>
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
                          <span className="text-[10px] uppercase tracking-widest text-slate-500">
                            {project.tags[0]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{project.path}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">System</p>
            <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
              <p>IPC ping: {pingResponse}</p>
              <p>Active ports: 5173, 9222</p>
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
          <div className="ml-auto flex gap-3">
            <button
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-indigo-400 hover:text-white disabled:opacity-40"
              disabled={isScanning}
              onClick={handleRescan}
            >
              {isScanning ? 'Scanning…' : 'Rescan directories'}
            </button>
          </div>
        </header>

        {scanError && (
          <div className="rounded-xl border border-rose-500/60 bg-rose-500/5 p-4 text-sm text-rose-200">{scanError}</div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Scripts">
            {projectScripts.length === 0 ? (
              <p className="text-sm text-slate-400">No scripts detected for this project.</p>
            ) : (
              <div className="space-y-3">
                {projectScripts.map((script) => (
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
                        className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/30 disabled:opacity-40"
                        onClick={() => handleRunScript(script)}
                        disabled={scriptInFlight === script.name}
                      >
                        {scriptInFlight === script.name ? 'Running…' : 'Run'}
                      </button>
                    </div>
                    {script.description && <p className="mt-2 text-sm text-slate-400">{script.description}</p>}
                    <code className="mt-3 block rounded-lg bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
                      {script.command}
                    </code>
                  </div>
                ))}
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

          <Section title="Logs">
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                <span>{scriptInFlight ? `${scriptInFlight} • running` : 'Last run'}</span>
                <span>{runHistory[0] ? formatTimestamp(runHistory[0].startedAt) : 'Idle'}</span>
              </div>
              <pre className="h-64 overflow-y-auto rounded-xl bg-black/60 p-4 font-mono text-xs text-emerald-300 whitespace-pre-wrap">
                {logOutput}
              </pre>
              <button className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs font-semibold text-slate-200">
                Export log (coming soon)
              </button>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}

export default App;
