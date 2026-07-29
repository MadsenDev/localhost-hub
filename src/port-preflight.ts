import type { ServiceEnvironment } from './tauri-api';

const PORT_KEYS = new Set(['PORT']);
const EXPLICIT_PORT_PATTERN = /(?:^|\s)--port(?:=|\s+)(\d{1,5})(?=\s|$)/g;

function validPort(value: unknown): number | null {
  const port = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : null;
}

export function deriveExpectedPorts(
  command: string,
  environment: ServiceEnvironment,
  configuredPort?: number | null,
): number[] {
  const ports = new Set<number>();
  const configured = validPort(configuredPort);
  if (configured) ports.add(configured);

  for (const variable of environment.vars) {
    if (!PORT_KEYS.has(variable.key.toUpperCase())) continue;
    const port = validPort(variable.value);
    if (port) ports.add(port);
  }

  for (const match of command.matchAll(EXPLICIT_PORT_PATTERN)) {
    const port = validPort(match[1]);
    if (port) ports.add(port);
  }

  return [...ports].sort((left, right) => left - right);
}
