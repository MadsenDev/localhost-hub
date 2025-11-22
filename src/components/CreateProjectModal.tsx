import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CreateProjectPayload } from '../types/global';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (projectData: CreateProjectPayload) => Promise<void>;
  electronAPI?: Window['electronAPI'];
}

const PROJECT_TEMPLATES = [
  {
    name: 'Empty',
    description: 'Just a basic package.json',
    packages: []
  },
  {
    name: 'React',
    description: 'React with Vite',
    packages: ['react', 'react-dom', 'vite', '@vitejs/plugin-react']
  },
  {
    name: 'Node.js',
    description: 'Basic Node.js project',
    packages: []
  },
  {
    name: 'TypeScript',
    description: 'TypeScript project',
    packages: ['typescript', '@types/node']
  }
];

type ScriptEntry = {
  id: string;
  key: string;
  command: string;
  locked?: boolean;
};

type StarterSuggestion = {
  id: string;
  title: string;
  description: string;
  headline: string;
  dependencies?: string[];
  devDependencies?: string[];
  scripts?: Record<string, string>;
  language?: 'javascript' | 'typescript';
  sampleCode?: 'console' | 'http';
};

const STARTER_SUGGESTIONS: StarterSuggestion[] = [
  {
    id: 'cli',
    title: 'CLI utility',
    headline: 'Interactive console entry point',
    description: 'Adds commander + chalk and wires a start script that runs src/index.js.',
    dependencies: ['commander', 'chalk'],
    scripts: { start: 'node src/index.js' },
    sampleCode: 'console'
  },
  {
    id: 'api-basic',
    title: 'HTTP API',
    headline: 'Node http server with JSON route',
    description: 'Adds ready-to-run dev/start scripts that watch src/server.js.',
    scripts: {
      dev: 'node --watch src/server.js',
      start: 'node src/server.js'
    },
    sampleCode: 'http'
  },
  {
    id: 'ts-lib',
    title: 'TypeScript library',
    headline: 'Bundles ts-node + compiler',
    description: 'Adds TypeScript tooling and dev/build scripts for authoring libraries.',
    devDependencies: ['typescript', 'ts-node', 'ts-node-dev'],
    scripts: {
      build: 'tsc -p .',
      dev: 'ts-node-dev --respawn src/index.ts',
      start: 'node dist/index.js'
    },
    language: 'typescript',
    sampleCode: 'console'
  }
];

const DEFAULT_SCRIPT_ROWS: ScriptEntry[] = [
  { id: 'script-dev', key: 'dev', command: '' },
  { id: 'script-start', key: 'start', command: '' },
  { id: 'script-build', key: 'build', command: '' },
  {
    id: 'script-test',
    key: 'test',
    command: 'echo "Error: no test specified" && exit 1',
    locked: true
  }
];

type StylingPresetId = 'none' | 'tailwind-v4' | 'tailwind-v3';
type IconPackId = 'react-icons' | 'lucide-react' | '@heroicons/react';

const STYLING_PRESETS: Array<{ id: StylingPresetId; title: string; description: string; badge?: string }> = [
  {
    id: 'none',
    title: 'Classic CSS',
    description: 'Plain CSS with no extra tooling.'
  },
  {
    id: 'tailwind-v4',
    title: 'Tailwind 4 (latest)',
    description: 'Oxide runtime, zero-config imports.',
    badge: 'New'
  },
  {
    id: 'tailwind-v3',
    title: 'Tailwind 3.4 LTS',
    description: 'Classic config + PostCSS pipeline.'
  }
];

const ICON_PACK_OPTIONS: Array<{ id: IconPackId; title: string; description: string }> = [
  {
    id: 'react-icons',
    title: 'react-icons',
    description: '2,000+ icons via a single import.'
  },
  {
    id: 'lucide-react',
    title: 'lucide-react',
    description: 'Clean outline set, tree-shake ready.'
  },
  {
    id: '@heroicons/react',
    title: '@heroicons/react',
    description: 'Heroicons solid & outline React components.'
  }
];

export function CreateProjectModal({ isOpen, onClose, onCreateProject, electronAPI }: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState('');
  const [directory, setDirectory] = useState('');
  const [description, setDescription] = useState('');
  const [packages, setPackages] = useState<string[]>([]);
  const [devPackages, setDevPackages] = useState<string[]>([]);
  const [packageInput, setPackageInput] = useState('');
  const [devPackageInput, setDevPackageInput] = useState('');
  const [packageManager, setPackageManager] = useState<'npm' | 'yarn' | 'pnpm' | 'bun'>('npm');
  const [installDependencies, setInstallDependencies] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [maxVisitedStep, setMaxVisitedStep] = useState(0);
  const [scriptsList, setScriptsList] = useState<ScriptEntry[]>(DEFAULT_SCRIPT_ROWS);
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(null);
  const [language, setLanguage] = useState<'javascript' | 'typescript'>('javascript');
  const [includeSampleCode, setIncludeSampleCode] = useState(true);
  const [sampleCodeStyle, setSampleCodeStyle] = useState<'console' | 'http'>('console');
  const [initializeGit, setInitializeGit] = useState(true);
  const [includeReadme, setIncludeReadme] = useState(true);
  const [readmeNotes, setReadmeNotes] = useState('');
  const [stylingPreset, setStylingPreset] = useState<StylingPresetId>('none');
  const [selectedIconPacks, setSelectedIconPacks] = useState<IconPackId[]>([]);

  const summarizedScripts = useMemo(
    () =>
      scriptsList.reduce((acc, entry) => {
        const key = entry.key.trim();
        const command = entry.command.trim();
        if (key && command) {
          acc[key] = command;
        }
        return acc;
      }, {} as Record<string, string>),
    [scriptsList]
  );

  const steps = [
    { title: 'Basics', subtitle: 'Name & directory' },
    { title: 'Stack', subtitle: 'Templates & packages' },
    { title: 'Extras', subtitle: 'Scripts & bootstrapping' },
    { title: 'Review', subtitle: 'Confirm & create' }
  ];

  const handleSelectDirectory = async () => {
    if (!electronAPI) return;
    try {
      const result = await electronAPI.dialog.selectDirectory({ title: 'Select directory for new project' });
      if (!result.canceled && result.path) {
        setDirectory(result.path);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select directory');
    }
  };

  const handleSelectTemplate = (template: typeof PROJECT_TEMPLATES[0]) => {
    setSelectedTemplate(template.name);
    setPackages([...template.packages]);
  };

  const mergeUniqueStrings = (current: string[], additions: string[] = []) => {
    const next = [...current];
    additions.forEach((pkg) => {
      const trimmed = pkg.trim();
      if (!trimmed) return;
      if (!next.includes(trimmed)) {
        next.push(trimmed);
      }
    });
    return next;
  };

  const handleApplyStarter = (starter: StarterSuggestion) => {
    setSelectedStarterId(starter.id);
    if (starter.language) {
      setLanguage(starter.language);
    }
    if (starter.sampleCode) {
      setSampleCodeStyle(starter.sampleCode);
      setIncludeSampleCode(true);
    }
    if (starter.dependencies?.length) {
      setPackages((prev) => mergeUniqueStrings(prev, starter.dependencies));
    }
    if (starter.devDependencies?.length) {
      setDevPackages((prev) => mergeUniqueStrings(prev, starter.devDependencies));
    }
    if (starter.scripts) {
      setScriptsList((prev) => {
        const existingKeys = new Map(prev.map((entry) => [entry.key, entry]));
        const updated: ScriptEntry[] = prev.map((entry) =>
          starter.scripts && starter.scripts[entry.key]
            ? { ...entry, command: starter.scripts[entry.key] }
            : entry
        );
        Object.entries(starter.scripts).forEach(([key, command]) => {
          if (!existingKeys.has(key)) {
            updated.push({
              id: `script-${key}-${Date.now()}`,
              key,
              command
            });
          }
        });
        return updated;
      });
    }
  };

  const resetErrorIfBasicsFilled = () => {
    if (projectName.trim() && directory.trim() && error) {
      setError(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setMaxVisitedStep(0);
      setError(null);
      setProjectName('');
      setDirectory('');
      setDescription('');
      setPackages([]);
      setDevPackages([]);
      setPackageInput('');
      setDevPackageInput('');
      setSelectedTemplate(null);
      setSelectedStarterId(null);
      setScriptsList(DEFAULT_SCRIPT_ROWS);
      setLanguage('javascript');
      setIncludeSampleCode(true);
      setSampleCodeStyle('console');
      setInitializeGit(true);
      setIncludeReadme(true);
      setReadmeNotes('');
      setInstallDependencies(true);
      setPackageManager('npm');
      setStylingPreset('none');
      setSelectedIconPacks([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const hasTypeScript = devPackages.some((pkg) => pkg === 'typescript' || pkg.startsWith('typescript@'));
    if (language === 'typescript' && !hasTypeScript) {
      setDevPackages((prev) => [...prev, 'typescript']);
    }
  }, [language, devPackages]);

  const ensureBasicsAreValid = () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      setCurrentStep(0);
      return false;
    }
    if (!directory.trim()) {
      setError('Directory is required');
      setCurrentStep(0);
      return false;
    }
    setError(null);
    return true;
  };

  const canContinueFromStep = (stepIndex: number) => {
    if (stepIndex === 0) {
      return Boolean(projectName.trim() && directory.trim());
    }
    return true;
  };

  const handleNextStep = () => {
    if (currentStep === 0 && !ensureBasicsAreValid()) {
      return;
    }
    const nextStep = Math.min(currentStep + 1, steps.length - 1);
    setCurrentStep(nextStep);
    setMaxVisitedStep((prev) => Math.max(prev, nextStep));
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleAddPackage = () => {
    const trimmed = packageInput.trim();
    if (trimmed && !packages.includes(trimmed)) {
      setPackages([...packages, trimmed]);
      setPackageInput('');
    }
  };

  const handleRemovePackage = (pkg: string) => {
    setPackages(packages.filter((p) => p !== pkg));
  };

  const handleAddDevPackage = () => {
    const trimmed = devPackageInput.trim();
    if (trimmed && !devPackages.includes(trimmed)) {
      setDevPackages([...devPackages, trimmed]);
      setDevPackageInput('');
    }
  };

  const handleRemoveDevPackage = (pkg: string) => {
    setDevPackages(devPackages.filter((p) => p !== pkg));
  };

  const handleToggleIconPack = (packId: IconPackId) => {
    setSelectedIconPacks((prev) =>
      prev.includes(packId) ? prev.filter((id) => id !== packId) : [...prev, packId]
    );
  };

  const handleScriptFieldChange = (id: string, field: 'key' | 'command', value: string) => {
    setScriptsList((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  };

  const handleAddScriptRow = () => {
    setScriptsList((prev) => [
      ...prev,
      { id: `script-custom-${Date.now()}`, key: '', command: '' }
    ]);
  };

  const handleRemoveScriptRow = (id: string) => {
    setScriptsList((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleCreate = async () => {
    if (!ensureBasicsAreValid()) {
      return;
    }

    const scriptsPayload = { ...summarizedScripts };
    if (!scriptsPayload.test) {
      scriptsPayload.test = 'echo "Error: no test specified" && exit 1';
    }

    setIsCreating(true);

    try {
      await onCreateProject({
        name: projectName.trim(),
        directory: directory.trim(),
        description: description.trim() || undefined,
        packages,
        devPackages,
        scripts: scriptsPayload,
        packageManager,
        installDependencies,
        language,
        includeSampleCode,
        sampleCodeStyle,
        initializeGit,
        includeReadme,
        readmeNotes: includeReadme ? readmeNotes.trim() || undefined : undefined,
        stylingPreset,
        iconPacks: selectedIconPacks
      });
      // Reset form
      setProjectName('');
      setDirectory('');
      setDescription('');
      setPackages([]);
      setDevPackages([]);
      setPackageInput('');
      setDevPackageInput('');
      setSelectedTemplate(null);
      setSelectedStarterId(null);
      setScriptsList(DEFAULT_SCRIPT_ROWS);
      setLanguage('javascript');
      setIncludeSampleCode(true);
      setSampleCodeStyle('console');
      setInitializeGit(true);
      setIncludeReadme(true);
      setReadmeNotes('');
      setStylingPreset('none');
      setSelectedIconPacks([]);
      setCurrentStep(0);
      setMaxVisitedStep(0);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-2xl space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-950 max-h-[90vh] overflow-y-auto"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">New Project</p>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Create a new project</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Move through a few quick steps to scaffold a new project, add dependencies, and run installs automatically.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              {steps.map((step, index) => {
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                const isClickable = index <= maxVisitedStep;
                return (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => isClickable && setCurrentStep(index)}
                    disabled={!isClickable}
                    className={`flex items-center gap-4 rounded-2xl px-3 py-2 text-left transition ${
                      isActive
                        ? 'bg-white shadow-sm dark:bg-slate-900/70'
                        : 'opacity-80 hover:opacity-100 disabled:opacity-50'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-sm font-semibold ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-600/10 text-indigo-600 dark:border-indigo-400 dark:text-indigo-200'
                          : isCompleted
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100'
                          : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {step.subtitle}
                      </p>
                      <p className={`text-base font-semibold ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                        {step.title}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {currentStep === 0 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value);
                      resetErrorIfBasicsFilled();
                    }}
                    placeholder="my-awesome-project"
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                    disabled={isCreating}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Directory *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={directory}
                      onChange={(e) => {
                        setDirectory(e.target.value);
                        resetErrorIfBasicsFilled();
                      }}
                      placeholder="C:\\Users\\...\\projects"
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                      disabled={isCreating}
                    />
                    <button
                      type="button"
                      onClick={handleSelectDirectory}
                      disabled={isCreating || !electronAPI}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                    >
                      Browse
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A brief description of your project"
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                    disabled={isCreating}
                  />
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-5">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Templates (optional)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PROJECT_TEMPLATES.map((template) => (
                      <button
                        key={template.name}
                        type="button"
                        onClick={() => handleSelectTemplate(template)}
                        disabled={isCreating}
                        className={`rounded-xl border px-4 py-3 text-left transition ${
                          selectedTemplate === template.name
                            ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10'
                            : 'border-slate-300 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-indigo-500/40'
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.name}</div>
                        <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{template.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Guided starters
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Jump-start your stack with curated dependencies, scripts, and sample code preferences. You can still tweak anything after applying a starter.
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {STARTER_SUGGESTIONS.map((starter) => (
                      <button
                        key={starter.id}
                        type="button"
                        onClick={() => handleApplyStarter(starter)}
                        disabled={isCreating}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          selectedStarterId === starter.id
                            ? 'border-indigo-500 bg-indigo-500/5 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/5'
                            : 'border-slate-300 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-indigo-500/40'
                        }`}
                      >
                        <p className="text-[11px] uppercase tracking-wide text-indigo-500 dark:text-indigo-300">{starter.headline}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{starter.title}</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{starter.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Dependencies
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={packageInput}
                      onChange={(e) => setPackageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddPackage();
                        }
                      }}
                      placeholder="react, express, zustand..."
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                      disabled={isCreating}
                    />
                    <button
                      type="button"
                      onClick={handleAddPackage}
                      disabled={isCreating || !packageInput.trim()}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                    >
                      Add
                    </button>
                  </div>
                  {packages.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {packages.map((pkg) => (
                        <span
                          key={pkg}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                        >
                          {pkg}
                          <button
                            type="button"
                            onClick={() => handleRemovePackage(pkg)}
                            disabled={isCreating}
                            className="text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Dev dependencies
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={devPackageInput}
                      onChange={(e) => setDevPackageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddDevPackage();
                        }
                      }}
                      placeholder="vite, vitest, typescript..."
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                      disabled={isCreating}
                    />
                    <button
                      type="button"
                      onClick={handleAddDevPackage}
                      disabled={isCreating || !devPackageInput.trim()}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                    >
                      Add
                    </button>
                  </div>
                  {devPackages.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {devPackages.map((pkg) => (
                        <span
                          key={pkg}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                        >
                          {pkg}
                          <button
                            type="button"
                            onClick={() => handleRemoveDevPackage(pkg)}
                            disabled={isCreating}
                            className="text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Package Manager
                    </label>
                    <select
                      value={packageManager}
                      onChange={(e) => setPackageManager(e.target.value as typeof packageManager)}
                      disabled={isCreating}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                    >
                      <option value="npm">npm</option>
                      <option value="yarn">yarn</option>
                      <option value="pnpm">pnpm</option>
                      <option value="bun">bun</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Options
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                      <input
                        type="checkbox"
                        checked={installDependencies}
                        onChange={(e) => setInstallDependencies(e.target.checked)}
                        disabled={isCreating}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-300 dark:border-slate-600"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">Run install after creation</span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Styling preset
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pick a CSS toolkit to install and scaffold. You can still hand-tune files after create.
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {STYLING_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setStylingPreset(preset.id)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          stylingPreset === preset.id
                            ? 'border-violet-500 bg-violet-500/10 text-violet-900 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-100'
                            : 'border-slate-300 bg-white hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200'
                        }`}
                      >
                        <p className="text-sm font-semibold">{preset.title}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{preset.description}</p>
                        {preset.badge && (
                          <span className="mt-2 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-100">
                            {preset.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Icon packs
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Add popular React icon libraries to dependencies.</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {ICON_PACK_OPTIONS.map((pack) => {
                      const isSelected = selectedIconPacks.includes(pack.id);
                      return (
                        <button
                          key={pack.id}
                          type="button"
                          onClick={() => handleToggleIconPack(pack.id)}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            isSelected
                              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-500/10 dark:text-emerald-100'
                              : 'border-slate-300 bg-white hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200'
                          }`}
                        >
                          <div className="font-semibold">{pack.title}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{pack.description}</div>
                          {isSelected && <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-200">Added</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Script planner
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    These npm scripts get copied into package.json. Leave a field empty to skip that entry.
                  </p>
                  <div className="space-y-2">
                    {scriptsList.map((entry) => (
                      <div key={entry.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/30 md:flex-row md:items-center">
                        <input
                          type="text"
                          value={entry.key}
                          onChange={(e) => handleScriptFieldChange(entry.id, 'key', e.target.value.replace(/\s+/g, '-'))}
                          placeholder="dev"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200 md:w-32"
                          disabled={isCreating || entry.locked}
                        />
                        <input
                          type="text"
                          value={entry.command}
                          onChange={(e) => handleScriptFieldChange(entry.id, 'command', e.target.value)}
                          placeholder="vite dev"
                          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                          disabled={isCreating}
                        />
                        {!entry.locked && (
                          <button
                            type="button"
                            onClick={() => handleRemoveScriptRow(entry.id)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:border-rose-300 hover:text-rose-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
                            disabled={isCreating}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddScriptRow}
                    disabled={isCreating}
                    className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    + Add script
                  </button>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-5">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Language baseline
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['javascript', 'typescript'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setLanguage(option)}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                          language === option
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-100'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200'
                        }`}
                      >
                        {option === 'javascript' ? 'JavaScript' : 'TypeScript'}
                        <p className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                          {option === 'javascript' ? 'Classic Node entry point' : 'Includes tsconfig + compiler tooling'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Sample code
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeSampleCode}
                      onChange={(e) => setIncludeSampleCode(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-300 dark:border-slate-600"
                    />
                    Drop in opinionated starter files (src/index.{language === 'typescript' ? 'ts' : 'js'})
                  </label>
                  {includeSampleCode && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        {
                          id: 'console' as const,
                          title: 'Hello CLI',
                          description: 'Logs a welcome message and exports a simple main() function.'
                        },
                        {
                          id: 'http' as const,
                          title: 'HTTP server',
                          description: 'Sets up a Node http server with JSON response and graceful shutdown.'
                        }
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setSampleCodeStyle(preset.id)}
                          className={`rounded-2xl border px-4 py-3 text-left transition ${
                            sampleCodeStyle === preset.id
                              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/70 dark:bg-emerald-500/10 dark:text-emerald-100'
                              : 'border-slate-300 bg-white hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200'
                          }`}
                        >
                          <p className="text-sm font-semibold">{preset.title}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{preset.description}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeReadme}
                      onChange={(e) => setIncludeReadme(e.target.checked)}
                      className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300 dark:border-slate-600"
                    />
                    <span>
                      Generate README.md
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        Includes scripts table, install instructions, and any notes you add below.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={initializeGit}
                      onChange={(e) => setInitializeGit(e.target.checked)}
                      className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300 dark:border-slate-600"
                    />
                    <span>
                      Initialize git repository
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        Runs <code className="font-mono">git init</code> and drops a sensible .gitignore.
                      </span>
                    </span>
                  </label>
                </div>

                {includeReadme && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      README notes (optional)
                    </label>
                    <textarea
                      value={readmeNotes}
                      onChange={(e) => setReadmeNotes(e.target.value)}
                      rows={4}
                      placeholder="Call out environment expectations, scripts to run, or follow-up tasks…"
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                    />
                  </div>
                )}

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tip: Give yourself a strong launch. These extras save you the boilerplate every time you spin up a new idea.
                </p>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/40">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">Project overview</h3>
                  <dl className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between gap-4">
                      <dt className="font-medium text-slate-500 dark:text-slate-400">Name</dt>
                      <dd className="text-right text-slate-900 dark:text-slate-100">{projectName || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="font-medium text-slate-500 dark:text-slate-400">Directory</dt>
                      <dd className="flex-1 text-right text-slate-900 dark:text-slate-100">{directory || '—'}</dd>
                    </div>
                    {description && (
                      <div className="flex justify-between gap-4">
                        <dt className="font-medium text-slate-500 dark:text-slate-400">Description</dt>
                        <dd className="flex-1 text-right text-slate-900 dark:text-slate-100">{description}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/40">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">Stack & dependencies</h3>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Template: {selectedTemplate ?? 'Custom'}
                  </p>
                  {packages.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No runtime packages selected</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {packages.map((pkg) => (
                        <span
                          key={pkg}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                        >
                          {pkg}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Dev dependencies</p>
                    {devPackages.length === 0 ? (
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">None selected</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {devPackages.map((pkg) => (
                          <span
                            key={pkg}
                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                          >
                            {pkg}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-500 dark:text-slate-400">Package manager</span>
                      <span className="text-slate-900 dark:text-slate-100">{packageManager}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-500 dark:text-slate-400">Run install</span>
                      <span className="text-slate-900 dark:text-slate-100">{installDependencies ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-500 dark:text-slate-400">Styling preset</span>
                      <span className="text-slate-900 dark:text-slate-100">
                        {stylingPreset === 'tailwind-v4'
                          ? 'Tailwind CSS 4'
                          : stylingPreset === 'tailwind-v3'
                          ? 'Tailwind CSS 3.4'
                          : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-500 dark:text-slate-400">Icon packs</span>
                      <span className="text-slate-900 dark:text-slate-100">
                        {selectedIconPacks.length === 0
                          ? 'None'
                          : selectedIconPacks
                              .map((id) => ICON_PACK_OPTIONS.find((option) => option.id === id)?.title ?? id)
                              .join(', ')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/40">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">Scripts & extras</h3>
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Scripts</p>
                      {Object.entries(summarizedScripts).length === 0 ? (
                        <p className="mt-1">Only the default test script will be added.</p>
                      ) : (
                        <ul className="mt-1 space-y-1 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                          {Object.entries(summarizedScripts).map(([key, command]) => (
                            <li key={key} className="flex items-center justify-between gap-3">
                              <span className="font-mono text-xs text-slate-500 dark:text-slate-300">{key}</span>
                              <span className="text-[13px] text-slate-900 dark:text-slate-100">{command}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span>Language</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{language === 'typescript' ? 'TypeScript' : 'JavaScript'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sample code</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {includeSampleCode ? (sampleCodeStyle === 'console' ? 'CLI hello world' : 'HTTP server') : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>README</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{includeReadme ? 'Generate file' : 'Skip'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Git repository</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{initializeGit ? 'Initialize' : 'Leave uninitialized'}</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Need to tweak something? Use the Back button to revisit any step before scaffolding.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isCreating}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-700"
              >
                Cancel
              </button>
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  disabled={isCreating}
                  className="rounded-2xl border border-slate-200 bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                >
                  Back
                </button>
              )}
              {currentStep < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  disabled={isCreating || !canContinueFromStep(currentStep)}
                  className="ml-auto rounded-2xl border border-indigo-200 bg-indigo-600/90 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating || !canContinueFromStep(0)}
                  className="ml-auto rounded-2xl border border-indigo-200 bg-indigo-600/90 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
                >
                  {isCreating ? 'Creating...' : 'Create Project'}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

