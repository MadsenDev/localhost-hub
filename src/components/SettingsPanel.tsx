import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HiCog6Tooth, 
  HiFolder, 
  HiPlay, 
  HiDocumentText, 
  HiServer, 
  HiPaintBrush,
  HiInformationCircle,
  HiCheck,
  HiChevronRight
} from 'react-icons/hi2';
import { LoadingSkeleton } from './LoadingSkeleton';

interface SettingsPanelProps {
  electronAPI?: Window['electronAPI'];
}

type SettingKey =
  // General
  | 'theme'
  | 'autoScanInterval'
  | 'minimizeToTray'
  | 'startMinimized'
  | 'enableNotifications'
  // Project Management
  | 'defaultPackageManager'
  | 'autoDetectPackageManager'
  | 'scanDepth'
  | 'ignorePatterns'
  // Script Execution
  | 'scriptTimeout'
  | 'killTimeout'
  | 'autoRestartOnCrash'
  | 'inheritSystemEnv'
  // Logging
  | 'logRetentionDays'
  | 'maxLogSizeMB'
  | 'logTimestampFormat'
  | 'autoScrollLogs'
  | 'logBufferSize'
  // Ports & Processes
  | 'portRefreshInterval'
  | 'showSystemProcesses'
  | 'portDetectionMethod'
  // UI/UX
  | 'sidebarWidth'
  | 'compactMode'
  | 'fontSize'
  | 'reduceAnimations';

type SettingConfig = {
  label: string;
  description: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'textarea';
  category: 'general' | 'projects' | 'scripts' | 'logging' | 'ports' | 'ui';
  options?: string[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
};

const SETTING_CONFIGS: Record<SettingKey, SettingConfig> = {
  // General
  theme: {
    label: 'Theme',
    description: 'Application color theme',
    type: 'select',
    category: 'general',
    options: ['dark', 'light', 'system']
  },
  autoScanInterval: {
    label: 'Auto-scan Interval',
    description: 'How often to automatically rescan for new projects (0 = disabled)',
    type: 'number',
    category: 'general',
    placeholder: '300',
    min: 0
  },
  minimizeToTray: {
    label: 'Minimize to System Tray',
    description: 'Minimize window to system tray instead of taskbar',
    type: 'boolean',
    category: 'general'
  },
  startMinimized: {
    label: 'Start Minimized',
    description: 'Launch application in minimized state',
    type: 'boolean',
    category: 'general'
  },
  enableNotifications: {
    label: 'Enable Notifications',
    description: 'Show desktop notifications for script events',
    type: 'boolean',
    category: 'general'
  },
  // Project Management
  defaultPackageManager: {
    label: 'Default Package Manager',
    description: 'Preferred package manager for running scripts',
    type: 'select',
    category: 'projects',
    options: ['npm', 'pnpm', 'yarn', 'bun', 'deno']
  },
  autoDetectPackageManager: {
    label: 'Auto-detect Package Manager',
    description: 'Automatically detect package manager from lock files',
    type: 'boolean',
    category: 'projects'
  },
  scanDepth: {
    label: 'Scan Depth',
    description: 'Maximum directory depth to scan for projects (0 = unlimited)',
    type: 'number',
    category: 'projects',
    placeholder: '10',
    min: 0,
    max: 50
  },
  ignorePatterns: {
    label: 'Ignore Patterns',
    description: 'Comma-separated patterns to ignore during scanning',
    type: 'textarea',
    category: 'projects',
    placeholder: 'node_modules, .git, dist, build'
  },
  // Script Execution
  scriptTimeout: {
    label: 'Script Timeout',
    description: 'Maximum time to wait for a script to start (0 = no timeout)',
    type: 'number',
    category: 'scripts',
    placeholder: '30',
    min: 0
  },
  killTimeout: {
    label: 'Kill Timeout',
    description: 'Time to wait before force-killing a process',
    type: 'number',
    category: 'scripts',
    placeholder: '5',
    min: 0,
    max: 60
  },
  autoRestartOnCrash: {
    label: 'Auto-restart on Crash',
    description: 'Automatically restart scripts that exit unexpectedly',
    type: 'boolean',
    category: 'scripts'
  },
  inheritSystemEnv: {
    label: 'Inherit System Environment',
    description: 'Include system environment variables when running scripts',
    type: 'boolean',
    category: 'scripts'
  },
  // Logging
  logRetentionDays: {
    label: 'Log Retention',
    description: 'Number of days to keep log history (0 = keep forever)',
    type: 'number',
    category: 'logging',
    placeholder: '30',
    min: 0
  },
  maxLogSizeMB: {
    label: 'Max Log Size per Process',
    description: 'Maximum log size before truncation (0 = unlimited)',
    type: 'number',
    category: 'logging',
    placeholder: '100',
    min: 0
  },
  logTimestampFormat: {
    label: 'Timestamp Format',
    description: 'Format for log timestamps',
    type: 'select',
    category: 'logging',
    options: ['none', 'relative', 'absolute', 'iso']
  },
  autoScrollLogs: {
    label: 'Auto-scroll Logs',
    description: 'Automatically scroll to bottom when new log entries arrive',
    type: 'boolean',
    category: 'logging'
  },
  logBufferSize: {
    label: 'Log Buffer Size',
    description: 'Number of log lines to keep in memory',
    type: 'number',
    category: 'logging',
    placeholder: '1000',
    min: 100,
    max: 10000,
    step: 100
  },
  // Ports & Processes
  portRefreshInterval: {
    label: 'Port Refresh Interval',
    description: 'How often to refresh port and process information',
    type: 'number',
    category: 'ports',
    placeholder: '2',
    min: 1,
    max: 60
  },
  showSystemProcesses: {
    label: 'Show System Processes',
    description: 'Include system processes in the ports & processes view',
    type: 'boolean',
    category: 'ports'
  },
  portDetectionMethod: {
    label: 'Port Detection Method',
    description: 'Method used to detect ports (lsof/netstat)',
    type: 'select',
    category: 'ports',
    options: ['auto', 'lsof', 'netstat']
  },
  // UI/UX
  sidebarWidth: {
    label: 'Sidebar Width',
    description: 'Width of the project sidebar in pixels',
    type: 'number',
    category: 'ui',
    placeholder: '288',
    min: 200,
    max: 500,
    step: 8
  },
  compactMode: {
    label: 'Compact Mode',
    description: 'Use more compact spacing throughout the UI',
    type: 'boolean',
    category: 'ui'
  },
  fontSize: {
    label: 'Font Size',
    description: 'Base font size for the application',
    type: 'select',
    category: 'ui',
    options: ['small', 'medium', 'large']
  },
  reduceAnimations: {
    label: 'Reduce Animations',
    description: 'Minimize animations for better performance',
    type: 'boolean',
    category: 'ui'
  }
};

const CATEGORIES = [
  { id: 'general', label: 'General', icon: HiCog6Tooth, color: 'indigo' },
  { id: 'projects', label: 'Projects', icon: HiFolder, color: 'emerald' },
  { id: 'scripts', label: 'Scripts', icon: HiPlay, color: 'blue' },
  { id: 'logging', label: 'Logging', icon: HiDocumentText, color: 'purple' },
  { id: 'ports', label: 'Ports & Processes', icon: HiServer, color: 'orange' },
  { id: 'ui', label: 'Appearance', icon: HiPaintBrush, color: 'pink' },
  { id: 'about', label: 'About', icon: HiInformationCircle, color: 'slate' }
] as const;

const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun', 'deno'];

export function SettingsPanel({ electronAPI }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('general');

  const loadSettings = useCallback(async () => {
    if (!electronAPI?.settings) return;
    try {
      setLoading(true);
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

  const handleSaveSetting = useCallback(
    async (key: SettingKey, value: string) => {
      if (!electronAPI?.settings) return;
      try {
        setSaving(key);
        await electronAPI.settings.set({ key, value });
        setSettings((prev) => ({ ...prev, [key]: value }));
        
        // If theme changed, trigger a custom event so App.tsx can react
        if (key === 'theme') {
          window.dispatchEvent(new CustomEvent('settings:themeChanged', { detail: { theme: value } }));
        }
      } catch (error) {
        console.error('Error saving setting:', error);
      } finally {
        setSaving(null);
      }
    },
    [electronAPI]
  );

  const getCategorySettings = (category: string) => {
    return Object.entries(SETTING_CONFIGS).filter(
      ([_, config]) => config.category === category
    ) as [SettingKey, SettingConfig][];
  };

  const renderSetting = (key: SettingKey, config: SettingConfig) => {
    const currentValue = settings[key] || '';
    const isSaving = saving === key;
    const isBoolean = config.type === 'boolean';
    const boolValue = currentValue === 'true' || currentValue === '1';

    return (
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="group"
      >
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50 bg-slate-50/50 dark:bg-slate-900/30 light:bg-slate-50/50 hover:border-indigo-300 dark:hover:border-indigo-700/50 light:hover:border-indigo-400/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 light:hover:bg-indigo-50/30 transition-all">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100 light:text-slate-900 mb-1">
              {config.label}
            </label>
            <p className="text-xs text-slate-600 dark:text-slate-400 light:text-slate-600 leading-relaxed">
              {config.description}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {isBoolean ? (
              <button
                onClick={() => handleSaveSetting(key, boolValue ? 'false' : 'true')}
                disabled={isSaving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 light:focus:ring-offset-white disabled:opacity-50 ${
                  boolValue
                    ? 'bg-indigo-600 dark:bg-indigo-500 light:bg-indigo-600'
                    : 'bg-slate-300 dark:bg-slate-700 light:bg-slate-300'
                }`}
                role="switch"
                aria-checked={boolValue}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    boolValue ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            ) : config.type === 'select' ? (
              <select
                value={currentValue}
                onChange={(e) => handleSaveSetting(key, e.target.value)}
                disabled={isSaving}
                className="rounded-lg border border-slate-300 dark:border-slate-700 light:border-slate-300 bg-white dark:bg-slate-800 light:bg-white px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 light:text-slate-900 focus:border-indigo-500 dark:focus:border-indigo-500 light:focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-40 min-w-[140px]"
              >
                {key === 'defaultPackageManager' && (
                  <>
                    <option value="">System default</option>
                    {PACKAGE_MANAGERS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </>
                )}
                {config.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </select>
            ) : config.type === 'textarea' ? (
              <textarea
                value={currentValue}
                onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                onBlur={(e) => handleSaveSetting(key, e.target.value)}
                disabled={isSaving}
                placeholder={config.placeholder}
                rows={3}
                className="rounded-lg border border-slate-300 dark:border-slate-700 light:border-slate-300 bg-white dark:bg-slate-800 light:bg-white px-3 py-2 text-sm text-slate-900 dark:text-slate-100 light:text-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500 light:placeholder:text-slate-400 focus:border-indigo-500 dark:focus:border-indigo-500 light:focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-40 resize-none w-64"
              />
            ) : (
              <input
                type={config.type}
                value={currentValue}
                onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                onBlur={(e) => handleSaveSetting(key, e.target.value)}
                disabled={isSaving}
                placeholder={config.placeholder}
                min={config.min}
                max={config.max}
                step={config.step}
                className="rounded-lg border border-slate-300 dark:border-slate-700 light:border-slate-300 bg-white dark:bg-slate-800 light:bg-white px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 light:text-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500 light:placeholder:text-slate-400 focus:border-indigo-500 dark:focus:border-indigo-500 light:focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-40 w-32"
              />
            )}
            {isSaving && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 light:text-slate-500">
                <div className="h-3 w-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span>Saving</span>
              </div>
            )}
            {!isSaving && currentValue && (
              <div className="text-indigo-500 dark:text-indigo-400 light:text-indigo-600">
                <HiCheck className="h-5 w-5" />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-64 border-r border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50 p-4">
          <LoadingSkeleton lines={6} />
        </div>
        <div className="flex-1 p-6">
          <LoadingSkeleton lines={8} />
        </div>
      </div>
    );
  }

  const activeCategoryData = CATEGORIES.find(c => c.id === activeCategory);
  const categorySettings = getCategorySettings(activeCategory);

  return (
    <div className="flex h-full">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50 bg-slate-50/30 dark:bg-slate-900/30 light:bg-slate-50/30 p-4 flex-shrink-0">
        <nav className="space-y-1">
          {CATEGORIES.map((category) => {
            const Icon = category.icon;
            const isActive = activeCategory === category.id;
            const count = category.id === 'about' ? 0 : getCategorySettings(category.id).length;
            
            return (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? `bg-indigo-50 dark:bg-indigo-950/30 light:bg-indigo-50 text-indigo-700 dark:text-indigo-300 light:text-indigo-700 border border-indigo-200 dark:border-indigo-800/50 light:border-indigo-200`
                    : 'text-slate-700 dark:text-slate-300 light:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/50 light:hover:bg-slate-100'
                }`}
              >
                <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400 light:text-indigo-600' : ''}`} />
                <span className="flex-1 text-left">{category.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  isActive
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 light:bg-indigo-100 text-indigo-700 dark:text-indigo-300 light:text-indigo-700'
                    : 'bg-slate-200 dark:bg-slate-700 light:bg-slate-200 text-slate-600 dark:text-slate-400 light:text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        <div className="p-6 max-w-3xl flex-1">
          {activeCategory === 'about' ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <HiInformationCircle className="h-6 w-6 text-indigo-600 dark:text-indigo-400 light:text-indigo-600" />
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white light:text-slate-900">
                    About Localhost Hub
                  </h3>
                </div>
              </div>

              {/* App Info Card */}
              <div className="rounded-xl border border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 light:from-indigo-50/50 light:to-purple-50/50 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="text-2xl font-bold text-slate-900 dark:text-white light:text-slate-900 mb-1">
                      Localhost Hub
                    </h4>
                    <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 light:text-indigo-600">
                      Version 0.5.0
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 light:text-slate-700 leading-relaxed">
                  A desktop control center for managing local development projects, scripts, and processes. 
                  Streamline your workflow with unified project management, script execution, environment profiles, 
                  and workspace orchestration.
                </p>
              </div>

              {/* Features */}
              <div className="rounded-xl border border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50 bg-slate-50/50 dark:bg-slate-900/30 light:bg-slate-50/50 p-6">
                <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100 light:text-slate-900 mb-4">
                  Key Features
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 light:text-indigo-600 mt-0.5">•</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600">Project scanning & management</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 light:text-indigo-600 mt-0.5">•</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600">Script execution & monitoring</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 light:text-indigo-600 mt-0.5">•</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600">Workspace orchestration</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 light:text-indigo-600 mt-0.5">•</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600">Environment profiles</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 light:text-indigo-600 mt-0.5">•</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600">Git integration</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 light:text-indigo-600 mt-0.5">•</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600">Port & process tracking</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 light:text-indigo-600 mt-0.5">•</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600">Package management</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 light:text-indigo-600 mt-0.5">•</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600">Project creation wizard</span>
                  </div>
                </div>
              </div>

              {/* Tech Stack */}
              <div className="rounded-xl border border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50 bg-slate-50/50 dark:bg-slate-900/30 light:bg-slate-50/50 p-6">
                <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100 light:text-slate-900 mb-4">
                  Built With
                </h5>
                <div className="flex flex-wrap gap-2">
                  {['Electron', 'React 19', 'TypeScript', 'Vite', 'Tailwind CSS', 'Framer Motion', 'SQLite'].map((tech) => (
                    <span
                      key={tech}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 light:bg-white border border-slate-200 dark:border-slate-700 light:border-slate-200 text-xs font-medium text-slate-700 dark:text-slate-300 light:text-slate-700"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>

              {/* Author & Links */}
              <div className="rounded-xl border border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50 bg-slate-50/50 dark:bg-slate-900/30 light:bg-slate-50/50 p-6 space-y-4">
                <div>
                  <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100 light:text-slate-900 mb-2">
                    Author
                  </h5>
                  <p className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600 mb-1">
                    Christoffer Madsen
                  </p>
                  <a
                    href="mailto:chris@madsens.dev"
                    onClick={(e) => {
                      e.preventDefault();
                      if (electronAPI?.shell?.openExternal) {
                        electronAPI.shell.openExternal('mailto:chris@madsens.dev');
                      }
                    }}
                    className="text-sm text-indigo-600 dark:text-indigo-400 light:text-indigo-600 hover:underline"
                  >
                    chris@madsens.dev
                  </a>
                </div>

                <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50">
                  <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100 light:text-slate-900 mb-3">
                    License
                  </h5>
                  <p className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600">
                    MIT License - Open source and free to use
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50">
                  <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100 light:text-slate-900 mb-3">
                    Support the Project
                  </h5>
                  <button
                    onClick={async () => {
                      if (electronAPI?.shell?.openExternal) {
                        await electronAPI.shell.openExternal('https://buymeacoffee.com/madsendev');
                      }
                    }}
                    className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-700 dark:text-amber-300 transition hover:bg-amber-100 dark:hover:bg-amber-500/20 w-full justify-center"
                  >
                    <span>☕</span>
                    <span>Buy Me a Coffee</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <>
              {activeCategoryData && (
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    {(() => {
                      const Icon = activeCategoryData.icon;
                      return <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400 light:text-indigo-600" />;
                    })()}
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white light:text-slate-900">
                      {activeCategoryData.label}
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 light:text-slate-600 ml-9">
                    {categorySettings.length} {categorySettings.length === 1 ? 'setting' : 'settings'}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {categorySettings.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 dark:text-slate-400 light:text-slate-500">
                    <p className="text-sm">No settings in this category</p>
                  </div>
                ) : (
                  categorySettings.map(([key, config]) => renderSetting(key, config))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
