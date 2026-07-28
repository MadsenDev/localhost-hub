import { invoke } from '@tauri-apps/api/core';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string | null;
  expires_in: number;
  interval: number;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface StoredService {
  id: string;
  name: string;
  repo_path: string;
  script: string;
  cmd: string;
  run_mode?: 'parallel' | 'sequential';
  order?: number;
}

export interface StoredWorkspace {
  id: string;
  name: string;
  color: string;
  services: StoredService[];
}

export interface AppConfig {
  onboarding_complete: boolean;
  github_token: string | null;
  github_user: GitHubUser | null;
  workspace_roots: string[];
  user_workspaces: StoredWorkspace[];
  appearance: {
    theme: string;
    accent: string;
    density: string;
    sidebar: string;
  };
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri) return Promise.resolve(null);
  return invoke<T>(cmd, args);
}

export const githubAuth = {
  loadConfig: () => call<AppConfig | null>('load_config'),

  saveConfig: (config: AppConfig) => call<void>('save_config', { config }),

  requestDeviceCode: () => call<DeviceCodeResponse>('github_request_device_code'),

  pollToken: (device_code: string) => call<GitHubUser>('github_poll_token', { deviceCode: device_code }),
};
