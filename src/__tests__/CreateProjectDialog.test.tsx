import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateProjectDialog } from '../create-project-dialog';
import { tauriApi } from '../tauri-api';

describe('CreateProjectDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires a name and parent folder before leaving Basics', () => {
    render(
      <CreateProjectDialog
        open
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Choose a parent folder and enter a project name.')).toBeInTheDocument();
    expect(screen.getByText('1. Basics')).toBeInTheDocument();
  });

  it('submits a typed React starter plan to the Tauri API', async () => {
    const createProject = vi.spyOn(tauriApi, 'createProject').mockResolvedValue({
      path: '/projects/example-app',
      files: ['package.json', 'src/main.tsx'],
      git_initialized: true,
      dependencies_installed: false,
      warnings: [],
    });
    const onCreated = vi.fn();

    render(
      <CreateProjectDialog
        open
        onClose={() => {}}
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('my-new-project'), {
      target: { value: 'example-app' },
    });
    fireEvent.change(screen.getByPlaceholderText('/Users/you/Projects'), {
      target: { value: '/projects' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tailwind v4' }));
    fireEvent.click(screen.getByRole('button', { name: 'lucide-react' }));
    fireEvent.change(screen.getByPlaceholderText('vitest@^4'), {
      target: { value: 'vitest@^4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    expect(createProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'example-app',
      directory: '/projects',
      template: 'react-vite',
      language: 'typescript',
      styling: 'tailwind-v4',
      icon_packs: ['lucide-react'],
      dev_dependencies: ['vitest@^4'],
      initialize_git: true,
    }));
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/projects/example-app' }),
      '/projects',
    );
  });
});
