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
