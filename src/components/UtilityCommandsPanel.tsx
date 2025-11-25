import { useMemo } from 'react';
import type { ProjectInfo, ScriptInfo } from '../types/global';

export type UtilityWorkflowDefinition =
  | { kind: 'script'; script: ScriptInfo }
  | { kind: 'command'; label: string; command: string };

interface UtilityCommandsPanelProps {
  project: ProjectInfo;
  onRun: (workflow: UtilityWorkflowDefinition) => void;
  electronAPI?: Window['electronAPI'];
}

type WorkflowEntry = {
  id: string;
  label: string;
  description: string;
  workflow: UtilityWorkflowDefinition;
  requiresBridge?: boolean;
};

const SCRIPT_CANDIDATES: Array<{ name: string; label: string; description: string }> = [
  { name: 'db:seed', label: 'DB Seed', description: 'npm run db:seed' },
  { name: 'db:migrate', label: 'DB Migrate', description: 'Run pending migrations' },
  { name: 'db:reset', label: 'DB Reset', description: 'Drop + recreate database' },
  { name: 'prisma:migrate', label: 'Prisma migrate', description: 'Run Prisma migrations' },
  { name: 'prisma:deploy', label: 'Prisma deploy', description: 'Apply migrations in production' },
  { name: 'test', label: 'Run tests', description: 'npm test' }
];

const COMMAND_CANDIDATES = [
  { id: 'docker-up', label: 'Docker compose up', command: 'docker compose up -d', description: 'Start docker compose stack' },
  { id: 'docker-down', label: 'Docker compose down', command: 'docker compose down', description: 'Stop docker compose stack' }
];

export function UtilityCommandsPanel({ project, onRun, electronAPI }: UtilityCommandsPanelProps) {
  const workflows = useMemo<WorkflowEntry[]>(() => {
    const availableScripts = new Map(project.scripts.map((script) => [script.name, script]));
    const entries: WorkflowEntry[] = [];
    SCRIPT_CANDIDATES.forEach((candidate) => {
      const script = availableScripts.get(candidate.name);
      if (script) {
        entries.push({
          id: candidate.name,
          label: candidate.label,
          description: candidate.description,
          workflow: { kind: 'script', script }
        });
      }
    });
    COMMAND_CANDIDATES.forEach((candidate) => {
      entries.push({
        id: candidate.id,
        label: candidate.label,
        description: candidate.description,
        workflow: { kind: 'command', label: candidate.label, command: candidate.command },
        requiresBridge: true
      });
    });
    return entries;
  }, [project.scripts]);

  if (workflows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No utility workflows detected yet. Add scripts like <code>db:seed</code> or <code>db:migrate</code> to surface quick
        actions.
      </p>
    );
  }

  const canRunCommands = Boolean(electronAPI);

  return (
    <div className="space-y-3">
      {workflows.map((workflow) => {
        const disabled = workflow.requiresBridge && !canRunCommands;
        return (
          <div
            key={workflow.id}
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900/40 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{workflow.label}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{workflow.description}</p>
            </div>
            <button
              onClick={() => onRun(workflow.workflow)}
              disabled={disabled}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100"
            >
              Run
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default UtilityCommandsPanel;

