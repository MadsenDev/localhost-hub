import React from 'react';
import type { Port, PortEdge, Workspace, Service } from './types';
import { Ic } from './icons';
import { StatusDot, StatusBadge } from './shared';

interface PortsViewProps {
  ports: Port[];
  edges: PortEdge[];
  workspaces: Workspace[];
  services: Service[];
  onOpenUrl: (url: string) => void;
}

interface PortNode extends Port {
  /** Position across the canvas as a fraction, 0 at the left edge and 1 at the right. */
  x: number;
  /** Position down the canvas as a percentage, matching the tier labels. */
  y: number;
}

/** Width of a `.ports-node`, which `min-width` fixes in the stylesheet. */
const NODE_WIDTH = 168;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Turns a 0..1 fraction into a CSS length for a box centred on that point,
 * keeping the box's edges inside the canvas however narrow it becomes.
 */
const bandPosition = (fraction: number) =>
  `calc(${NODE_WIDTH / 2}px + ${clamp01(fraction)} * (100% - ${NODE_WIDTH}px))`;

export function PortsView({ ports, edges, workspaces, services, onOpenUrl }: PortsViewProps) {
  const [hovered, setHovered] = React.useState<string | null>(null);

  const wsList = workspaces.map((w) => w.id);
  const groupOrder: Record<string, number> = { web: 0, edge: 0.4, api: 1.5, db: 2.8 };

  // A node is a fixed-width box centred on its coordinate, so a coordinate
  // expressed purely as a percentage clips as soon as the canvas gets narrow:
  // the first column used to sit at a hardcoded 18%, which is only 83px across a
  // 630px canvas — less than the node's own 84px half-width, so it hung off the
  // left edge with its label cut to "port". Columns are therefore fractions of a
  // band inset by half a node at each end, converted to a length below, which
  // keeps every node inside the canvas at any width.
  const wsFrac: Record<string, number> = {};
  if (wsList.length === 1) {
    // One workspace belongs in the middle, not pinned to the left. The old
    // spread formula divided by `max(1, n - 1)`, which silently produced the
    // left-most position instead of a centred one.
    wsFrac[wsList[0]] = 0.5;
  } else {
    wsList.forEach((id, i) => { wsFrac[id] = i / (wsList.length - 1); });
  }

  const nodes: PortNode[] = ports.map((p) => {
    const xJitter = ((p.port % 7) - 3) * 0.02;
    const yJitter = ((p.port % 5) - 2) * 1.8;
    const x = clamp01((wsFrac[p.ws] ?? 0.5) + xJitter);
    const yBase = 14 + (groupOrder[p.group] ?? 1.5) * 22;
    const y = yBase + yJitter;
    return { ...p, x, y };
  });

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const svcById = Object.fromEntries(services.map((s) => [s.id, s]));
  const wsById = Object.fromEntries(workspaces.map((w) => [w.id, w]));

  return (
    <div className="view"><div className="view-inner">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Topology</div>
          <h1 className="h1">Ports & URLs</h1>
          <div style={{ color: "var(--fg-3)", fontSize: 12.5, marginTop: 4 }}>Live map of every localhost port — clustered by workspace, connected by observed traffic.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost"><Ic.Filter size={11} /> Workspace</button>
          <button className="btn sm ghost"><Ic.Search size={11} /> Find port</button>
          <button className="btn sm primary"><Ic.Plus size={11} /> Watch port</button>
        </div>
      </div>

      <div className="ports-map">
        <div className="ports-canvas">
          {workspaces.map((w) => (
            <div key={w.id} style={{ position: "absolute", left: bandPosition(wsFrac[w.id] ?? 0.5), top: 14, transform: "translateX(-50%)", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.12em", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: w.swatch }} />
              {w.name}
            </div>
          ))}

          {[
            { label: "WEB / EDGE", y: 22 },
            { label: "SERVICES",   y: 47 },
            { label: "DATA",       y: 75 }
          ].map((t) => (
            <div key={t.label} style={{ position: "absolute", left: 8, top: t.y + "%", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--fg-4)", letterSpacing: "0.14em" }}>{t.label}</div>
          ))}

          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} preserveAspectRatio="none">
            <defs>
              <marker id="port-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--blue)" />
              </marker>
            </defs>
            {edges.map((e, i) => {
              const a = byId[e.from], b = byId[e.to];
              if (!a || !b) return null;
              const aSvc = svcById[a.svc], bSvc = svcById[b.svc];
              const active = aSvc?.status === "running" && bSvc?.status === "running";
              // These connectors do not currently draw: SVG path data takes user
              // units, not percentages, so every `d` below is rejected outright.
              // Making them render needs the canvas measured in pixels so the
              // curve endpoints can match the band the nodes are positioned in —
              // its own change, tracked with the topology layout work in the
              // README's status section. Percentages are kept here so the units
              // stay consistent with `y` rather than mixing in a 0..1 fraction.
              const x1 = a.x * 100 + "%", y1 = a.y + "%", x2 = b.x * 100 + "%", y2 = b.y + "%";
              const mx = ((a.x + b.x) / 2) * 100 + "%", my = ((a.y + b.y) / 2 + 4) + "%";
              const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
              return (
                <g key={i}>
                  <path d={d} className="ports-link-base" />
                  {active ? (
                    <>
                      <path d={d} className="ports-link-active" markerEnd="url(#port-arrow)" />
                      <path d={d} className="ports-link-flow" />
                    </>
                  ) : (
                    <path d={d} className="ports-link-idle" />
                  )}
                </g>
              );
            })}
          </svg>

          {nodes.map((n) => {
            const svc = svcById[n.svc];
            const w = wsById[n.ws];
            const url = n.url ?? `http://localhost:${n.port}`;
            const touching = edges.filter((e) => e.from === n.id || e.to === n.id);
            const peers = touching.map((e) => {
              const other = e.from === n.id ? byId[e.to] : byId[e.from];
              if (!other) return null;
              const peerSvc = svcById[other.svc];
              return { node: other, svc: peerSvc, active: peerSvc?.status === "running" };
            }).filter(Boolean) as { node: PortNode; svc: Service | undefined; active: boolean }[];

            return (
              <div
                key={n.id}
                className={"ports-node" + (n.status === "failed" ? " conflict" : "") + (hovered === n.id ? " is-hover" : "")}
                style={{ left: bandPosition(n.x), top: n.y + "%", borderLeft: `3px solid ${w?.swatch ?? 'var(--line-1)'}` }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onDoubleClick={() => onOpenUrl(url)}
              >
                <StatusDot s={n.status} />
                <div>
                  <div className="pn-name">{svc ? svc.name : "port"}</div>
                  <div className="pn-port">:{n.port} · {svc ? svc.framework : ""}</div>
                </div>

                {hovered === n.id ? (
                  <div className="pn-flyout">
                    <div className="pn-flyout-head">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: w?.swatch ?? 'var(--line-1)' }} />
                        <span style={{ fontWeight: 600, color: "var(--fg-1)", fontSize: 12.5 }}>{svc ? svc.name : "port"}</span>
                      </span>
                      <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>:{n.port}</span>
                    </div>
                    <div className="pn-flyout-meta">
                      <div className="row"><span className="k">Workspace</span><span className="v">{w?.name ?? '—'}</span></div>
                      <div className="row"><span className="k">Project</span><span className="v mono">{svc ? svc.project : "—"}</span></div>
                      <div className="row">
                        <span className="k">URL</span>
                        <a
                          className="v mono"
                          href={url}
                          onClick={(event) => {
                            event.preventDefault();
                            onOpenUrl(url);
                          }}
                          style={{ color: "var(--blue)" }}
                        >
                          {url}
                        </a>
                      </div>
                      <div className="row"><span className="k">Status</span><span className="v"><StatusBadge s={n.status} /></span></div>
                    </div>
                    {peers.length > 0 ? (
                      <div className="pn-flyout-peers">
                        <div className="eyebrow" style={{ marginBottom: 6 }}>Talks to</div>
                        {peers.map((p, i) => (
                          <div key={i} className="pn-peer">
                            <StatusDot s={p.active ? "running" : "stopped"} />
                            <span className="mono" style={{ color: "var(--fg-1)" }}>{p.svc ? p.svc.name : "—"}</span>
                            <span className="mono" style={{ color: "var(--fg-4)" }}>:{p.node.port}</span>
                            {p.active
                              ? <span className="mono" style={{ color: "var(--ok)", marginLeft: "auto", fontSize: 10.5 }}>{Math.floor(40 + Math.random() * 80)} req/s</span>
                              : <span className="mono" style={{ color: "var(--fg-4)", marginLeft: "auto", fontSize: 10.5 }}>idle</span>}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="ports-legend">
          <span className="li"><StatusDot s="running" /> running</span>
          <span className="li"><StatusDot s="starting" /> starting</span>
          <span className="li"><StatusDot s="failed" /> conflict</span>
          <span className="li"><StatusDot s="stopped" /> stopped</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--fg-4)" }}>Hover to inspect · double-click to open</span>
        </div>
      </div>

      <div style={{ height: 18 }} />
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title active"><span className="dot" /> Active ports</div>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-4)" }}>{nodes.filter((n) => n.status === "running").length} listening</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr auto", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--line-soft)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          <span>Port</span><span>Service</span><span>Workspace</span><span>URL</span><span style={{ textAlign: "right" }}>Status</span>
        </div>
        {nodes.map((n) => {
          const svc = svcById[n.svc];
          const w = wsById[n.ws];
          const url = n.url ?? `http://localhost:${n.port}`;
          return (
            <div key={n.id} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr auto", gap: 10, padding: "10px 14px", alignItems: "center", borderBottom: "1px solid var(--line-soft)", fontSize: 12 }}>
              <span className="mono" style={{ color: "var(--fg-1)" }}>:{n.port}</span>
              <span className="mono">{svc ? svc.name : "—"} <span style={{ color: "var(--fg-3)" }}>· {svc ? svc.framework : ""}</span></span>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: w?.swatch ?? 'var(--line-1)' }} />
                <span>{w?.name ?? '—'}</span>
              </span>
              <a
                href={url}
                onClick={(event) => {
                  event.preventDefault();
                  onOpenUrl(url);
                }}
                className="mono"
                style={{ color: "var(--blue)", textDecoration: "none" }}
              >
                {url}
              </a>
              <span style={{ textAlign: "right" }}><StatusBadge s={n.status} /></span>
            </div>
          );
        })}
      </div>
    </div></div>
  );
}
