import React from 'react';
import { Ic } from './icons';
import {
  tauriApi,
  type CreateProjectPayload,
  type CreateProjectResult,
  type PackageManager,
  type ProjectLanguage,
  type ProjectTemplate,
} from './tauri-api';

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateProjectResult, parentDirectory: string) => Promise<void> | void;
}

const TEMPLATES: Array<{
  id: ProjectTemplate;
  name: string;
  detail: string;
  scripts: string;
}> = [
  { id: 'react-vite', name: 'React + Vite', detail: 'React 19 with a clean Vite starter.', scripts: 'dev · build · preview' },
  { id: 'node-http', name: 'Node HTTP', detail: 'A small native HTTP service with no framework.', scripts: 'dev · start' },
  { id: 'empty', name: 'Empty', detail: 'A minimal executable project you can shape yourself.', scripts: 'dev · start' },
];

const MANAGERS: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];

const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg-2)',
  border: '1px solid var(--line-1)',
  borderRadius: 'var(--r-1)',
  color: 'var(--fg-1)',
  fontSize: 12.5,
  outline: 'none',
  padding: '8px 10px',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--fg-4)',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

export function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: CreateProjectDialogProps) {
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState('');
  const [directory, setDirectory] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [template, setTemplate] = React.useState<ProjectTemplate>('react-vite');
  const [language, setLanguage] = React.useState<ProjectLanguage>('typescript');
  const [packageManager, setPackageManager] = React.useState<PackageManager>('npm');
  const [styling, setStyling] = React.useState<'none' | 'tailwind-v4'>('none');
  const [icons, setIcons] = React.useState<string[]>([]);
  const [packages, setPackages] = React.useState('');
  const [devPackages, setDevPackages] = React.useState('');
  const [scripts, setScripts] = React.useState('');
  const [includeReadme, setIncludeReadme] = React.useState(true);
  const [readmeNotes, setReadmeNotes] = React.useState('');
  const [initializeGit, setInitializeGit] = React.useState(true);
  const [installDependencies, setInstallDependencies] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setError('');
  }, [open]);

  if (!open) return null;

  async function chooseDirectory() {
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Choose where to create the project',
    });
    if (typeof selected === 'string') setDirectory(selected);
  }

  function toggleIcon(packageName: string) {
    setIcons(current =>
      current.includes(packageName)
        ? current.filter(item => item !== packageName)
        : [...current, packageName]
    );
  }

  function splitPackages(value: string): string[] {
    return value
      .split(/[\n,]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function parseScripts(value: string): Record<string, string> {
    const output: Record<string, string> = {};
    for (const line of value.split('\n').map(item => item.trim()).filter(Boolean)) {
      const separator = line.indexOf('=');
      if (separator < 1 || !line.slice(separator + 1).trim()) {
        throw new Error(`Use name=command for custom scripts. Could not parse "${line}".`);
      }
      output[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    return output;
  }

  function validateCurrentStep(): boolean {
    if (step === 0 && (!name.trim() || !directory.trim())) {
      setError('Choose a parent folder and enter a project name.');
      return false;
    }
    setError('');
    return true;
  }

  async function create() {
    setError('');
    setCreating(true);
    try {
      const payload: CreateProjectPayload = {
        name: name.trim(),
        directory,
        description: description.trim(),
        template,
        language,
        package_manager: packageManager,
        dependencies: splitPackages(packages),
        dev_dependencies: splitPackages(devPackages),
        scripts: parseScripts(scripts),
        styling: template === 'react-vite' ? styling : 'none',
        icon_packs: icons,
        include_readme: includeReadme,
        readme_notes: readmeNotes.trim(),
        initialize_git: initializeGit,
        install_dependencies: installDependencies,
      };
      const result = await tauriApi.createProject(payload);
      if (!result?.path) {
        throw new Error('Project creation is available in the Localhost Hub desktop app.');
      }
      await onCreated(result, directory);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCreating(false);
    }
  }

  const steps = ['Basics', 'Starter', 'Options', 'Review'];
  const targetPath = directory
    ? `${directory.replace(/[\\/]$/, '')}${directory.includes('\\') ? '\\' : '/'}${name || 'project-name'}`
    : 'Choose a parent folder';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 160,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(3, 5, 8, 0.72)',
        backdropFilter: 'blur(6px)',
      }}
      onMouseDown={event => {
        if (event.target === event.currentTarget && !creating) onClose();
      }}
    >
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        style={{
          width: 'min(680px, calc(100vw - 48px))',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'auto',
          padding: 0,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--line-0)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>New local project</div>
              <div id="create-project-title" style={{ color: 'var(--fg-1)', fontSize: 17, fontWeight: 650 }}>
                Create project
              </div>
            </div>
            <button className="btn sm ghost" onClick={onClose} disabled={creating} aria-label="Close">
              <Ic.Close size={12} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 16 }}>
            {steps.map((item, index) => (
              <div key={item}>
                <div style={{ height: 2, borderRadius: 2, background: index <= step ? 'var(--blue)' : 'var(--line-1)' }} />
                <div style={{ marginTop: 5, color: index === step ? 'var(--fg-2)' : 'var(--fg-4)', fontSize: 10.5 }}>
                  {index + 1}. {item}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ minHeight: 330, padding: 20 }}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Project name</label>
                <input
                  autoFocus
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="my-new-project"
                  style={{ ...fieldStyle, marginTop: 6 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Parent folder</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input
                    value={directory}
                    onChange={event => setDirectory(event.target.value)}
                    placeholder="/Users/you/Projects"
                    style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }}
                  />
                  <button className="btn ghost" onClick={chooseDirectory}>
                    Browse
                  </button>
                </div>
                <div style={{ marginTop: 6, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                  {targetPath}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  placeholder="What is this project for?"
                  rows={3}
                  style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle}>Starter</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 7 }}>
                  {TEMPLATES.map(item => {
                    const selected = template === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setTemplate(item.id);
                          if (item.id !== 'react-vite') setStyling('none');
                        }}
                        style={{
                          minHeight: 118,
                          padding: 12,
                          textAlign: 'left',
                          cursor: 'pointer',
                          background: selected ? 'var(--blue-soft)' : 'var(--bg-2)',
                          border: `1px solid ${selected ? 'var(--blue-edge)' : 'var(--line-1)'}`,
                          borderRadius: 'var(--r-1)',
                          color: 'var(--fg-1)',
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{item.name}</div>
                        <div style={{ color: 'var(--fg-3)', fontSize: 11, lineHeight: 1.5, marginTop: 6 }}>{item.detail}</div>
                        <div style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: 9.5, marginTop: 8 }}>{item.scripts}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <ChoiceRow
                label="Language"
                options={[
                  { value: 'typescript', label: 'TypeScript' },
                  { value: 'javascript', label: 'JavaScript' },
                ]}
                value={language}
                onChange={value => setLanguage(value as ProjectLanguage)}
              />
              <ChoiceRow
                label="Package manager"
                options={MANAGERS.map(manager => ({ value: manager, label: manager }))}
                value={packageManager}
                onChange={value => setPackageManager(value as PackageManager)}
              />
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <div>
                  <label style={labelStyle}>Styling</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    {(['none', 'tailwind-v4'] as const).map(value => (
                      <button
                        key={value}
                        className={`btn sm ${styling === value ? 'primary' : 'ghost'}`}
                        disabled={template !== 'react-vite' && value !== 'none'}
                        onClick={() => setStyling(value)}
                      >
                        {value === 'none' ? 'Plain CSS' : 'Tailwind v4'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Icon packages</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    {['lucide-react', 'react-icons'].map(packageName => (
                      <button
                        key={packageName}
                        className={`btn sm ${icons.includes(packageName) ? 'primary' : 'ghost'}`}
                        onClick={() => toggleIcon(packageName)}
                      >
                        {packageName}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Dependencies</label>
                  <textarea
                    rows={3}
                    value={packages}
                    onChange={event => setPackages(event.target.value)}
                    placeholder={'zod\n@tanstack/react-query@^5'}
                    style={{ ...fieldStyle, marginTop: 6, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <div>
                  <label style={labelStyle}>Development dependencies</label>
                  <textarea
                    rows={3}
                    value={devPackages}
                    onChange={event => setDevPackages(event.target.value)}
                    placeholder="vitest@^4"
                    style={{ ...fieldStyle, marginTop: 6, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Custom scripts</label>
                  <textarea
                    rows={4}
                    value={scripts}
                    onChange={event => setScripts(event.target.value)}
                    placeholder={'test=vitest run\nlint=eslint .'}
                    style={{ ...fieldStyle, marginTop: 6, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                  />
                  <div style={{ color: 'var(--fg-4)', fontSize: 10.5, marginTop: 5 }}>One name=command pair per line.</div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 18 }}>
              <div>
                <label style={labelStyle}>Project plan</label>
                <div style={{ marginTop: 7, padding: 14, background: 'var(--bg-2)', border: '1px solid var(--line-0)', borderRadius: 'var(--r-1)' }}>
                  <ReviewLine label="Location" value={targetPath} mono />
                  <ReviewLine label="Starter" value={TEMPLATES.find(item => item.id === template)?.name ?? template} />
                  <ReviewLine label="Runtime" value={`${language === 'typescript' ? 'TypeScript' : 'JavaScript'} · ${packageManager}`} />
                  <ReviewLine label="Styling" value={styling === 'tailwind-v4' ? 'Tailwind v4' : 'Plain CSS'} />
                  <ReviewLine label="Extras" value={[...icons, ...splitPackages(packages), ...splitPackages(devPackages)].join(', ') || 'None'} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <label style={labelStyle}>README notes</label>
                  <textarea
                    rows={4}
                    value={readmeNotes}
                    onChange={event => setReadmeNotes(event.target.value)}
                    disabled={!includeReadme}
                    placeholder="Project-specific setup or context."
                    style={{ ...fieldStyle, marginTop: 6, resize: 'vertical', opacity: includeReadme ? 1 : 0.55 }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Toggle label="Create README" checked={includeReadme} onChange={setIncludeReadme} />
                <Toggle label="Initialize Git repository" checked={initializeGit} onChange={setInitializeGit} />
                <Toggle label={`Run ${packageManager} install`} checked={installDependencies} onChange={setInstallDependencies} />
                <div style={{ padding: 12, marginTop: 5, color: 'var(--fg-4)', background: 'var(--bg-2)', borderRadius: 'var(--r-1)', fontSize: 10.5, lineHeight: 1.55 }}>
                  Localhost Hub writes the project through Rust. Installation can take a few minutes; closing this window is disabled while it runs.
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ margin: '0 20px 14px', padding: '9px 11px', color: 'var(--bad)', background: 'color-mix(in oklch, var(--bad) 10%, var(--bg-2))', border: '1px solid color-mix(in oklch, var(--bad) 32%, var(--line-1))', borderRadius: 'var(--r-1)', fontSize: 11.5 }}>
            {error}
          </div>
        )}

        <div style={{ padding: '13px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line-0)' }}>
          <button
            className="btn ghost"
            disabled={step === 0 || creating}
            onClick={() => {
              setError('');
              setStep(current => Math.max(0, current - 1));
            }}
          >
            Back
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" disabled={creating} onClick={onClose}>Cancel</button>
            {step < 3 ? (
              <button
                className="btn primary"
                onClick={() => {
                  if (validateCurrentStep()) setStep(current => current + 1);
                }}
              >
                Continue
              </button>
            ) : (
              <button className="btn primary" disabled={creating} onClick={create}>
                {creating ? 'Creating project…' : 'Create project'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
        {options.map(option => (
          <button
            key={option.value}
            className={`btn sm ${value === option.value ? 'primary' : 'ghost'}`}
            onClick={() => onChange(option.value)}
            style={{ textTransform: option.label.length <= 4 ? 'lowercase' : undefined }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: 'var(--bg-2)', border: '1px solid var(--line-0)', borderRadius: 'var(--r-1)', color: 'var(--fg-2)', fontSize: 11.5, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function ReviewLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '74px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line-0)' }}>
      <span style={{ color: 'var(--fg-4)', fontSize: 10.5 }}>{label}</span>
      <span style={{ color: 'var(--fg-2)', fontSize: 11, fontFamily: mono ? 'var(--font-mono)' : undefined, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
}
