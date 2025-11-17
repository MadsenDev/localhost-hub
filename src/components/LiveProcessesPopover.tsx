import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ActiveProcessInfo } from '../types/global';
import { formatDuration, formatTimestamp } from './ActiveProcessesPanel';

interface LiveProcessesPopoverProps {
  processes: ActiveProcessInfo[];
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
}

export function LiveProcessesPopover({ processes, isOpen, onClose, anchorRef }: LiveProcessesPopoverProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;

    const updatePosition = () => {
      const anchorRect = anchorRef.current?.getBoundingClientRect();
      if (anchorRect) {
        const popoverWidth = 400;
        const padding = 16;
        let left = anchorRect.left + padding;
        
        // Ensure popover doesn't overflow viewport on the right
        if (left + popoverWidth > window.innerWidth) {
          left = window.innerWidth - popoverWidth - padding;
        }
        
        // Ensure popover doesn't overflow viewport on the left
        if (left < padding) {
          left = padding;
        }

        setPosition({
          top: anchorRect.bottom + 8,
          left
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, anchorRef]);

  if (!isOpen) return null;

  const popoverContent = (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-[400px] rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          maxHeight: '400px'
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h3 className="text-sm font-semibold text-white">Live Processes</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-4" style={{ maxHeight: '350px' }}>
          {processes.length === 0 ? (
            <p className="text-sm text-slate-400">No scripts are currently running.</p>
          ) : (
            <div className="space-y-3">
              {processes.map((process) => (
                <div
                  key={process.id}
                  className={`rounded-xl border p-3 ${
                    process.isExternal
                      ? 'border-purple-500/30 bg-purple-500/5'
                      : 'border-indigo-500/30 bg-indigo-500/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                    <p className="text-sm font-semibold text-white">{process.script}</p>
                    {process.isExternal && (
                      <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                        External
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{formatTimestamp(process.startedAt)}</span>
                    <span className="ml-auto text-xs text-slate-300">{formatDuration(process.startedAt)}</span>
                  </div>
                  <p className="mt-2 truncate text-xs text-slate-400">{process.command}</p>
                  <p className="truncate text-xs text-slate-500">{process.projectPath}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(popoverContent, document.body);
}

