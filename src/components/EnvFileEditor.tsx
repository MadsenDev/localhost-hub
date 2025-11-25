import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectInfo } from '../types/global';

type EnvEntry = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

interface EnvFileEditorProps {
  project: ProjectInfo;
  electronAPI?: Window['electronAPI'];
}

function parseEnv(content: string): EnvEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: EnvEntry[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const disabled = trimmed.startsWith('#');
    const activeLine = disabled ? trimmed.replace(/^#\s*/, '') : trimmed;
    const eqIndex = activeLine.indexOf('=');
    if (eqIndex === -1) {
      return;
    }
    const key = activeLine.slice(0, eqIndex).trim();
    const value = activeLine.slice(eqIndex + 1).trim();
    if (!key) {
      return;
    }
    entries.push({
      id: `${key}-${index}`,
      key,
      value,
      enabled: !disabled
    });
  });
  return entries;
}

function serializeEnv(entries: EnvEntry[]): string {
  return entries
    .filter((entry) => entry.key.trim())
    .map((entry) => {
      const line = `${entry.key}=${entry.value}`;
      return entry.enabled ? line : `# ${line}`;
    })
    .join('\n');
}

export function EnvFileEditor({ project, electronAPI }: EnvFileEditorProps) {
  const [files, setFiles] = useState<Array<{ name: string; exists: boolean }>>([]);
  const [selectedFile, setSelectedFile] = useState<string>('.env');
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBridge = Boolean(electronAPI?.envFiles);

  const loadFiles = useCallback(async () => {
    if (!electronAPI?.envFiles) {
      setFiles([]);
      return;
    }
    try {
      const list = await electronAPI.envFiles.list(project.path);
      setFiles(list);
      setSelectedFile((current) => {
        if (current && list.some((file) => file.name === current)) {
          return current;
        }
        return list[0]?.name ?? '.env';
      });
    } catch (err) {
      console.error('Failed to load env files', err);
      setFiles([]);
    }
  }, [electronAPI, project.path]);

  const loadContents = useCallback(async () => {
    if (!electronAPI?.envFiles || !selectedFile) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const contents = await electronAPI.envFiles.read({
        projectPath: project.path,
        file: selectedFile
      });
      setEntries(parseEnv(contents));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load env file.';
      setError(message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [electronAPI, project.path, selectedFile]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  const handleAddEntry = () => {
    setEntries((current) => [
      ...current,
      { id: `entry-${Date.now()}`, key: '', value: '', enabled: true }
    ]);
  };

  const handleChangeEntry = (id: string, changes: Partial<EnvEntry>) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
  };

  const handleRemoveEntry = (id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  };

  const handleBooleanToggle = (id: string) => {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        const normalized = entry.value.toLowerCase();
        if (['true', 'false'].includes(normalized)) {
          return { ...entry, value: normalized === 'true' ? 'false' : 'true' };
        }
        if (['1', '0'].includes(normalized)) {
          return { ...entry, value: normalized === '1' ? '0' : '1' };
        }
        return entry;
      })
    );
  };

  const handleSave = async () => {
    if (!electronAPI?.envFiles) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const serialized = serializeEnv(entries);
      await electronAPI.envFiles.write({
        projectPath: project.path,
        file: selectedFile,
        contents: serialized
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save env file.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const booleanCandidates = useMemo(() => new Set(['true', 'false', '1', '0']), []);

  if (!hasBridge) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        Connect the desktop app to edit .env files.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Project env files</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Toggle feature flags or update secrets without leaving the app.
          </p>
        </div>
        <select
          value={selectedFile}
          onChange={(event) => setSelectedFile(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
        >
          {files.map((file) => (
            <option key={file.name} value={file.name}>
              {file.name}
              {!file.exists ? ' (new)' : ''}
            </option>
          ))}
          {files.length === 0 && <option value=".env">.env</option>}
        </select>
      </div>

      {error && <p className="text-sm text-rose-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading env file…</p>
      ) : (
        <div className="space-y-3">
          {entries.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">No variables yet. Add your first one below.</p>
          )}
          {entries.map((entry) => {
            const isBoolean = booleanCandidates.has(entry.value.toLowerCase());
            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-slate-200 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                  <input
                    value={entry.key}
                    onChange={(event) => handleChangeEntry(entry.id, { key: event.target.value })}
                    placeholder="KEY"
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                  />
                  <input
                    value={entry.value}
                    onChange={(event) => handleChangeEntry(entry.id, { value: event.target.value })}
                    placeholder="value"
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onChange={(event) => handleChangeEntry(entry.id, { enabled: event.target.checked })}
                      />
                      Enabled
                    </label>
                    {isBoolean && (
                      <button
                        className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
                        onClick={() => handleBooleanToggle(entry.id)}
                      >
                        Toggle boolean
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveEntry(entry.id)}
                    className="text-rose-500 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <button
            onClick={handleAddEntry}
            className="w-full rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
          >
            + Add variable
          </button>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={loadContents}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl border border-indigo-200 bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 dark:border-indigo-500/40"
        >
          {saving ? 'Saving…' : 'Save env file'}
        </button>
      </div>
    </div>
  );
}

export default EnvFileEditor;

