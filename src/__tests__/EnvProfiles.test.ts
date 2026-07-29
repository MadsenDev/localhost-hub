import { describe, expect, it } from 'vitest';
import {
  normalizeProjectProfiles,
  resolveEnvProfile,
  toServiceEnvironment,
} from '../env-profiles';
import type { EnvProfile } from '../types';

const profiles: EnvProfile[] = [
  {
    id: 'development',
    project_path: '/code/app',
    name: 'Development',
    description: '',
    is_default: true,
    vars: [{ key: 'API_URL', value: 'http://localhost:8080', is_secret: false }],
  },
  {
    id: 'testing',
    project_path: '/code/app',
    name: 'Testing',
    description: '',
    is_default: false,
    vars: [{ key: 'TOKEN', value: 'private', is_secret: true }],
  },
];

describe('environment profiles', () => {
  it('resolves an assigned profile before the project default', () => {
    expect(resolveEnvProfile(profiles, '/code/app', 'testing')?.id).toBe('testing');
    expect(resolveEnvProfile(profiles, '/code/app')?.id).toBe('development');
    expect(resolveEnvProfile(profiles, '/code/other')).toBeNull();
  });

  it('creates the minimal Rust runner payload without secret metadata', () => {
    expect(toServiceEnvironment(profiles[1])).toEqual({
      inherit_system: true,
      vars: [{ key: 'TOKEN', value: 'private' }],
    });
  });

  it('applies temporary overrides after the selected profile without mutating it', () => {
    expect(toServiceEnvironment(profiles[0], [
      { key: 'API_URL', value: 'http://localhost:9000', is_secret: false },
      { key: 'TRACE', value: '1', is_secret: false },
    ])).toEqual({
      inherit_system: true,
      vars: [
        { key: 'API_URL', value: 'http://localhost:9000' },
        { key: 'TRACE', value: '1' },
      ],
    });
    expect(profiles[0].vars[0].value).toBe('http://localhost:8080');
  });

  it('keeps only one project default and rejects duplicate keys', () => {
    const normalized = normalizeProjectProfiles([], '/code/app', profiles.map(profile => ({
      ...profile,
      is_default: true,
    })));
    expect(normalized.filter(profile => profile.is_default)).toHaveLength(1);

    expect(() => normalizeProjectProfiles([], '/code/app', [{
      ...profiles[0],
      vars: [
        { key: 'PORT', value: '3000', is_secret: false },
        { key: 'PORT', value: '3001', is_secret: false },
      ],
    }])).toThrow(/duplicated/);
  });
});
