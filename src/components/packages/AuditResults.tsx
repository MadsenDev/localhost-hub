import { motion, AnimatePresence } from 'framer-motion';
import type { ParsedAuditResult } from '../../utils/packageParsers';
import { Recommendations } from './Recommendations';

interface AuditResultsProps {
  auditResults: ParsedAuditResult;
  projectPath: string;
  electronAPI?: Window['electronAPI'];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
}

export function AuditResults({ auditResults, projectPath, electronAPI, isExpanded, onToggleExpand, onClose }: AuditResultsProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white/95 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-rose-50 dark:bg-rose-500/5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Security Audit Results
            </h4>
            <div className="flex items-center gap-3">
              {auditResults.summary.critical > 0 && (
                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                  {auditResults.summary.critical} Critical
                </span>
              )}
              {auditResults.summary.high > 0 && (
                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                  {auditResults.summary.high} High
                </span>
              )}
              {auditResults.summary.moderate > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                  {auditResults.summary.moderate} Moderate
                </span>
              )}
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                {auditResults.summary.total} total
              </span>
              <button
                onClick={onToggleExpand}
                className="ml-2 rounded-lg p-1 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                <svg
                  className={`w-4 h-4 text-slate-600 dark:text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="ml-1 rounded-lg p-1 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
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
        </div>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {auditResults.vulnerabilities.map((vuln, index) => {
                  const severityColor = 
                    vuln.severity === 'critical' ? 'rose' :
                    vuln.severity === 'high' ? 'orange' :
                    vuln.severity === 'moderate' ? 'amber' :
                    'slate';
                  
                  return (
                    <div key={`${vuln.package}-${index}`} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 text-sm">
                              {vuln.package}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold border ${
                              severityColor === 'rose' ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40' :
                              severityColor === 'orange' ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/40' :
                              severityColor === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40' :
                              'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600'
                            }`}>
                              {vuln.severity}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-500 font-mono">
                              {vuln.versionRange}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                            {vuln.description}
                          </p>
                          {vuln.advisoryUrl && (
                            <a
                              href={vuln.advisoryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 underline"
                            >
                              View Advisory →
                            </a>
                          )}
                        </div>
                      </div>
                      {vuln.dependencyTree.length > 0 && (
                        <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Dependency Path:</p>
                          <div className="space-y-1">
                            {vuln.dependencyTree.slice(0, 5).map((dep, depIndex) => (
                              <div key={depIndex} className="text-xs text-slate-600 dark:text-slate-400">
                                <span className="font-mono">{dep.package}</span>
                                <span className="text-slate-400 dark:text-slate-600 mx-1">•</span>
                                <span className="font-mono text-slate-500 dark:text-slate-500">{dep.versionRange}</span>
                              </div>
                            ))}
                            {vuln.dependencyTree.length > 5 && (
                              <p className="text-xs text-slate-500 dark:text-slate-500 italic">
                                +{vuln.dependencyTree.length - 5} more...
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-600 dark:text-slate-400 font-mono flex-1">
                            {vuln.fixAvailable}
                          </p>
                          {vuln.fixCommand && electronAPI?.scripts?.runCustom && (
                            <button
                              onClick={async () => {
                                try {
                                  await electronAPI.scripts.runCustom({
                                    projectPath,
                                    command: vuln.fixCommand!,
                                    label: `Fix ${vuln.package}`
                                  });
                                } catch (error) {
                                  console.error('Error running fix command:', error);
                                }
                              }}
                              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 whitespace-nowrap dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
                            >
                              Run Fix
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Recommendations
        recommendations={auditResults.recommendations}
        projectPath={projectPath}
        electronAPI={electronAPI}
        isExpanded={isExpanded}
      />
    </div>
  );
}

