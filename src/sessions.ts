/**
 * Sessions, derived from recorded runs.
 *
 * A session is a burst of development work: a cluster of runs close together in
 * time, with the gaps between clusters being the times nothing was running. Hub
 * does not record sessions as such, and it does not need to — every run already
 * carries when it started, when it ended and how it finished, which is enough to
 * reconstruct them.
 *
 * This is deliberately separate from the view so it can be tested without
 * rendering anything. Previously the Sessions view invented its own timeline —
 * hardcoded event markers, spans from a hash of the service name, and two
 * statistics ("14 builds, avg 482ms" and "218 requests") for telemetry Hub has
 * never collected. None of it could be reached, because the sessions array it read
 * from was always empty.
 */
import type { RunOutcome } from './generated/RunOutcome';
import type { RunRecord } from './generated/RunRecord';

/**
 * The quiet period that separates one session from the next.
 *
 * Half an hour: long enough that a restart, a build, or stepping away for coffee
 * stays inside one session, short enough that this morning and this afternoon are
 * two. Nothing depends on the exact figure — it only decides where the list is cut.
 */
export const SESSION_GAP_MS = 30 * 60 * 1000;

export interface SessionSpan {
  /** Position within the session, 0 at its start and 1 at its end. */
  from: number;
  to: number;
  outcome: RunOutcome;
  run: RunRecord;
}

export interface SessionTrack {
  serviceId: string;
  spans: SessionSpan[];
}

export type SessionEventKind = 'started' | 'exited' | 'failed' | 'stopped' | 'interrupted';

export interface SessionEvent {
  /** Position within the session, 0 to 1. */
  at: number;
  atMs: number;
  kind: SessionEventKind;
  serviceId: string;
  detail: string;
}

export interface DerivedSession {
  /** The first run's identifier: stable across refreshes, unlike an index. */
  id: string;
  startedAtMs: number;
  /** `null` while something in this session is still running. */
  endedAtMs: number | null;
  durationMs: number;
  /** True when at least one run has not finished. */
  live: boolean;
  runs: RunRecord[];
  tracks: SessionTrack[];
  events: SessionEvent[];
}

/** When a run finished, or `fallbackMs` if it has not. */
function runEnd(run: RunRecord, fallbackMs: number): number {
  return run.ended_at_ms ?? fallbackMs;
}

/**
 * How a finished run should read on the timeline.
 *
 * `exited` splits on the exit code, because "the process ended" and "the process
 * failed" are the same outcome in the record but not the same thing to look at.
 */
function endKind(run: RunRecord): SessionEventKind {
  switch (run.outcome) {
    case 'exited':
      return run.exit_code === 0 || run.exit_code === null ? 'exited' : 'failed';
    case 'failed':
      return 'failed';
    case 'stopped':
      return 'stopped';
    case 'interrupted':
      return 'interrupted';
    default:
      return 'exited';
  }
}

/** The bar colour for a span, using the timeline's existing variants. */
export function spanTone(outcome: RunOutcome, exitCode: number | null): string {
  if (outcome === 'running') return 'blue';
  if (outcome === 'failed') return 'danger';
  if (outcome === 'exited') return exitCode === 0 || exitCode === null ? 'ok' : 'danger';
  return 'warm';
}

function detailFor(run: RunRecord, kind: SessionEventKind): string {
  switch (kind) {
    case 'started':
      return run.cmd;
    case 'exited':
      return 'exited cleanly';
    case 'failed':
      return run.exit_code === null ? 'failed' : `exit code ${run.exit_code}`;
    case 'stopped':
      return 'stopped from Localhost Hub';
    case 'interrupted':
      return 'still running when Hub last closed';
  }
}

/**
 * Groups runs into sessions, newest first.
 *
 * `nowMs` is passed in rather than read from the clock so the result is
 * deterministic under test, and so a still-running session can be measured
 * against the same instant as everything else on screen.
 */
export function deriveSessions(runs: RunRecord[], nowMs: number): DerivedSession[] {
  const ordered = [...runs]
    .filter((run) => Number.isFinite(run.started_at_ms))
    .sort((left, right) => left.started_at_ms - right.started_at_ms);
  if (ordered.length === 0) return [];

  // Cluster on the gap between a run starting and the latest end so far. Using
  // the running maximum rather than the previous run's end matters for
  // overlapping runs: a long-lived server keeps the session open across the short
  // runs that happen beside it.
  const clusters: RunRecord[][] = [];
  let current: RunRecord[] = [];
  let clusterEnd = -Infinity;

  for (const run of ordered) {
    if (current.length > 0 && run.started_at_ms - clusterEnd > SESSION_GAP_MS) {
      clusters.push(current);
      current = [];
      clusterEnd = -Infinity;
    }
    current.push(run);
    clusterEnd = Math.max(clusterEnd, runEnd(run, nowMs));
  }
  if (current.length > 0) clusters.push(current);

  return clusters.map((cluster) => buildSession(cluster, nowMs)).reverse();
}

function buildSession(runs: RunRecord[], nowMs: number): DerivedSession {
  const startedAtMs = Math.min(...runs.map((run) => run.started_at_ms));
  const live = runs.some((run) => run.outcome === 'running');
  const lastEnd = Math.max(...runs.map((run) => runEnd(run, nowMs)));
  const endedAtMs = live ? null : lastEnd;

  // A session of one instantaneous run would have zero width and divide by zero
  // below, so the window has a floor of one second.
  const durationMs = Math.max(1000, lastEnd - startedAtMs);
  const fraction = (atMs: number) =>
    Math.min(1, Math.max(0, (atMs - startedAtMs) / durationMs));

  const byService = new Map<string, SessionSpan[]>();
  const events: SessionEvent[] = [];

  for (const run of runs) {
    const endMs = runEnd(run, nowMs);
    const spans = byService.get(run.service_id) ?? [];
    spans.push({
      from: fraction(run.started_at_ms),
      to: fraction(endMs),
      outcome: run.outcome,
      run,
    });
    byService.set(run.service_id, spans);

    events.push({
      at: fraction(run.started_at_ms),
      atMs: run.started_at_ms,
      kind: 'started',
      serviceId: run.service_id,
      detail: detailFor(run, 'started'),
    });

    if (run.outcome !== 'running') {
      const kind = endKind(run);
      events.push({
        at: fraction(endMs),
        atMs: endMs,
        kind,
        serviceId: run.service_id,
        detail: detailFor(run, kind),
      });
    }
  }

  const tracks: SessionTrack[] = [...byService.entries()]
    .map(([serviceId, spans]) => ({
      serviceId,
      spans: spans.sort((left, right) => left.from - right.from),
    }))
    .sort((left, right) => left.serviceId.localeCompare(right.serviceId));

  events.sort((left, right) => left.atMs - right.atMs);

  return {
    id: runs[0].run_id,
    startedAtMs,
    endedAtMs,
    durationMs,
    live,
    runs,
    tracks,
    events,
  };
}

/** Service ids running at `position` (0 to 1) within the session. */
export function activeAt(session: DerivedSession, position: number): string[] {
  return session.tracks
    .filter((track) => track.spans.some((span) => position >= span.from && position <= span.to))
    .map((track) => track.serviceId);
}

/** Events at or before `position`, for the "what had gone wrong by here" counts. */
export function eventsBefore(
  session: DerivedSession,
  position: number,
  kinds: SessionEventKind[],
): SessionEvent[] {
  return session.events.filter(
    (event) => event.at <= position && kinds.includes(event.kind),
  );
}

/**
 * How much of the session's work was in flight at each point, for the strip above
 * the scrubber. `1` means every service in the session was running.
 *
 * Normalised against the number of services rather than against the busiest
 * bucket. Normalising to the peak makes the strip always reach full height, so a
 * session where three services ran start to finish — the common case — drew a solid
 * bar of maximum height across the whole width and said nothing. Against the track
 * count the height means something absolute, and [`densityIsFlat`] tells the caller
 * when there is nothing worth drawing at all.
 */
export function density(session: DerivedSession, buckets = 64): number[] {
  const counts = new Array(buckets).fill(0);
  for (const track of session.tracks) {
    for (const span of track.spans) {
      const first = Math.floor(span.from * buckets);
      const last = Math.min(buckets - 1, Math.ceil(span.to * buckets));
      for (let index = first; index <= last; index += 1) {
        counts[index] += 1;
      }
    }
  }
  const services = Math.max(1, session.tracks.length);
  return counts.map((count) => Math.min(1, count / services));
}

/** True when every bucket is identical, so the strip would convey nothing. */
export function densityIsFlat(strip: number[]): boolean {
  return strip.length === 0 || strip.every((value) => value === strip[0]);
}

/**
 * Which stored workspace a session belonged to, if any.
 *
 * This is a real join rather than a guess: a run records the `service_id` it was
 * started with, and `start_workspace` passes the stored workspace service's own id
 * straight through to `begin_run`. So the ids in a session's tracks *are* workspace
 * service ids whenever a workspace started them.
 *
 * Services started outside a workspace — a script run directly from a project — get
 * an id of the form `project::{projectId}::{script}`, which belongs to no workspace
 * and simply will not match. A session of only those returns `null`, and the caller
 * should offer no resume rather than attribute it to something arbitrary.
 *
 * The best match wins when a session touches more than one workspace, which happens
 * if two were run in the same burst of work. Ties go to the first, and the count is
 * returned so a caller can tell a complete match from a partial one.
 */
export function attributeSession<W extends { id: string; services: { id: string }[] }>(
  session: DerivedSession,
  workspaces: W[],
): { workspace: W; matched: number } | null {
  const ids = new Set(session.tracks.map((track) => track.serviceId));
  let best: { workspace: W; matched: number } | null = null;

  for (const workspace of workspaces) {
    const matched = workspace.services.filter((service) => ids.has(service.id)).length;
    if (matched > 0 && (best === null || matched > best.matched)) {
      best = { workspace, matched };
    }
  }
  return best;
}
