import { motion, AnimatePresence } from 'framer-motion';
import { HiXMark } from 'react-icons/hi2';
import SettingsPanel from './SettingsPanel';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  electronAPI?: Window['electronAPI'];
}

export function SettingsModal({ isOpen, onClose, electronAPI }: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 dark:bg-black/60 light:bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200/20 dark:border-slate-800 light:border-slate-300 bg-white/95 dark:bg-slate-950/95 light:bg-white/95 backdrop-blur-xl shadow-2xl flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200/50 dark:border-slate-800/50 light:border-slate-200/50">
                <div className="space-y-0.5">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white light:text-slate-900">Settings</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 light:text-slate-600">Customize your Localhost Hub experience</p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-500 dark:text-slate-400 light:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/50 light:hover:bg-slate-100 hover:text-slate-900 dark:hover:text-white light:hover:text-slate-900 transition-colors"
                  title="Close"
                >
                  <HiXMark className="h-5 w-5" />
                </button>
              </div>
              
              {/* Content */}
              <div className="flex-1 min-h-0">
                <SettingsPanel electronAPI={electronAPI} />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default SettingsModal;
