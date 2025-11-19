import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;

  useEffect(() => {
    if (!electronAPI) return;

    const checkMaximized = async () => {
      try {
        const maximized = await electronAPI.window.isMaximized();
        setIsMaximized(maximized);
      } catch {
        // Ignore errors
      }
    };

    checkMaximized();

    // Check periodically for window state changes
    const interval = setInterval(checkMaximized, 500);
    return () => clearInterval(interval);
  }, [electronAPI]);

  const handleMinimize = async () => {
    if (electronAPI) {
      try {
        await electronAPI.window.minimize();
      } catch {
        // Ignore errors
      }
    }
  };

  const handleMaximize = async () => {
    if (electronAPI) {
      try {
        const result = await electronAPI.window.maximize();
        setIsMaximized(result.isMaximized);
      } catch {
        // Ignore errors
      }
    }
  };

  const handleClose = async () => {
    if (electronAPI) {
      try {
        await electronAPI.window.close();
      } catch {
        // Ignore errors
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-10 items-center justify-between border-b border-slate-900 bg-slate-950/95 backdrop-blur-sm px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <img 
          src="/logo_wordmark.svg" 
          alt="Localhost Hub" 
          className="h-5 w-auto opacity-80"
        />
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <motion.button
          whileHover={{ backgroundColor: 'rgba(51, 65, 85, 0.8)' }}
          whileTap={{ scale: 0.95 }}
          onClick={handleMinimize}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-200"
          title="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </motion.button>
        <motion.button
          whileHover={{ backgroundColor: 'rgba(51, 65, 85, 0.8)' }}
          whileTap={{ scale: 0.95 }}
          onClick={handleMaximize}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-200"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            {isMaximized ? (
              <>
                <path d="M3 3h6v6H3z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M2 2v2M2 2h2M10 2v2M10 2h-2M2 10v-2M2 10h2M10 10v-2M10 10h-2" stroke="currentColor" strokeWidth="1" />
              </>
            ) : (
              <path d="M2 2h8v8H2z" stroke="currentColor" strokeWidth="1.5" fill="none" />
            )}
          </svg>
        </motion.button>
        <motion.button
          whileHover={{ backgroundColor: 'rgba(239, 68, 68, 0.8)' }}
          whileTap={{ scale: 0.95 }}
          onClick={handleClose}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-400"
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </motion.button>
      </div>
    </motion.div>
  );
}

