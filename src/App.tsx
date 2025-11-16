import { useEffect, useMemo, useState } from 'react';

type Project = {
  id: string;
  name: string;
  path: string;
  type: string;
  tags: string[];
  favorite?: boolean;
};

type Script = {
  name: string;
  command: string;
  description: string;
  workspace?: string;
};

const sampleProjects: Project[] = [
  {
    id: 'hub',
    name: 'Localhost Hub',
    path: '~/dev/localhost-hub',
    type: 'Node + Electron',
    tags: ['Electron', 'React', 'SQLite'],
    favorite: true
  },
  {
    id: 'api',
    name: 'Payments API',
    path: '~/work/payments-api',
    type: 'Node Service',
    tags: ['pnpm', 'Docker']
  },
  {
    id: 'marketing',
    name: 'Marketing Site',
    path: '~/clients/marketing-site',
    type: 'Next.js',
    tags: ['Vercel']
  }
];

const sampleScripts: Script[] = [
  {
    name: 'dev',
    command: 'pnpm dev',
    description: 'Start renderer (Vite) + Electron in watch mode',
    workspace: 'Full Stack'
  },
  {
    name: 'scan-projects',
    command: 'tsx scripts/scan-projects.ts',
    description: 'Rescan directories for package.json files'
  },
  {
    name: 'sync-db',
    command: 'pnpm prisma migrate deploy',
    description: 'Apply latest schema changes',
    workspace: 'Backend'
  }
];

const runningProcesses = [
  {
    id: 'dev',
    script: 'dev',
    status: 'Running',
    startedAt: '12:04 PM',
    port: 5173
  },
  {
    id: 'api',
    script: 'sync-db',
    status: 'Idle',
    startedAt: '—',
    port: 5432
  }
];

const statusColor: Record<string, string> = {
  Running: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  Idle: 'bg-slate-700/30 text-slate-200 border-slate-600'
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <button className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
          View all
        </button>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-inner">
        {children}
      </div>
    </section>
  );
}

function App() {
  const [selectedProject] = useState<Project>(sampleProjects[0]);
  const [pingResponse, setPingResponse] = useState<string>('…');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    window.electronAPI
      ?.ping()
      .then((result) => mounted && setPingResponse(result))
      .catch(() => mounted && setPingResponse('offline'));
    return () => {
      mounted = false;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    if (!query) return sampleProjects;
    return sampleProjects.filter((project) =>
      `${project.name} ${project.path} ${project.tags.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [query]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-72 flex-col border-r border-slate-900 bg-slate-950/80 p-5">
        <div className="mb-4 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">Localhost</p>
          <h1 className="text-xl font-semibold">Hub</h1>
        </div>
        <div className="relative mb-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 text-xs">
            ⌘K
          </span>
        </div>
        <div className="space-y-4 overflow-y-auto pr-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Projects</p>
            <ul className="mt-3 space-y-2 text-sm">
              {filteredProjects.map((project) => (
                <li
                  key={project.id}
                  className={`rounded-xl border border-transparent px-3 py-2 hover:border-slate-800 hover:bg-slate-900/70 ${
                    project.id === selectedProject.id ? 'bg-slate-900/80 border-indigo-400/50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{project.name}</span>
                    {project.favorite && <span className="text-amber-400">★</span>}
                  </div>
                  <p className="text-xs text-slate-500">{project.path}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">System</p>
            <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
              <p>IPC ping: {pingResponse}</p>
              <p>Active ports: 5173, 9222</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col gap-6 p-8">
        <header className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-sm text-slate-400">{selectedProject.path}</p>
            <h1 className="text-3xl font-semibold text-white">{selectedProject.name}</h1>
          </div>
          <div className="ml-auto flex gap-3">
            <button className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-indigo-400 hover:text-white">
              Open in VS Code
            </button>
            <button className="rounded-xl border border-indigo-500/60 bg-indigo-600/20 px-4 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/30">
              Run Workspace
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Scripts">
            <div className="space-y-3">
              {sampleScripts.map((script) => (
                <div
                  key={script.name}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-indigo-400/40"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold">{script.name}</p>
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        {script.workspace ?? 'Single'} workspace
                      </p>
                    </div>
                    <button className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/30">
                      Run
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{script.description}</p>
                  <code className="mt-3 block rounded-lg bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
                    {script.command}
                  </code>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Activity">
            <div className="space-y-4">
              {runningProcesses.map((process) => (
                <div key={process.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Script</p>
                      <p className="text-lg font-semibold text-white">{process.script}</p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusColor[process.status]}`}
                    >
                      {process.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div>
                      <p className="text-slate-500">Started</p>
                      <p>{process.startedAt}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Port</p>
                      <p>{process.port}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Logs">
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                <span>dev • Vite</span>
                <span>Live</span>
              </div>
              <pre className="h-64 overflow-y-auto rounded-xl bg-black/60 p-4 font-mono text-xs text-emerald-300">
                {`12:04:08 PM  ready in 1022 ms\n12:04:09 PM  launching electron...\n12:04:10 PM  compiled renderer + main\n12:04:12 PM  websocket connected`}
              </pre>
              <button className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs font-semibold text-slate-200">
                Open detailed log
              </button>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}

export default App;
