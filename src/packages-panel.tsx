import React from 'react';
import { Ic } from './icons';
import {
  tauriApi,
  type DependencyKind,
  type PackageAction,
  type PackageActionResult,
  type ProjectPackage,
  type ProjectPackages,
} from './tauri-api';

const KIND_LABELS: Record<DependencyKind, string> = {
  dependency: 'Runtime',
  dev_dependency: 'Development',
  peer_dependency: 'Peer',
  optional_dependency: 'Optional',
};

export function PackagesPanel({ projectPath }: { projectPath: string }) {
  const [state, setState] = React.useState<ProjectPackages | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [pending, setPending] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [kind, setKind] = React.useState<DependencyKind | 'all'>('all');
  const [showAdd, setShowAdd] = React.useState(false);
  const [packageName, setPackageName] = React.useState('');
  const [version, setVersion] = React.useState('');
  const [dev, setDev] = React.useState(false);
  const [result, setResult] = React.useState<PackageActionResult | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const packages = await tauriApi.getProjectPackages(projectPath);
      if (!packages) throw new Error('Package inspection is available in the desktop app.');
      setState(packages);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function run(
    action: PackageAction,
    packageItem?: ProjectPackage,
    options?: { name?: string; version?: string; dev?: boolean },
  ) {
    const label = packageItem?.name ?? options?.name ?? action;
    setPending(`${action}:${label}`);
    setError('');
    setResult(null);
    try {
      const actionResult = await tauriApi.runPackageAction({
        project_path: projectPath,
        action,
        package_name: packageItem?.name ?? options?.name ?? null,
        version: options?.version || null,
        dev: options?.dev ?? false,
      });
      if (!actionResult) throw new Error('Package actions are available in the desktop app.');
      setResult(actionResult);
      if (['install_all', 'add', 'remove', 'update', 'regenerate_lockfile'].includes(action)) {
        await load();
      }
      if (action === 'add' && actionResult.success) {
        setPackageName('');
        setVersion('');
        setDev(false);
        setShowAdd(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending('');
    }
  }

  const packages = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return (state?.packages ?? []).filter(packageItem =>
      (kind === 'all' || packageItem.kind === kind)
      && (!query || packageItem.name.toLowerCase().includes(query))
    );
  }, [kind, search, state]);

  if (loading && !state) {
    return <div className="panel"><Empty title="Inspecting package manifests…" /></div>;
  }
  if (error && !state) {
    return (
      <div className="panel">
        <Empty title={error} />
        <div style={{ textAlign: 'center', paddingBottom: 16 }}>
          <button className="btn sm ghost" onClick={() => void load()}>Retry</button>
        </div>
      </div>
    );
  }
  if (!state) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title"><span className="dot" /> Packages</div>
          <div style={{ color: 'var(--fg-4)', fontSize: 11, marginTop: 4 }}>
            {state.package_manager} · {state.installed_count}/{state.packages.length} installed
            {state.missing_count > 0 ? ` · ${state.missing_count} missing` : ''}
          </div>
        </div>
        <div className="panel-actions">
          <button className="btn sm ghost" onClick={() => setShowAdd(value => !value)}>
            <Ic.Plus size={10} /> Add package
          </button>
          <button
            className="btn sm primary"
            disabled={Boolean(pending)}
            onClick={() => void run('install_all')}
          >
            {pending.startsWith('install_all:') ? 'Installing…' : 'Install all'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div style={{ padding: 14, borderBottom: '1px solid var(--line-soft)', display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) minmax(120px, 1fr) auto auto', gap: 8, alignItems: 'center' }}>
          <input
            className="input mono"
            aria-label="Package name"
            placeholder="@scope/package"
            value={packageName}
            onChange={event => setPackageName(event.target.value)}
          />
          <input
            className="input mono"
            aria-label="Package version"
            placeholder="latest or ^1.2.3"
            value={version}
            onChange={event => setVersion(event.target.value)}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--fg-3)', fontSize: 11 }}>
            <input type="checkbox" checked={dev} onChange={event => setDev(event.target.checked)} />
            Dev
          </label>
          <button
            className="btn sm primary"
            disabled={!packageName.trim() || Boolean(pending)}
            onClick={() => void run('add', undefined, {
              name: packageName.trim(),
              version: version.trim(),
              dev,
            })}
          >
            Add
          </button>
        </div>
      )}

      <div style={{ padding: 12, borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <input
          className="input"
          aria-label="Search packages"
          placeholder="Search packages…"
          value={search}
          onChange={event => setSearch(event.target.value)}
          style={{ flex: '1 1 220px' }}
        />
        {(['all', 'dependency', 'dev_dependency', 'peer_dependency', 'optional_dependency'] as const).map(value => (
          <button
            key={value}
            className={`btn sm ${kind === value ? 'primary' : 'ghost'}`}
            onClick={() => setKind(value)}
          >
            {value === 'all' ? 'All' : KIND_LABELS[value]}
          </button>
        ))}
      </div>

      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <button className="btn sm ghost" disabled={Boolean(pending)} onClick={() => void run('outdated')}>
          {pending.startsWith('outdated:') ? 'Checking…' : 'Check outdated'}
        </button>
        <button className="btn sm ghost" disabled={Boolean(pending)} onClick={() => void run('audit')}>
          {pending.startsWith('audit:') ? 'Auditing…' : 'Security audit'}
        </button>
        <button className="btn sm ghost" disabled={Boolean(pending)} onClick={() => void run('regenerate_lockfile')}>
          {pending.startsWith('regenerate_lockfile:') ? 'Regenerating…' : 'Regenerate lockfile'}
        </button>
        <button className="btn sm ghost" disabled={loading || Boolean(pending)} onClick={() => void load()}>
          <Ic.Reload size={10} /> Refresh
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', color: 'var(--danger)', borderBottom: '1px solid var(--line-soft)' }}>{error}</div>}
      {result && (
        <div style={{ padding: 12, borderBottom: '1px solid var(--line-soft)', background: 'var(--bg-0)' }}>
          <div className="mono" style={{ color: result.success ? 'var(--ok)' : 'var(--danger)', fontSize: 11, marginBottom: 7 }}>
            $ {result.command} · {result.success ? 'completed' : `exit ${result.exit_code ?? 'unknown'}`}
          </div>
          {(result.stdout || result.stderr) && (
            <pre className="mono" style={{ margin: 0, maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--fg-2)', fontSize: 10.5 }}>
              {[result.stdout, result.stderr].filter(Boolean).join('\n')}
            </pre>
          )}
        </div>
      )}

      {packages.length === 0 ? (
        <Empty title={search || kind !== 'all' ? 'No packages match this filter.' : 'No dependencies are declared.'} />
      ) : packages.map(packageItem => {
        const actionKey = `${packageItem.name}`;
        return (
          <div key={`${packageItem.kind}:${packageItem.name}`} className="script-row" style={{ gridTemplateColumns: 'minmax(160px, 1fr) minmax(160px, 1fr) auto' }}>
            <span>
              <span className="name mono">{packageItem.name}</span>
              <span style={{ marginLeft: 7, color: 'var(--fg-4)', fontSize: 10 }}>{KIND_LABELS[packageItem.kind]}</span>
            </span>
            <span className="cmd">
              requested {packageItem.requested_version}
              {' · '}
              <span style={{ color: packageItem.installed_version ? 'var(--ok)' : 'var(--warn)' }}>
                {packageItem.installed_version ? `installed ${packageItem.installed_version}` : 'missing'}
              </span>
            </span>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              {!packageItem.installed_version ? (
                <button
                  className="btn sm primary"
                  disabled={Boolean(pending)}
                  onClick={() => void run('install_all')}
                >
                  {pending.startsWith('install_all:') ? 'Installing…' : 'Install dependencies'}
                </button>
              ) : (
                <button
                  className="btn sm ghost"
                  disabled={Boolean(pending)}
                  onClick={() => void run('update', packageItem)}
                >
                  {pending === `update:${actionKey}` ? 'Updating…' : 'Update'}
                </button>
              )}
              <button
                className="btn sm ghost"
                style={{ color: 'var(--danger)' }}
                disabled={Boolean(pending)}
                onClick={() => {
                  if (window.confirm(`Remove ${packageItem.name} from this project?`)) {
                    void run('remove', packageItem);
                  }
                }}
              >
                Remove
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ title }: { title: string }) {
  return (
    <div className="empty" style={{ padding: 30 }}>
      <Ic.Stack size={26} />
      <div style={{ color: 'var(--fg-3)', marginTop: 9, fontSize: 12 }}>{title}</div>
    </div>
  );
}
