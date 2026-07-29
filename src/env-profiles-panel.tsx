import React from 'react';
import type { EnvProfile } from './types';
import { Ic } from './icons';
import { tauriApi } from './tauri-api';

interface EnvProfilesPanelProps {
  projectPath: string;
  profiles: EnvProfile[];
  onSave: (profiles: EnvProfile[]) => Promise<void>;
}

function newId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function EnvProfilesPanel({ projectPath, profiles, onSave }: EnvProfilesPanelProps) {
  const [drafts, setDrafts] = React.useState<EnvProfile[]>(profiles);
  const [revealed, setRevealed] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [transferring, setTransferring] = React.useState('');
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    setDrafts(profiles);
    setRevealed(new Set());
    setError('');
    setStatus('');
  }, [projectPath, profiles]);

  function updateProfile(id: string, patch: Partial<EnvProfile>) {
    setDrafts(current => current.map(profile => profile.id === id ? { ...profile, ...patch } : profile));
  }

  function setDefault(id: string) {
    setDrafts(current => current.map(profile => ({ ...profile, is_default: profile.id === id })));
  }

  function addProfile() {
    const profile: EnvProfile = {
      id: newId('env'),
      project_path: projectPath,
      name: `Profile ${drafts.length + 1}`,
      description: '',
      is_default: drafts.length === 0,
      vars: [],
    };
    setDrafts(current => [...current, profile]);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await onSave(drafts);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  async function importFile() {
    setError('');
    setStatus('');
    setTransferring('import');
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({
        title: 'Import an environment file',
        multiple: false,
        directory: false,
      });
      if (!path) return;
      const imported = await tauriApi.importEnvFile(path);
      if (!imported) throw new Error('Environment import is available in the desktop app.');
      const fileName = imported.path.replace(/\\/g, '/').split('/').pop() || '.env';
      const profile: EnvProfile = {
        id: newId('env'),
        project_path: projectPath,
        name: fileName,
        description: `Imported from ${fileName}`,
        is_default: drafts.length === 0,
        vars: imported.variables,
      };
      setDrafts(current => [...current, profile]);
      setStatus(`Imported ${imported.variables.length} variables into a new unsaved profile.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setTransferring('');
    }
  }

  async function exportProfile(profile: EnvProfile) {
    const confirmed = window.confirm(
      `Export "${profile.name}" to a plaintext .env file? Secret-marked values will be included.`,
    );
    if (!confirmed) return;
    setError('');
    setStatus('');
    setTransferring(`export:${profile.id}`);
    try {
      const { save: saveDialog } = await import('@tauri-apps/plugin-dialog');
      const suffix = profile.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
      const defaultPath = profile.name === '.env' || profile.name.startsWith('.env.')
        ? profile.name
        : suffix ? `.env.${suffix}` : '.env';
      const path = await saveDialog({
        title: 'Export environment profile',
        defaultPath,
      });
      if (!path) return;
      await tauriApi.exportEnvFile(path, profile.vars);
      setStatus(`Exported ${profile.vars.length} variables with owner-private permissions where supported.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setTransferring('');
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title"><span className="dot" /> Environment profiles</div>
          <div style={{ color: 'var(--fg-4)', fontSize: 11, marginTop: 4 }}>
            Profiles extend the system environment when Hub starts a service. Secret fields are masked in the interface.
          </div>
        </div>
        <div className="panel-actions">
          <button className="btn sm ghost" onClick={() => void importFile()} disabled={Boolean(transferring)}>
            {transferring === 'import' ? 'Importing…' : 'Import .env'}
          </button>
          <button className="btn sm ghost" onClick={addProfile}><Ic.Plus size={11} /> Add profile</button>
          <button className="btn sm primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save profiles'}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '10px 14px', color: 'var(--danger)', borderBottom: '1px solid var(--line-soft)' }}>{error}</div>}
      {status && <div style={{ padding: '10px 14px', color: 'var(--ok)', borderBottom: '1px solid var(--line-soft)' }}>{status}</div>}

      {drafts.length === 0 ? (
        <div className="empty" style={{ padding: 36 }}>
          <Ic.Activity size={28} />
          <div style={{ color: 'var(--fg-3)', marginTop: 9, fontSize: 12 }}>
            No profiles yet. Add one to supply variables to project scripts and workspace services.
          </div>
        </div>
      ) : drafts.map(profile => (
        <div key={profile.id} style={{ padding: 14, borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(220px, 2fr) auto auto auto', gap: 8, alignItems: 'center' }}>
            <input
              aria-label="Profile name"
              className="input"
              value={profile.name}
              onChange={event => updateProfile(profile.id, { name: event.target.value })}
              placeholder="Development"
            />
            <input
              aria-label="Profile description"
              className="input"
              value={profile.description}
              onChange={event => updateProfile(profile.id, { description: event.target.value })}
              placeholder="Optional description"
            />
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--fg-3)', fontSize: 11 }}>
              <input type="radio" checked={profile.is_default} onChange={() => setDefault(profile.id)} />
              Default
            </label>
            <button
              className="btn sm ghost"
              onClick={() => void exportProfile(profile)}
              disabled={Boolean(transferring)}
            >
              {transferring === `export:${profile.id}` ? 'Exporting…' : 'Export .env'}
            </button>
            <button
              className="btn sm ghost"
              style={{ color: 'var(--danger)' }}
              onClick={() => setDrafts(current => current.filter(item => item.id !== profile.id))}
            >
              Remove
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            {profile.vars.map((variable, index) => {
              const revealKey = `${profile.id}:${index}`;
              return (
                <div key={revealKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 2fr) auto auto auto', gap: 7, marginTop: 7 }}>
                  <input
                    aria-label="Variable key"
                    className="input mono"
                    value={variable.key}
                    onChange={event => updateProfile(profile.id, {
                      vars: profile.vars.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item),
                    })}
                    placeholder="API_URL"
                  />
                  <input
                    aria-label={`${variable.key || 'Variable'} value`}
                    className="input mono"
                    type={variable.is_secret && !revealed.has(revealKey) ? 'password' : 'text'}
                    value={variable.value}
                    onChange={event => updateProfile(profile.id, {
                      vars: profile.vars.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item),
                    })}
                    placeholder="value"
                  />
                  <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--fg-3)', fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={variable.is_secret}
                      onChange={event => updateProfile(profile.id, {
                        vars: profile.vars.map((item, itemIndex) => itemIndex === index ? { ...item, is_secret: event.target.checked } : item),
                      })}
                    />
                    Secret
                  </label>
                  <button
                    className="btn sm ghost"
                    disabled={!variable.is_secret}
                    onClick={() => setRevealed(current => {
                      const next = new Set(current);
                      if (next.has(revealKey)) next.delete(revealKey);
                      else next.add(revealKey);
                      return next;
                    })}
                  >
                    {revealed.has(revealKey) ? 'Hide' : 'Reveal'}
                  </button>
                  <button
                    className="btn sm ghost"
                    aria-label={`Remove ${variable.key || 'variable'}`}
                    onClick={() => updateProfile(profile.id, { vars: profile.vars.filter((_, itemIndex) => itemIndex !== index) })}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              className="btn sm ghost"
              style={{ marginTop: 9 }}
              onClick={() => updateProfile(profile.id, {
                vars: [...profile.vars, { key: '', value: '', is_secret: false }],
              })}
            >
              <Ic.Plus size={10} /> Add variable
            </button>
          </div>
        </div>
      ))}

      <div style={{ padding: '10px 14px', color: 'var(--fg-4)', fontSize: 10.5 }}>
        Values are stored locally in Hub&apos;s private configuration. The “secret” flag masks display; it does not encrypt the value.
      </div>
    </div>
  );
}
