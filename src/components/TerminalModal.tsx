import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  logOutput: string;
  scriptName: string;
  projectName: string;
  logContainerRef: RefObject<HTMLPreElement | null>;
  isAutoScrollEnabled: boolean;
  onToggleAutoScroll: () => void;
}

export function TerminalModal({
  isOpen,
  onClose,
  logOutput,
  scriptName,
  projectName,
  logContainerRef,
  isAutoScrollEnabled,
  onToggleAutoScroll
}: TerminalModalProps) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new content arrives
  useEffect(() => {
    if (isAutoScrollEnabled && logContainerRef.current && isOpen) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      });
    }
  }, [logOutput, isAutoScrollEnabled, isOpen, logContainerRef]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className="fixed z-50 flex flex-col rounded-lg border border-slate-700 bg-slate-800 shadow-2xl"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '800px',
        height: '500px',
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100vh - 2rem)'
      }}
    >
      {/* Header - draggable */}
      <div
        className="drag-handle flex items-center justify-between rounded-t-lg border-b border-slate-700 bg-slate-900 px-4 py-3 cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">{scriptName}</h3>
            <p className="text-xs text-slate-400">{projectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleAutoScroll}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
            title={isAutoScrollEnabled ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          >
            {isAutoScrollEnabled ? '⏸' : '▶'}
          </button>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
            title="Close (script will continue running)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden bg-slate-950 p-4">
        <pre
          ref={logContainerRef}
          className="h-full w-full overflow-y-auto overflow-x-auto font-mono text-xs text-emerald-300 whitespace-pre-wrap"
        >
          {logOutput || ' '}
        </pre>
      </div>
    </div>
  );
}

