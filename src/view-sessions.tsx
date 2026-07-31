import React from 'react';
import { Ic } from './icons';
import { SectionHeader } from './shared';
import { tauriApi, type RunRecord } from './tauri-api';
import {
  activeAt,
  density,
  densityIsFlat,
  deriveSessions,
  eventsBefore,
  spanTone,
  type DerivedSession,
  type SessionEventKind,
} from './sessions';
import { formatDuration } from './utils';

interface SessionsViewProps {
  onOpenLogs: () => void;
}

const EVENT_GLYPH: Record<SessionEventKind, string> = {
  started: '◉',
  exited: '▲',
  failed: '✕',
  stopped: '■',
  interrupted: '!',
};

const EVENT_LABEL: Record<SessionEventKind, string> = {
  started: 'started',
  exited: 'exited',
  failed: 'failed',
  stopped: 'stopped',
  interrupted: 'interrupted',
};

function formatWhen(ms: number): string {
  const elapsed = Date.now() - ms;
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Sessions, reconstructed from recorded runs.
 *
 * Everything on screen comes from `history/runs.json`: the spans are when services
 * actually ran, the markers are how those runs actually ended, and the counts are
 * of real records. Nothing here is derived from the service name or invented to
 * fill the layout, which is what the previous version of this view did — and it
 * could not even be reached, because the array it read from was always empty.
 */
export function SessionsView({ onOpenLogs }: SessionsViewProps) {
  const [runs, setRuns] = React.useState<RunRecord[] | null>(null);
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(null);
  const [scrub, setScrub] = React.useState(1);
  const [hover, setHover] = React.useState<{ x: number; active: number } | null>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  const load = React.useCallback(async () => {
    setError('');
    try {
      setRuns(await tauriApi.listRunHistory());
    } catch (reason) {
      setRuns([]);
      setError(String(reason).replace(/^Error:\s*/, ''));
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const up = () => { draggingRef.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // `Date.now()` is captured once per render rather than read inside the
  // derivation, so every position on screen is measured against one instant.
  const sessions = React.useMemo(
    () => (runs ? deriveSessions(runs, Date.now()) : []),
    [runs],
  );

  const session: DerivedSession | undefined =
    sessions.find((candidate) => candidate.id === selected) ?? sessions[0];

  if (runs === null) {
    return (
      <div className="view"><div className="view-inner">
        <div className="empty">
          <Ic.Clock size={36} />
          <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)' }}>Reading run history…</div>
        </div>
      </div></div>
    );
  }

  if (!session) {
    return (
      <div className="view"><div className="view-inner">
        <div className="empty">
          <Ic.Clock size={36} />
          <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)' }}>No sessions yet</div>
          <div style={{ color: 'var(--fg-4)', marginTop: 6, fontSize: 12, maxWidth: 460 }}>
            {error
              ? `Run history could not be read: ${error}`
              : 'Start a workspace and its runs will be grouped here into a slice of time you can scrub through.'}
          </div>
        </div>
      </div></div>
    );
  }

  return <SessionsTimeline
    sessions={sessions}
    session={session}
    onSelect={(id) => { setSelected(id); setScrub(1); }}
    scrub={scrub}
    setScrub={setScrub}
    hover={hover}
    setHover={setHover}
    trackRef={trackRef}
    draggingRef={draggingRef}
    onOpenLogs={onOpenLogs}
    onRefresh={() => void load()}
  />;
}

interface TimelineProps {
  sessions: DerivedSession[];
  session: DerivedSession;
  onSelect: (id: string) => void;
  scrub: number;
  setScrub: (value: number) => void;
  hover: { x: number; active: number } | null;
  setHover: (value: { x: number; active: number } | null) => void;
  trackRef: React.RefObject<HTMLDivElement | null>;
  draggingRef: React.MutableRefObject<boolean>;
  onOpenLogs: () => void;
  onRefresh: () => void;
}

function SessionsTimeline({
  sessions, session, onSelect, scrub, setScrub, hover, setHover,
  trackRef, draggingRef, onOpenLogs, onRefresh,
}: TimelineProps) {
  const durationSec = session.durationMs / 1000;
  const elapsedSec = durationSec * scrub;
  const activeNow = activeAt(session, scrub);
  const failuresBefore = eventsBefore(session, scrub, ['failed', 'interrupted']).length;
  const strip = React.useMemo(() => density(session), [session]);
  // Three services running start to finish gives every bucket the same value, and
  // a chart with no variation is decoration. Drawn only when it says something.
  const showDensity = !densityIsFlat(strip);

  function relX(event: React.MouseEvent): number {
    if (!trackRef.current) return 0;
    const box = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
  }

  return (
    <div className="view"><div className="view-inner">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Memory</div>
          <h1 className="h1">Sessions</h1>
          <div style={{ color: 'var(--fg-3)', fontSize: 12.5, marginTop: 4, maxWidth: 640 }}>
            Recorded runs, grouped into bursts of work. Scrub to see what was running at
            a moment, and where it stopped.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sm ghost" onClick={onRefresh}><Ic.Reload size={11} /> Refresh</button>
          <button className="btn sm" onClick={onOpenLogs}><Ic.Logs size={11} /> Open logs</button>
        </div>
      </div>

      <div className="timeline">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="h2" style={{ fontSize: 17 }}>
                {new Date(session.startedAtMs).toLocaleString(undefined, {
                  weekday: 'long', hour: '2-digit', minute: '2-digit',
                })}
              </h2>
              {session.live ? (
                <span className="tag ok"><span className="status-dot running" /> live</span>
              ) : null}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>
              {session.tracks.length} {session.tracks.length === 1 ? 'service' : 'services'}
              {' · '}{session.runs.length} {session.runs.length === 1 ? 'run' : 'runs'}
              {' · started '}{formatWhen(session.startedAtMs)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--warm)' }}>
              {formatDuration(elapsedSec)}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              of {formatDuration(durationSec)}
            </div>
          </div>
        </div>

        <div className="tl-event-rail">
          {showDensity ? (
          <div className="tl-density">
            {strip.map((value, index) => (
              <span
                key={index}
                style={{
                  height: `${8 + value * 16}px`,
                  background: `oklch(0.66 0.115 252 / ${0.12 + value * 0.65})`,
                }}
              />
            ))}
          </div>
          ) : null}
          <div className="tl-events">
            {session.events.map((event, index) => (
              <button
                type="button"
                key={`${event.serviceId}-${event.atMs}-${event.kind}-${index}`}
                className={`tl-event ev-${event.kind}${Math.abs(event.at - scrub) < 0.012 ? ' is-near' : ''}`}
                style={{ left: `${event.at * 100}%` }}
                onClick={() => setScrub(event.at)}
                title={`${event.serviceId} ${EVENT_LABEL[event.kind]}`}
              >
                <span className="ev-stem" style={{ height: `${event.kind === 'started' ? 16 : 26}px` }} />
                <span className="ev-glyph">{EVENT_GLYPH[event.kind]}</span>
                <span className="ev-tip">
                  <span className="ev-tip-kind">{EVENT_LABEL[event.kind]}</span>
                  <span className="ev-tip-label">{event.serviceId}</span>
                  <span className="ev-tip-detail">{event.detail}</span>
                  <span className="ev-tip-time">
                    +{formatDuration((event.atMs - session.startedAtMs) / 1000)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div
          ref={trackRef}
          className="tl-track"
          onMouseDown={(event) => { draggingRef.current = true; setScrub(relX(event)); }}
          onMouseMove={(event) => {
            const at = relX(event);
            if (draggingRef.current) setScrub(at);
            setHover({ x: at, active: activeAt(session, at).length });
          }}
          onMouseLeave={() => setHover(null)}
        >
          <div className="tl-track-fill" style={{ width: `${scrub * 100}%` }} />
          <div className="tl-playhead" style={{ left: `calc(${scrub * 100}% - 1px)` }}>
            <span className="tl-playhead-arm" />
            <span className="tl-playhead-bubble">{formatDuration(elapsedSec)}</span>
          </div>
          {hover && hover.x !== scrub ? (
            <div className="tl-hover-line" style={{ left: `${hover.x * 100}%` }}>
              <span className="tl-hover-bubble">
                +{formatDuration(hover.x * durationSec)} · {hover.active} active
              </span>
            </div>
          ) : null}
        </div>
        <div className="timeline-axis">
          <span>00:00</span>
          <span>{formatDuration(durationSec * 0.25)}</span>
          <span>{formatDuration(durationSec * 0.5)}</span>
          <span>{formatDuration(durationSec * 0.75)}</span>
          <span>{formatDuration(durationSec)}</span>
        </div>

        <div style={{ marginTop: 26, display: 'grid', gap: 4 }}>
          {session.tracks.map((track) => {
            const on = activeNow.includes(track.serviceId);
            return (
              <div key={track.serviceId} className={`timeline-row tl-row${on ? ' is-on' : ''}`}>
                <div className="label">
                  <span className={`status-dot ${on ? 'running' : 'stopped'}`} style={{ marginRight: 8 }} />
                  <span className="mono" style={{ color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {track.serviceId}
                  </span>
                </div>
                <div className="track-cell">
                  {track.spans.map((span, index) => (
                    <div
                      key={index}
                      className={`timeline-bar ${spanTone(span.outcome, span.run.exit_code)}`}
                      style={{
                        left: `${span.from * 100}%`,
                        // A run shorter than the timeline's resolution would be
                        // invisible, so every span keeps a minimum width.
                        width: `${Math.max(0.4, (span.to - span.from) * 100)}%`,
                      }}
                      title={`${span.run.cmd} · ${span.outcome}`}
                    />
                  ))}
                  <div className="tl-row-playhead" style={{ left: `calc(${scrub * 100}% - 1px)` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="tl-stats">
          <TLStat label="At cursor" value={`+${formatDuration(elapsedSec)}`} sub="from session start" />
          <TLStat
            label="Active services"
            value={`${activeNow.length}/${session.tracks.length}`}
            sub="at this moment"
            tone={activeNow.length === session.tracks.length ? 'ok' : 'warn'}
          />
          <TLStat
            label="Failures before"
            value={String(failuresBefore)}
            sub={failuresBefore === 1 ? 'failed or interrupted run' : 'failed or interrupted runs'}
            tone={failuresBefore > 0 ? 'danger' : 'muted'}
          />
          <TLStat label="Runs" value={String(session.runs.length)} sub="recorded in this session" />
        </div>
      </div>

      <div style={{ height: 22 }} />

      <SectionHeader title="Session history" />
      <div className="panel" style={{ padding: 0 }}>
        {sessions.map((candidate) => {
          const failures = candidate.events.filter(
            (event) => event.kind === 'failed' || event.kind === 'interrupted',
          ).length;
          return (
            <div
              key={candidate.id}
              className={`session-row${candidate.id === session.id ? ' active' : ''}`}
              onClick={() => onSelect(candidate.id)}
            >
              <span
                style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: candidate.live ? 'var(--ok)' : failures > 0 ? 'var(--danger)' : 'var(--fg-4)',
                }}
              />
              <span className="when">{formatWhen(candidate.startedAtMs)}</span>
              <span style={{ minWidth: 0 }}>
                <span className="title">
                  {candidate.tracks.length} {candidate.tracks.length === 1 ? 'service' : 'services'}
                </span>
                <span className="meta" style={{ marginLeft: 8 }}>
                  {candidate.runs.length} {candidate.runs.length === 1 ? 'run' : 'runs'}
                  {failures > 0 ? ` · ${failures} failed` : ''}
                </span>
              </span>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                {candidate.live ? <span className="tag ok">live</span> : null}
                <span className="badge">{formatDuration(candidate.durationMs / 1000)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div></div>
  );
}

interface TLStatProps { label: string; value: string; sub: string; tone?: string; }

function TLStat({ label, value, sub, tone = 'muted' }: TLStatProps) {
  const colorMap: Record<string, string> = {
    ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', muted: 'var(--fg-1)',
  };
  return (
    <div className="tl-stat">
      <div className="l">{label}</div>
      <div className="v" style={{ color: colorMap[tone] }}>{value}</div>
      <div className="s">{sub}</div>
    </div>
  );
}
