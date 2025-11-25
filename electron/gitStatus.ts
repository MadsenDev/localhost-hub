import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

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
  
  // Handle detached HEAD state - git status shows "HEAD (no branch)" or similar
  if (cleaned.includes('HEAD') && (cleaned.includes('no branch') || cleaned.includes('detached'))) {
    // Don't set branch here, let the rev-parse method handle it
    // But still parse ahead/behind if present
    const match = cleaned.match(/\[([^\]]+)\]/);
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
    return info;
  }
  
  const [branchSegment, rest] = cleaned.split('...');
  if (branchSegment) {
    const branchName = branchSegment.trim();
    // Only set branch if it's not "HEAD" (which indicates detached state)
    if (branchName && branchName !== 'HEAD') {
      info.branch = branchName;
    }
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

export function findGitExecutable(): string | null {
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Try common Git installation paths on Windows
    const commonPaths = [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd\\git.exe` : null,
    ].filter(Boolean) as string[];
    
    // Check if git exists in common installation locations
    for (const gitPath of commonPaths) {
      if (existsSync(gitPath)) {
        return gitPath;
      }
    }
  }
  
  // Fallback: assume git is in PATH
  return null;
}

function runGitCommand(command: string, cwd: string, options: { encoding?: BufferEncoding; stdio?: any } = {}): string {
  const gitPath = findGitExecutable();
  const isWindows = process.platform === 'win32';
  
  if (gitPath) {
    // Use full path to git executable (Windows)
    // On Windows, we need to quote the path and use shell mode
    const fullCommand = `"${gitPath}" ${command}`;
    return execSync(fullCommand, {
      cwd,
      encoding: options.encoding || 'utf-8',
      stdio: options.stdio || 'pipe',
      shell: true
    });
  } else {
    // Use 'git' from PATH (Linux/Mac)
    // On Unix-like systems, we can use shell mode or direct execution
    // Using shell mode ensures proper argument parsing
    const fullCommand = `git ${command}`;
    return execSync(fullCommand, {
      cwd,
      encoding: options.encoding || 'utf-8',
      stdio: options.stdio || 'pipe',
      shell: true
    });
  }
}

export function getGitStatus(projectPath: string): GitStatusInfo {
  const cwd = resolve(projectPath);
  
  // First check if git is available
  try {
    const gitPath = findGitExecutable();
    if (gitPath) {
      execSync(`"${gitPath}" --version`, { stdio: 'ignore' });
    } else {
      execSync('git --version', { stdio: 'ignore', shell: process.platform === 'win32' });
    }
  } catch (error: any) {
    // Git is not installed or not in PATH
    if (error.code === 'ENOENT') {
      return { isRepo: false };
    }
    // Other error, continue to check if it's a repo
  }
  
  try {
    runGitCommand('rev-parse --is-inside-work-tree', cwd, { stdio: 'ignore' });
  } catch {
    return { isRepo: false };
  }

  // Get branch name using a more reliable method that works on all platforms
  let branch: string | undefined;
  try {
    const branchOutput = runGitCommand('rev-parse --abbrev-ref HEAD', cwd, { encoding: 'utf-8' });
    const branchName = branchOutput.trim();
    // If we get "HEAD", we're in detached state - try to get the commit hash or tag
    if (branchName === 'HEAD') {
      try {
        // Try to get a tag name if we're on a tag
        const tagOutput = runGitCommand('describe --tags --exact-match HEAD', cwd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        const tag = tagOutput.trim();
        if (tag) {
          branch = tag;
        }
      } catch {
        // Not on a tag, continue to get hash
      }
      
      // If we didn't get a tag, get the short commit hash
      if (!branch) {
        try {
          const hashOutput = runGitCommand('rev-parse --short HEAD', cwd, { encoding: 'utf-8' });
          branch = hashOutput.trim();
        } catch {
          branch = 'detached';
        }
      }
    } else {
      branch = branchName;
    }
  } catch (error: any) {
    // If git command fails (e.g., git not installed), return early
    if (error.code === 'ENOENT') {
      return { isRepo: false };
    }
    // Fallback to parsing status output - will be handled below
    branch = undefined;
  }

  let statusOutput: string;
  try {
    statusOutput = runGitCommand('status --short --branch', cwd, { encoding: 'utf-8' });
  } catch (error: any) {
    // If git status fails, we can't get the full status
    if (error.code === 'ENOENT') {
      return { isRepo: false };
    }
    // Return what we have so far
    return {
      isRepo: true,
      branch: branch,
      dirty: false,
      changes: []
    };
  }
  // Handle both Unix (LF) and Windows (CRLF) line endings
  const lines = statusOutput.trim().split(/\r?\n/);
  const branchInfo = lines.length > 0 ? parseBranchLine(lines[0]) : {};
  
  // Use the branch from rev-parse if we got it, otherwise fall back to parsed branch
  if (!branch) {
    branch = branchInfo.branch;
  }
  
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
    const logOutput = runGitCommand('log -1 --pretty=format:%h%n%s%n%cr', cwd, { encoding: 'utf-8' });
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
    branch: branch,
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    upstream: branchInfo.upstream,
    dirty,
    changes,
    lastCommit
  };
}

