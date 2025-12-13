import { useState, useEffect, useCallback } from 'react';

type SettingValue = string | number | boolean | null;

export function useSettings(electronAPI?: Window['electronAPI']) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    if (!electronAPI?.settings) {
      setLoading(false);
      return;
    }
    try {
      const data = await electronAPI.settings.getAll();
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }, [electronAPI]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const getSetting = useCallback(
    (key: string, defaultValue: SettingValue = null): SettingValue => {
      const value = settings[key];
      if (value === undefined || value === '') {
        return defaultValue;
      }
      // Try to parse as number
      if (typeof defaultValue === 'number') {
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
      }
      // Try to parse as boolean
      if (typeof defaultValue === 'boolean') {
        return value === 'true' || value === '1';
      }
      return value;
    },
    [settings]
  );

  const getSettingAsNumber = useCallback(
    (key: string, defaultValue: number = 0): number => {
      return getSetting(key, defaultValue) as number;
    },
    [getSetting]
  );

  const getSettingAsBoolean = useCallback(
    (key: string, defaultValue: boolean = false): boolean => {
      return getSetting(key, defaultValue) as boolean;
    },
    [getSetting]
  );

  const getSettingAsString = useCallback(
    (key: string, defaultValue: string = ''): string => {
      return (getSetting(key, defaultValue) as string) || defaultValue;
    },
    [getSetting]
  );

  const setSetting = useCallback(
    async (key: string, value: SettingValue) => {
      if (!electronAPI?.settings) return;
      try {
        const stringValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value ?? '');
        await electronAPI.settings.set({ key, value: stringValue });
        setSettings((prev) => ({ ...prev, [key]: stringValue }));
      } catch (error) {
        console.error('Error saving setting:', error);
        throw error;
      }
    },
    [electronAPI]
  );

  return {
    settings,
    loading,
    getSetting,
    getSettingAsNumber,
    getSettingAsBoolean,
    getSettingAsString,
    setSetting,
    reload: loadSettings
  };
}

