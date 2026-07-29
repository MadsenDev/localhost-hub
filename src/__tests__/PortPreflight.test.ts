import { describe, expect, it } from 'vitest';
import { deriveExpectedPorts } from '../port-preflight';

describe('port preflight inference', () => {
  it('combines configured, PORT environment, and explicit --port values', () => {
    expect(deriveExpectedPorts(
      'vite --port 5173 --host 0.0.0.0',
      {
        inherit_system: true,
        vars: [
          { key: 'PORT', value: '4173' },
          { key: 'API_URL', value: 'http://localhost:8080' },
        ],
      },
      3000,
    )).toEqual([3000, 4173, 5173]);
  });

  it('ignores ambiguous numbers, invalid ports, and unrelated variables', () => {
    expect(deriveExpectedPorts(
      'docker run -p 8080:80 image --workers 4',
      {
        inherit_system: true,
        vars: [
          { key: 'VITE_API_PORT', value: '9000' },
          { key: 'PORT', value: '70000' },
        ],
      },
    )).toEqual([]);
  });

  it('deduplicates explicit --port syntax', () => {
    expect(deriveExpectedPorts(
      'vite --port=5173 --port 5173',
      { inherit_system: true, vars: [] },
      5173,
    )).toEqual([5173]);
  });
});
