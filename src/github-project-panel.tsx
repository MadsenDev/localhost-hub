import React from 'react';
import { Ic } from './icons';
import { tauriApi, type GitHubProjectContext } from './tauri-api';

export function GitHubProjectPanel({ path }: { path: string }) {
  const [context, setContext] = React.useState<GitHubProjectContext | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    tauriApi.getGitHubProjectContext(path)
      .then(result => {
        if (!cancelled) setContext(result);
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  React.useEffect(() => load(), [load]);

  if (loading) {
    return (
      <div style={{ padding: '12px 0 4px', color: 'var(--fg-4)', fontSize: 10.5 }}>
        Loading GitHub context…
      </div>
    );
  }

  if (error || !context) {
    return (
      <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-2)', border: '1px solid var(--line-0)', borderRadius: 'var(--r-1)' }}>
        <div style={{ color: 'var(--bad)', fontSize: 10.5 }}>{error || 'GitHub context is unavailable.'}</div>
        <div style={{ color: 'var(--fg-4)', fontSize: 10, marginTop: 4 }}>
          Connect GitHub in Settings and ensure this project has a github.com remote.
        </div>
        <button className="btn sm ghost" style={{ marginTop: 7 }} onClick={() => load()}>
          <Ic.Reload size={10} /> Retry
        </button>
      </div>
    );
  }

  const currentPullRequest = context.pull_requests.find(
    pullRequest => pullRequest.head_ref === context.current_branch,
  );
  const otherPullRequests = context.pull_requests.filter(
    pullRequest => pullRequest !== currentPullRequest,
  );
  const checkCounts = context.checks.reduce(
    (counts, check) => {
      if (check.status !== 'completed') counts.pending += 1;
      else if (check.conclusion === 'success' || check.conclusion === 'neutral' || check.conclusion === 'skipped') counts.passing += 1;
      else counts.failing += 1;
      return counts;
    },
    { passing: 0, failing: 0, pending: 0 },
  );

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-0)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--fg-1)', fontSize: 11.5, fontWeight: 650 }}>
              {context.repository.full_name}
            </span>
            <span className="tag">{context.repository.private ? 'private' : 'public'}</span>
            {context.repository.archived && <span className="tag warn">archived</span>}
            {context.repository.fork && <span className="tag">fork</span>}
          </div>
          <div style={{ color: 'var(--fg-4)', fontSize: 10, marginTop: 3 }}>
            {context.repository.description || `${context.remote_name} · ${context.remote_url}`}
          </div>
        </div>
        <button
          className="btn sm ghost"
          onClick={() => tauriApi.openGitHubUrl(context.repository.html_url)}
        >
          <Ic.External size={10} /> Open repository
        </button>
        <button className="btn sm ghost" onClick={() => load()} aria-label="Refresh GitHub context">
          <Ic.Reload size={10} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7, marginTop: 10 }}>
        <SummaryCell
          label="Current branch"
          value={context.current_branch ?? 'detached'}
          detail={context.head_sha ? context.head_sha.slice(0, 7) : 'No commit'}
        />
        <SummaryCell
          label="Open work"
          value={`${context.pull_requests.length} PR · ${context.issues.length} issue${context.issues.length === 1 ? '' : 's'}`}
          detail={`Default: ${context.repository.default_branch}`}
        />
        <SummaryCell
          label="Checks"
          value={context.checks.length === 0 ? 'No checks' : `${checkCounts.passing} pass · ${checkCounts.failing} fail`}
          detail={checkCounts.pending > 0 ? `${checkCounts.pending} still running` : 'Latest local commit'}
          tone={checkCounts.failing > 0 ? 'bad' : checkCounts.pending > 0 ? 'warn' : 'ok'}
        />
      </div>

      {currentPullRequest && (
        <section style={{ marginTop: 10 }}>
          <SectionLabel>Current branch pull request</SectionLabel>
          <RemoteRow
            prefix={`#${currentPullRequest.number}`}
            title={currentPullRequest.title}
            meta={`${currentPullRequest.head_ref} → ${currentPullRequest.base_ref}${currentPullRequest.draft ? ' · draft' : ''}`}
            url={currentPullRequest.html_url}
            tone="blue"
          />
        </section>
      )}

      {context.checks.length > 0 && (
        <section style={{ marginTop: 10 }}>
          <SectionLabel>Checks for {context.head_sha?.slice(0, 7)}</SectionLabel>
          <div style={{ display: 'grid', gap: 3 }}>
            {context.checks.slice(0, 6).map((check, index) => {
              const tone = check.status !== 'completed'
                ? 'warn'
                : check.conclusion === 'success' || check.conclusion === 'neutral' || check.conclusion === 'skipped'
                  ? 'ok'
                  : 'bad';
              return (
                <RemoteRow
                  key={`${check.name}-${index}`}
                  prefix={check.conclusion ?? check.status}
                  title={check.name}
                  meta={check.app_name ?? 'GitHub check'}
                  url={check.html_url}
                  tone={tone}
                />
              );
            })}
            {context.checks.length > 6 && (
              <div style={{ color: 'var(--fg-4)', fontSize: 10 }}>+{context.checks.length - 6} more checks</div>
            )}
          </div>
        </section>
      )}

      {(otherPullRequests.length > 0 || context.issues.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <section>
            <SectionLabel>Other open pull requests</SectionLabel>
            {otherPullRequests.length === 0 ? (
              <EmptyLine>None</EmptyLine>
            ) : (
              <div style={{ display: 'grid', gap: 3 }}>
                {otherPullRequests.slice(0, 4).map(pullRequest => (
                  <RemoteRow
                    key={pullRequest.number}
                    prefix={`#${pullRequest.number}`}
                    title={pullRequest.title}
                    meta={`${pullRequest.author} · ${formatDate(pullRequest.updated_at)}`}
                    url={pullRequest.html_url}
                  />
                ))}
              </div>
            )}
          </section>
          <section>
            <SectionLabel>Open issues</SectionLabel>
            {context.issues.length === 0 ? (
              <EmptyLine>None</EmptyLine>
            ) : (
              <div style={{ display: 'grid', gap: 3 }}>
                {context.issues.slice(0, 4).map(issue => (
                  <RemoteRow
                    key={issue.number}
                    prefix={`#${issue.number}`}
                    title={issue.title}
                    meta={`${issue.author} · ${formatDate(issue.updated_at)}${issue.labels.length ? ` · ${issue.labels.map(label => label.name).join(', ')}` : ''}`}
                    url={issue.html_url}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {context.warnings.map(warning => (
        <div key={warning} style={{ color: 'var(--warn)', fontSize: 10, marginTop: 7 }}>
          {warning}
        </div>
      ))}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  const toneColor = tone === 'ok'
    ? 'var(--ok)'
    : tone === 'warn'
      ? 'var(--warn)'
      : tone === 'bad'
        ? 'var(--bad)'
        : 'var(--fg-2)';
  return (
    <div style={{ padding: '8px 9px', background: 'var(--bg-2)', border: '1px solid var(--line-0)', borderRadius: 'var(--r-1)', minWidth: 0 }}>
      <div style={{ color: 'var(--fg-4)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div className="mono" style={{ color: toneColor, fontSize: 10.5, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ color: 'var(--fg-4)', fontSize: 9.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: 'var(--fg-4)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
      {children}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ color: 'var(--fg-4)', fontSize: 10, padding: '6px 8px' }}>{children}</div>;
}

function RemoteRow({
  prefix,
  title,
  meta,
  url,
  tone,
}: {
  prefix: string;
  title: string;
  meta: string;
  url?: string | null;
  tone?: 'blue' | 'ok' | 'warn' | 'bad';
}) {
  const prefixColor = tone === 'blue'
    ? 'var(--blue)'
    : tone === 'ok'
      ? 'var(--ok)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'bad'
          ? 'var(--bad)'
          : 'var(--fg-3)';
  return (
    <button
      disabled={!url}
      onClick={() => {
        if (url) tauriApi.openGitHubUrl(url);
      }}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 7,
        padding: '6px 8px',
        textAlign: 'left',
        background: 'var(--bg-2)',
        border: '1px solid var(--line-0)',
        borderRadius: 'var(--r-1)',
        color: 'inherit',
        cursor: url ? 'pointer' : 'default',
      }}
    >
      <span className="mono" style={{ color: prefixColor, fontSize: 9.5, paddingTop: 1 }}>{prefix}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', color: 'var(--fg-2)', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ display: 'block', color: 'var(--fg-4)', fontSize: 9.5, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>
      </span>
    </button>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
