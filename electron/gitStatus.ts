import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

export type GitStatusInfo = {
  isRepo: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
  dirty?: boolean;
  upstream?: string;
  changes?: GitChange[];
  lastCommit?: {
    hash: string;
    message: string;
    relativeTime: string;
  };
};

export type GitChange = {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
};

export function parseBranchLine(line: string) {
  const info: { branch?: string; ahead?: number; behind?: number; upstream?: string } = {};
  const cleaned = line.replace(/^##\s*/, '').trim();
  const [branchSegment, rest] = cleaned.split('...');
  if (branchSegment) {
    info.branch = branchSegment.trim();
  }
  if (rest) {
    const upstreamPart = rest.split(' ')[0]?.trim();
    if (upstreamPart && !upstreamPart.startsWith('[')) {
      info.upstream = upstreamPart;
    }
    const match = rest.match(/\[([^\]]+)\]/);
    if (match) {
      const parts = match[1].split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith('ahead')) {
          info.ahead = Number(trimmed.replace('ahead', '').trim());
        } else if (trimmed.startsWith('behind')) {
          info.behind = Number(trimmed.replace('behind', '').trim());
        }
      }
    }
  }
  return info;
}

export function getGitStatus(projectPath: string): GitStatusInfo {
  const cwd = resolve(projectPath);
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });
  } catch {
    return { isRepo: false };
  }

  const statusOutput = execSync('git status --short --branch', { cwd, encoding: 'utf-8' });
  const lines = statusOutput.trim().split('\n');
  const branchInfo = lines.length > 0 ? parseBranchLine(lines[0]) : {};
  const changes: GitChange[] =
    lines.length > 1
      ? lines.slice(1).map((line) => {
          const indexStatus = line[0]?.trim() || '';
          const worktreeStatus = line[1]?.trim() || '';
          const path = line.slice(3).trim();
          return {
            path,
            indexStatus,
            worktreeStatus
          };
        })
      : [];
  const dirty = changes.length > 0;

  let lastCommit: GitStatusInfo['lastCommit'] = undefined;
  try {
    const logOutput = execSync('git log -1 --pretty=format:%h%n%s%n%cr', { cwd, encoding: 'utf-8' });
    const [hash, message, relative] = logOutput.split('\n');
    if (hash && message && relative) {
      lastCommit = {
        hash,
        message,
        relativeTime: relative
      };
    }
  } catch {
    // ignore
  }

  return {
    isRepo: true,
    branch: branchInfo.branch,
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    upstream: branchInfo.upstream,
    dirty,
    changes,
    lastCommit
  };
}

