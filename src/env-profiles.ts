import type { EnvProfile } from './types';
import type { ServiceEnvironment } from './tauri-api';

export function profilesForProject(profiles: EnvProfile[], projectPath: string): EnvProfile[] {
  return profiles.filter(profile => profile.project_path === projectPath);
}

export function resolveEnvProfile(
  profiles: EnvProfile[],
  projectPath: string,
  preferredId?: string | null,
): EnvProfile | null {
  const projectProfiles = profilesForProject(profiles, projectPath);
  if (preferredId) {
    const preferred = projectProfiles.find(profile => profile.id === preferredId);
    if (preferred) return preferred;
  }
  return projectProfiles.find(profile => profile.is_default) ?? null;
}

export function toServiceEnvironment(profile: EnvProfile | null): ServiceEnvironment {
  return {
    inherit_system: true,
    vars: profile?.vars.map(({ key, value }) => ({ key, value })) ?? [],
  };
}

export function normalizeProjectProfiles(
  allProfiles: EnvProfile[],
  projectPath: string,
  projectProfiles: EnvProfile[],
): EnvProfile[] {
  const seenIds = new Set<string>();
  let foundDefault = false;
  const normalized = projectProfiles.map(profile => {
    if (seenIds.has(profile.id)) throw new Error(`Duplicate environment profile id: ${profile.id}`);
    seenIds.add(profile.id);
    const name = profile.name.trim();
    if (!name) throw new Error('Profile name cannot be empty.');
    const seenKeys = new Set<string>();
    const vars = profile.vars.map(variable => {
      const key = variable.key.trim();
      if (!key) throw new Error(`Environment profile "${name}" has an empty variable key.`);
      if (key.includes('=') || key.includes('\0')) {
        throw new Error(`Environment variable "${key}" contains an invalid character.`);
      }
      if (seenKeys.has(key)) throw new Error(`Environment variable "${key}" is duplicated.`);
      seenKeys.add(key);
      return { ...variable, key };
    });
    const isDefault = profile.is_default && !foundDefault;
    foundDefault ||= isDefault;
    return { ...profile, project_path: projectPath, name, is_default: isDefault, vars };
  });
  if (normalized.length > 0 && !normalized.some(profile => profile.is_default)) {
    normalized[0] = { ...normalized[0], is_default: true };
  }
  return [
    ...allProfiles.filter(profile => profile.project_path !== projectPath),
    ...normalized,
  ];
}
