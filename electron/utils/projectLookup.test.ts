import { describe, expect, it } from 'vitest';
import { findProjectIdByPath, normalizePath } from './projectLookup';

describe('project lookup helpers', () => {
  it('normalizes relative paths', () => {
    expect(normalizePath('.')).toBe(process.cwd());
  });

  it('prefers cached projects when resolving ids', () => {
    const cached = [
      { id: 'a', path: '/Users/dev/app' },
      { id: 'b', path: '/Users/dev/api' }
    ];
    const loadProjects = () => [{ id: 'c', path: '/Users/dev/web' }];

    expect(findProjectIdByPath('/Users/dev/api', cached, loadProjects)).toBe('b');
  });

  it('falls back to stored projects when cache miss occurs', () => {
    const cached: Array<{ id: string; path: string }> = [];
    const loadProjects = () => [
      { id: 'api', path: '/Users/dev/api' },
      { id: 'web', path: '/Users/dev/web' }
    ];

    expect(findProjectIdByPath('/Users/dev/web', cached, loadProjects)).toBe('web');
  });

  it('returns null when project path is unknown', () => {
    const cached = [{ id: 'a', path: '/known/path' }];
    const loadProjects = () => [{ id: 'b', path: '/other/path' }];
    expect(findProjectIdByPath('/missing/path', cached, loadProjects)).toBeNull();
  });
});

