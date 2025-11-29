import { useState, useRef, useEffect } from 'react';
import type { MouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiPlay, HiClock, HiCog6Tooth, HiArrowPath, HiFolderOpen, HiSquares2X2, HiPlus, HiPuzzlePiece } from 'react-icons/hi2';
import type { ProjectInfo, ActiveProcessInfo, RunHistory, GitStatusInfo } from '../types/global';
import { LiveProcessesPopover } from './LiveProcessesPopover';
import { HistoryModal } from './HistoryModal';
import { LoadingSkeleton } from './LoadingSkeleton';

interface ProjectSidebarProps {
  query: string;
  onQueryChange: (value: string) => void;
  filteredProjects: ProjectInfo[];
  allProjects: ProjectInfo[];
  isScanning: boolean;
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  pingResponse: string;
  scanDirectories: string[] | null;
  activeProcesses: ActiveProcessInfo[];
  runHistory: RunHistory[];
  gitStatuses?: Map<string, GitStatusInfo>;
  onOpenSettings?: () => void;
  onRescan?: () => void;
  onOpenSetup?: () => void;
  onOpenWorkspaces?: () => void;
  onOpenPlugins?: () => void;
  onCreateProject?: () => void;
  style?: React.CSSProperties;
  hiddenProjects?: ProjectInfo[];
  showHiddenProjects?: boolean;
  onToggleHiddenProjects?: () => void;
  onHideProject?: (projectId: string) => void;
  onUnhideProject?: (projectId: string) => void;
}

export function ProjectSidebar({
  query,
  onQueryChange,
  filteredProjects,
  allProjects,
  isScanning,
  selectedProjectId,
  onSelectProject,
  pingResponse,
  scanDirectories,
  activeProcesses,
  runHistory,
  gitStatuses,
  onOpenSettings,
  onRescan,
  onOpenSetup,
  onOpenWorkspaces,
  onOpenPlugins,
  onCreateProject,
  style,
  hiddenProjects = [],
  showHiddenProjects = false,
  onToggleHiddenProjects,
  onHideProject,
  onUnhideProject
}: ProjectSidebarProps) {
  const [showLiveProcesses, setShowLiveProcesses] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const liveProcessesButtonRef = useRef<HTMLButtonElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: ProjectInfo } | null>(null);

  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleProjectContextMenu = (event: MouseEvent, project: ProjectInfo) => {
    if (!onHideProject) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, project });
  };

  const handleHideSelectedProject = () => {
    if (contextMenu && onHideProject) {
      onHideProject(contextMenu.project.id);
    }
    setContextMenu(null);
  };

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 dark:border-slate-900 bg-white/80 dark:bg-slate-950/80 p-5" style={style}>
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            ref={liveProcessesButtonRef}
            onClick={() => setShowLiveProcesses(!showLiveProcesses)}
            className="relative rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-2 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            title="Live processes"
          >
            <HiPlay className="h-4 w-4" />
            {activeProcesses.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-semibold text-white">
                {activeProcesses.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-2 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            title="Recent history"
          >
            <HiClock className="h-4 w-4" />
          </button>
          {onRescan && (
            <button
              onClick={onRescan}
              disabled={isScanning}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-2 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Rescan projects"
            >
              <HiArrowPath className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            </button>
          )}
          {onOpenSetup && (
            <button
              onClick={onOpenSetup}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-2 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              title="Configure scan directories"
            >
              <HiFolderOpen className="h-4 w-4" />
            </button>
          )}
          {onOpenWorkspaces && (
            <button
              onClick={onOpenWorkspaces}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-2 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              title="Manage workspaces"
            >
              <HiSquares2X2 className="h-4 w-4" />
            </button>
          )}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-2 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              title="Settings"
            >
              <HiCog6Tooth className="h-4 w-4" />
            </button>
          )}
          {onOpenPlugins && (
            <button
              onClick={onOpenPlugins}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-2 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              title="Plugins"
            >
              <HiPuzzlePiece className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="relative mb-5 flex-shrink-0">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search projects"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 px-4 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-0 focus:outline-none"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-slate-500 text-xs">⌘K</span>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 -mr-5 pr-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-500">Projects</p>
          {onCreateProject && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCreateProject}
              className="mt-3 w-full rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-500/40 bg-indigo-50/50 dark:bg-indigo-500/5 px-4 py-3 text-sm font-semibold text-indigo-700 dark:text-indigo-300 transition hover:border-indigo-400 hover:bg-indigo-100/70 dark:hover:border-indigo-400 dark:hover:bg-indigo-500/10"
            >
              <div className="flex items-center justify-center gap-2">
                <HiPlus className="h-4 w-4" />
                <span>Create New Project</span>
              </div>
            </motion.button>
          )}
          <div className="mt-3 space-y-2 text-sm">
            {isScanning && filteredProjects.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 px-3 py-2">
                    <LoadingSkeleton lines={2} className="space-y-1.5" />
                  </div>
                ))}
              </div>
            ) : filteredProjects.length === 0 && !isScanning ? (
              <p className="text-xs text-slate-500 dark:text-slate-500">No projects discovered yet.</p>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredProjects.map((project, index) => {
                  const gitStatus = gitStatuses?.get(project.id);
                  const isRunning = activeProcesses.some(
                    (proc) => proc.projectPath === project.path && !proc.isExternal
                  );
                  const baseClasses =
                    'cursor-pointer rounded-xl border px-3 py-2 transition relative overflow-hidden';
                  const stateClasses =
                    project.id === selectedProjectId
                      ? 'border-indigo-300 dark:border-indigo-400/50 bg-indigo-50 dark:bg-slate-900/80'
                      : isRunning
                        ? 'border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-500/10'
                        : 'border-transparent hover:border-slate-200 dark:hover:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900/70';
                  return (
                    <motion.li
                      key={project.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      whileHover={{ x: 2 }}
                      className={`${baseClasses} ${stateClasses}`}
                      onClick={() => onSelectProject(project.id)}
                      onContextMenu={(event) => handleProjectContextMenu(event, project)}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-medium truncate flex-1 min-w-0 text-slate-800 dark:text-slate-100">{project.name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isRunning && (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              Running
                            </span>
                          )}
                          {project.tags.length > 0 && (
                            <span className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-500 flex-shrink-0">{project.tags[0]}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-500 truncate">{project.path}</p>
                      {gitStatus &&
                        (gitStatus.isRepo ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-600 dark:text-slate-200">{gitStatus.branch ?? 'detached'}</span>
                            {gitStatus.ahead ? <span className="text-emerald-600 dark:text-emerald-300">↑{gitStatus.ahead}</span> : null}
                            {gitStatus.behind ? <span className="text-amber-500 dark:text-amber-300">↓{gitStatus.behind}</span> : null}
                            {gitStatus.dirty ? (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-300">
                                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                                dirty
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-300">
                                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                                clean
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-500">No git repo</div>
                        ))}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-3 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-500">System</p>
            <p className="truncate text-slate-700 dark:text-slate-300">IPC ping: {pingResponse}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-500">Scan roots</p>
            {scanDirectories && scanDirectories.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {scanDirectories.map((dir) => (
                  <li key={dir} className="truncate text-slate-600 dark:text-slate-300">
                    {dir}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 dark:text-slate-500">Configure directories to begin scanning.</p>
            )}
          </div>
        </div>
        {onToggleHiddenProjects && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            <button
              onClick={onToggleHiddenProjects}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500/50"
            >
              <span>Hidden projects ({hiddenProjects.length})</span>
              <span>{showHiddenProjects ? 'Hide' : 'Show'}</span>
            </button>
            {showHiddenProjects && (
              <div className="space-y-2">
                {hiddenProjects.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-500">No hidden projects yet.</p>
                ) : (
                  hiddenProjects.map((project) => (
                    <div
                      key={project.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-700 dark:text-slate-200">{project.name}</p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{project.path}</p>
                        </div>
                        {onUnhideProject && (
                          <button
                            onClick={() => onUnhideProject(project.id)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                          >
                            Unhide
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <LiveProcessesPopover
        processes={activeProcesses}
        isOpen={showLiveProcesses}
        onClose={() => setShowLiveProcesses(false)}
        anchorRef={liveProcessesButtonRef}
      />
      <HistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} runHistory={runHistory} />
      {contextMenu && onHideProject && (
        <div
          className="fixed z-50 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={handleHideSelectedProject}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70"
          >
            Hide “{contextMenu.project.name}”
          </button>
        </div>
      )}
    </aside>
  );
}

export default ProjectSidebar;
