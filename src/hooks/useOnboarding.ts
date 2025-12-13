import { useState, useEffect, useCallback } from 'react';
import { useSettings } from './useSettings';
import type { TourStep } from '../components/OnboardingTour';
import { createDemoProject, DEMO_PROJECT_ID, getDemoLogs, isDemoProject } from '../utils/demoProject';
import type { ProjectInfo } from '../types/global';

export function useOnboarding(electronAPI?: Window['electronAPI']) {
  const settings = useSettings(electronAPI);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [demoProject, setDemoProject] = useState<ProjectInfo | null>(null);

  const onboardingCompleted = settings.getSettingAsBoolean('onboarding_v1_completed', false);

  // Check if we should show welcome modal on mount
  useEffect(() => {
    if (!settings.loading && !onboardingCompleted && !showWelcomeModal && !isOnboardingActive) {
      setShowWelcomeModal(true);
    }
  }, [settings.loading, onboardingCompleted, showWelcomeModal, isOnboardingActive]);

  const startOnboarding = useCallback(async () => {
    setShowWelcomeModal(false);
    setIsOnboardingActive(true);
    setCurrentStep(0);
    // Inject demo project
    const demo = createDemoProject();
    setDemoProject(demo);
  }, []);

  const skipOnboarding = useCallback(async () => {
    setShowWelcomeModal(false);
    setIsOnboardingActive(false);
    setDemoProject(null);
    // Mark as completed so we don't nag again
    await settings.setSetting('onboarding_v1_completed', true);
    await settings.setSetting('onboarding_v1_skipped', true);
    await settings.setSetting('onboarding_v1_seen_at', Date.now().toString());
  }, [settings]);

  const finishOnboarding = useCallback(async () => {
    setIsOnboardingActive(false);
    setDemoProject(null);
    setCurrentStep(0);
    await settings.setSetting('onboarding_v1_completed', true);
    await settings.setSetting('onboarding_v1_seen_at', Date.now().toString());
  }, [settings]);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, tourSteps.length - 1));
  }, []);

  const backStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const resetOnboarding = useCallback(async () => {
    await settings.setSetting('onboarding_v1_completed', false);
    await settings.setSetting('onboarding_v1_skipped', false);
    await settings.reload();
    // Optionally restart onboarding immediately
    setShowWelcomeModal(true);
  }, [settings]);

  // Listen for reset event from settings
  useEffect(() => {
    const handleReset = () => {
      setShowWelcomeModal(true);
    };
    window.addEventListener('onboarding:reset', handleReset);
    return () => window.removeEventListener('onboarding:reset', handleReset);
  }, []);

  return {
    showWelcomeModal,
    isOnboardingActive,
    currentStep,
    demoProject,
    startOnboarding,
    skipOnboarding,
    finishOnboarding,
    nextStep,
    backStep,
    resetOnboarding,
    isDemoProject,
    getDemoLogs
  };
}

// Define tour steps
export const tourSteps: TourStep[] = [
  {
    id: 'projects',
    title: 'Projects',
    body: 'Projects live here—select one to see scripts, logs, Git, and ports.',
    target: 'sidebar-projects'
  },
  {
    id: 'project-header',
    title: 'Project Status',
    body: 'This header shows what\'s running, Git status, and quick actions.',
    target: 'project-header'
  },
  {
    id: 'run-scripts',
    title: 'Run Scripts',
    body: 'Run scripts without opening a terminal—output is tracked per project.',
    target: 'script-run',
    onEnter: () => {
      // Ensure Scripts tab is active
      const scriptsTab = document.querySelector('[data-tour="tab-scripts"]') as HTMLElement;
      if (scriptsTab) {
        scriptsTab.click();
      }
    }
  },
  {
    id: 'logs',
    title: 'Logs',
    body: 'When something breaks, check Logs—everything is grouped by project.',
    target: 'tab-logs',
    onEnter: () => {
      const logsTab = document.querySelector('[data-tour="tab-logs"]') as HTMLElement;
      if (logsTab) {
        logsTab.click();
      }
    }
  },
  {
    id: 'ports',
    title: 'Ports',
    body: 'Ports are detected and surfaced so you can jump to the right URL fast.',
    target: 'tab-ports',
    onEnter: () => {
      const portsTab = document.querySelector('[data-tour="tab-ports"]') as HTMLElement;
      if (portsTab) {
        portsTab.click();
      }
    }
  },
  {
    id: 'open-browser',
    title: 'Open in Browser',
    body: 'Open the detected local URL with one click—no copy/paste.',
    target: 'open-in-browser',
    onEnter: () => {
      // Ensure we're on a tab that shows the open in browser button
      const portsTab = document.querySelector('[data-tour="tab-ports"]') as HTMLElement;
      if (portsTab) {
        portsTab.click();
      }
    }
  },
  {
    id: 'end',
    title: 'You\'re all set!',
    body: 'This was a demo project—nothing here was real. Ready to use your own projects?',
    target: 'project-header' // Use a stable target for the final step
  }
];

