import React from 'react';
import { Ic } from './icons';
import type { LivePort } from './tauri-api';

export type PortConflictDecision = 'cancel' | 'terminate' | 'force';

interface PortConflictDialogProps {
  conflicts: LivePort[];
  onDecide: (decision: PortConflictDecision) => void;
}

function ownerLabel(conflict: LivePort) {
  if (conflict.process_name && conflict.pid) return `${conflict.process_name} · PID ${conflict.pid}`;
  if (conflict.process_name) return conflict.process_name;
  if (conflict.pid) return `PID ${conflict.pid}`;
  return 'Unknown process';
}

export function PortConflictDialog({ conflicts, onDecide }: PortConflictDialogProps) {
  const knownOwners = new Set(
    conflicts.map(conflict => conflict.pid).filter((pid): pid is number => pid != null),
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 180,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(3, 5, 8, 0.76)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="port-conflict-title"
        style={{ width: 'min(620px, calc(100vw - 48px))', boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5)' }}
      >
        <div className="panel-head">
          <div>
            <div className="eyebrow" style={{ color: 'var(--warn)', marginBottom: 4 }}>Start blocked</div>
            <div id="port-conflict-title" style={{ color: 'var(--fg-1)', fontSize: 16, fontWeight: 650 }}>
              {conflicts.length === 1 ? 'Expected port is already in use' : 'Expected ports are already in use'}
            </div>
            <div style={{ color: 'var(--fg-4)', fontSize: 11, marginTop: 5 }}>
              Localhost Hub checked immediately before launch to avoid starting a service that cannot bind.
            </div>
          </div>
        </div>

        <div style={{ padding: 14, display: 'grid', gap: 8 }}>
          {conflicts.map(conflict => (
            <div key={`${conflict.port}:${conflict.pid ?? 'unknown'}`} className="ws-card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                <span className="mono" style={{ color: 'var(--warn)', fontSize: 15, fontWeight: 650 }}>:{conflict.port}</span>
                <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>{ownerLabel(conflict)}</span>
              </div>
              <div className="mono" style={{ color: 'var(--fg-4)', fontSize: 10.5, marginTop: 6 }}>
                {conflict.bind_address || 'unknown address'} · {conflict.protocol.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '11px 14px', borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <button className="btn sm ghost" onClick={() => onDecide('cancel')}>Cancel</button>
          <span style={{ display: 'inline-flex', gap: 7 }}>
            <button
              className="btn sm danger"
              disabled={knownOwners.size === 0}
              title={knownOwners.size === 0 ? 'The operating system did not expose an owner PID.' : 'Terminate the listed owner processes and check again.'}
              onClick={() => onDecide('terminate')}
            >
              <Ic.Stop size={10} /> Stop {knownOwners.size === 1 ? 'owner' : 'owners'} & retry
            </button>
            <button className="btn sm ghost" onClick={() => onDecide('force')}>
              <Ic.Play size={10} /> Start anyway
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
