import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export type ExternalProcess = {
  id: string;
  script: string;
  command: string;
  projectPath: string;
  startedAt: number;
  isExternal: true;
  pid?: number;
  port?: number;
};

// Common development ports
const DEV_PORTS = [3000, 3001, 5173, 5174, 8080, 8081, 4200, 5000, 5001, 8000, 8001, 9000, 9001];

// Keywords to identify relevant processes
const RELEVANT_KEYWORDS = [
  'vite',
  'react',
  'next',
  'nuxt',
  'svelte',
  'astro',
  'remix',
  'webpack',
  'rollup',
  'parcel',
  'esbuild',
  'tsx',
  'ts-node',
  'nodemon',
  'node-dev',
  'dev',
  'serve',
  'localhost'
];

function isRelevantProcess(command: string, processName: string): boolean {
  const lowerCommand = command.toLowerCase();
  const lowerName = processName.toLowerCase();
  
  // Exclude the Electron main process (the app itself), but NOT dev servers running for localhost-hub
  // The Electron main process will have 'electron' and the path to main.js or similar
  if (lowerCommand.includes('electron') && (lowerCommand.includes('main.js') || lowerCommand.includes('dist-electron'))) {
    return false;
  }
  
  // Exclude grep/lsof/ps processes used for scanning
  if (lowerCommand.includes('grep') || lowerCommand.includes('lsof') || lowerCommand.includes('ps ')) {
    return false;
  }
  
  // Check if command or process name contains relevant keywords
  return RELEVANT_KEYWORDS.some(keyword => 
    lowerCommand.includes(keyword) || lowerName.includes(keyword)
  );
}

async function scanProcessesLinux(): Promise<ExternalProcess[]> {
  const processes: ExternalProcess[] = [];
  
  try {
    // Get processes listening on localhost ports
    const { stdout: netstatOutput } = await execAsync('lsof -i -P -n | grep LISTEN | grep -E ":(3000|3001|5173|5174|8080|8081|4200|5000|5001|8000|8001|9000|9001)" || true');
    
    const lines = netstatOutput.trim().split('\n').filter(Boolean);
    const processMap = new Map<number, { command: string; port: number }>();
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      
      const pid = parseInt(parts[1], 10);
      if (isNaN(pid)) continue;
      
      // Extract port from the line (format: node 12345 user 23u IPv4 ... TCP *:5173 (LISTEN))
      const portMatch = line.match(/:(\d+)\s*\(LISTEN\)/);
      if (!portMatch) continue;
      
      const port = parseInt(portMatch[1], 10);
      if (!DEV_PORTS.includes(port)) continue;
      
      // Get full command for this PID
      try {
        const { stdout: cmdOutput } = await execAsync(`ps -p ${pid} -o command= 2>/dev/null || true`);
        const command = cmdOutput.trim();
        
        if (!command) continue;
        
        // If it's listening on a dev port, include it if it's relevant OR if it's a node process
        // (node processes on dev ports are likely dev servers)
        const isNodeProcess = command.includes('node') || command.includes('npm');
        if (isRelevantProcess(command, '') || (isNodeProcess && !command.includes('grep') && !command.includes('lsof'))) {
          // Double-check: exclude the Electron main process
          if (command.includes('electron') && (command.includes('main.js') || command.includes('dist-electron'))) {
            continue;
          }
          processMap.set(pid, { command, port });
        }
      } catch {
        // Process might have exited, skip it
      }
    }
    
    // Also check all node processes for relevant commands
    try {
      const { stdout: psOutput } = await execAsync('ps aux | grep -E "(node|npm|vite|react)" | grep -v grep || true');
      const psLines = psOutput.trim().split('\n').filter(Boolean);

      for (const line of psLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 11) continue;

        const pid = parseInt(parts[1], 10);
        if (isNaN(pid) || processMap.has(pid)) continue;

        const command = parts.slice(10).join(' ');
        if (!isRelevantProcess(command, '')) {
          continue;
        }

        // Try to find the port this process is using. If we can't match it to one
        // of the known dev server ports, skip it so that helper/child processes
        // (like Vite's worker processes) aren't shown as separate entries.
        try {
          const { stdout: portOutput } = await execAsync(`lsof -p ${pid} -i -P -n | grep LISTEN | head -1 || true`);
          const portMatch = portOutput.match(/:(\d+)\s*\(LISTEN\)/);
          const port = portMatch ? parseInt(portMatch[1], 10) : null;

          if (port && DEV_PORTS.includes(port)) {
            processMap.set(pid, { command, port });
          }
        } catch {
          // Process might have exited between the ps and lsof calls; ignore it.
        }
      }
    } catch {
      // Ignore errors
    }
    
    // Convert to ExternalProcess format
    for (const [pid, { command, port }] of processMap.entries()) {
      // Extract a meaningful name from the command
      let script = 'dev server';
      if (command.includes('vite')) {
        // Check if it's a specific vite command
        if (command.includes('vite dev') || command.includes('vite --')) {
          script = 'vite dev';
        } else {
          script = 'vite';
        }
      } else if (command.includes('react-scripts')) script = 'react-scripts';
      else if (command.includes('react')) script = 'react';
      else if (command.includes('next dev')) script = 'next dev';
      else if (command.includes('next')) script = 'next';
      else if (command.includes('npm run')) {
        const match = command.match(/npm run (\w+)/);
        if (match) script = match[1];
      } else if (command.includes('node')) {
        // Try to extract script name from node command
        const nodeMatch = command.match(/node\s+(?:.*\/)?(\w+\.(?:js|ts|mjs))/);
        if (nodeMatch) {
          script = nodeMatch[1].replace(/\.(js|ts|mjs)$/, '');
        } else {
          script = 'node server';
        }
      }
      
      // Try to extract project path from command
      let projectPath = 'External';
      // Look for paths in the command
      const pathMatches = command.match(/(\/[^\s"'`]+)/g);
      if (pathMatches && pathMatches.length > 0) {
        // Use the first path that looks like a project directory
        for (const path of pathMatches) {
          // Skip common system paths
          if (path.includes('/node_modules/') || path.includes('/.cache/') || path.includes('/tmp/')) {
            continue;
          }
          // If it contains common project indicators, use it
          if (path.includes('/src/') || path.includes('/app/') || path.includes('/lib/') || path.match(/\/[^/]+$/)) {
            // Extract directory (remove filename if present)
            const dirMatch = path.match(/^(.+)\/[^/]+$/);
            projectPath = dirMatch ? dirMatch[1] : path;
            break;
          }
        }
        // If no good match, use the first non-system path
        if (projectPath === 'External') {
          for (const path of pathMatches) {
            if (!path.includes('/node_modules/') && !path.includes('/.cache/')) {
              const dirMatch = path.match(/^(.+)\/[^/]+$/);
              projectPath = dirMatch ? dirMatch[1] : path;
              break;
            }
          }
        }
      }
      
      processes.push({
        id: `external-${pid}`,
        script: script || `process-${pid}`,
        command: command.substring(0, 200), // Truncate long commands
        projectPath,
        startedAt: Date.now() - 3600000, // Estimate: started 1 hour ago (we don't have exact time)
        isExternal: true,
        pid,
        port
      });
    }
  } catch (error) {
    console.error('Error scanning external processes:', error);
  }
  
  return processes;
}

async function scanProcessesDarwin(): Promise<ExternalProcess[]> {
  // macOS uses similar commands to Linux
  return scanProcessesLinux();
}

async function scanProcessesWin32(): Promise<ExternalProcess[]> {
  const processes: ExternalProcess[] = [];
  
  try {
    // On Windows, use netstat and tasklist
    const { stdout: netstatOutput } = await execAsync(
      'netstat -ano | findstr LISTENING | findstr /E ":3000 :3001 :5173 :5174 :8080 :8081 :4200 :5000 :5001 :8000 :8001 :9000 :9001" || echo'
    );
    
    const lines = netstatOutput.trim().split('\n').filter(Boolean);
    const pidPortMap = new Map<number, number>();
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      // Format: TCP    0.0.0.0:5173    0.0.0.0:0    LISTENING    12345
      const addressPart = parts.find(p => p.includes(':'));
      if (!addressPart) continue;
      
      const portMatch = addressPart.match(/:(\d+)$/);
      if (!portMatch) continue;
      
      const port = parseInt(portMatch[1], 10);
      if (!DEV_PORTS.includes(port)) continue;
      
      const pid = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(pid)) {
        pidPortMap.set(pid, port);
      }
    }
    
    // Get command for each PID
    for (const [pid, port] of pidPortMap.entries()) {
      try {
        const { stdout: taskOutput } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH || echo`);
        const parts = taskOutput.split(',');
        if (parts.length < 2) continue;
        
        const processName = parts[0].replace(/"/g, '').trim();
        const command = `${processName} (port ${port})`;
        
        if (isRelevantProcess(command, processName)) {
          processes.push({
            id: `external-${pid}`,
            script: processName.includes('node') ? 'node server' : 'dev server',
            command: command.substring(0, 200),
            projectPath: 'Unknown',
            startedAt: Date.now() - 3600000,
            isExternal: true,
            pid,
            port
          });
        }
      } catch {
        // Process might have exited
      }
    }
  } catch (error) {
    console.error('Error scanning external processes on Windows:', error);
  }
  
  return processes;
}

export async function scanExternalProcesses(): Promise<ExternalProcess[]> {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return scanProcessesWin32();
  } else if (platform === 'darwin') {
    return scanProcessesDarwin();
  } else {
    return scanProcessesLinux();
  }
}

