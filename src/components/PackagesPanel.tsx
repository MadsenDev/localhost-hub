import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProjectInfo } from '../types/global';
import { LoadingSkeleton } from './LoadingSkeleton';

interface PackagesPanelProps {
  project: ProjectInfo;
  electronAPI?: Window['electronAPI'];
  onInstallPackage: (packageName: string, version?: string, isDev?: boolean) => void;
}

type DependencyType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';

interface PackageInfo {
  name: string;
  expectedVersion: string;
  installedVersion?: string;
  isInstalled: boolean;
  type: DependencyType;
  isScoped?: boolean;
}

export function PackagesPanel({ project, electronAPI, onInstallPackage }: PackagesPanelProps) {
  const [dependencies, setDependencies] = useState<Record<string, Record<string, string>>>({
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {}
  });
  const [installed, setInstalled] = useState<Record<string, { version?: string; path: string }>>({});
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<DependencyType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [newPackageName, setNewPackageName] = useState('');
  const [newPackageVersion, setNewPackageVersion] = useState('');
  const [newPackageIsDev, setNewPackageIsDev] = useState(false);

  const inputClass =
    'rounded-lg border border-slate-300 bg-white/95 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:ring-0';
  const chipButtonBase =
    'rounded-lg border px-3 py-1 text-xs font-semibold transition';
  const surfaceCardClass =
    'rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40';
  const warningCardClass =
    'rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/5';

  const loadPackages = useCallback(async () => {
    if (!electronAPI?.packages) return;
    try {
      setLoading(true);
      const [deps, installedPackages] = await Promise.all([
        electronAPI.packages.getDependencies(project.path),
        electronAPI.packages.scanNodeModules(project.path)
      ]);
      setDependencies(deps);
      setInstalled(installedPackages);
    } catch (error) {
      console.error('Error loading packages:', error);
    } finally {
      setLoading(false);
    }
  }, [electronAPI, project.path]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // Combine all dependencies into a single list
  const allPackages = useMemo(() => {
    const packages: PackageInfo[] = [];
    
    (Object.keys(dependencies) as DependencyType[]).forEach((type) => {
      Object.entries(dependencies[type] || {}).forEach(([name, version]) => {
        const installedInfo = installed[name];
        packages.push({
          name,
          expectedVersion: version,
          installedVersion: installedInfo?.version,
          isInstalled: Boolean(installedInfo),
          type,
          isScoped: name.startsWith('@')
        });
      });
    });

    return packages.sort((a, b) => a.name.localeCompare(b.name));
  }, [dependencies, installed]);

  // Filter packages based on selected type and search query
  const filteredPackages = useMemo(() => {
    let filtered = allPackages;
    
    if (selectedType !== 'all') {
      filtered = filtered.filter((pkg) => pkg.type === selectedType);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((pkg) => pkg.name.toLowerCase().includes(query));
    }
    
    return filtered;
  }, [allPackages, selectedType, searchQuery]);

  const handleInstallNewPackage = useCallback(() => {
    if (!newPackageName.trim()) return;
    onInstallPackage(newPackageName.trim(), newPackageVersion.trim() || undefined, newPackageIsDev);
    setNewPackageName('');
    setNewPackageVersion('');
    setNewPackageIsDev(false);
    setShowInstallForm(false);
  }, [newPackageName, newPackageVersion, newPackageIsDev, onInstallPackage]);

  const typeLabels: Record<DependencyType | 'all', string> = {
    all: 'All',
    dependencies: 'Dependencies',
    devDependencies: 'Dev Dependencies',
    peerDependencies: 'Peer Dependencies',
    optionalDependencies: 'Optional Dependencies'
  };

  const typeColors: Record<DependencyType, string> = {
    dependencies: 'indigo',
    devDependencies: 'purple',
    peerDependencies: 'amber',
    optionalDependencies: 'slate'
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton lines={6} />
      </div>
    );
  }

  const totalExpected = allPackages.length;
  const totalInstalled = allPackages.filter((p) => p.isInstalled).length;
  const missingPackages = allPackages.filter((p) => !p.isInstalled);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Packages</h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {totalInstalled} of {totalExpected} installed
            {missingPackages.length > 0 && ` • ${missingPackages.length} missing`}
          </p>
        </div>
        <button
          onClick={() => setShowInstallForm(!showInstallForm)}
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
        >
          {showInstallForm ? 'Cancel' : '+ Install Package'}
        </button>
      </div>

      <AnimatePresence>
        {showInstallForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 space-y-3 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/5"
          >
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Package name (e.g., lodash)"
                value={newPackageName}
                onChange={(e) => setNewPackageName(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Version (optional, e.g., ^4.17.21)"
                value={newPackageVersion}
                onChange={(e) => setNewPackageVersion(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={newPackageIsDev}
                  onChange={(e) => setNewPackageIsDev(e.target.checked)}
                  className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/60 dark:text-indigo-400"
                />
                <span>Save as dev dependency</span>
              </label>
              <button
                onClick={handleInstallNewPackage}
                disabled={!newPackageName.trim()}
                className="ml-auto rounded-lg border border-indigo-200 bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40 dark:border-indigo-500/40 dark:bg-indigo-500/30 dark:text-indigo-100"
              >
                Install
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`${chipButtonBase} ${
              selectedType === type
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200'
                : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-indigo-400/40 dark:hover:text-indigo-200'
            }`}
          >
            {typeLabels[type]}
          </button>
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Search packages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`${inputClass} w-full`}
        />
      </div>

      {filteredPackages.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white/95 p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {searchQuery ? 'No packages found matching your search.' : 'No packages found in this category.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredPackages.map((pkg, index) => {
              const color = typeColors[pkg.type];
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
                        onClick={() => onInstallPackage(pkg.name, pkg.expectedVersion, pkg.type === 'devDependencies')}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 whitespace-nowrap dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
                      >
                        Install
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default PackagesPanel;

