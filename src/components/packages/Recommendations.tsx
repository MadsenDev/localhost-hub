import { motion, AnimatePresence } from 'framer-motion';

interface RecommendationsProps {
  recommendations: string[];
  projectPath: string;
  electronAPI?: Window['electronAPI'];
  isExpanded: boolean;
}

export function Recommendations({ recommendations, projectPath, electronAPI, isExpanded }: RecommendationsProps) {
  if (recommendations.length === 0) return null;

  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/5">
            <h5 className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 mb-2">Recommendations:</h5>
            <ul className="space-y-2">
              {recommendations.map((rec, recIndex) => {
                // Extract command from backticks if present
                const commandMatch = rec.match(/`([^`]+)`/);
                const command = commandMatch ? commandMatch[1] : null;
                const recText = rec.replace(/`([^`]+)`/g, (match, cmd) => cmd);
                
                return (
                  <li key={recIndex} className="flex items-start justify-between gap-2">
                    <span className="text-xs text-indigo-800 dark:text-indigo-300 flex-1">
                      {recText}
                    </span>
                    {command && electronAPI?.scripts?.runCustom && (
                      <button
                        onClick={async () => {
                          try {
                            await electronAPI.scripts.runCustom({
                              projectPath,
                              command: command,
                              label: 'Audit Fix'
                            });
                          } catch (error) {
                            console.error('Error running fix command:', error);
                          }
                        }}
                        className="rounded-lg border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-200 whitespace-nowrap dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
                      >
                        Run
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

