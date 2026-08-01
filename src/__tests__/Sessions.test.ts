import { describe, expect, it } from 'vitest';

import type { RunRecord } from '../generated/RunRecord';
import type { RunOutcome } from '../generated/RunOutcome';
import {
  SESSION_GAP_MS,
  activeAt,
  attributeSession,
  density,
  densityIsFlat,
  deriveSessions,
  eventsBefore,
  spanTone,
} from '../sessions';

const MINUTE = 60 * 1000;
const BASE = 1_700_000_000_000;

function run(
  overrides: Partial<RunRecord> & { started_at_ms: number },
): RunRecord {
  return {
    run_id: `run-${overrides.started_at_ms}-${overrides.service_id ?? 'svc'}`,
    service_id: 'svc',
    cwd: '/code/app',
    cmd: 'npm run dev',
    pid: 1234,
    ended_at_ms: null,
    exit_code: null,
    outcome: 'exited' as RunOutcome,
    log_truncated: false,
    ...overrides,
  };
}

describe('deriveSessions', () => {
  it('reports no sessions when nothing has ever run', () => {
    expect(deriveSessions([], BASE)).toEqual([]);
  });

  it('groups runs that overlap or sit close together into one session', () => {
    const sessions = deriveSessions(
      [
        run({ started_at_ms: BASE, ended_at_ms: BASE + 5 * MINUTE, service_id: 'api' }),
        run({ started_at_ms: BASE + MINUTE, ended_at_ms: BASE + 6 * MINUTE, service_id: 'web' }),
      ],
      BASE + 10 * MINUTE,
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0].runs).toHaveLength(2);
    expect(sessions[0].tracks.map((track) => track.serviceId)).toEqual(['api', 'web']);
  });

  it('splits on a quiet period longer than the gap', () => {
    const morning = run({ started_at_ms: BASE, ended_at_ms: BASE + 5 * MINUTE });
    const afternoon = run({
      started_at_ms: BASE + 5 * MINUTE + SESSION_GAP_MS + MINUTE,
      ended_at_ms: BASE + 5 * MINUTE + SESSION_GAP_MS + 2 * MINUTE,
    });

    const sessions = deriveSessions([morning, afternoon], BASE + 3 * 60 * MINUTE);
    expect(sessions).toHaveLength(2);
    // Newest first, so the afternoon leads.
    expect(sessions[0].runs[0].run_id).toBe(afternoon.run_id);
    expect(sessions[1].runs[0].run_id).toBe(morning.run_id);
  });

  it('does not split when a long-lived service spans the gap', () => {
    // The server runs for two hours; a short run happens ninety minutes in. The
    // gap between the short run and the *previous run's start* exceeds the
    // threshold, but nothing was ever quiet, so it is one session. This is why
    // clustering uses the running maximum end rather than the previous end.
    const server = run({
      started_at_ms: BASE,
      ended_at_ms: BASE + 120 * MINUTE,
      service_id: 'server',
    });
    const later = run({
      started_at_ms: BASE + 90 * MINUTE,
      ended_at_ms: BASE + 91 * MINUTE,
      service_id: 'migrate',
    });

    expect(deriveSessions([server, later], BASE + 130 * MINUTE)).toHaveLength(1);
  });

  it('treats a session with a running run as live and measures it against now', () => {
    const sessions = deriveSessions(
      [run({ started_at_ms: BASE, outcome: 'running', ended_at_ms: null })],
      BASE + 7 * MINUTE,
    );

    expect(sessions[0].live).toBe(true);
    expect(sessions[0].endedAtMs).toBeNull();
    expect(sessions[0].durationMs).toBe(7 * MINUTE);
  });

  it('closes a session at its last end once nothing is running', () => {
    const sessions = deriveSessions(
      [run({ started_at_ms: BASE, ended_at_ms: BASE + 4 * MINUTE, outcome: 'exited', exit_code: 0 })],
      BASE + 90 * MINUTE,
    );

    expect(sessions[0].live).toBe(false);
    expect(sessions[0].endedAtMs).toBe(BASE + 4 * MINUTE);
    expect(sessions[0].durationMs).toBe(4 * MINUTE);
  });

  it('places spans at their real position within the session', () => {
    const sessions = deriveSessions(
      [
        run({ started_at_ms: BASE, ended_at_ms: BASE + 10 * MINUTE, service_id: 'a' }),
        run({ started_at_ms: BASE + 5 * MINUTE, ended_at_ms: BASE + 10 * MINUTE, service_id: 'b' }),
      ],
      BASE + 20 * MINUTE,
    );

    const [a, b] = sessions[0].tracks;
    expect(a.spans[0]).toMatchObject({ from: 0, to: 1 });
    // Started halfway through a ten-minute window.
    expect(b.spans[0].from).toBeCloseTo(0.5, 5);
    expect(b.spans[0].to).toBeCloseTo(1, 5);
  });

  it('survives a session whose runs all started in the same millisecond', () => {
    // Without a floor on the window this divides by zero and every position
    // becomes NaN, which would put every bar at `left: NaN%`.
    const sessions = deriveSessions(
      [run({ started_at_ms: BASE, ended_at_ms: BASE, outcome: 'exited', exit_code: 0 })],
      BASE,
    );

    expect(sessions[0].durationMs).toBeGreaterThan(0);
    for (const span of sessions[0].tracks[0].spans) {
      expect(Number.isFinite(span.from)).toBe(true);
      expect(Number.isFinite(span.to)).toBe(true);
    }
  });
});

describe('events', () => {
  it('records a start for every run and an end for every finished run', () => {
    const sessions = deriveSessions(
      [
        run({ started_at_ms: BASE, ended_at_ms: BASE + MINUTE, outcome: 'exited', exit_code: 0 }),
        run({ started_at_ms: BASE + MINUTE, outcome: 'running', service_id: 'live' }),
      ],
      BASE + 2 * MINUTE,
    );

    const kinds = sessions[0].events.map((event) => event.kind);
    expect(kinds.filter((kind) => kind === 'started')).toHaveLength(2);
    // The still-running one contributes no end event.
    expect(kinds.filter((kind) => kind !== 'started')).toEqual(['exited']);
  });

  it('separates a clean exit from a failing one, which the record does not', () => {
    const clean = deriveSessions(
      [run({ started_at_ms: BASE, ended_at_ms: BASE + MINUTE, outcome: 'exited', exit_code: 0 })],
      BASE + 2 * MINUTE,
    );
    const failed = deriveSessions(
      [run({ started_at_ms: BASE, ended_at_ms: BASE + MINUTE, outcome: 'exited', exit_code: 1 })],
      BASE + 2 * MINUTE,
    );

    expect(clean[0].events.map((e) => e.kind)).toContain('exited');
    expect(failed[0].events.map((e) => e.kind)).toContain('failed');
    expect(failed[0].events.find((e) => e.kind === 'failed')?.detail).toBe('exit code 1');
  });

  it('names an interrupted run for what it is', () => {
    const sessions = deriveSessions(
      [
        run({
          started_at_ms: BASE,
          ended_at_ms: BASE + MINUTE,
          outcome: 'interrupted',
        }),
      ],
      BASE + 2 * MINUTE,
    );

    const event = sessions[0].events.find((e) => e.kind === 'interrupted');
    expect(event?.detail).toBe('still running when Hub last closed');
  });

  it('counts only the kinds asked for, at or before the cursor', () => {
    const sessions = deriveSessions(
      [
        run({ started_at_ms: BASE, ended_at_ms: BASE + MINUTE, outcome: 'failed', service_id: 'a' }),
        run({
          started_at_ms: BASE + 8 * MINUTE,
          ended_at_ms: BASE + 10 * MINUTE,
          outcome: 'failed',
          service_id: 'b',
        }),
      ],
      BASE + 20 * MINUTE,
    );
    const session = sessions[0];

    expect(eventsBefore(session, 0.5, ['failed'])).toHaveLength(1);
    expect(eventsBefore(session, 1, ['failed'])).toHaveLength(2);
    expect(eventsBefore(session, 1, ['stopped'])).toHaveLength(0);
  });
});

describe('activeAt', () => {
  it('reports which services were running at a position', () => {
    const sessions = deriveSessions(
      [
        run({ started_at_ms: BASE, ended_at_ms: BASE + 10 * MINUTE, service_id: 'all-along' }),
        run({
          started_at_ms: BASE + 6 * MINUTE,
          ended_at_ms: BASE + 10 * MINUTE,
          service_id: 'late',
        }),
      ],
      BASE + 20 * MINUTE,
    );
    const session = sessions[0];

    expect(activeAt(session, 0.1)).toEqual(['all-along']);
    expect(activeAt(session, 0.9).sort()).toEqual(['all-along', 'late']);
  });
});

describe('spanTone', () => {
  it('distinguishes running, clean, failed and halted runs', () => {
    expect(spanTone('running', null)).toBe('blue');
    expect(spanTone('exited', 0)).toBe('ok');
    expect(spanTone('exited', 137)).toBe('danger');
    expect(spanTone('failed', null)).toBe('danger');
    expect(spanTone('stopped', null)).toBe('warm');
    expect(spanTone('interrupted', null)).toBe('warm');
  });
});

describe('density', () => {
  it('measures how many of the session\'s services were running, not a relative peak', () => {
    const sessions = deriveSessions(
      [
        run({ started_at_ms: BASE, ended_at_ms: BASE + 10 * MINUTE, service_id: 'a' }),
        run({ started_at_ms: BASE, ended_at_ms: BASE + 5 * MINUTE, service_id: 'b' }),
        run({ started_at_ms: BASE, ended_at_ms: BASE + 5 * MINUTE, service_id: 'c' }),
      ],
      BASE + 20 * MINUTE,
    );

    const strip = density(sessions[0], 10);
    expect(strip).toHaveLength(10);
    // All three overlap at the start, one remains at the end.
    expect(strip[0]).toBeCloseTo(1, 5);
    expect(strip[9]).toBeCloseTo(1 / 3, 5);
    for (const value of strip) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('reports a strip as flat when it would convey nothing', () => {
    // Three services running the whole session: every bucket identical. Peak
    // normalisation drew this as a solid full-height bar across the width.
    const uniform = deriveSessions(
      [
        run({ started_at_ms: BASE, ended_at_ms: BASE + 10 * MINUTE, service_id: 'a' }),
        run({ started_at_ms: BASE, ended_at_ms: BASE + 10 * MINUTE, service_id: 'b' }),
        run({ started_at_ms: BASE, ended_at_ms: BASE + 10 * MINUTE, service_id: 'c' }),
      ],
      BASE + 20 * MINUTE,
    );
    expect(densityIsFlat(density(uniform[0], 10))).toBe(true);

    const varied = deriveSessions(
      [
        run({ started_at_ms: BASE, ended_at_ms: BASE + 10 * MINUTE, service_id: 'a' }),
        run({ started_at_ms: BASE + 5 * MINUTE, ended_at_ms: BASE + 10 * MINUTE, service_id: 'b' }),
      ],
      BASE + 20 * MINUTE,
    );
    expect(densityIsFlat(density(varied[0], 10))).toBe(false);
  });
});

describe('attributeSession', () => {
  const storefront = {
    id: 'ws-storefront',
    services: [{ id: 'svc-web' }, { id: 'svc-api' }, { id: 'svc-worker' }],
  };
  const other = { id: 'ws-docs', services: [{ id: 'svc-docs' }] };

  function sessionOf(...serviceIds: string[]) {
    return deriveSessions(
      serviceIds.map((service_id, index) =>
        run({
          started_at_ms: BASE + index,
          ended_at_ms: BASE + MINUTE,
          service_id,
        }),
      ),
      BASE + 2 * MINUTE,
    )[0];
  }

  it('matches a session to the workspace whose services ran', () => {
    const result = attributeSession(sessionOf('svc-web', 'svc-api'), [storefront, other]);
    expect(result?.workspace.id).toBe('ws-storefront');
    expect(result?.matched).toBe(2);
  });

  it('prefers the workspace covering more of the session', () => {
    const result = attributeSession(
      sessionOf('svc-web', 'svc-api', 'svc-docs'),
      [other, storefront],
    );
    expect(result?.workspace.id).toBe('ws-storefront');
  });

  it('attributes nothing when a script was run straight from a project', () => {
    // `directProjectServiceId` produces this shape, and it belongs to no
    // workspace. Attributing it to one anyway would offer a resume that restarts
    // something the user never ran.
    expect(attributeSession(sessionOf('project::repo-1::dev'), [storefront])).toBeNull();
  });

  it('attributes nothing when the workspace has since been deleted', () => {
    expect(attributeSession(sessionOf('svc-web'), [other])).toBeNull();
    expect(attributeSession(sessionOf('svc-web'), [])).toBeNull();
  });
});
