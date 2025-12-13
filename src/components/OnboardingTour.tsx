import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiXMark, HiChevronLeft, HiChevronRight } from 'react-icons/hi2';

export type TourStep = {
  id: string;
  title: string;
  body: string;
  target: string; // CSS selector for [data-tour="..."]
  onEnter?: () => void; // e.g. switch tabs
};

interface OnboardingTourProps {
  steps: TourStep[];
  currentStep: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

export function OnboardingTour({
  steps,
  currentStep,
  onNext,
  onBack,
  onSkip,
  onFinish
}: OnboardingTourProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [bubblePosition, setBubblePosition] = useState<{ top: number; left: number; placement: 'right' | 'left' | 'bottom' } | null>(null);
  const step = steps[currentStep];
  const highlightRef = useRef<HTMLDivElement>(null);

  // Update position when step changes or window resizes
  useEffect(() => {
    const updatePosition = () => {
      if (!step) return;

      const element = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement;
      if (!element) {
        // Element not found, try to navigate to it via onEnter
        if (step.onEnter) {
          step.onEnter();
          // Retry after a short delay
          setTimeout(updatePosition, 100);
        }
        return;
      }

      const rect = element.getBoundingClientRect();
      setTargetRect(rect);

      // Scroll element into view if needed
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

      // Calculate bubble position
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const bubbleWidth = 320;
      const bubbleHeight = 180;
      const padding = 16;

      let placement: 'right' | 'left' | 'bottom' = 'right';
      let top = rect.top + rect.height / 2 - bubbleHeight / 2;
      let left = rect.right + padding;

      // Try right side first
      if (left + bubbleWidth > windowWidth - padding) {
        // Try left side
        left = rect.left - bubbleWidth - padding;
        if (left < padding) {
          // Place below
          placement = 'bottom';
          top = rect.bottom + padding;
          left = rect.left + rect.width / 2 - bubbleWidth / 2;
          // Clamp to viewport
          if (left < padding) left = padding;
          if (left + bubbleWidth > windowWidth - padding) left = windowWidth - bubbleWidth - padding;
        } else {
          placement = 'left';
        }
      }

      // Clamp vertical position
      if (top < padding) top = padding;
      if (top + bubbleHeight > windowHeight - padding) {
        top = windowHeight - bubbleHeight - padding;
      }

      setBubblePosition({ top, left, placement });
    };

    updatePosition();

    // Re-run onEnter if provided
    if (step?.onEnter) {
      step.onEnter();
    }

    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(updatePosition, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      clearTimeout(timeout);
    };
  }, [step, currentStep]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onSkip();
      } else if (event.key === 'ArrowRight' && currentStep < steps.length - 1) {
        onNext();
      } else if (event.key === 'ArrowLeft' && currentStep > 0) {
        onBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, steps.length, onNext, onBack, onSkip]);

  if (!step || !bubblePosition) {
    return null;
  }

  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <>
      {/* Scrim overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9998] bg-black/50"
        onClick={(e) => {
          // Only allow clicking on Skip/Next buttons, not the scrim
          e.stopPropagation();
        }}
      />

      {/* Highlight ring */}
      {targetRect && (
        <motion.div
          ref={highlightRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: '12px',
            border: '3px solid rgb(99, 102, 241)',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 20px rgba(99, 102, 241, 0.5)'
          }}
        />
      )}

      {/* Callout bubble */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="fixed z-[10000] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 w-80"
        style={{
          top: bubblePosition.top,
          left: bubblePosition.left
        }}
      >
        {/* Arrow */}
        {bubblePosition.placement === 'right' && targetRect && (
          <div
            className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-0 h-0 border-t-[12px] border-t-transparent border-r-[12px] border-r-white dark:border-r-slate-900 border-b-[12px] border-b-transparent"
            style={{
              top: `${Math.min(Math.max(bubblePosition.top - targetRect.top + bubblePosition.top / 2, 20), 160)}px`
            }}
          />
        )}
        {bubblePosition.placement === 'left' && targetRect && (
          <div
            className="absolute right-0 top-1/2 translate-x-full -translate-y-1/2 w-0 h-0 border-t-[12px] border-t-transparent border-l-[12px] border-l-white dark:border-l-slate-900 border-b-[12px] border-b-transparent"
            style={{
              top: `${Math.min(Math.max(bubblePosition.top - targetRect.top + bubblePosition.top / 2, 20), 160)}px`
            }}
          />
        )}
        {bubblePosition.placement === 'bottom' && targetRect && (
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-0 h-0 border-l-[12px] border-l-transparent border-b-[12px] border-b-white dark:border-b-slate-900 border-r-[12px] border-r-transparent"
            style={{
              left: `${Math.min(Math.max(bubblePosition.left - targetRect.left + bubblePosition.left / 2, 20), 280)}px`
            }}
          />
        )}

        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{step.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{step.body}</p>
          </div>
          <button
            onClick={onSkip}
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition"
            aria-label="Skip tour"
          >
            <HiXMark className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 mt-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {currentStep + 1} of {steps.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              disabled={isFirstStep}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <HiChevronLeft className="h-4 w-4 inline mr-1" />
              Back
            </button>
            {isLastStep ? (
              <button
                onClick={onFinish}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-lg transition"
              >
                Finish
              </button>
            ) : (
              <button
                onClick={onNext}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-lg transition"
              >
                Next
                <HiChevronRight className="h-4 w-4 inline ml-1" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

