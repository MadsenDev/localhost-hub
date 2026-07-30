import { invoke } from '@tauri-apps/api/core';

// Types owned by the Rust backend — see src/generated.
// Previously duplicated here, which let this file drift from the Rust
// definitions without anything noticing.
import type { AppConfig } from './generated/AppConfig';
import type { DeviceCodeResponse } from './generated/DeviceCodeResponse';
import type { EnvProfile } from './generated/EnvProfile';
import type { EnvVariable } from './generated/EnvVariable';
import type { GitHubUser } from './generated/GitHubUser';
import type { StoredService } from './generated/StoredService';
import type { StoredWorkspace } from './generated/StoredWorkspace';

export type {
  AppConfig,
  DeviceCodeResponse,
  EnvProfile,
  EnvVariable,
  GitHubUser,
  StoredService,
  StoredWorkspace,
};


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
