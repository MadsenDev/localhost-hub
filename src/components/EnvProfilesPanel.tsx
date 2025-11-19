import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EnvProfile, EnvVar } from '../types/global';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { LoadingSkeleton } from './LoadingSkeleton';

interface EnvProfilesPanelProps {
  projectId: string;
  electronAPI?: Window['electronAPI'];
}

export function EnvProfilesPanel({ projectId, electronAPI }: EnvProfilesPanelProps) {
  const [profiles, setProfiles] = useState<EnvProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<number | null>(null);
  const [editingVars, setEditingVars] = useState<Map<number, EnvVar[]>>(new Map());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDescription, setNewProfileDescription] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ profileId: number; profileName: string } | null>(null);

  const inputClass =
    'rounded-lg border border-slate-300 bg-white/95 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:ring-0';
  const inputCompactClass =
    'rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:ring-0';
  const cardClass =
    'rounded-xl border border-slate-200 bg-white/95 p-4 space-y-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/40';
  const subtleButtonClass =
    'rounded-lg border px-3 py-1 text-xs font-semibold transition';

  const loadProfiles = useCallback(async () => {
    if (!electronAPI?.envProfiles) return;
    try {
      setLoading(true);
      const data = await electronAPI.envProfiles.list(projectId);
      setProfiles(data);
      // Initialize editing vars map
      const varsMap = new Map<number, EnvVar[]>();
      data.forEach((profile) => {
        varsMap.set(profile.id, [...profile.vars]);
      });
      setEditingVars(varsMap);
    } catch (error) {
      console.error('Error loading env profiles:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, electronAPI]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleCreateProfile = useCallback(async () => {
    if (!electronAPI?.envProfiles || !newProfileName.trim()) return;
    try {
      const result = await electronAPI.envProfiles.create({
        projectId,
        name: newProfileName.trim(),
        description: newProfileDescription.trim() || undefined
      });
      setNewProfileName('');
      setNewProfileDescription('');
      setShowCreateForm(false);
      await loadProfiles();
    } catch (error) {
      console.error('Error creating profile:', error);
    }
  }, [electronAPI, projectId, newProfileName, newProfileDescription, loadProfiles]);

  const handleDeleteClick = useCallback((profileId: number, profileName: string) => {
    setDeleteConfirm({ profileId, profileName });
  }, []);

  const handleDeleteConfirm = useCallback(
    async () => {
      if (!electronAPI?.envProfiles || !deleteConfirm) return;
      try {
        await electronAPI.envProfiles.delete(deleteConfirm.profileId);
        setDeleteConfirm(null);
        await loadProfiles();
      } catch (error) {
        console.error('Error deleting profile:', error);
        setDeleteConfirm(null);
      }
    },
    [electronAPI, deleteConfirm, loadProfiles]
  );

  const handleToggleDefault = useCallback(
    async (profileId: number, isDefault: boolean) => {
      if (!electronAPI?.envProfiles) return;
      try {
        await electronAPI.envProfiles.update({ id: profileId, isDefault: !isDefault });
        await loadProfiles();
      } catch (error) {
        console.error('Error updating profile:', error);
      }
    },
    [electronAPI, loadProfiles]
  );

  const handleUpdateProfile = useCallback(
    async (profileId: number, updates: { name?: string; description?: string }) => {
      if (!electronAPI?.envProfiles) return;
      try {
        await electronAPI.envProfiles.update({ id: profileId, ...updates });
        setEditingProfile(null);
        await loadProfiles();
      } catch (error) {
        console.error('Error updating profile:', error);
      }
    },
    [electronAPI, loadProfiles]
  );

  const handleSaveVars = useCallback(
    async (profileId: number) => {
      if (!electronAPI?.envProfiles) return;
      const vars = editingVars.get(profileId) || [];
      // Filter out empty keys
      const validVars = vars.filter((v) => v.key.trim() !== '');
      try {
        await electronAPI.envProfiles.setVars({
          profileId,
          vars: validVars.map((v) => ({
            key: v.key.trim(),
            value: v.value,
            isSecret: v.isSecret
          }))
        });
        await loadProfiles();
      } catch (error) {
        console.error('Error saving vars:', error);
      }
    },
    [electronAPI, editingVars, loadProfiles]
  );

  const handleAddVar = useCallback((profileId: number) => {
    setEditingVars((prev) => {
      const newMap = new Map(prev);
      const vars = newMap.get(profileId) || [];
      newMap.set(profileId, [
        ...vars,
        {
          id: Date.now(), // Temporary ID
          envProfileId: profileId,
          key: '',
          value: '',
          isSecret: false
        }
      ]);
      return newMap;
    });
  }, []);

  const handleRemoveVar = useCallback((profileId: number, varId: number) => {
    setEditingVars((prev) => {
      const newMap = new Map(prev);
      const vars = newMap.get(profileId) || [];
      newMap.set(profileId, vars.filter((v) => v.id !== varId));
      return newMap;
    });
  }, []);

  const handleUpdateVar = useCallback((profileId: number, varId: number, updates: Partial<EnvVar>) => {
    setEditingVars((prev) => {
      const newMap = new Map(prev);
      const vars = newMap.get(profileId) || [];
      newMap.set(
        profileId,
        vars.map((v) => (v.id === varId ? { ...v, ...updates } : v))
      );
      return newMap;
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton lines={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Environment Profiles</h3>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
        >
          {showCreateForm ? 'Cancel' : '+ New Profile'}
        </button>
      </div>

      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 space-y-3 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/5"
          >
            <input
              type="text"
              placeholder="Profile name (e.g., dev, staging, prod)"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              className={`${inputClass} w-full`}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newProfileDescription}
              onChange={(e) => setNewProfileDescription(e.target.value)}
              className={`${inputClass} w-full`}
            />
            <button
              onClick={handleCreateProfile}
              disabled={!newProfileName.trim()}
              className="rounded-lg border border-indigo-200 bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40 dark:border-indigo-500/40 dark:bg-indigo-500/30 dark:text-indigo-100"
            >
              Create Profile
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {profiles.length === 0 && !showCreateForm ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">No environment profiles yet. Create one to get started.</p>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {profiles.map((profile, index) => {
              const isEditing = editingProfile === profile.id;
              const vars = editingVars.get(profile.id) || [];

              return (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className={cardClass}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            defaultValue={profile.name}
                            onBlur={(e) => {
                              if (e.target.value !== profile.name) {
                                handleUpdateProfile(profile.id, { name: e.target.value });
                              }
                            }}
                            className={`${inputClass} w-full py-1.5`}
                          />
                          <input
                            type="text"
                            defaultValue={profile.description || ''}
                            placeholder="Description (optional)"
                            onBlur={(e) => {
                              if (e.target.value !== (profile.description || '')) {
                                handleUpdateProfile(profile.id, { description: e.target.value || undefined });
                              }
                            }}
                            className={`${inputClass} w-full py-1.5`}
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">{profile.name}</h4>
                            {profile.isDefault && (
                              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200">
                                Default
                              </span>
                            )}
                          </div>
                          {profile.description && (
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{profile.description}</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleDefault(profile.id, profile.isDefault)}
                        className={`${subtleButtonClass} ${
                          profile.isDefault
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-indigo-400/40 dark:hover:text-indigo-200'
                        }`}
                      >
                        {profile.isDefault ? 'Default' : 'Set Default'}
                      </button>
                      <button
                        onClick={() => setEditingProfile(isEditing ? null : profile.id)}
                        className={`${subtleButtonClass} border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-indigo-400/40 dark:hover:text-white`}
                      >
                        {isEditing ? 'Done' : 'Edit'}
                      </button>
                      <button
                        onClick={() => handleDeleteClick(profile.id, profile.name)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Environment Variables
                      </p>
                      <button
                        onClick={() => handleAddVar(profile.id)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-indigo-400/40 dark:hover:text-white"
                      >
                        + Add Var
                      </button>
                    </div>
                    {vars.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">No environment variables defined</p>
                    ) : (
                      <div className="space-y-2">
                        {vars.map((envVar) => (
                          <div key={envVar.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="KEY"
                              value={envVar.key}
                              onChange={(e) => handleUpdateVar(profile.id, envVar.id, { key: e.target.value })}
                              className={`${inputCompactClass} flex-1`}
                            />
                            <input
                              type={envVar.isSecret ? 'password' : 'text'}
                              placeholder="value"
                              value={envVar.value}
                              onChange={(e) => handleUpdateVar(profile.id, envVar.id, { value: e.target.value })}
                              className={`${inputCompactClass} flex-1`}
                            />
                            <button
                              onClick={() => handleUpdateVar(profile.id, envVar.id, { isSecret: !envVar.isSecret })}
                              className={`${subtleButtonClass} px-2 py-1.5 ${
                                envVar.isSecret
                                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300'
                                  : 'border-slate-300 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-amber-400/40 dark:hover:text-amber-300'
                              }`}
                              title={envVar.isSecret ? 'Secret (hidden)' : 'Mark as secret'}
                            >
                              🔒
                            </button>
                            <button
                              onClick={() => handleRemoveVar(profile.id, envVar.id)}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/30"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => handleSaveVars(profile.id)}
                          className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
                        >
                          Save Variables
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Environment Profile"
        message="Are you sure you want to delete this environment profile? This action cannot be undone."
        itemName={deleteConfirm?.profileName}
      />
    </div>
  );
}

export default EnvProfilesPanel;

