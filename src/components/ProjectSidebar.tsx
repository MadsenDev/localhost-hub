import type { ProjectInfo } from '../types/global';

interface ProjectSidebarProps {
  query: string;
  onQueryChange: (value: string) => void;
  filteredProjects: ProjectInfo[];
  isScanning: boolean;
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  pingResponse: string;
  scanDirectories: string[] | null;
}

export function ProjectSidebar({
  query,
  onQueryChange,
  filteredProjects,
  isScanning,
  selectedProjectId,
  onSelectProject,
  pingResponse,
  scanDirectories
}: ProjectSidebarProps) {
  return (
    <aside className="flex w-72 flex-col border-r border-slate-900 bg-slate-950/80 p-5">
      <div className="mb-4 space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">Localhost</p>
        <h1 className="text-xl font-semibold">Hub</h1>
      </div>
      <div className="relative mb-5">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
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
                    onClick={() => onSelectProject(project.id)}
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
  );
}

export default ProjectSidebar;
