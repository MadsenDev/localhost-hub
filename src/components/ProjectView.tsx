import type { RefObject } from 'react';
import type { ActiveProcessInfo, ProjectInfo, ScriptInfo, GitStatusInfo } from '../types/global';
import Section from './Section';
import ScriptsPanel from './ScriptsPanel';
import LogsPanel from './LogsPanel';
import EnvProfilesPanel from './EnvProfilesPanel';
import PortsProcessesPanel from './PortsProcessesPanel';
import { ProjectHeader } from './ProjectHeader';
import { PackagesPanel } from './PackagesPanel';
import { GitPanel } from './GitPanel';
import EnvFileEditor from './EnvFileEditor';

interface ProjectViewProps {
  project: ProjectInfo;
  scriptInFlight: string | null;
  activeProcesses: ActiveProcessInfo[];
  expectedPorts: Record<string, number>;
  detectedUrl: string | null;
  currentRunId: string | null;
  gitStatus: GitStatusInfo | null;
  gitStatusLoading: boolean;
  onRefreshGit: () => void;
  onOpenInBrowser: (url: string) => Promise<void>;
  onInstall: (packageManager: string) => Promise<void>;
  onStopScript: () => Promise<void>;
  onForceStopScript: () => Promise<void>;
  onRestartScript: (script: ScriptInfo) => Promise<void>;
  electronAPI?: Window['electronAPI'];
  activeTab: 'scripts' | 'logs' | 'env-profiles' | 'ports' | 'packages' | 'git';
  onChangeTab: (tab: 'scripts' | 'logs' | 'env-profiles' | 'ports' | 'packages' | 'git') => void;
  projectScripts: ScriptInfo[];
  onRunScript: (script: ScriptInfo) => Promise<void>;
  logStatusLabel: string;
  logOutput: string;
  logContainerRef: RefObject<HTMLPreElement | null>;
  onExportLog: () => Promise<void>;
  isExportingLog: boolean;
  canExportLog: boolean;
  isAutoScrollEnabled: boolean;
  onToggleAutoScroll: () => void;
  onClearLog: () => void;
  onCopyLog: () => Promise<void>;
  canCopyLog: boolean;
  canClearLog: boolean;
  onInstallPackage: (packageName: string, version?: string, isDev?: boolean) => Promise<void>;
  forceStopReady: boolean;
  onOpenRunCommandModal?: () => void;
  onEditScriptOverrides?: (script: ScriptInfo) => void;
  hasOverrides?: (script: ScriptInfo) => boolean;
}

export function ProjectView({
  project,
  scriptInFlight,
  activeProcesses,
  expectedPorts,
  detectedUrl,
  currentRunId,
  gitStatus,
  gitStatusLoading,
  onRefreshGit,
  onOpenInBrowser,
  onInstall,
  onStopScript,
  onForceStopScript,
  onRestartScript,
  electronAPI,
  activeTab,
  onChangeTab,
  projectScripts,
  onRunScript,
  logStatusLabel,
  logOutput,
  logContainerRef,
  onExportLog,
  isExportingLog,
  canExportLog,
  isAutoScrollEnabled,
  onToggleAutoScroll,
  onClearLog,
  onCopyLog,
  canCopyLog,
  canClearLog,
  onInstallPackage,
  forceStopReady,
  onOpenRunCommandModal,
  onEditScriptOverrides,
  hasOverrides
}: ProjectViewProps) {
  const handleHeaderRestart = () => {
    if (!scriptInFlight) return;
    const script = project.scripts.find((s) => s.name === scriptInFlight);
    if (script) {
      onRestartScript(script);
    }
  };

  return (
    <>
      <ProjectHeader
        project={project}
        scriptInFlight={scriptInFlight}
        activeProcesses={activeProcesses}
        expectedPorts={expectedPorts}
        detectedUrl={detectedUrl}
        currentRunId={currentRunId}
        gitStatus={gitStatus}
        gitStatusLoading={gitStatusLoading}
        onRefreshGit={onRefreshGit}
        onOpenInBrowser={onOpenInBrowser}
        onInstall={onInstall}
        onStopScript={onStopScript}
        onForceStopScript={onForceStopScript}
        onRestartScript={handleHeaderRestart}
        electronAPI={electronAPI}
        forceStopReady={forceStopReady}
      />

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 mt-6">
        {(['scripts', 'logs', 'env-profiles', 'ports', 'packages', 'git'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onChangeTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-300'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {tab === 'env-profiles' ? 'Env Profiles' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {activeTab === 'scripts' && (
          <Section
            title="Scripts"
            action={
              onOpenRunCommandModal ? (
                <button
                  onClick={onOpenRunCommandModal}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-indigo-500/40"
                >
                  Run custom command
                </button>
              ) : null
            }
          >
            <ScriptsPanel
              scripts={projectScripts}
              scriptInFlight={scriptInFlight}
              onRunScript={onRunScript}
              onStopScript={onStopScript}
              onRestartScript={onRestartScript}
              forceStopReady={forceStopReady}
              onForceStopScript={onForceStopScript}
              onEditOverrides={onEditScriptOverrides}
              hasOverrides={hasOverrides}
            />
          </Section>
        )}

        {activeTab === 'logs' && (
          <Section title="Logs" action={<span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{logStatusLabel}</span>}>
            <LogsPanel
              logOutput={logOutput}
              logContainerRef={logContainerRef}
              onExportLog={onExportLog}
              isExporting={isExportingLog}
              canExport={canExportLog}
              isAutoScrollEnabled={isAutoScrollEnabled}
              onToggleAutoScroll={onToggleAutoScroll}
              onClearLog={onClearLog}
              onCopyLog={onCopyLog}
              canCopy={canCopyLog}
              canClear={canClearLog}
            />
          </Section>
        )}

        {activeTab === 'env-profiles' && (
          <div className="space-y-6">
            <Section title="Environment Profiles">
              <EnvProfilesPanel projectId={project.id} electronAPI={electronAPI} />
            </Section>
            <Section title=".env helpers">
              <EnvFileEditor project={project} electronAPI={electronAPI} />
            </Section>
          </div>
        )}

        {activeTab === 'ports' && (
          <Section title="Ports & Processes">
            <PortsProcessesPanel electronAPI={electronAPI} selectedProject={project} />
          </Section>
        )}

        {activeTab === 'packages' && (
          <Section title="Packages">
            <PackagesPanel project={project} electronAPI={electronAPI} onInstallPackage={onInstallPackage} />
          </Section>
        )}

        {activeTab === 'git' && (
          <Section title="Git">
            <GitPanel
              project={project}
              gitStatus={gitStatus}
              gitStatusLoading={gitStatusLoading}
              onRefreshGit={onRefreshGit}
              electronAPI={electronAPI}
            />
          </Section>
        )}
      </div>
    </>
  );
}

export default ProjectView;

