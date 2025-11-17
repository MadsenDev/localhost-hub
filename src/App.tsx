import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveProcessInfo, ProjectInfo, RunHistory, ScriptInfo } from './types/global';
import ProjectSidebar from './components/ProjectSidebar';
import ScriptsPanel from './components/ScriptsPanel';
import LogsPanel from './components/LogsPanel';
import SetupModal from './components/SetupModal';
import Section from './components/Section';

const STORAGE_KEY = 'localhost-hub:scan-directories';
const HISTORY_STORAGE_KEY = 'localhost-hub:run-history';
const MAX_HISTORY = 20;

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
  const [runHistory, setRunHistory] = useState<RunHistory[]>(() => {
    if (typeof window === 'undefined') return [];
    const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored) as RunHistory[];
    } catch {
      return [];
    }
  });
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
  const [activeProcesses, setActiveProcesses] = useState<ActiveProcessInfo[]>([]);
  const [isExportingLog, setIsExportingLog] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  const logContainerRef = useRef<HTMLPreElement | null>(null);
  const currentRunRef = useRef<string | null>(null);

  useEffect(() => {
    currentRunRef.current = currentRun?.id ?? null;
  }, [currentRun]);

  useEffect(() => {
    if (!isAutoScrollEnabled) {
      return;
    }
    const element = logContainerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [isAutoScrollEnabled, logOutput]);

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
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(runHistory));
  }, [runHistory]);

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
      let status: 'Success' | 'Failed' | 'Stopped';
      if (payload.wasStopped) {
        status = 'Stopped';
      } else if (payload.exitCode === 0) {
        status = 'Success';
      } else {
        status = 'Failed';
      }

      const entry: RunHistory = {
        id: payload.runId,
        script: payload.script,
        status,
        startedAt: payload.startedAt,
        finishedAt: payload.finishedAt,
        exitCode: payload.exitCode
      };
      setRunHistory((history) => [entry, ...history].slice(0, MAX_HISTORY));
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
      setRunHistory((history) => [entry, ...history].slice(0, MAX_HISTORY));
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

  useEffect(() => {
    if (!electronAPI) {
      setActiveProcesses([]);
      return;
    }

    let ignore = false;
    const fetchProcesses = async () => {
      try {
        const list = await electronAPI.processes.active();
        if (!ignore) {
          setActiveProcesses(list);
        }
      } catch {
        if (!ignore) {
          setActiveProcesses([]);
        }
      }
    };

    // Fetch immediately on mount
    fetchProcesses();
    // Then fetch again after a short delay to catch any processes that started during initialization
    const immediateTimeout = window.setTimeout(fetchProcesses, 500);
    // Then poll every 2 seconds (reduced from 3 for more responsive updates)
    const interval = window.setInterval(fetchProcesses, 2000);
    return () => {
      ignore = true;
      window.clearTimeout(immediateTimeout);
      window.clearInterval(interval);
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
  const latestRun = runHistory[0] ?? null;
  const logStatusLabel = scriptInFlight ? `${scriptInFlight} • running` : latestRun ? 'Last run' : 'Idle';
  const canExportLog = Boolean(logOutput && logOutput.trim().length > 0);
  const canCopyLog = canExportLog;
  const canClearLog = Boolean(logOutput.length);

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
        
        // Immediately fetch active processes to show the newly started script
        try {
          const processes = await electronAPI.processes.active();
          setActiveProcesses(processes);
        } catch {
          // Ignore errors, polling will catch it
        }
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
        setRunHistory((current) => [failureEntry, ...current].slice(0, MAX_HISTORY));
        setScriptInFlight(null);
        setCurrentRun(null);
      }
    },
    [electronAPI, selectedProject]
  );

  const handleRestartScript = useCallback(
    async (script: ScriptInfo) => {
      if (!electronAPI) {
        setLogOutput('Script execution is available when running the desktop app.');
        return;
      }

      if (!selectedProject) {
        return;
      }

      const somethingRunning = Boolean(currentRun);
      if (somethingRunning && currentRun?.id) {
        setLogOutput((current) => `${current}\nRestarting ${script.name}…`);
        try {
          await electronAPI.scripts.stop(currentRun.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to stop running script before restart.';
          setLogOutput((current) => `${current}\n${message}`);
        }

        // Give the process a short moment to exit before relaunching
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      await handleRunScript(script);
    },
    [currentRun, electronAPI, handleRunScript, selectedProject]
  );

  const handleStopScript = useCallback(async () => {
    if (!electronAPI || !currentRun) return;
    try {
      await electronAPI.scripts.stop(currentRun.id);
      setLogOutput((current) => `${current}\nStopping process…`);
      
      // Immediately fetch active processes to remove the stopped script from the list
      try {
        const processes = await electronAPI.processes.active();
        setActiveProcesses(processes);
      } catch {
        // Ignore errors, polling will catch it
      }
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

  const handleSelectFolder = useCallback(async () => {
    if (!electronAPI) {
      console.error('electronAPI is not available. Preload script may not be loading correctly.');
      setSetupError('Electron API is not available. Please check the console for errors.');
      return;
    }
    try {
      const result = await electronAPI.dialog.selectDirectory();
      if (!result.canceled && result.path) {
        const currentDirs = parseDirectories(setupInput);
        // Add the new folder if it's not already in the list
        if (!currentDirs.includes(result.path)) {
          const newDirs = [...currentDirs, result.path].join('\n');
          setSetupInput(newDirs);
          setSetupError(null);
        } else {
          setSetupError('This directory is already in the list.');
        }
      }
    } catch (error) {
      setSetupError('Failed to select directory. Please try again.');
    }
  }, [electronAPI, setupInput]);

  const handleRemoveFolder = useCallback(
    (pathToRemove: string) => {
      const currentDirs = parseDirectories(setupInput);
      const newDirs = currentDirs.filter((dir) => dir !== pathToRemove).join('\n');
      setSetupInput(newDirs);
      setSetupError(null);
    },
    [setupInput]
  );

  const handleExportLog = useCallback(async () => {
    if (!canExportLog) return;
    const contents = logOutput;
    const suggestedName = `localhost-hub-log-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.txt`;
    if (electronAPI?.logs?.export) {
      try {
        setIsExportingLog(true);
        await electronAPI.logs.export({ contents, suggestedName });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to export log.';
        setLogOutput((current) => `${current}\n[error] ${message}`);
      } finally {
        setIsExportingLog(false);
      }
      return;
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const blob = new Blob([contents], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [canExportLog, electronAPI, logOutput]);

  const handleToggleAutoScroll = useCallback(() => {
    setIsAutoScrollEnabled((current) => !current);
  }, []);

  const handleClearLog = useCallback(() => {
    setLogOutput('');
  }, []);

  const handleCopyLog = useCallback(async () => {
    if (!canCopyLog || typeof window === 'undefined') {
      return;
    }

    const copyText = logOutput;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to copy log contents.';
      setLogOutput((current) => `${current}\n[error] ${message}`);
      return;
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = copyText;
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to copy log contents.';
      setLogOutput((current) => `${current}\n[error] ${message}`);
    }
  }, [canCopyLog, logOutput]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <ProjectSidebar
        query={query}
        onQueryChange={setQuery}
        filteredProjects={filteredProjects}
        isScanning={isScanning}
        selectedProjectId={selectedProjectId}
        onSelectProject={(id) => setSelectedProjectId(id)}
        pingResponse={pingResponse}
        scanDirectories={scanDirectories}
        activeProcesses={activeProcesses}
        runHistory={runHistory}
      />

      <main className="flex flex-1 flex-col gap-6 p-8 overflow-y-auto">
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
            <ScriptsPanel
              scripts={projectScripts}
              scriptInFlight={scriptInFlight}
              onRunScript={handleRunScript}
              onStopScript={handleStopScript}
              onRestartScript={handleRestartScript}
            />
          </Section>

          <Section title="Logs" action={<span className="text-xs uppercase tracking-wide text-slate-500">{logStatusLabel}</span>}>
            <LogsPanel
              logOutput={logOutput}
              logContainerRef={logContainerRef}
              onExportLog={handleExportLog}
              isExporting={isExportingLog}
              canExport={canExportLog}
              isAutoScrollEnabled={isAutoScrollEnabled}
              onToggleAutoScroll={handleToggleAutoScroll}
              onClearLog={handleClearLog}
              onCopyLog={handleCopyLog}
              canCopy={canCopyLog}
              canClear={canClearLog}
            />
          </Section>
        </div>
      </main>

        <SetupModal
          isOpen={showSetup}
          setupInput={setupInput}
          onChange={setSetupInput}
          onSave={handleSaveDirectories}
          onUseRepoRoot={handleUseRepoRoot}
          onClose={() => setShowSetup(false)}
          setupError={setupError}
          onSelectFolder={handleSelectFolder}
          onRemoveFolder={handleRemoveFolder}
        />
    </div>
  );
}

export default App;
