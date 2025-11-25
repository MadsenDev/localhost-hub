import { useState } from 'react';

interface GitAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (credentials: { username: string; password: string }, remember: boolean) => void;
  hasStoredCredentials?: boolean;
}

export function GitAuthModal({ isOpen, onClose, onSubmit, hasStoredCredentials }: GitAuthModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!username.trim() || !password) {
      setError('Enter both username and token.');
      return;
    }
    onSubmit({ username: username.trim(), password }, remember);
    setUsername('');
    setPassword('');
    setRemember(true);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Git credentials</h2>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Close
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Provide HTTPS credentials (GitHub username + PAT with `repo` access). {hasStoredCredentials ? 'You already have saved credentials for this project; submitting new ones will replace them.' : ''}
        </p>
        <div className="space-y-3">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Username</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
              placeholder="your username"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Password / token</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
              placeholder="password or PAT"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Remember for this project
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-lg border border-indigo-200 bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white dark:border-indigo-500/40"
          >
            Save & Push
          </button>
        </div>
      </div>
    </div>
  );
}

export default GitAuthModal;

