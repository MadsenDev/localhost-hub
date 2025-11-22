import { motion } from 'framer-motion';

interface ProjectEmptyStateProps {
  scanDirectories: string[] | null;
  isScanning: boolean;
  onOpenSetup: () => void;
  onRescan: () => void;
  onCreateProject: () => void;
}

const cards = [
  {
    title: 'Scan Projects',
    description: 'Point Localhost Hub at folders where you keep your apps. We’ll automatically detect scripts, packages, and ports.',
    actionLabel: 'Choose directories',
    actionVariant: 'primary' as const
  },
  {
    title: 'Organize Workspaces',
    description: 'Bundle backend + frontend + tooling scripts into a single workspace for one-click orchestration.',
    actionLabel: 'Open workspaces',
    actionVariant: 'ghost' as const
  },
  {
    title: 'Customize Settings',
    description: 'Adjust auto-scan, package managers, ports and theming so Localhost Hub matches your flow.',
    actionLabel: 'Open settings',
    actionVariant: 'ghost' as const
  }
];

export function ProjectEmptyState({ scanDirectories, isScanning, onOpenSetup, onRescan, onCreateProject }: ProjectEmptyStateProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-950/50 dark:shadow-black/40">
      <div className="flex flex-col gap-10 lg:flex-row lg:items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Getting Started
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">Your local universe awaits</h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
            Localhost Hub discovers your projects, runs scripts, monitors ports, and keeps every workspace at your fingertips.
            Pick a starting point below—everything updates live as soon as you connect your directories.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onOpenSetup}
              className="inline-flex items-center justify-center rounded-2xl border border-indigo-500 bg-indigo-500/90 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-500"
            >
              {scanDirectories ? 'Edit scan directories' : 'Choose directories'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCreateProject}
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-500 bg-emerald-500/90 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-500"
            >
              + Create Project
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onRescan}
              disabled={isScanning || scanDirectories === null}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 shadow-lg shadow-slate-400/20 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 disabled:opacity-40"
            >
              {isScanning ? 'Scanning…' : 'Rescan projects'}
            </motion.button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4">
          {cards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index, duration: 0.35, type: 'spring' }}
              className="rounded-2xl border border-slate-200/80 bg-white/60 px-4 py-4 shadow-lg shadow-slate-200/40 dark:border-slate-800/60 dark:bg-slate-900/60 dark:shadow-black/30"
            >
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">{`0${index + 1}`}</p>
              <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{card.title}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{card.description}</p>
              <div className="mt-3">
                <button
                  className={`text-sm font-semibold ${
                    card.actionVariant === 'primary'
                      ? 'text-indigo-600 hover:text-indigo-500'
                      : 'text-slate-500 hover:text-indigo-500'
                  }`}
                  onClick={card.actionVariant === 'primary' ? onOpenSetup : undefined}
                >
                  {card.actionLabel} →
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProjectEmptyState;

