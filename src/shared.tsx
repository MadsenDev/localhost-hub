import type { ServiceStatus } from './types';

interface StatusDotProps {
  s: ServiceStatus | string;
  style?: React.CSSProperties;
}

export function StatusDot({ s, style }: StatusDotProps) {
  return <span className={"status-dot " + s} style={style} />;
}

interface SparklineProps {
  points: number[];
  color?: string;
}

export function Sparkline({ points, color = "var(--blue)" }: SparklineProps) {
  const w = 100, h = 28;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = Math.max(1, max - min);
  const pts = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / span) * (h - 4) - 2;
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pts + ` ${w},${h} 0,${h}`} fill={color} opacity="0.08" />
    </svg>
  );
}

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
      <h2 className="h2">{title}</h2>
      {actionLabel ? (
        <button className="btn sm ghost" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

interface StatusBadgeProps {
  s: string;
}

export function StatusBadge({ s }: StatusBadgeProps) {
  const cls = s === "running" ? "ok" : s === "starting" || s === "restarting" ? "warn" : s === "failed" || s === "crashed" ? "danger" : "";
  return <span className={"tag " + cls}><StatusDot s={s as ServiceStatus} />{s}</span>;
}
