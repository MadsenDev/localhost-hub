import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectHeader } from '../ProjectHeader';
import type { ActiveProcessInfo, ProjectInfo, GitStatusInfo } from '../../types/global';

vi.mock('framer-motion', () => {
  const MotionDiv = ({ children, whileHover: _wh, whileTap: _wt, ...rest }: any) => <div {...rest}>{children}</div>;
  const MotionButton = ({ children, whileHover: _wh, whileTap: _wt, ...rest }: any) => <button {...rest}>{children}</button>;
  return {
    motion: {
      div: MotionDiv,
      button: MotionButton
    }
  };
});

const baseProject: ProjectInfo = {
  id: 'project-1',
  name: 'Sample Project',
  path: '/path/project',
  type: 'React',
  tags: [],
  scripts: [{ name: 'dev', command: 'npm run dev' }]
};

const noop = () => {};
const baseGitStatus: GitStatusInfo | null = null;

describe('ProjectHeader', () => {
  it('prefers detected URL over other sources', () => {
    const openSpy = vi.fn();
    render(
      <ProjectHeader
        project={baseProject}
        scriptInFlight={null}
        activeProcesses={[]}
        expectedPorts={{}}
        detectedUrl="http://localhost:5173"
        currentRunId={null}
        gitStatus={baseGitStatus}
        gitStatusLoading={false}
        onRefreshGit={noop}
        onOpenInBrowser={openSpy}
        onInstall={noop}
        onStopScript={noop}
        onRestartScript={noop}
      />
    );

    const button = screen.getByRole('button', { name: /open in browser/i });
    fireEvent.click(button);
    expect(openSpy).toHaveBeenCalledWith('http://localhost:5173');
  });

  it('falls back to detected process port when no URL provided', () => {
    const openSpy = vi.fn();
    const processes: ActiveProcessInfo[] = [
      {
        id: 'run-1',
        script: 'dev',
        command: 'npm run dev',
        projectPath: '/path/project',
        startedAt: Date.now(),
        port: 4000
      }
    ];
    render(
      <ProjectHeader
        project={baseProject}
        scriptInFlight="dev"
        activeProcesses={processes}
        expectedPorts={{}}
        detectedUrl={null}
        currentRunId="run-1"
        gitStatus={baseGitStatus}
        gitStatusLoading={false}
        onRefreshGit={noop}
        onOpenInBrowser={openSpy}
        onInstall={noop}
        onStopScript={noop}
        onRestartScript={noop}
      />
    );

    const button = screen.getByRole('button', { name: /open in browser/i });
    fireEvent.click(button);
    expect(openSpy).toHaveBeenCalledWith('http://localhost:4000');
  });

  it('hides action when no ports or URLs are available', () => {
    render(
      <ProjectHeader
        project={baseProject}
        scriptInFlight={null}
        activeProcesses={[]}
        expectedPorts={{}}
        detectedUrl={null}
        currentRunId={null}
        gitStatus={baseGitStatus}
        gitStatusLoading={false}
        onRefreshGit={noop}
        onOpenInBrowser={noop}
        onInstall={noop}
        onStopScript={noop}
        onRestartScript={noop}
      />
    );

    expect(screen.queryByRole('button', { name: /open in browser/i })).not.toBeInTheDocument();
  });
});

