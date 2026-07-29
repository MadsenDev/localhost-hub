import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthView } from '../view-health';
import { tauriApi, type RepositoryHealth } from '../tauri-api';
import type { Repo } from '../types';

const repo = {
  id: 'repo::/projects/hub',
  name: 'Localhost Hub',
  path: '/projects/hub',
  git_root: '/projects/hub',
  framework: 'React',
  package_manager: 'npm',
  scripts: [],
  manifests: ['package.json'],
  has_env: false,
  has_git: true,
  git_status: null,
  is_running: false,
  running_port: null,
  cpu: 0,
  mem: 0,
} satisfies Repo;

const health: RepositoryHealth = {
  path: '/projects/hub',
  score: 68,
  status: 'attention',
  signals: [
    { id: 'readme', label: 'README', state: 'good', detail: 'README detected' },
    { id: 'unpushed', label: 'Unpushed commits', state: 'warn', detail: '2 commits ahead of the upstream branch' },
  ],
  has_readme: true,
  has_license: false,
  has_ci: true,
  dependency_manifests: ['package.json'],
  uncommitted_changes: 1,
  oldest_uncommitted_days: 4,
  unpushed_commits: 2,
  last_commit_timestamp: 1,
  days_since_last_commit: 3,
  stale_branches: [{ name: 'old-ui', last_commit_timestamp: 1, days_since_commit: 140, merged_into_head: true }],
};

describe('HealthView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('summarizes native repository health and expands its signals', async () => {
    const analyze = vi.spyOn(tauriApi, 'analyzeRepositoryHealth').mockResolvedValue([health]);

    render(<HealthView repos={[repo]} />);

    expect(await screen.findByText('Localhost Hub')).toBeInTheDocument();
    expect(analyze).toHaveBeenCalledWith(['/projects/hub']);
    expect(screen.getAllByText('68')).toHaveLength(2);
    expect(screen.getByText('2 commits ahead of the upstream branch')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('README detected')).toBeInTheDocument();
    expect(screen.getByText(/old-ui \(140d, merged\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
  });
});
