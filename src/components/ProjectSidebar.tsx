import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiPlay, HiClock, HiCog6Tooth, HiArrowPath, HiFolderOpen, HiSquares2X2 } from 'react-icons/hi2';
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
  style?: React.CSSProperties;
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
  style
}: ProjectSidebarProps) {
  const [showLiveProcesses, setShowLiveProcesses] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const liveProcessesButtonRef = useRef<HTMLButtonElement>(null);

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
                  return (
                    <motion.li
                      key={project.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      whileHover={{ x: 2 }}
                      className={`cursor-pointer rounded-xl border px-3 py-2 transition ${
                        project.id === selectedProjectId
                          ? 'border-indigo-300 dark:border-indigo-400/50 bg-indigo-50 dark:bg-slate-900/80'
                          : 'border-transparent hover:border-slate-200 dark:hover:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900/70'
                      }`}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-medium truncate flex-1 min-w-0 text-slate-800 dark:text-slate-100">{project.name}</span>
                        {project.tags.length > 0 && (
                          <span className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-500 flex-shrink-0">{project.tags[0]}</span>
                        )}
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
      </div>
      <LiveProcessesPopover
        processes={activeProcesses}
        isOpen={showLiveProcesses}
        onClose={() => setShowLiveProcesses(false)}
        anchorRef={liveProcessesButtonRef}
      />
      <HistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} runHistory={runHistory} />
    </aside>
  );
}

export default ProjectSidebar;
