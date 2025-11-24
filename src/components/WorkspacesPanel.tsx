import { useMemo, useState } from 'react';
import type { ProjectInfo, Workspace } from '../types/global';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface WorkspacesPanelProps {
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
  onRestartWorkspace: (workspaceId: number) => Promise<void>;
  onRestartItem: (payload: { workspaceId: number; itemId: number }) => Promise<void>;
}

type DraftState = {
  projectId?: string;
  scriptName?: string;
  runMode: 'parallel' | 'sequential';
};

export function WorkspacesPanel({
  workspaces,
  projects,
  loading,
  onCreateWorkspace,
  onDeleteWorkspace,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onStartWorkspace,
  onStopWorkspace,
  onRestartWorkspace,
  onRestartItem
}: WorkspacesPanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState({ name: '', description: '' });
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<number | null>(null);
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{ id: number; name: string } | null>(null);
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, DraftState>>({});
  const [pendingCreate, setPendingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const sortedWorkspaces = useMemo(
    () =>
      [...workspaces].sort((a, b) => {
        if (a.favorite === b.favorite) {
          return a.name.localeCompare(b.name);
        }
        return a.favorite ? -1 : 1;
      }),
    [workspaces]
  );

  const handleCreateWorkspace = async () => {
    if (!createDraft.name.trim()) {
      setCreateError('Name is required.');
      return;
    }
    setCreateError(null);
    setPendingCreate(true);
    try {
      await onCreateWorkspace({
        name: createDraft.name.trim(),
        description: createDraft.description?.trim() || undefined
      });
      setCreateDraft({ name: '', description: '' });
      setShowCreate(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create workspace.');
    } finally {
      setPendingCreate(false);
    }
  };

  const handleToggleStart = async (workspace: Workspace) => {
    setPendingWorkspaceId(workspace.id);
    try {
      if ((workspace.activeRunCount ?? 0) > 0) {
        await onStopWorkspace(workspace.id);
      } else {
        await onStartWorkspace(workspace.id);
      }
    } catch (error) {
      console.error('Workspace action failed', error);
    } finally {
      setPendingWorkspaceId(null);
    }
  };

  const handleRestartWorkspace = async (workspace: Workspace) => {
    setPendingWorkspaceId(workspace.id);
    try {
      await onRestartWorkspace(workspace.id);
    } catch (error) {
      console.error('Failed to restart workspace', error);
    } finally {
      setPendingWorkspaceId(null);
    }
  };

  const handleAddItem = async (workspaceId: number) => {
    const draft = drafts[workspaceId];
    if (!draft?.projectId || !draft.scriptName) {
      return;
    }
    try {
      await onAddItem({
        workspaceId,
        projectId: draft.projectId,
        scriptName: draft.scriptName,
        runMode: draft.runMode
      });
      setDrafts((prev) => ({ ...prev, [workspaceId]: { runMode: 'parallel' } }));
    } catch (error) {
      console.error('Failed to add workspace item', error);
    }
  };

  const activeDraft = (workspaceId: number): DraftState =>
    drafts[workspaceId] ?? {
      runMode: 'parallel'
    };

  const projectScripts = (projectId?: string) => {
    if (!projectId) {
      return [];
    }
    return projects.find((project) => project.id === projectId)?.scripts ?? [];
  };

  const handleToggleRunMode = async (item: Workspace['items'][number]) => {
    try {
      await onUpdateItem({
        id: item.id,
        runMode: item.runMode === 'sequential' ? 'parallel' : 'sequential'
      });
    } catch (error) {
      console.error('Failed to update run mode', error);
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    try {
      await onRemoveItem(itemId);
    } catch (error) {
      console.error('Failed to remove workspace item', error);
    }
  };

  const handleRestartItem = async (workspaceId: number, itemId: number) => {
    setPendingItemId(itemId);
    try {
      await onRestartItem({ workspaceId, itemId });
    } catch (error) {
      console.error('Failed to restart workspace item', error);
    } finally {
      setPendingItemId((current) => (current === itemId ? null : current));
    }
  };

  const renderItems = (workspace: Workspace, canRestartItems: boolean) => {
    if (workspace.items.length === 0) {
      return <p className="text-sm text-slate-600 dark:text-slate-400">No scripts added yet.</p>;
    }
    return (
      <div className="space-y-3">
        {workspace.items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/40 p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.projectName || item.projectId}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {item.scriptName}{' '}
                <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {item.runMode === 'sequential' ? 'Sequential' : 'Parallel'}
                </span>
              </p>
              {item.envProfileName && (
                <p className="text-xs text-slate-500 dark:text-slate-400">Env: {item.envProfileName}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canRestartItems && (
                <button
                  onClick={() => handleRestartItem(workspace.id, item.id)}
                  disabled={pendingItemId === item.id}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100"
                >
                  Restart
                </button>
              )}
              <button
                onClick={() => handleToggleRunMode(item)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-400/50"
              >
                Toggle Mode
              </button>
              <button
                onClick={() => handleRemoveItem(item.id)}
                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Workspaces</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Group scripts across projects and run them together.</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100"
        >
          {showCreate ? 'Cancel' : '+ New Workspace'}
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Name</label>
              <input
                type="text"
                value={createDraft.name}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                placeholder="Full Stack Dev"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</label>
              <input
                type="text"
                value={createDraft.description}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                placeholder="Starts frontend + backend"
              />
            </div>
          </div>
          {createError && <p className="mt-2 text-sm text-rose-500">{createError}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreateWorkspace}
              disabled={pendingCreate}
              className="rounded-lg border border-indigo-200 bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 dark:border-indigo-500/40"
            >
              Create Workspace
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton lines={4} />
      ) : sortedWorkspaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          No workspaces yet. Use “New Workspace” to create your first bundle of scripts.
        </div>
      ) : (
        <div className="space-y-4">
          {sortedWorkspaces.map((workspace) => {
            const runningCount = workspace.activeRunCount ?? 0;
            const totalCount = workspace.items.length;
            const isRunning = runningCount > 0;
            const draft = activeDraft(workspace.id);
            const scripts = projectScripts(draft.projectId);

            return (
              <div
                key={workspace.id}
                className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{workspace.name}</h4>
                    {workspace.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">{workspace.description}</p>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {runningCount} / {totalCount || 0} running
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleToggleStart(workspace)}
                      disabled={pendingWorkspaceId === workspace.id}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                        isRunning
                          ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200'
                          : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'
                      } ${pendingWorkspaceId === workspace.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isRunning ? 'Stop Workspace' : 'Start Workspace'}
                    </button>
                  {isRunning && (
                    <button
                      onClick={() => handleRestartWorkspace(workspace)}
                      disabled={pendingWorkspaceId === workspace.id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                    >
                      Restart Workspace
                    </button>
                  )}
                    <button
                      onClick={() => setExpandedWorkspaceId((prev) => (prev === workspace.id ? null : workspace.id))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                    >
                      {expandedWorkspaceId === workspace.id ? 'Hide Scripts' : 'Manage Scripts'}
                    </button>
                    <button
                      onClick={() => setWorkspaceToDelete({ id: workspace.id, name: workspace.name })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">{renderItems(workspace, isRunning)}</div>

                {expandedWorkspaceId === workspace.id && (
                  <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                    <div className="grid gap-3 md:grid-cols-4">
                      <select
                        value={draft.projectId ?? ''}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [workspace.id]: { ...draft, projectId: event.target.value || undefined, scriptName: undefined }
                          }))
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                      >
                        <option value="">Select project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={draft.scriptName ?? ''}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [workspace.id]: { ...draft, scriptName: event.target.value || undefined }
                          }))
                        }
                        disabled={!draft.projectId}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                      >
                        <option value="">{draft.projectId ? 'Select script' : 'Choose project first'}</option>
                        {scripts.map((script) => (
                          <option key={script.name} value={script.name}>
                            {script.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={draft.runMode}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [workspace.id]: { ...draft, runMode: event.target.value as DraftState['runMode'] }
                          }))
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                      >
                        <option value="parallel">Parallel</option>
                        <option value="sequential">Sequential</option>
                      </select>
                      <button
                        onClick={() => handleAddItem(workspace.id)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100"
                        disabled={!draft.projectId || !draft.scriptName}
                      >
                        + Add Script
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={Boolean(workspaceToDelete)}
        onClose={() => setWorkspaceToDelete(null)}
        onConfirm={async () => {
          if (workspaceToDelete) {
            await onDeleteWorkspace(workspaceToDelete.id);
            setWorkspaceToDelete(null);
          }
        }}
        title="Delete Workspace"
        message="Deleting this workspace will remove all of its scripts. This action cannot be undone."
        itemName={workspaceToDelete?.name}
      />
    </div>
  );
}

export default WorkspacesPanel;

