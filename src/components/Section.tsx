import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

export function Section({ title, children, action }: SectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        {action ?? null}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-inner">{children}</div>
    </section>
  );
}

export default Section;
