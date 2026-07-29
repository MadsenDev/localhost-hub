import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackagesPanel } from '../packages-panel';
import { tauriApi, type PackageActionResult, type ProjectPackages } from '../tauri-api';

const packages: ProjectPackages = {
  package_manager: 'pnpm',
  installed_count: 1,
  missing_count: 1,
  packages: [
    {
      name: '@types/node',
      requested_version: '^24.0.0',
      installed_version: null,
      kind: 'dev_dependency',
    },
    {
      name: 'react',
      requested_version: '^19.2.0',
      installed_version: '19.2.0',
      kind: 'dependency',
    },
  ],
};

const actionResult: PackageActionResult = {
  package_manager: 'pnpm',
  command: 'pnpm add --save-dev vitest@latest',
  success: true,
  exit_code: 0,
  stdout: 'Packages: +1',
  stderr: '',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PackagesPanel', () => {
  it('shows declared and installed package state from Rust', async () => {
    vi.spyOn(tauriApi, 'getProjectPackages').mockResolvedValue(packages);

    render(<PackagesPanel projectPath="/code/app" />);

    expect(await screen.findByText('react')).toBeInTheDocument();
    expect(screen.getByText('@types/node')).toBeInTheDocument();
    expect(screen.getByText(/installed 19.2.0/)).toBeInTheDocument();
    expect(screen.getByText('missing')).toBeInTheDocument();
    expect(screen.getByText(/pnpm · 1\/2 installed · 1 missing/)).toBeInTheDocument();
  });

  it('submits a typed add action and refreshes the manifest', async () => {
    const inspect = vi.spyOn(tauriApi, 'getProjectPackages').mockResolvedValue(packages);
    const run = vi.spyOn(tauriApi, 'runPackageAction').mockResolvedValue(actionResult);

    render(<PackagesPanel projectPath="/code/app" />);
    await screen.findByText('react');
    fireEvent.click(screen.getByRole('button', { name: /Add package/ }));
    fireEvent.change(screen.getByLabelText('Package name'), { target: { value: 'vitest' } });
    fireEvent.change(screen.getByLabelText('Package version'), { target: { value: 'latest' } });
    fireEvent.click(screen.getByLabelText('Dev'));
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));

    await waitFor(() => expect(run).toHaveBeenCalledWith({
      project_path: '/code/app',
      action: 'add',
      package_name: 'vitest',
      version: 'latest',
      dev: true,
    }));
    await waitFor(() => expect(inspect).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/pnpm add --save-dev vitest@latest/)).toBeInTheDocument();
  });
});
