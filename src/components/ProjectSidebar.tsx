import { useState, useRef } from 'react';
import { HiPlay, HiClock } from 'react-icons/hi2';
import type { ProjectInfo, ActiveProcessInfo, RunHistory } from '../types/global';
import { LiveProcessesPopover } from './LiveProcessesPopover';
import { HistoryModal } from './HistoryModal';

interface ProjectSidebarProps {
  query: string;
  onQueryChange: (value: string) => void;
  filteredProjects: ProjectInfo[];
  isScanning: boolean;
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  pingResponse: string;
  scanDirectories: string[] | null;
  activeProcesses: ActiveProcessInfo[];
  runHistory: RunHistory[];
}

export function ProjectSidebar({
  query,
  onQueryChange,
  filteredProjects,
  isScanning,
  selectedProjectId,
  onSelectProject,
  pingResponse,
  scanDirectories,
  activeProcesses,
  runHistory
}: ProjectSidebarProps) {
  const [showLiveProcesses, setShowLiveProcesses] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const liveProcessesButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <aside className="flex h-full w-72 flex-col border-r border-slate-900 bg-slate-950/80 p-5">
      <div className="mb-4 flex-shrink-0">
        <div className="mb-2 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">Localhost</p>
            <h1 className="text-xl font-semibold">Hub</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              ref={liveProcessesButtonRef}
              onClick={() => setShowLiveProcesses(!showLiveProcesses)}
              className="relative rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
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
              className="rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
              title="Recent history"
            >
              <HiClock className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="relative mb-5 flex-shrink-0">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search projects"
          className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 text-xs">⌘K</span>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 -mr-5 pr-5">
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
                    onClick={() => onSelectProject(project.id)}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="font-medium truncate flex-1 min-w-0">{project.name}</span>
                      {project.tags.length > 0 && (
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 flex-shrink-0">{project.tags[0]}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{project.path}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400 flex-shrink-0 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">System</p>
            <p className="truncate">IPC ping: {pingResponse}</p>
          </div>
          <div className="min-w-0">
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
