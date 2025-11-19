import WorkspacesPanel from './WorkspacesPanel';
import type { ProjectInfo, Workspace } from '../types/global';

interface WorkspacesModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  projects: ProjectInfo[];
  loading?: boolean;
  onCreateWorkspace: (payload: { name: string; description?: string }) => Promise<number | null | void>;
  onDeleteWorkspace: (workspaceId: number) => Promise<void>;
  onAddItem: (payload: { workspaceId: number; projectId: string; scriptName: string; envProfileId?: number | null; runMode?: 'parallel' | 'sequential' }) => Promise<void>;
  onUpdateItem: (payload: { id: number; envProfileId?: number | null; runMode?: 'parallel' | 'sequential'; orderIndex?: number }) => Promise<void>;
  onRemoveItem: (itemId: number) => Promise<void>;
  onStartWorkspace: (workspaceId: number) => Promise<void>;
  onStopWorkspace: (workspaceId: number) => Promise<void>;
}

export function WorkspacesModal({
  isOpen,
  onClose,
  workspaces,
  projects,
  loading,
  onCreateWorkspace,
  onDeleteWorkspace,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onStartWorkspace,
  onStopWorkspace
}: WorkspacesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 px-4 py-8">
      <div className="relative flex h-full w-full max-w-5xl flex-col rounded-3xl border border-slate-200/70 bg-white p-6 shadow-2xl dark:border-slate-800/80 dark:bg-slate-950">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">Workspaces</p>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Organize multi-script workflows</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Create workspace bundles, add scripts from any project, and run them sequentially or in parallel.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <WorkspacesPanel
            workspaces={workspaces}
            projects={projects}
            loading={loading}
            onCreateWorkspace={onCreateWorkspace}
            onDeleteWorkspace={onDeleteWorkspace}
            onAddItem={onAddItem}
            onUpdateItem={onUpdateItem}
            onRemoveItem={onRemoveItem}
            onStartWorkspace={onStartWorkspace}
            onStopWorkspace={onStopWorkspace}
          />
        </div>
      </div>
    </div>
  );
}

export default WorkspacesModal;

