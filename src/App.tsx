import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveProcessInfo, RunHistory, ScriptInfo, ProjectInfo, GitStatusInfo } from './types/global';
import ProjectSidebar from './components/ProjectSidebar';
import SetupModal from './components/SetupModal';
import SettingsModal from './components/SettingsModal';
import { TitleBar } from './components/TitleBar';
import ProjectEmptyState from './components/ProjectEmptyState';
import ScanStatusBanner from './components/ScanStatusBanner';
import ProjectView from './components/ProjectView';
import { useSettings } from './hooks/useSettings';
import { useWorkspaces } from './hooks/useWorkspaces';
import WorkspacesModal from './components/WorkspacesModal';
import { ToastProvider, useToast } from './hooks/useToasts';
import ToastViewport from './components/ToastViewport';
import { useProjects } from './hooks/useProjects';
import { LoadingScreen } from './components/LoadingScreen';
import { TerminalModal } from './components/TerminalModal';
import { CreateProjectModal } from './components/CreateProjectModal';

const HISTORY_STORAGE_KEY = 'localhost-hub:run-history';
const MAX_HISTORY = 20;
const FORCE_STOP_DELAY_MS = 6000;
const HIDDEN_PROJECTS_STORAGE_KEY = 'localhost-hub:hidden-projects';

function AppContent() {
  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const settings = useSettings(electronAPI);
  const { pushToast } = useToast();
  const {
    workspaces,
    loading: workspacesLoading,
    createWorkspace,
    deleteWorkspace,
    addWorkspaceItem,
    updateWorkspaceItem,
    removeWorkspaceItem,
    startWorkspace,
    stopWorkspace,
    restartWorkspace,
    restartWorkspaceItem
  } = useWorkspaces(electronAPI);
  const {
    projects,
    filteredProjects,
    selectedProjectId,
    selectProject,
    query,
    setQuery,
    scanDirectories,
    isScanning,
    scanError,
    showSetup,
    setupInput,
    setSetupInput,
    setupError,
    openSetup,
    closeSetup,
    saveDirectories,
    useRepoRoot,
    selectFolder,
    removeFolder,
    rescan
  } = useProjects({ electronAPI });
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project] as const)), [projects]);
  const projectPathToId = useMemo(() => new Map(projects.map((project) => [project.path, project.id] as const)), [projects]);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  // Reload settings when they might have changed (e.g., from settings modal)
  useEffect(() => {
    if (!electronAPI) return;
    
    // Listen for theme change events from settings panel
    const handleThemeChange = () => {
      settings.reload();
    };
    window.addEventListener('settings:themeChanged', handleThemeChange);
    
    // Also listen for focus events to reload settings when user returns to window
    const handleFocus = () => {
      settings.reload();
    };
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('settings:themeChanged', handleThemeChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [electronAPI, settings]);

  useEffect(() => {
    if (!electronAPI?.settings) {
      return;
    }
    let cancelled = false;
    const loadHiddenProjects = async () => {
      try {
        const stored = await electronAPI.settings.get('hiddenProjects');
        if (!stored || cancelled) {
          return;
        }
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHiddenProjectIds(parsed);
        }
      } catch (error) {
        console.error('Failed to load hidden projects', error);
      }
    };
    loadHiddenProjects();
    return () => {
      cancelled = true;
    };
  }, [electronAPI]);

  const [activeTab, setActiveTab] = useState<'scripts' | 'logs' | 'env-profiles' | 'ports' | 'packages' | 'git' | 'terminal'>('scripts');
  const [showSettings, setShowSettings] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [pingResponse, setPingResponse] = useState<string>('…');
  const [isLoading, setIsLoading] = useState(true);
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const terminalLogContainerRef = useRef<HTMLPreElement | null>(null);
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
  // Store logs per project ID
  const [projectLogs, setProjectLogs] = useState<Map<string, string>>(new Map());
  // Track current run per project
  const [projectRuns, setProjectRuns] =
    useState<Map<string, { id: string; script: string; projectPath: string }>>(new Map());
  const [activeProcesses, setActiveProcesses] = useState<ActiveProcessInfo[]>([]);
  const [isExportingLog, setIsExportingLog] = useState(false);
  const [expectedPorts, setExpectedPorts] = useState<Map<string, Record<string, number>>>(new Map());
  const [detectedUrls, setDetectedUrls] = useState<Map<string, string>>(new Map());
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, GitStatusInfo>>(new Map());
  const [gitLoadingProjectId, setGitLoadingProjectId] = useState<string | null>(null);
  const [forceStopCandidates, setForceStopCandidates] = useState<Set<string>>(new Set());
  const [hiddenProjectIds, setHiddenProjectIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    const stored = window.localStorage.getItem(HIDDEN_PROJECTS_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [showHiddenProjects, setShowHiddenProjects] = useState(false);
  
  // Get auto-scroll setting (default true)
  const isAutoScrollEnabled = settings.getSettingAsBoolean('autoScrollLogs', true);

  const logContainerRef = useRef<HTMLPreElement | null>(null);
  // Track runId to projectId mapping
  const runIdToProjectId = useRef<Map<string, string>>(new Map());
  const forceStopTimersRef = useRef<Map<string, { timerId: number }>>(new Map());

  const persistHiddenProjects = useCallback(
    (ids: string[]) => {
      if (typeof window !== 'undefined') {
        if (ids.length === 0) {
          window.localStorage.removeItem(HIDDEN_PROJECTS_STORAGE_KEY);
        } else {
          window.localStorage.setItem(HIDDEN_PROJECTS_STORAGE_KEY, JSON.stringify(ids));
        }
      }
      if (electronAPI?.settings) {
        electronAPI.settings
          .set({ key: 'hiddenProjects', value: JSON.stringify(ids) })
          .catch((error) => console.error('Failed to persist hidden projects', error));
      }
    },
    [electronAPI]
  );

  const handleHideProject = useCallback(
    (projectId: string) => {
      setHiddenProjectIds((current) => {
        if (current.includes(projectId)) {
          return current;
        }
        const updated = [...current, projectId];
        persistHiddenProjects(updated);
        return updated;
      });
      if (selectedProjectId === projectId) {
        selectProject(null);
      }
    },
    [persistHiddenProjects, selectProject, selectedProjectId]
  );

  const handleUnhideProject = useCallback(
    (projectId: string) => {
      setHiddenProjectIds((current) => {
        if (!current.includes(projectId)) {
          return current;
        }
        const updated = current.filter((id) => id !== projectId);
        persistHiddenProjects(updated);
        return updated;
      });
    },
    [persistHiddenProjects]
  );

  const handleToggleHiddenProjects = useCallback(() => {
    setShowHiddenProjects((prev) => !prev);
  }, []);

  const clearForceStopEligibility = useCallback((runId?: string | null) => {
    if (!runId) return;
    const timer = forceStopTimersRef.current.get(runId);
    if (timer) {
      window.clearTimeout(timer.timerId);
      forceStopTimersRef.current.delete(runId);
    }
    setForceStopCandidates((current) => {
      if (!current.has(runId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(runId);
      return next;
    });
  }, []);

  const startForceStopCountdown = useCallback(
    (runId: string, projectId: string, scriptName?: string | null) => {
      if (!runId || !projectId) return;
      if (forceStopTimersRef.current.has(runId)) return;
      const timerId = window.setTimeout(() => {
        setForceStopCandidates((current) => {
          if (current.has(runId)) {
            return current;
          }
          const next = new Set(current);
          next.add(runId);
          return next;
        });
        setProjectLogs((current) => {
          const updated = new Map(current);
          const existing = updated.get(projectId) || '';
          const note = `Process${scriptName ? ` "${scriptName}"` : ''} is taking longer than expected to exit. Force stop is now available.\n`;
          updated.set(projectId, existing ? `${existing}\n${note}` : note);
          return updated;
        });
        forceStopTimersRef.current.delete(runId);
      }, FORCE_STOP_DELAY_MS);
      forceStopTimersRef.current.set(runId, { timerId });
    },
    [setProjectLogs]
  );

  // Get logs for the currently selected project
  const logOutput = useMemo(() => {
    if (!selectedProjectId) {
      return 'Select a project to view logs.';
    }
    return projectLogs.get(selectedProjectId) || 'Select a script to run and view logs.';
  }, [selectedProjectId, projectLogs]);

  // Get current run for the selected project
  const currentRun = useMemo(() => {
    if (!selectedProjectId) return null;
    return projectRuns.get(selectedProjectId) || null;
  }, [selectedProjectId, projectRuns]);

  // Get script in flight for the selected project
  const scriptInFlight = useMemo(() => {
    return currentRun?.script || null;
  }, [currentRun]);
  const isForceStopReady = useMemo(() => (currentRun ? forceStopCandidates.has(currentRun.id) : false), [currentRun, forceStopCandidates]);
  const currentGitStatus = useMemo(() => {
    if (!selectedProject) return null;
    return gitStatusMap.get(selectedProject.id) || null;
  }, [gitStatusMap, selectedProject]);
  const isGitStatusLoading = selectedProject ? gitLoadingProjectId === selectedProject.id : false;
  const hiddenProjectIdSet = useMemo(() => new Set(hiddenProjectIds), [hiddenProjectIds]);
  const visibleProjects = useMemo(
    () => filteredProjects.filter((project) => !hiddenProjectIdSet.has(project.id)),
    [filteredProjects, hiddenProjectIdSet]
  );
  const hiddenProjectsForSidebar = useMemo(
    () => filteredProjects.filter((project) => hiddenProjectIdSet.has(project.id)),
    [filteredProjects, hiddenProjectIdSet]
  );

  useEffect(() => {
    if (!isAutoScrollEnabled) {
      return;
    }
    const element = logContainerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [isAutoScrollEnabled, logOutput]);

  // Handle initial loading - show loading screen until app is ready
  useEffect(() => {
    if (!electronAPI) {
      setIsLoading(false);
      return;
    }
    
    // Show loading screen for at least 1.5 seconds for better UX
    const minDisplayTime = 1500;
    const startTime = Date.now();
    
    // Show loading screen until projects are loaded or timeout
    let mounted = true;
    const checkReady = async () => {
      try {
        // Wait for initial project list to load
        await electronAPI.projects.list();
        
        // Ensure minimum display time
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, minDisplayTime - elapsed);
        
        if (mounted) {
          setTimeout(() => {
            if (mounted) {
              setIsLoading(false);
            }
          }, remainingTime);
        }
      } catch {
        // If there's an error, still hide loading after minimum display time
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, minDisplayTime - elapsed);
        if (mounted) {
          setTimeout(() => {
            if (mounted) {
              setIsLoading(false);
            }
          }, remainingTime);
        }
      }
    };
    
    // Also set a maximum timeout to ensure loading screen doesn't stay forever
    const maxTimeout = setTimeout(() => {
      if (mounted) {
        setIsLoading(false);
      }
    }, 5000);
    
    checkReady();
    
    return () => {
      mounted = false;
      clearTimeout(maxTimeout);
    };
  }, [electronAPI]);

  useEffect(() => {
    return () => {
      forceStopTimersRef.current.forEach(({ timerId }) => {
        window.clearTimeout(timerId);
      });
      forceStopTimersRef.current.clear();
    };
  }, []);

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
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(runHistory));
  }, [runHistory]);

  useEffect(() => {
    if (!electronAPI) {
      return;
    }
    const offLog = electronAPI.scripts.onLog((payload) => {
      let projectId = runIdToProjectId.current.get(payload.runId);
      if (!projectId && payload.projectId) {
        projectId = payload.projectId;
        runIdToProjectId.current.set(payload.runId, projectId);
      }
      if (!projectId) return;

      // Update logs for that project
      setProjectLogs((current) => {
        const updated = new Map(current);
        const existing = updated.get(projectId) || '';
        updated.set(projectId, existing + payload.chunk);
        return updated;
      });

      const urlMatch = payload.chunk.match(/https?:\/\/localhost:\d+[^\s)"]*/i);
      if (urlMatch && projectId) {
        setDetectedUrls((current) => {
          const next = new Map(current);
          next.set(projectId, urlMatch[0]);
          return next;
        });
      }
    });
    const offExit = electronAPI.scripts.onExit((payload) => {
      clearForceStopEligibility(payload.runId);
      let projectId = runIdToProjectId.current.get(payload.runId);
      if (!projectId && payload.projectId) {
        projectId = payload.projectId;
        runIdToProjectId.current.set(payload.runId, projectId);
      }
      runIdToProjectId.current.delete(payload.runId);

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

      if (projectId) {
        const projectName = projectsById.get(projectId)?.name ?? 'Project';
        if (status === 'Failed') {
          pushToast({
            title: `${projectName}: ${payload.script} failed`,
            description:
              payload.exitCode !== null
                ? `Exited with code ${payload.exitCode}`
                : 'Process exited unexpectedly.',
            variant: 'error'
          });
        } else if (status === 'Success') {
          pushToast({
            title: `${projectName}: ${payload.script} completed`,
            variant: 'success',
            duration: 4000
          });
        } else if (status === 'Stopped') {
          pushToast({
            title: `${projectName}: ${payload.script} stopped`,
            variant: 'info',
            duration: 3500
          });
        }
      }

      // Clear the run for this project
      if (projectId) {
        setProjectRuns((current) => {
          const updated = new Map(current);
          const existing = updated.get(projectId);
          if (existing?.id === payload.runId) {
            updated.delete(projectId);
            // Close terminal modal when script completes
            if (selectedProjectId === projectId) {
              setShowTerminalModal(false);
            }
          }
          return updated;
        });
      }
    });
    const offError = electronAPI.scripts.onError((payload) => {
      clearForceStopEligibility(payload.runId);
      let projectId = runIdToProjectId.current.get(payload.runId);
      if (!projectId && payload.projectId) {
        projectId = payload.projectId;
        runIdToProjectId.current.set(payload.runId, projectId);
      }
      if (!projectId) return;

      const entry: RunHistory = {
        id: `${payload.runId}-error`,
        script: payload.script,
        status: 'Failed',
        startedAt: payload.startedAt,
        finishedAt: Date.now(),
        exitCode: null
      };
      setRunHistory((history) => [entry, ...history].slice(0, MAX_HISTORY));

      // Update logs for that project
      setProjectLogs((current) => {
        const updated = new Map(current);
        const existing = updated.get(projectId) || '';
        updated.set(projectId, existing + `\n[error] ${payload.message}`);
        return updated;
      });

      // Clear the run for this project
      setProjectRuns((current) => {
        const updated = new Map(current);
        const existing = updated.get(projectId);
        if (existing?.id === payload.runId) {
          updated.delete(projectId);
        }
        return updated;
      });

      const projectName = projectId ? projectsById.get(projectId)?.name ?? 'Project' : 'Project';
      pushToast({
        title: `${projectName}: ${payload.script}`,
        description: payload.message,
        variant: 'error'
      });
    });

    return () => {
      offLog?.();
      offExit?.();
      offError?.();
    };
  }, [electronAPI, projectsById, pushToast, clearForceStopEligibility]);

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
    // Get port refresh interval from settings (default 2 seconds)
    const refreshInterval = settings.getSettingAsNumber('portRefreshInterval', 2) * 1000;
    // Poll at configured interval
    const interval = window.setInterval(fetchProcesses, refreshInterval);
    return () => {
      ignore = true;
      window.clearTimeout(immediateTimeout);
      window.clearInterval(interval);
    };
  }, [electronAPI, settings.getSettingAsNumber('portRefreshInterval', 2)]);


  useEffect(() => {
    setDetectedUrls((current) => {
      if (current.size === 0) {
        return current;
      }
      const activeProjectIds = new Set<string>();
      activeProcesses.forEach((proc) => {
        const id = projectPathToId.get(proc.projectPath);
        if (id) {
          activeProjectIds.add(id);
        }
      });
      let changed = false;
      const next = new Map(current);
      for (const key of current.keys()) {
        if (!activeProjectIds.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [activeProcesses, projectPathToId]);


  // Load expected ports when project is selected
  useEffect(() => {
    if (!electronAPI?.scripts?.getAllExpectedPorts || !selectedProject) {
      return;
    }

    let ignore = false;
    const loadPorts = async () => {
      try {
        const ports = await electronAPI.scripts.getAllExpectedPorts(selectedProject.id);
        if (!ignore) {
          setExpectedPorts((prev) => {
            const updated = new Map(prev);
            updated.set(selectedProject.id, ports);
            return updated;
          });
        }
      } catch (error) {
        console.error('Error loading expected ports:', error);
      }
    };

    loadPorts();
    return () => {
      ignore = true;
    };
  }, [electronAPI, selectedProject]);

  const fetchGitStatus = useCallback(
    async (project: ProjectInfo) => {
      if (!electronAPI?.git?.status) {
        return;
      }
      setGitLoadingProjectId(project.id);
      try {
        const status = await electronAPI.git.status(project.path);
        setGitStatusMap((prev) => {
          const next = new Map(prev);
          next.set(project.id, status);
          return next;
        });
      } catch (error) {
        console.error('Error loading git status:', error);
        setGitStatusMap((prev) => {
          const next = new Map(prev);
          next.set(project.id, { isRepo: false });
          return next;
        });
      } finally {
        setGitLoadingProjectId((current) => (current === project.id ? null : current));
      }
    },
    [electronAPI]
  );

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    fetchGitStatus(selectedProject);
  }, [selectedProject, fetchGitStatus]);

  useEffect(() => {
    if (!electronAPI?.git?.status || projects.length === 0) {
      return;
    }

    let cancelled = false;
    const projectsNeedingStatus = projects.filter((project) => !gitStatusMap.has(project.id));
    if (projectsNeedingStatus.length === 0) {
      return;
    }

    (async () => {
      for (const project of projectsNeedingStatus) {
        if (cancelled) break;
        try {
          const status = await electronAPI.git.status(project.path);
          if (cancelled) break;
          setGitStatusMap((prev) => {
            if (prev.has(project.id)) {
              return prev;
            }
            const next = new Map(prev);
            next.set(project.id, status);
            return next;
          });
        } catch {
          if (cancelled) break;
          setGitStatusMap((prev) => {
            if (prev.has(project.id)) {
              return prev;
            }
            const next = new Map(prev);
            next.set(project.id, { isRepo: false });
            return next;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [electronAPI, projects, gitStatusMap]);

  const projectScripts = selectedProject?.scripts ?? [];
  const latestRun = runHistory[0] ?? null;
  const logStatusLabel = scriptInFlight ? `${scriptInFlight} • running` : latestRun ? 'Last run' : 'Idle';
  const canExportLog = Boolean(logOutput && logOutput.trim().length > 0);
  const canCopyLog = canExportLog;
  const canClearLog = Boolean(logOutput.length);

  const handleRunScript = useCallback(
    async (script: ScriptInfo) => {
      if (!selectedProject) return;
      if (!electronAPI) {
        setProjectLogs((current) => {
          const updated = new Map(current);
          updated.set(selectedProject.id, 'Script execution is available when running the desktop app.');
          return updated;
        });
        return;
      }
      try {
        // Initialize log for this project if needed
        setProjectLogs((current) => {
          const updated = new Map(current);
          updated.set(selectedProject.id, `Running ${script.name}...\n`);
          return updated;
        });

        const run = await electronAPI.scripts.run({
          projectPath: selectedProject.path,
          projectId: selectedProject.id,
          script: script.name
        });
        if (!run) return;

        // Map runId to projectId
        runIdToProjectId.current.set(run.runId, selectedProject.id);

        // Set the current run for this project
        setProjectRuns((current) => {
          const updated = new Map(current);
          updated.set(selectedProject.id, {
            id: run.runId,
            script: script.name,
            projectPath: selectedProject.path
          });
          return updated;
        });

        // Show terminal modal when script starts
        setShowTerminalModal(true);

        // Immediately fetch active processes to show the newly started script
        try {
          const processes = await electronAPI.processes.active();
          setActiveProcesses(processes);
        } catch {
          // Ignore errors, polling will catch it
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run script.';
        setProjectLogs((current) => {
          const updated = new Map(current);
          updated.set(selectedProject.id, message);
          return updated;
        });
        const failureEntry: RunHistory = {
          id: `${Date.now()}-${script.name}`,
          script: script.name,
          status: 'Failed',
          startedAt: Date.now(),
          finishedAt: Date.now(),
          exitCode: null
        };
        setRunHistory((current) => [failureEntry, ...current].slice(0, MAX_HISTORY));
      }
    },
    [electronAPI, selectedProject]
  );

  const handleRestartScript = useCallback(
    async (script: ScriptInfo) => {
      if (!electronAPI) {
        if (selectedProject) {
          setProjectLogs((current) => {
            const updated = new Map(current);
            updated.set(selectedProject.id, 'Script execution is available when running the desktop app.');
            return updated;
          });
        }
        return;
      }

      if (!selectedProject) {
        return;
      }

      const projectRun = projectRuns.get(selectedProject.id);
      if (projectRun?.id) {
        setProjectLogs((current) => {
          const updated = new Map(current);
          const existing = updated.get(selectedProject.id) || '';
          updated.set(selectedProject.id, existing + `\nRestarting ${script.name}…\n`);
          return updated;
        });
        try {
          await electronAPI.scripts.stop(projectRun.id);
          startForceStopCountdown(projectRun.id, selectedProject.id, script.name);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to stop running script before restart.';
          setProjectLogs((current) => {
            const updated = new Map(current);
            const existing = updated.get(selectedProject.id) || '';
            updated.set(selectedProject.id, existing + `\n${message}\n`);
            return updated;
          });
        }

        // Give the process a short moment to exit before relaunching
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      await handleRunScript(script);
    },
    [electronAPI, handleRunScript, selectedProject, projectRuns, startForceStopCountdown]
  );

  const handleStopScript = useCallback(async () => {
    if (!electronAPI || !selectedProject || !currentRun) return;
    try {
      await electronAPI.scripts.stop(currentRun.id);
      setProjectLogs((current) => {
        const updated = new Map(current);
        const existing = updated.get(selectedProject.id) || '';
        updated.set(selectedProject.id, existing + '\nStopping process…\n');
        return updated;
      });

      if (selectedProject.id) {
        startForceStopCountdown(currentRun.id, selectedProject.id, currentRun.script);
      }

      // Immediately fetch active processes to remove the stopped script from the list
      try {
        const processes = await electronAPI.processes.active();
        setActiveProcesses(processes);
      } catch {
        // Ignore errors, polling will catch it
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to stop process.';
      setProjectLogs((current) => {
        const updated = new Map(current);
        const existing = updated.get(selectedProject.id) || '';
        updated.set(selectedProject.id, existing + `\n${message}\n`);
        return updated;
      });
    }
  }, [currentRun, electronAPI, selectedProject, startForceStopCountdown]);

  const handleForceStopScript = useCallback(async () => {
    if (!electronAPI || !selectedProject || !currentRun) return;
    const processInfo = activeProcesses.find((proc) => proc.id === currentRun.id);
    if (!processInfo?.pid) {
      setProjectLogs((current) => {
        const updated = new Map(current);
        const existing = updated.get(selectedProject.id) || '';
        updated.set(
          selectedProject.id,
          `${existing}${existing ? '\n' : ''}Force stop unavailable: unable to determine PID for the running process.\n`
        );
        return updated;
      });
      return;
    }
    try {
      await electronAPI.processes.kill(processInfo.pid);
      setProjectLogs((current) => {
        const updated = new Map(current);
        const existing = updated.get(selectedProject.id) || '';
        updated.set(selectedProject.id, `${existing}${existing ? '\n' : ''}Force stop signal sent (SIGKILL).\n`);
        return updated;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to force kill process.';
      setProjectLogs((current) => {
        const updated = new Map(current);
        const existing = updated.get(selectedProject.id) || '';
        updated.set(selectedProject.id, `${existing}${existing ? '\n' : ''}${message}\n`);
        return updated;
      });
    } finally {
      clearForceStopEligibility(currentRun.id);
    }
  }, [activeProcesses, clearForceStopEligibility, currentRun, electronAPI, selectedProject]);

  const handleExportLog = useCallback(async () => {
    if (!canExportLog || !selectedProject) return;
    const contents = logOutput;
    const projectName = selectedProject.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const suggestedName = `${projectName}-log-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.txt`;
    if (electronAPI?.logs?.export) {
      try {
        setIsExportingLog(true);
        await electronAPI.logs.export({ contents, suggestedName });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to export log.';
        setProjectLogs((current) => {
          const updated = new Map(current);
          const existing = updated.get(selectedProject.id) || '';
          updated.set(selectedProject.id, existing + `\n[error] ${message}\n`);
          return updated;
        });
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
  }, [canExportLog, electronAPI, logOutput, selectedProject]);

  // Auto-scroll is now controlled by settings, so this is a no-op
  // but kept for compatibility with LogsPanel
  const handleToggleAutoScroll = useCallback(() => {
    // Settings-based auto-scroll is read-only from UI
    // User should change it in settings
  }, []);

  const handleClearLog = useCallback(() => {
    if (!selectedProject) return;
    setProjectLogs((current) => {
      const updated = new Map(current);
      updated.set(selectedProject.id, '');
      return updated;
    });
  }, [selectedProject]);

  const handleOpenInBrowser = useCallback(async (url: string) => {
    if (electronAPI?.shell?.openExternal) {
      await electronAPI.shell.openExternal(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }, [electronAPI]);

  const handleRefreshGit = useCallback(() => {
    if (!selectedProject) {
      return;
    }
    fetchGitStatus(selectedProject);
  }, [selectedProject, fetchGitStatus]);

  const handleInstall = useCallback(
    async (packageManager: string) => {
      if (!electronAPI?.scripts?.install || !selectedProject) return;
      try {
        setProjectLogs((current) => {
          const updated = new Map(current);
          const existing = updated.get(selectedProject.id) || '';
          updated.set(selectedProject.id, existing + `\nRunning ${packageManager} install...\n`);
          return updated;
        });

        const run = await electronAPI.scripts.install({
          projectPath: selectedProject.path,
          packageManager
        });

        setProjectRuns((current) => {
          const updated = new Map(current);
          updated.set(selectedProject.id, {
            id: run.runId,
            script: 'install',
            projectPath: selectedProject.path
          });
          return updated;
        });

        runIdToProjectId.current.set(run.runId, selectedProject.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start install';
        setProjectLogs((current) => {
          const updated = new Map(current);
          const existing = updated.get(selectedProject.id) || '';
          updated.set(selectedProject.id, existing + `\n[error] ${message}\n`);
          return updated;
        });
      }
    },
    [electronAPI, selectedProject]
  );

  const handleInstallPackage = useCallback(
    async (packageName: string, version?: string, isDev?: boolean) => {
      if (!electronAPI?.packages?.installPackage || !selectedProject) return;
      
      // Detect package manager
      let packageManager: string | undefined;
      if (electronAPI.scripts?.detectPackageManager) {
        try {
          packageManager = await electronAPI.scripts.detectPackageManager(selectedProject.path);
        } catch {
          // Use default
        }
      }

      try {
        setProjectLogs((current) => {
          const updated = new Map(current);
          const existing = updated.get(selectedProject.id) || '';
          const packageSpec = version ? `${packageName}@${version}` : packageName;
          updated.set(selectedProject.id, existing + `\nInstalling ${packageSpec}...\n`);
          return updated;
        });

        const run = await electronAPI.packages.installPackage({
          projectPath: selectedProject.path,
          packageName,
          version,
          isDev,
          packageManager
        });

        setProjectRuns((current) => {
          const updated = new Map(current);
          updated.set(selectedProject.id, {
            id: run.runId,
            script: `install-${packageName}`,
            projectPath: selectedProject.path
          });
          return updated;
        });

        runIdToProjectId.current.set(run.runId, selectedProject.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to install package';
        setProjectLogs((current) => {
          const updated = new Map(current);
          const existing = updated.get(selectedProject.id) || '';
          updated.set(selectedProject.id, existing + `\n[error] ${message}\n`);
          return updated;
        });
      }
    },
    [electronAPI, selectedProject]
  );


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
      if (selectedProject) {
        setProjectLogs((current) => {
          const updated = new Map(current);
          const existing = updated.get(selectedProject.id) || '';
          updated.set(selectedProject.id, existing + `\n[error] ${message}\n`);
          return updated;
        });
      }
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
      if (selectedProject) {
        setProjectLogs((current) => {
          const updated = new Map(current);
          const existing = updated.get(selectedProject.id) || '';
          updated.set(selectedProject.id, existing + `\n[error] ${message}\n`);
          return updated;
        });
      }
    }
  }, [canCopyLog, logOutput, selectedProject]);

  // Apply UI settings
  const sidebarWidth = settings.getSettingAsNumber('sidebarWidth', 288);
  const compactMode = settings.getSettingAsBoolean('compactMode', false);
  const fontSize = settings.getSettingAsString('fontSize', 'medium');
  const reduceAnimations = settings.getSettingAsBoolean('reduceAnimations', false);
  
  const theme = settings.getSettingAsString('theme', 'dark');
  const fontSizeClass = fontSize === 'small' ? 'text-sm' : fontSize === 'large' ? 'text-base' : 'text-sm';
  const compactClass = compactMode ? 'gap-2' : 'gap-6';
  const animationClass = reduceAnimations ? '' : '';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
    } else if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (event: MediaQueryListEvent) => {
        if (event.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // Show loading screen while app initializes
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Get terminal modal props
  const terminalLogOutput = currentRun && selectedProject ? logOutput : '';
  const terminalScriptName = currentRun?.script || '';
  const terminalProjectName = selectedProject?.name || '';

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden flex-col ${fontSizeClass}`}>
      {electronAPI && <TitleBar />}
      <div className="flex flex-1 overflow-hidden">
        <ProjectSidebar
          style={{ width: `${sidebarWidth}px` }}
          query={query}
          onQueryChange={setQuery}
          filteredProjects={visibleProjects}
          allProjects={projects}
          isScanning={isScanning}
          selectedProjectId={selectedProjectId}
          onSelectProject={selectProject}
          pingResponse={pingResponse}
          scanDirectories={scanDirectories}
          activeProcesses={activeProcesses}
          runHistory={runHistory}
          gitStatuses={gitStatusMap}
          onOpenSettings={() => setShowSettings(true)}
          onRescan={rescan}
          onOpenSetup={openSetup}
          onOpenWorkspaces={() => setShowWorkspaces(true)}
          onCreateProject={() => setShowCreateProject(true)}
          hiddenProjects={hiddenProjectsForSidebar}
          showHiddenProjects={showHiddenProjects}
          onToggleHiddenProjects={handleToggleHiddenProjects}
          onHideProject={handleHideProject}
          onUnhideProject={handleUnhideProject}
        />

      <main className={`flex flex-1 flex-col ${compactClass} p-8 overflow-y-auto`}>
        {!selectedProject && (
          <ProjectEmptyState
            scanDirectories={scanDirectories}
            isScanning={isScanning}
            onOpenSetup={openSetup}
            onRescan={rescan}
            onCreateProject={() => setShowCreateProject(true)}
          />
        )}

        <ScanStatusBanner scanDirectories={scanDirectories} scanError={scanError} />

        {selectedProject && (
          <ProjectView
            project={selectedProject}
            scriptInFlight={scriptInFlight}
            activeProcesses={activeProcesses}
            expectedPorts={expectedPorts.get(selectedProject.id) || {}}
            detectedUrl={detectedUrls.get(selectedProject.id) || null}
            currentRunId={currentRun?.id || null}
            gitStatus={currentGitStatus}
            gitStatusLoading={isGitStatusLoading}
            onRefreshGit={handleRefreshGit}
            onOpenInBrowser={handleOpenInBrowser}
            onInstall={handleInstall}
            onStopScript={handleStopScript}
            onForceStopScript={handleForceStopScript}
            onRestartScript={handleRestartScript}
            electronAPI={electronAPI}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            projectScripts={projectScripts}
            onRunScript={handleRunScript}
            logStatusLabel={logStatusLabel}
            logOutput={logOutput}
            logContainerRef={logContainerRef}
            onExportLog={handleExportLog}
            isExportingLog={isExportingLog}
            canExportLog={canExportLog}
            isAutoScrollEnabled={isAutoScrollEnabled}
            onToggleAutoScroll={handleToggleAutoScroll}
            onClearLog={handleClearLog}
            onCopyLog={handleCopyLog}
            canCopyLog={canCopyLog}
            canClearLog={canClearLog}
            onInstallPackage={handleInstallPackage}
            forceStopReady={isForceStopReady}
          />
        )}
      </main>

        <SetupModal
          isOpen={showSetup}
          setupInput={setupInput}
          onChange={setSetupInput}
          onSave={saveDirectories}
          onUseRepoRoot={useRepoRoot}
          onClose={closeSetup}
          setupError={setupError}
          onSelectFolder={selectFolder}
          onRemoveFolder={removeFolder}
        />
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} electronAPI={electronAPI} />
        <WorkspacesModal
          isOpen={showWorkspaces}
          onClose={() => setShowWorkspaces(false)}
          workspaces={workspaces}
          projects={projects}
          loading={workspacesLoading}
          onCreateWorkspace={createWorkspace}
          onDeleteWorkspace={deleteWorkspace}
          onAddItem={addWorkspaceItem}
          onUpdateItem={updateWorkspaceItem}
          onRemoveItem={removeWorkspaceItem}
          onStartWorkspace={startWorkspace}
          onStopWorkspace={stopWorkspace}
          onRestartWorkspace={restartWorkspace}
          onRestartItem={restartWorkspaceItem}
        />
        {currentRun && selectedProject && (
          <TerminalModal
            isOpen={showTerminalModal}
            onClose={() => setShowTerminalModal(false)}
            logOutput={terminalLogOutput}
            scriptName={terminalScriptName}
            projectName={terminalProjectName}
            logContainerRef={terminalLogContainerRef}
            isAutoScrollEnabled={isAutoScrollEnabled}
            onToggleAutoScroll={handleToggleAutoScroll}
          />
        )}
        <CreateProjectModal
          isOpen={showCreateProject}
          onClose={() => setShowCreateProject(false)}
          onCreateProject={async (projectData) => {
            if (!electronAPI) {
              throw new Error('Electron API not available');
            }
            await electronAPI.projects.create(projectData);
            // Trigger rescan to pick up the new project
            await rescan();
            pushToast({
              title: 'Project created',
              description: `Successfully created ${projectData.name}`,
              variant: 'success'
            });
          }}
          electronAPI={electronAPI}
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
      <ToastViewport />
    </ToastProvider>
  );
}
