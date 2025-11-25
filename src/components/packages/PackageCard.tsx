import { motion } from 'framer-motion';

type DependencyType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';

interface PackageInfo {
  name: string;
  expectedVersion: string;
  installedVersion?: string;
  isInstalled: boolean;
  type: DependencyType;
}

interface PackageCardProps {
  pkg: PackageInfo;
  index: number;
  onInstall: (packageName: string, version?: string, isDev?: boolean) => void;
}

const typeLabels: Record<DependencyType | 'all', string> = {
  all: 'All',
  dependencies: 'Dependencies',
  devDependencies: 'Dev Dependencies',
  peerDependencies: 'Peer Dependencies',
  optionalDependencies: 'Optional Dependencies'
};

const surfaceCardClass =
  'rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40';
const warningCardClass =
  'rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/5';

export function PackageCard({ pkg, index, onInstall }: PackageCardProps) {
  const versionMatch = pkg.isInstalled && pkg.installedVersion && pkg.expectedVersion
    ? pkg.installedVersion === pkg.expectedVersion.replace(/^[\^~]/, '') || 
      pkg.installedVersion.startsWith(pkg.expectedVersion.replace(/^[\^~]/, '').split('.')[0])
    : false;

  return (
    <motion.div
      key={pkg.name}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className={pkg.isInstalled ? surfaceCardClass : warningCardClass}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-slate-900 font-mono dark:text-white">{pkg.name}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold border ${
                pkg.type === 'dependencies'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/40'
                  : pkg.type === 'devDependencies'
                  ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/40'
                  : pkg.type === 'peerDependencies'
                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                  : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600'
              }`}
            >
              {typeLabels[pkg.type]}
            </span>
            {!pkg.isInstalled && (
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
                Missing
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-600 dark:text-slate-400">
              Expected: <span className="font-mono text-slate-900 dark:text-slate-300">{pkg.expectedVersion}</span>
            </span>
            {pkg.isInstalled ? (
              <>
                <span className="text-slate-400 dark:text-slate-600">•</span>
                <span className={versionMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                  Installed: <span className="font-mono">{pkg.installedVersion}</span>
                  {!versionMatch && ' ⚠'}
                </span>
              </>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">Not installed</span>
            )}
          </div>
        </div>
        {!pkg.isInstalled && (
          <button
            onClick={() => onInstall(pkg.name, pkg.expectedVersion, pkg.type === 'devDependencies')}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 whitespace-nowrap dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
          >
            Install
          </button>
        )}
      </div>
    </motion.div>
  );
}

