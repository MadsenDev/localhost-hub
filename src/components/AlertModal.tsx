import { motion, AnimatePresence } from 'framer-motion';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: 'error' | 'warning' | 'info';
}

export function AlertModal({ isOpen, onClose, title, message, variant = 'error' }: AlertModalProps) {
  if (!isOpen) return null;

  const variantStyles = {
    error: {
      border: 'border-rose-500/40',
      bg: 'bg-rose-500/5',
      text: 'text-rose-200',
      button: 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/30'
    },
    warning: {
      border: 'border-amber-500/40',
      bg: 'bg-amber-500/5',
      text: 'text-amber-200',
      button: 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/30'
    },
    info: {
      border: 'border-indigo-500/40',
      bg: 'bg-indigo-500/5',
      text: 'text-indigo-200',
      button: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/30'
    }
  };

  const styles = variantStyles[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/90"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`w-full max-w-md rounded-2xl border ${styles.border} ${styles.bg} p-6 shadow-2xl`}>
              <div className="mb-4">
                <h3 className={`text-lg font-semibold ${styles.text}`}>{title}</h3>
                <p className={`mt-2 text-sm ${styles.text} opacity-90`}>{message}</p>
              </div>
              <div className="flex items-center justify-end">
                <button
                  onClick={onClose}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${styles.button}`}
                >
                  OK
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default AlertModal;

