import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubProjectPanel } from '../github-project-panel';
import { tauriApi, type GitHubProjectContext } from '../tauri-api';

const context: GitHubProjectContext = {
  repository: {
    name: 'localhost-hub',
    full_name: 'MadsenDev/localhost-hub',
    html_url: 'https://github.com/MadsenDev/localhost-hub',
    private: false,
    archived: false,
    fork: false,
    description: 'Local development control center',
    default_branch: 'main',
    open_issues_count: 2,
    updated_at: '2026-07-29T09:00:00Z',
  },
  remote_name: 'origin',
  remote_url: 'git@github.com:MadsenDev/localhost-hub.git',
  current_branch: 'feat/github-project-context',
  head_sha: '1234567890abcdef',
  pull_requests: [{
    number: 23,
    title: 'Add GitHub project context',
    html_url: 'https://github.com/MadsenDev/localhost-hub/pull/23',
    draft: true,
    head_ref: 'feat/github-project-context',
    base_ref: 'main',
    author: 'MadsenDev',
    updated_at: '2026-07-29T09:00:00Z',
  }],
  issues: [{
    number: 7,
    title: 'Improve authentication storage',
    html_url: 'https://github.com/MadsenDev/localhost-hub/issues/7',
    author: 'MadsenDev',
    labels: [{ name: 'security', color: 'd73a4a' }],
    updated_at: '2026-07-28T09:00:00Z',
  }],
  checks: [{
    name: 'Rust',
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/MadsenDev/localhost-hub/actions/runs/1',
    app_name: 'GitHub Actions',
    started_at: '2026-07-29T09:00:00Z',
    completed_at: '2026-07-29T09:05:00Z',
  }],
  warnings: [],
};

describe('GitHubProjectPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps the current branch to its pull request and reports checks and issues', async () => {
    vi.spyOn(tauriApi, 'getGitHubProjectContext').mockResolvedValue(context);
    const openGitHubUrl = vi.spyOn(tauriApi, 'openGitHubUrl').mockResolvedValue();

    render(<GitHubProjectPanel path="/projects/localhost-hub" />);

    expect(await screen.findByText('MadsenDev/localhost-hub')).toBeInTheDocument();
    expect(screen.getByText('Current branch pull request')).toBeInTheDocument();
    expect(screen.getByText('Add GitHub project context')).toBeInTheDocument();
    expect(screen.getByText('Rust')).toBeInTheDocument();
    expect(screen.getByText('Improve authentication storage')).toBeInTheDocument();
    expect(screen.getByText('1 pass · 0 fail')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open repository/i }));
    expect(openGitHubUrl).toHaveBeenCalledWith(context.repository.html_url);
  });

  it('explains when a project cannot be connected to GitHub', async () => {
    vi.spyOn(tauriApi, 'getGitHubProjectContext').mockRejectedValue(
      new Error('No github.com Git remote is configured for this project.'),
    );

    render(<GitHubProjectPanel path="/projects/local-only" />);

    await waitFor(() => {
      expect(screen.getByText('No github.com Git remote is configured for this project.')).toBeInTheDocument();
    });
    expect(screen.getByText(/Connect GitHub in Settings/)).toBeInTheDocument();
  });
});
