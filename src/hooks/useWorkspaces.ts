import { useCallback, useEffect, useState } from 'react';
import type { Workspace } from '../types/global';

type WorkspaceDraft = {
  name: string;
  description?: string;
  favorite?: boolean;
};

export function useWorkspaces(electronAPI?: Window['electronAPI']) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    if (!electronAPI?.workspaces) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await electronAPI.workspaces.list();
      setWorkspaces(result);
    } finally {
      setLoading(false);
    }
  }, [electronAPI]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!electronAPI?.workspaces?.onStatus) {
      return;
    }
    const unsubscribe = electronAPI.workspaces.onStatus((payload) => {
      setWorkspaces((prev) =>
        prev.map((workspace) =>
          workspace.id === payload.workspaceId ? { ...workspace, activeRunCount: payload.activeRunCount } : workspace
        )
      );
    });
    return unsubscribe;
  }, [electronAPI]);

  const createWorkspace = useCallback(
    async (draft: WorkspaceDraft) => {
      if (!electronAPI?.workspaces) {
        return null;
      }
      const result = await electronAPI.workspaces.create(draft);
      await loadWorkspaces();
      return result.id;
    },
    [electronAPI, loadWorkspaces]
  );

  const updateWorkspace = useCallback(
    async (payload: { id: number; name?: string; description?: string; favorite?: boolean }) => {
      if (!electronAPI?.workspaces) {
        return;
      }
      await electronAPI.workspaces.update(payload);
      await loadWorkspaces();
    },
    [electronAPI, loadWorkspaces]
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: number) => {
      if (!electronAPI?.workspaces) {
        return;
      }
      await electronAPI.workspaces.delete(workspaceId);
      await loadWorkspaces();
    },
    [electronAPI, loadWorkspaces]
  );

  const addWorkspaceItem = useCallback(
    async (payload: { workspaceId: number; projectId: string; scriptName: string; envProfileId?: number | null; runMode?: 'parallel' | 'sequential' }) => {
      if (!electronAPI?.workspaces) {
        return;
      }
      await electronAPI.workspaces.addItem(payload);
      await loadWorkspaces();
    },
    [electronAPI, loadWorkspaces]
  );

  const updateWorkspaceItem = useCallback(
    async (payload: { id: number; envProfileId?: number | null; runMode?: 'parallel' | 'sequential'; orderIndex?: number }) => {
      if (!electronAPI?.workspaces) {
        return;
      }
      await electronAPI.workspaces.updateItem(payload);
      await loadWorkspaces();
    },
    [electronAPI, loadWorkspaces]
  );

  const removeWorkspaceItem = useCallback(
    async (itemId: number) => {
      if (!electronAPI?.workspaces) {
        return;
      }
      await electronAPI.workspaces.removeItem(itemId);
      await loadWorkspaces();
    },
    [electronAPI, loadWorkspaces]
  );

  const startWorkspace = useCallback(
    async (workspaceId: number) => {
      if (!electronAPI?.workspaces) {
        return;
      }
      await electronAPI.workspaces.start(workspaceId);
    },
    [electronAPI]
  );

  const stopWorkspace = useCallback(
    async (workspaceId: number) => {
      if (!electronAPI?.workspaces) {
        return;
      }
      await electronAPI.workspaces.stop(workspaceId);
    },
    [electronAPI]
  );

  return {
    workspaces,
    loading,
    reload: loadWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    addWorkspaceItem,
    updateWorkspaceItem,
    removeWorkspaceItem,
    startWorkspace,
    stopWorkspace
  };
}

