interface OutdatedPackage {
  package: string;
  current: string;
  wanted: string;
  latest: string;
  location: string;
  dependedBy: string;
}

interface OutdatedPackagesTableProps {
  packages: OutdatedPackage[];
  onClose: () => void;
}

export function OutdatedPackagesTable({ packages, onClose }: OutdatedPackagesTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Outdated Packages ({packages.length})
          </h4>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-4 h-4 text-slate-600 dark:text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Package</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Current</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Wanted</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Latest</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">Location</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg, index) => {
              const isMajorUpdate = pkg.current.split('.')[0] !== pkg.latest.split('.')[0];
              const isMinorUpdate = !isMajorUpdate && pkg.current.split('.')[1] !== pkg.latest.split('.')[1];
              
              return (
                <tr
                  key={`${pkg.package}-${index}`}
                  className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {pkg.package}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{pkg.current}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono ${
                      pkg.current !== pkg.wanted
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {pkg.wanted}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono ${
                      isMajorUpdate
                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : isMinorUpdate
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {pkg.latest}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-500 font-mono text-[10px]">
                    {pkg.location}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

