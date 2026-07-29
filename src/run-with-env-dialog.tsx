import React from 'react';
import type { EnvVariable } from './types';
import { Ic } from './icons';

interface RunWithEnvDialogProps {
  scriptName: string;
  profileName: string | null;
  onClose: () => void;
  onRun: (variables: EnvVariable[]) => void;
}

function rowId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type DraftVariable = EnvVariable & { id: string };

export function RunWithEnvDialog({ scriptName, profileName, onClose, onRun }: RunWithEnvDialogProps) {
  const [variables, setVariables] = React.useState<DraftVariable[]>([
    { id: rowId(), key: '', value: '', is_secret: false },
  ]);
  const [revealed, setRevealed] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState('');

  function update(id: string, patch: Partial<DraftVariable>) {
    setVariables(current => current.map(variable => variable.id === id ? { ...variable, ...patch } : variable));
  }

  function run() {
    const normalized = variables
      .filter(variable => variable.key.trim() || variable.value)
      .map(variable => ({ ...variable, key: variable.key.trim() }));
    const invalid = normalized.find(variable => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.key));
    if (invalid) {
      setError(`"${invalid.key || 'empty key'}" is not a valid environment variable name.`);
      return;
    }
    const keys = normalized.map(variable => variable.key);
    if (new Set(keys).size !== keys.length) {
      setError('Temporary override keys must be unique.');
      return;
    }
    onRun(normalized.map(({ id: _id, ...variable }) => variable));
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 170,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(3, 5, 8, 0.72)',
        backdropFilter: 'blur(6px)',
      }}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-env-title"
        style={{
          width: 'min(650px, calc(100vw - 48px))',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'auto',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="panel-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>One run only</div>
            <div id="run-env-title" style={{ color: 'var(--fg-1)', fontSize: 16, fontWeight: 650 }}>
              Run {scriptName} with overrides
            </div>
            <div style={{ color: 'var(--fg-4)', fontSize: 11, marginTop: 5 }}>
              {profileName ? `Overrides are applied on top of “${profileName}”.` : 'Overrides are applied on top of the system environment.'}
            </div>
          </div>
          <button className="btn sm ghost" onClick={onClose} aria-label="Close"><Ic.Close size={12} /></button>
        </div>

        {error && <div style={{ padding: '10px 14px', color: 'var(--danger)', borderBottom: '1px solid var(--line-soft)' }}>{error}</div>}

        <div style={{ padding: 14 }}>
          {variables.map(variable => (
            <div key={variable.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(200px, 2fr) auto auto auto', gap: 7, marginBottom: 8 }}>
              <input
                className="input mono"
                aria-label="Override key"
                placeholder="PORT"
                value={variable.key}
                onChange={event => update(variable.id, { key: event.target.value })}
              />
              <input
                className="input mono"
                aria-label={`${variable.key || 'Override'} value`}
                type={variable.is_secret && !revealed.has(variable.id) ? 'password' : 'text'}
                placeholder="5173"
                value={variable.value}
                onChange={event => update(variable.id, { value: event.target.value })}
              />
              <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--fg-3)', fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={variable.is_secret}
                  onChange={event => update(variable.id, { is_secret: event.target.checked })}
                />
                Secret
              </label>
              <button
                className="btn sm ghost"
                disabled={!variable.is_secret}
                onClick={() => setRevealed(current => {
                  const next = new Set(current);
                  if (next.has(variable.id)) next.delete(variable.id);
                  else next.add(variable.id);
                  return next;
                })}
              >
                {revealed.has(variable.id) ? 'Hide' : 'Reveal'}
              </button>
              <button
                className="btn sm ghost"
                aria-label={`Remove ${variable.key || 'override'}`}
                onClick={() => setVariables(current => current.filter(item => item.id !== variable.id))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="btn sm ghost"
            onClick={() => setVariables(current => [...current, { id: rowId(), key: '', value: '', is_secret: false }])}
          >
            <Ic.Plus size={10} /> Add override
          </button>
        </div>

        <div style={{ padding: '11px 14px', borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--fg-4)', fontSize: 10.5 }}>
            Values are not saved. Restart keeps this run&apos;s environment; stopping and starting normally removes it.
          </span>
          <span style={{ display: 'inline-flex', gap: 7 }}>
            <button className="btn sm ghost" onClick={onClose}>Cancel</button>
            <button className="btn sm primary" onClick={run}><Ic.Play size={10} /> Run once</button>
          </span>
        </div>
      </div>
    </div>
  );
}
