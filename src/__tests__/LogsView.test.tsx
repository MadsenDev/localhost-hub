import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogsView, serializeLogs } from '../view-logs';
import type { LogLine, Service, Workspace } from '../types';

const { saveMock, writeTextFileMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: saveMock }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile: writeTextFileMock }));

const service: Service = {
  id: 'service-dev',
  project: 'localhost-hub',
  name: 'frontend',
  cmd: 'npm run dev',
  status: 'running',
  uptime: 10,
  port: 5173,
  pkg: 'npm',
  cpu: 1,
  mem: 64,
  framework: 'React',
};

const workspace: Workspace = {
  id: 'workspace-main',
  name: 'Localhost Hub',
  desc: '',
  swatch: '#7c8cff',
  path: '/code',
  projects: ['localhost-hub'],
  services: [service],
  lastOpened: 'now',
};

const logs: LogLine[] = [
  { ts: '10:42:00.125', src: service.id, kind: 'ok', msg: 'ready at http://localhost:5173' },
  { ts: '10:42:01.250', src: service.id, kind: 'error', msg: '<img src=x onerror=alert(1)> failed' },
];

function renderLogs(overrides: Partial<React.ComponentProps<typeof LogsView>> = {}) {
  const props: React.ComponentProps<typeof LogsView> = {
    workspaces: [workspace],
    services: [service],
    logs,
    sources: { [service.id]: true },
    toggleSource: vi.fn(),
    setAllSources: vi.fn(),
    search: '',
    setSearch: vi.fn(),
    autoscroll: true,
    setAutoscroll: vi.fn(),
    clearLogs: vi.fn(),
    ...overrides,
  };
  return { ...render(<LogsView {...props} />), props };
}

describe('LogsView', () => {
  beforeEach(() => {
    saveMock.mockReset();
    writeTextFileMock.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('filters by level, searches source names, and renders process text safely', () => {
    const { rerender, props } = renderLogs();

    expect(screen.getByText('<img src=x onerror=alert(1)> failed')).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Errors 1/ }));
    expect(screen.queryByText('<img src=x onerror=alert(1)> failed')).not.toBeInTheDocument();
    expect(screen.getByText('ready at http://localhost:5173')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Errors 1/ }));
    rerender(<LogsView {...props} search="frontend" />);
    expect(screen.getByText('ready at http://localhost:5173')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)> failed')).toBeInTheDocument();
  });

  it('copies and exports exactly the visible log representation', async () => {
    saveMock.mockResolvedValue('/tmp/frontend.log');
    renderLogs({ logs: [logs[0]] });
    const expected = '[10:42:00.125] [OK] [frontend] ready at http://localhost:5173';

    fireEvent.click(screen.getByRole('button', { name: 'Copy visible' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expected));

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(writeTextFileMock).toHaveBeenCalledWith('/tmp/frontend.log', `${expected}\n`));
    expect(screen.getByText('Exported 1 visible lines')).toBeInTheDocument();
  });

  it('serializes unknown sources without losing their identity', () => {
    expect(serializeLogs(
      [{ ts: '12:00:00.000', src: 'external-123', kind: 'warn', msg: 'slow response' }],
      {},
    )).toBe('[12:00:00.000] [WARN] [external-123] slow response');
  });
});
