import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

interface GitInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (command: string, label: string) => Promise<void>;
  onCheckAgain?: () => Promise<void>;
}

export function GitInstallModal({ isOpen, onClose, onRunCommand, onCheckAgain }: GitInstallModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<'winget' | 'choco' | 'scoop' | 'download'>('winget');
  const [isChecking, setIsChecking] = useState(false);

  if (!isOpen) return null;

  const installCommands = {
    winget: 'winget install --id Git.Git -e --source winget',
    choco: 'choco install git -y',
    scoop: 'scoop install git',
    download: 'start https://git-scm.com/download/win'
  };

  const installLabels = {
    winget: 'Install Git with winget',
    choco: 'Install Git with Chocolatey',
    scoop: 'Install Git with Scoop',
    download: 'Open Git download page'
  };

  const handleInstall = async () => {
    if (selectedMethod === 'download') {
      // Open download page in browser
      window.open('https://git-scm.com/download/win', '_blank');
      onClose();
      return;
    }

    try {
      await onRunCommand(installCommands[selectedMethod], installLabels[selectedMethod]);
      // Don't close immediately - let user check if it worked
    } catch (error) {
      console.error('Failed to run install command:', error);
    }
  };

  const handleCheckAgain = async () => {
    if (!onCheckAgain) return;
    setIsChecking(true);
    try {
      await onCheckAgain();
    } finally {
      setIsChecking(false);
    }
  };

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
            <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white">Git is not installed</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Git is required to use the Git features in this app. Choose an installation method below:
                </p>
              </div>

              <div className="mb-6 space-y-3">
                <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3 cursor-pointer hover:bg-slate-900 transition-colors">
                  <input
                    type="radio"
                    name="installMethod"
                    value="winget"
                    checked={selectedMethod === 'winget'}
                    onChange={() => setSelectedMethod('winget')}
                    className="text-indigo-500 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-white">Windows Package Manager (winget)</div>
                    <div className="text-xs text-slate-400 mt-1">Recommended for Windows 10/11</div>
                    <div className="text-xs font-mono text-slate-500 mt-1">{installCommands.winget}</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3 cursor-pointer hover:bg-slate-900 transition-colors">
                  <input
                    type="radio"
                    name="installMethod"
                    value="choco"
                    checked={selectedMethod === 'choco'}
                    onChange={() => setSelectedMethod('choco')}
                    className="text-indigo-500 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-white">Chocolatey</div>
                    <div className="text-xs text-slate-400 mt-1">If you have Chocolatey installed</div>
                    <div className="text-xs font-mono text-slate-500 mt-1">{installCommands.choco}</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3 cursor-pointer hover:bg-slate-900 transition-colors">
                  <input
                    type="radio"
                    name="installMethod"
                    value="scoop"
                    checked={selectedMethod === 'scoop'}
                    onChange={() => setSelectedMethod('scoop')}
                    className="text-indigo-500 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-white">Scoop</div>
                    <div className="text-xs text-slate-400 mt-1">If you have Scoop installed</div>
                    <div className="text-xs font-mono text-slate-500 mt-1">{installCommands.scoop}</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3 cursor-pointer hover:bg-slate-900 transition-colors">
                  <input
                    type="radio"
                    name="installMethod"
                    value="download"
                    checked={selectedMethod === 'download'}
                    onChange={() => setSelectedMethod('download')}
                    className="text-indigo-500 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-white">Manual Download</div>
                    <div className="text-xs text-slate-400 mt-1">Download and install Git manually</div>
                    <div className="text-xs text-slate-500 mt-1">Opens git-scm.com in your browser</div>
                  </div>
                </label>
              </div>

              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-300">
                  <strong>Note:</strong> After installing Git, you may need to restart this app for it to detect Git in your PATH. 
                  If the installation completed successfully, try clicking "Check Again" below.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {onCheckAgain && (
                    <button
                      onClick={handleCheckAgain}
                      disabled={isChecking}
                      className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
                    >
                      {isChecking ? 'Checking...' : 'Check Again'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInstall}
                    className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-500/30"
                  >
                    {selectedMethod === 'download' ? 'Open Download Page' : 'Run Install Command'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default GitInstallModal;

