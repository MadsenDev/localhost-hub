import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectInfo } from '../types/global';

const STORAGE_KEY = 'localhost-hub:scan-directories';
const SELECTED_PROJECT_STORAGE = 'localhost-hub:selected-project';

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
        description: 'Starts the Vite development server.',
        runner: 'npm'
      },
      {
        name: 'build',
        command: 'vite build',
        description: 'Creates an optimized production build.',
        runner: 'npm'
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
      { name: 'dev', command: 'npm run dev', description: 'Run API in watch mode.', runner: 'npm' },
      { name: 'test', command: 'npm run test', description: 'Execute unit tests.', runner: 'npm' }
    ]
  }
];

function parseDirectories(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

interface UseProjectsOptions {
  electronAPI?: Window['electronAPI'];
}

export function useProjects({ electronAPI }: UseProjectsOptions) {
  const isMockMode = !electronAPI;

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(SELECTED_PROJECT_STORAGE);
  });
  const [query, setQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
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

  const selectProject = useCallback((id: string | null) => {
    setSelectedProjectIdState(id);
    if (typeof window === 'undefined') return;
    if (id) {
      window.localStorage.setItem(SELECTED_PROJECT_STORAGE, id);
    } else {
      window.localStorage.removeItem(SELECTED_PROJECT_STORAGE);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (scanDirectories) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scanDirectories));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [scanDirectories]);

  const applyScanResults = useCallback((result: ProjectInfo[]) => {
    setProjects(result);
    setSelectedProjectIdState((current) => {
      if (current && result.some((project) => project.id === current)) {
        return current;
      }
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(SELECTED_PROJECT_STORAGE);
      }
      return null;
    });
  }, []);

  const performScan = useCallback(
    async (directories: string[]) => {
      if (!electronAPI) return;
      setIsScanning(true);
      try {
        const result = await electronAPI.projects.scan(directories);
        applyScanResults(result);
        setScanError(
          result.length === 0
            ? 'No package.json or Cargo.toml files detected in the configured directories.'
            : null
        );
      } catch (error) {
        setScanError(error instanceof Error ? error.message : 'Failed to scan for projects.');
      } finally {
        setIsScanning(false);
      }
    },
    [electronAPI, applyScanResults]
  );

  useEffect(() => {
    if (isMockMode) {
      setProjects(mockProjects);
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
      const scan = async () => {
        setIsScanning(true);
        try {
          const result = await electronAPI.projects.scan(scanDirectories);
          if (ignore) return;
          applyScanResults(result);
          setScanError(
            result.length === 0 ? 'No package.json or Cargo.toml files detected in the configured directories.' : null
          );
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

    scan();
    return () => {
      ignore = true;
    };
  }, [electronAPI, isMockMode, scanDirectories, applyScanResults]);

  const handleRescan = useCallback(async () => {
    if (!electronAPI || scanDirectories === null) {
      setShowSetup(true);
      return;
    }
    await performScan(scanDirectories);
  }, [electronAPI, scanDirectories, performScan]);

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
      setSetupError('Electron API is not available. Please check the console for errors.');
      return;
    }
    try {
      const result = await electronAPI.dialog.selectDirectory();
      if (!result.canceled && result.path) {
        const currentDirs = parseDirectories(setupInput);
        if (!currentDirs.includes(result.path)) {
          const newDirs = [...currentDirs, result.path].join('\n');
          setSetupInput(newDirs);
          setSetupError(null);
        } else {
          setSetupError('This directory is already in the list.');
        }
      }
    } catch {
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

  const filteredProjects = useMemo(() => {
    if (!query) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.path} ${project.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [projects, query]);

  return {
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
    openSetup: handleOpenSetup,
    closeSetup: () => setShowSetup(false),
    saveDirectories: handleSaveDirectories,
    useRepoRoot: handleUseRepoRoot,
    selectFolder: handleSelectFolder,
    removeFolder: handleRemoveFolder,
    rescan: handleRescan
  };
}

