import { motion, AnimatePresence } from 'framer-motion';
import { useToastContext } from '../hooks/useToasts';

const variantTokens = {
  info: {
    accent: 'from-sky-500/80 to-sky-600/70',
    iconBg: 'bg-sky-100 dark:bg-sky-500/20',
    iconTone: 'text-sky-600 dark:text-sky-200',
    titleTone: 'text-slate-900 dark:text-slate-50',
    bodyTone: 'text-slate-600 dark:text-slate-300',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm.75 14.5h-1.5V10h1.5Zm0-7.5h-1.5V7h1.5Z" />
      </svg>
    )
  },
  success: {
    accent: 'from-emerald-500/80 to-emerald-600/70',
    iconBg: 'bg-emerald-100 dark:bg-emerald-500/20',
    iconTone: 'text-emerald-600 dark:text-emerald-200',
    titleTone: 'text-emerald-900 dark:text-emerald-100',
    bodyTone: 'text-emerald-700 dark:text-emerald-200',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M20.285 5.707 9 17l-5.285-5.293 1.414-1.414L9 14.172l9.871-9.879Z" />
      </svg>
    )
  },
  error: {
    accent: 'from-rose-500/80 to-rose-600/70',
    iconBg: 'bg-rose-100 dark:bg-rose-500/20',
    iconTone: 'text-rose-600 dark:text-rose-200',
    titleTone: 'text-rose-900 dark:text-rose-100',
    bodyTone: 'text-rose-700 dark:text-rose-200',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm2.121 12.95L12 12.828l-2.121 2.122-1.414-1.414L10.586 11l-2.121-2.121 1.414-1.414L12 9.586l2.121-2.121 1.414 1.414L13.414 11l2.121 2.121Z" />
      </svg>
    )
  },
  warning: {
    accent: 'from-amber-500/80 to-amber-600/70',
    iconBg: 'bg-amber-100 dark:bg-amber-500/20',
    iconTone: 'text-amber-600 dark:text-amber-200',
    titleTone: 'text-amber-900 dark:text-amber-100',
    bodyTone: 'text-amber-700 dark:text-amber-200',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M12 2 1 21h22Zm0 5.5 6.19 11H5.81ZM11 11h2v4h-2Zm0 5h2v2h-2Z" />
      </svg>
    )
  }
} as const;

export function ToastViewport() {
  const { toasts, removeToast } = useToastContext();

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-full max-w-sm flex-col gap-3 sm:top-6 sm:right-6">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const variant = toast.variant ?? 'info';
          const tokens = variantTokens[variant];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.9 }}
              transition={{ duration: 0.35, type: 'spring', stiffness: 320, damping: 25 }}
              className="pointer-events-auto overflow-hidden rounded-3xl shadow-2xl shadow-black/10 backdrop-blur-md"
            >
              <div className={`h-1 w-full bg-gradient-to-r ${tokens.accent}`} />
              <div className="flex flex-1 items-start gap-4 bg-white/95 px-4 py-4 text-slate-900 dark:bg-slate-900/80 dark:text-slate-50">
                <div className={`mt-1 flex h-9 w-9 items-center justify-center rounded-2xl ${tokens.iconBg} ${tokens.iconTone}`}>
                  {tokens.icon}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className={`text-sm font-semibold ${tokens.titleTone}`}>{toast.title}</p>
                  {toast.description && (
                    <p className={`text-sm leading-snug ${tokens.bodyTone}`}>{toast.description}</p>
                  )}
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-sm text-slate-400 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default ToastViewport;

