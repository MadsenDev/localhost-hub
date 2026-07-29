import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceView } from '../view-workspace';
import type { Workspace } from '../types';

const workspace: Workspace = {
  id: 'shop',
  name: 'Shop',
  desc: '1 service',
  swatch: '#4a78c4',
  path: '',
  projects: ['api'],
  services: [{
    id: 'api',
    project: 'api',
    name: 'api',
    cmd: 'cargo run',
    repo_path: '/code/api',
    port: null,
    status: 'stopped',
    uptime: 0,
    pkg: 'cargo',
    cpu: 0,
    mem: 0,
    framework: 'Rust',
    run_mode: 'sequential',
    order: 0,
    expected_port: 8080,
    startup_delay_ms: 2_000,
    readiness_timeout_ms: 30_000,
  }],
  sessions: 0,
  lastOpened: 'recently',
};

describe('workspace readiness controls', () => {
  it('edits sequential startup delay and readiness timeout in seconds', () => {
    const onUpdateService = vi.fn();
    render(
      <WorkspaceView
        workspace={workspace}
        onStartSvc={vi.fn()}
        onStopSvc={vi.fn()}
        onRestartSvc={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onOpenLogs={vi.fn()}
        onOpenWorkspaceLogs={vi.fn()}
        onOpenUrl={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onUpdateWorkspace={vi.fn()}
        onRemoveService={vi.fn()}
        onUpdateService={onUpdateService}
        onAddService={vi.fn()}
        repos={[]}
        envProfiles={[]}
        onAddToWorkspace={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('api startup delay seconds')).toHaveValue('2');
    expect(screen.getByLabelText('api readiness timeout seconds')).toHaveValue('30');

    fireEvent.change(screen.getByLabelText('api startup delay seconds'), { target: { value: '5' } });
    expect(onUpdateService).toHaveBeenCalledWith('shop', 'api', { startup_delay_ms: 5_000 });

    fireEvent.change(screen.getByLabelText('api readiness timeout seconds'), { target: { value: '45' } });
    expect(onUpdateService).toHaveBeenCalledWith('shop', 'api', { readiness_timeout_ms: 45_000 });
  });
});
