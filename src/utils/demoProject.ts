import type { ProjectInfo, ScriptInfo } from '../types/global';

export const DEMO_PROJECT_ID = 'demo-project';

export function createDemoProject(): ProjectInfo {
  const fakeScripts: ScriptInfo[] = [
    {
      name: 'dev',
      command: 'vite',
      description: 'Start development server',
      runner: 'npm'
    },
    {
      name: 'build',
      command: 'tsc && vite build',
      description: 'Build for production',
      runner: 'npm'
    },
    {
      name: 'lint',
      command: 'eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0',
      description: 'Run linter',
      runner: 'npm'
    },
    {
      name: 'start',
      command: 'vite preview',
      description: 'Preview production build',
      runner: 'npm'
    }
  ];

  return {
    id: DEMO_PROJECT_ID,
    name: 'Demo Project',
    path: '/demo/private-investigation-graph-tool',
    type: 'TYPESCRIPT',
    tags: ['demo'],
    scripts: fakeScripts
  };
}

export function getDemoLogs(): string {
  return `Vite v5.0.0 ready in 420ms

  ➜  Local:   http://localhost:1716/
  ➜  Network: use --host to expose
  ➜  press h to show help

  ✓ 23 modules transformed.
  ✓ Built in 120ms
`;
}

export function isDemoProject(project: ProjectInfo | null): boolean {
  return project?.id === DEMO_PROJECT_ID;
}

