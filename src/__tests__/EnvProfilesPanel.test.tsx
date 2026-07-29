import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvProfilesPanel } from '../env-profiles-panel';
import { tauriApi } from '../tauri-api';
import type { EnvProfile } from '../types';

const { openMock, saveMock } = vi.hoisted(() => ({
  openMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
  save: saveMock,
}));

const profile: EnvProfile = {
  id: 'development',
  project_path: '/code/app',
  name: 'Development',
  description: '',
  is_default: true,
  vars: [
    { key: 'API_URL', value: 'http://localhost:8080', is_secret: false },
    { key: 'API_TOKEN', value: 'private', is_secret: true },
  ],
};

describe('EnvProfilesPanel', () => {
  beforeEach(() => {
    openMock.mockReset();
    saveMock.mockReset();
    vi.restoreAllMocks();
  });

  it('imports real values into a new unsaved profile for review', async () => {
    openMock.mockResolvedValue('/code/app/.env.local');
    vi.spyOn(tauriApi, 'importEnvFile').mockResolvedValue({
      path: '/code/app/.env.local',
      variables: [
        { key: 'PORT', value: '4173', is_secret: false },
        { key: 'API_TOKEN', value: 'imported-secret', is_secret: true },
      ],
    });
    const onSave = vi.fn();
    render(<EnvProfilesPanel projectPath="/code/app" profiles={[profile]} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Import .env' }));

    expect(await screen.findByDisplayValue('.env.local')).toBeInTheDocument();
    expect(screen.getByDisplayValue('4173')).toBeInTheDocument();
    expect(screen.getByDisplayValue('imported-secret')).toHaveAttribute('type', 'password');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/new unsaved profile/)).toBeInTheDocument();
  });

  it('exports the selected profile including secret values after confirmation', async () => {
    saveMock.mockResolvedValue('/code/app/.env.development');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const exportFile = vi.spyOn(tauriApi, 'exportEnvFile').mockResolvedValue(undefined);
    render(<EnvProfilesPanel projectPath="/code/app" profiles={[profile]} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export .env' }));

    await waitFor(() => expect(exportFile).toHaveBeenCalledWith('/code/app/.env.development', profile.vars));
    expect(screen.getByText(/owner-private permissions/)).toBeInTheDocument();
  });
});
