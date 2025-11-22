import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (projectData: {
    name: string;
    directory: string;
    description?: string;
    packages: string[];
    packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
    installDependencies: boolean;
  }) => Promise<void>;
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

export function CreateProjectModal({ isOpen, onClose, onCreateProject, electronAPI }: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState('');
  const [directory, setDirectory] = useState('');
  const [description, setDescription] = useState('');
  const [packages, setPackages] = useState<string[]>([]);
  const [packageInput, setPackageInput] = useState('');
  const [packageManager, setPackageManager] = useState<'npm' | 'yarn' | 'pnpm' | 'bun'>('npm');
  const [installDependencies, setInstallDependencies] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }
    if (!directory.trim()) {
      setError('Directory is required');
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      await onCreateProject({
        name: projectName.trim(),
        directory: directory.trim(),
        description: description.trim() || undefined,
        packages,
        packageManager,
        installDependencies
      });
      // Reset form
      setProjectName('');
      setDirectory('');
      setDescription('');
      setPackages([]);
      setPackageInput('');
      setSelectedTemplate(null);
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
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">New Project</p>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Create a new project</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Create a new project folder with a package.json file. You can add packages and run npm install automatically.
            </p>
          </div>

          <div className="space-y-4">
            {/* Project Name */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Project Name *
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="my-awesome-project"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                disabled={isCreating}
              />
            </div>

            {/* Directory */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Directory *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  placeholder="C:\Users\...\projects"
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

            {/* Description */}
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

            {/* Templates */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Template (optional)
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

            {/* Packages */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Packages
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
                  placeholder="react, express, typescript..."
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

            {/* Package Manager & Install Options */}
            <div className="grid grid-cols-2 gap-4">
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

            {error && <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || !projectName.trim() || !directory.trim()}
              className="rounded-2xl border border-indigo-200 bg-indigo-600/90 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-700"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

