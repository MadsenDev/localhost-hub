import type { CSSProperties } from 'react';
import './brand.css';

interface HubLogoProps {
  size?: number;
  accent?: string;
  body?: string;
}

export function HubLogo({ size = 22, accent = "var(--blue)", body = "var(--fg-1)" }: HubLogoProps) {
  const cx = 24, cy = 24;
  const spokes = [-90, -22, 46, 114];
  const tipDist = 16;
  const off = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [cx + Math.cos(rad) * tipDist, cy + Math.sin(rad) * tipDist];
  };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {spokes.map((deg, i) => {
        const [x, y] = off(deg);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={body} strokeWidth="3" strokeLinecap="round" />;
      })}
      <circle cx={cx} cy={cy} r="7.5" stroke={body} strokeWidth="3" fill="none" />
      {spokes.map((deg, i) => {
        const [x, y] = off(deg);
        return <circle key={"d" + i} cx={x} cy={y} r="3.6" fill={accent} />;
      })}
      <circle cx={cx + 17} cy={cy + 13} r="3.6" fill={accent} opacity="0.85" />
    </svg>
  );
}

interface AnimatedHubLockupProps {
  markSize?: number;
  accent?: string;
  body?: string;
}

const lockupSpokes = [0, 136.43, 223.57, 291.9];

export function AnimatedHubLockup({
  markSize = 72,
  accent = 'var(--blue)',
  body = 'var(--fg-1)',
}: AnimatedHubLockupProps) {
  const style = {
    '--hub-mark-size': `${markSize}px`,
    '--hub-accent': accent,
    '--hub-body': body,
  } as CSSProperties;

  const words = [
    { value: 'Localhost', className: 'hub-lockup-localhost', start: 1.4 },
    { value: 'Hub', className: 'hub-lockup-hub', start: 1.7 },
  ];

  return (
    <div className="hub-lockup" style={style} aria-label="Localhost Hub">
      <svg
        className="hub-lockup-mark"
        viewBox="-215 -215 430 430"
        role="img"
        aria-hidden="true"
      >
        {lockupSpokes.map((rotation, index) => (
          <g key={rotation} transform={`rotate(${rotation})`}>
            <rect
              className="hub-lockup-link"
              x="-13.13"
              y="-140.5"
              width="26.27"
              height="95"
              style={{ animationDelay: `${0.52 + index * 0.08}s` }}
            />
            <line
              className="hub-lockup-signal"
              x1="0"
              y1="-140.5"
              x2="0"
              y2="-45.5"
              pathLength="100"
              style={{ animationDelay: `${2.3 + index * 0.3}s` }}
            />
            <circle
              className="hub-lockup-node"
              cx="0"
              cy="-168"
              r="35.24"
              style={{ animationDelay: `${0.18 + index * 0.08}s` }}
            />
          </g>
        ))}
        <circle className="hub-lockup-ripple hub-lockup-ripple-accent" cx="0" cy="0" r="54.68" />
        <circle className="hub-lockup-ring" cx="0" cy="0" r="54.68" />
        <circle className="hub-lockup-ripple hub-lockup-ripple-body" cx="0" cy="0" r="54.68" />
        <circle className="hub-lockup-core" cx="0" cy="0" r="34.87" />
      </svg>

      <div className="hub-lockup-wordmark" aria-hidden="true">
        {words.map((word) => (
          <span key={word.value} className={word.className}>
            {[...word.value].map((letter, index) => (
              <span
                className="hub-lockup-letter"
                key={`${letter}-${index}`}
                style={{ animationDelay: `${word.start + index * 0.03}s` }}
              >
                {letter}
              </span>
            ))}
          </span>
        ))}
        <span className="hub-lockup-caret-track">
          <span className="hub-lockup-caret" />
        </span>
      </div>
    </div>
  );
}
