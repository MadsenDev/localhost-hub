import { motion, AnimatePresence } from 'framer-motion';
import { HiSparkles } from 'react-icons/hi2';

interface OnboardingModalProps {
  isOpen: boolean;
  onStart: () => void;
  onSkip: () => void;
}

export function OnboardingModal({ isOpen, onStart, onSkip }: OnboardingModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50"
        onClick={onSkip}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-8 max-w-md w-full mx-4"
        >
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-500/20 mb-6 mx-auto">
            <HiSparkles className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-3">
            Welcome to Localhost Hub
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-center mb-8 leading-relaxed">
            Want a quick 60-second tour to learn the basics? We'll show you around with a safe demo project.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={onStart}
              className="w-full px-6 py-3 text-base font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-lg transition"
            >
              Start tour
            </button>
            <button
              onClick={onSkip}
              className="w-full px-6 py-3 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition"
            >
              Skip for now
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

