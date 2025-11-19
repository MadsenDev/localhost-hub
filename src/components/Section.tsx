import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Section({ title, children, action, className }: SectionProps) {
  return (
    <section className={`space-y-4 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {action ?? null}
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/40 p-4 shadow-sm dark:shadow-inner">
        {children}
      </div>
    </section>
  );
}

export default Section;
