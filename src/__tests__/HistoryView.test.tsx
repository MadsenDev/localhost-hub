import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryView } from '../view-history';
import { tauriApi, type RunRecord } from '../tauri-api';

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    run_id: 'run-1',
    service_id: 'web',
    cwd: '/projects/hub',
    cmd: 'npm run dev',
    pid: 4242,
    started_at_ms: Date.now() - 90_000,
    ended_at_ms: Date.now() - 30_000,
    exit_code: 0,
    outcome: 'exited',
    log_truncated: false,
    ...overrides,
  };
}

describe('HistoryView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists recorded runs with their outcome and duration', async () => {
    const list = vi.spyOn(tauriApi, 'listRunHistory').mockResolvedValue([run()]);

    render(<HistoryView />);

    expect(await screen.findByText('web')).toBeInTheDocument();
    expect(screen.getByText('npm run dev')).toBeInTheDocument();
    expect(screen.getByText('PID 4242')).toBeInTheDocument();
    expect(screen.getByText('Exited (0)')).toBeInTheDocument();
    expect(screen.getByText('1m 0s')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('loads a run’s stored output on demand', async () => {
    vi.spyOn(tauriApi, 'listRunHistory').mockResolvedValue([run()]);
    const readLog = vi.spyOn(tauriApi, 'readRunLog').mockResolvedValue({
      run_id: 'run-1',
      lines: ['listening on 3000', 'compiled successfully'],
      truncated: false,
    });

    render(<HistoryView />);
    fireEvent.click(await screen.findByText('web'));

    expect(await screen.findByText(/listening on 3000/)).toBeInTheDocument();
    expect(readLog).toHaveBeenCalledWith('run-1');

    // Clicking again collapses it rather than reloading.
    fireEvent.click(screen.getByText('web'));
    await waitFor(() => expect(screen.queryByText(/listening on 3000/)).not.toBeInTheDocument());
  });

  it('says so when only the tail of a log is available', async () => {
    vi.spyOn(tauriApi, 'listRunHistory').mockResolvedValue([run({ log_truncated: true })]);
    vi.spyOn(tauriApi, 'readRunLog').mockResolvedValue({
      run_id: 'run-1',
      lines: ['late output'],
      truncated: true,
    });

    render(<HistoryView />);
    fireEvent.click(await screen.findByText('web'));

    expect(await screen.findByText(/Showing the end of a longer log/)).toBeInTheDocument();
  });

  it('warns about runs that were still going when the app closed', async () => {
    vi.spyOn(tauriApi, 'listRunHistory').mockResolvedValue([
      run({ outcome: 'interrupted', exit_code: null }),
    ]);

    render(<HistoryView />);

    expect(
      await screen.findByText(/1 run was still running when Localhost Hub last closed/),
    ).toBeInTheDocument();
    expect(screen.getByText('Interrupted')).toBeInTheDocument();
  });

  it('reports an empty history rather than looking broken', async () => {
    vi.spyOn(tauriApi, 'listRunHistory').mockResolvedValue([]);

    render(<HistoryView />);

    expect(await screen.findByText('No runs recorded yet.')).toBeInTheDocument();
  });

  it('clears the history and reloads', async () => {
    const list = vi
      .spyOn(tauriApi, 'listRunHistory')
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([]);
    const clear = vi.spyOn(tauriApi, 'clearRunHistory').mockResolvedValue(undefined);

    render(<HistoryView />);
    await screen.findByText('web');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(await screen.findByText('No runs recorded yet.')).toBeInTheDocument();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('surfaces a backend failure instead of showing an empty list', async () => {
    vi.spyOn(tauriApi, 'listRunHistory').mockRejectedValue(new Error('history is unreadable'));

    render(<HistoryView />);

    expect(await screen.findByText('history is unreadable')).toBeInTheDocument();
  });
});
