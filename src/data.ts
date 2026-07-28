import type { HubDataShape } from './types';

export const HubData: HubDataShape = (() => {
  const workspaces = [
    {
      id: "fattern",
      name: "Fattern",
      desc: "Design system + marketing site. Next.js front-end, Postgres, and Stripe webhooks via local tunnel.",
      swatch: "oklch(0.66 0.115 252)",
      path: "~/code/fattern",
      projects: ["fattern-web", "fattern-api", "fattern-tunnel"],
      services: [
        { id: "svc-web", project: "fattern-web", name: "web", cmd: "pnpm dev", port: 3000, status: "running" as const, uptime: 1842, pkg: "pnpm", cpu: 4.2, mem: 312, framework: "Next.js" },
        { id: "svc-api", project: "fattern-api", name: "api", cmd: "pnpm dev:server", port: 4000, status: "running" as const, uptime: 1820, pkg: "pnpm", cpu: 1.6, mem: 198, framework: "Fastify" },
        { id: "svc-pg",  project: "fattern-api", name: "postgres", cmd: "docker compose up db", port: 5432, status: "running" as const, uptime: 1851, pkg: "docker", cpu: 0.4, mem: 84, framework: "Postgres 16" },
        { id: "svc-tn",  project: "fattern-tunnel", name: "tunnel", cmd: "ngrok http 3000", port: 4040, status: "starting" as const, uptime: 6, pkg: "bin", cpu: 0.1, mem: 28, framework: "ngrok" },
        { id: "svc-storybook", project: "fattern-web", name: "storybook", cmd: "pnpm storybook", port: 6006, status: "stopped" as const, uptime: 0, pkg: "pnpm", cpu: 0, mem: 0, framework: "Storybook" }
      ],
      sessions: 12,
      lastOpened: "2 minutes ago"
    },
    {
      id: "backlayer",
      name: "Backlayer",
      desc: "Rust service mesh experiment. Cargo workspace with three crates and a TUI dashboard.",
      swatch: "oklch(0.80 0.07 75)",
      path: "~/code/backlayer",
      projects: ["backlayer-core", "backlayer-cli", "backlayer-bench"],
      services: [
        { id: "bl-core", project: "backlayer-core", name: "core", cmd: "cargo watch -x run", port: 7700, status: "running" as const, uptime: 412, pkg: "cargo", cpu: 12.4, mem: 220, framework: "Rust 1.84" },
        { id: "bl-cli",  project: "backlayer-cli",  name: "cli", cmd: "cargo run --bin bl", port: null, status: "stopped" as const, uptime: 0, pkg: "cargo", cpu: 0, mem: 0, framework: "Rust 1.84" },
        { id: "bl-bench",project: "backlayer-bench",name: "bench", cmd: "cargo bench", port: null, status: "failed" as const, uptime: 0, pkg: "cargo", cpu: 0, mem: 0, framework: "Rust 1.84" }
      ],
      sessions: 7,
      lastOpened: "yesterday"
    },
    {
      id: "vitni",
      name: "Vitni",
      desc: "Witness-style report intake. Vite + SvelteKit, Python FastAPI worker, Redis queue.",
      swatch: "oklch(0.73 0.13 148)",
      path: "~/code/vitni",
      projects: ["vitni-app", "vitni-worker", "vitni-redis"],
      services: [
        { id: "vt-app",    project: "vitni-app",    name: "app",    cmd: "bun run dev", port: 5173, status: "running" as const, uptime: 622, pkg: "bun",    cpu: 3.1, mem: 188, framework: "SvelteKit" },
        { id: "vt-worker", project: "vitni-worker", name: "worker", cmd: "uv run worker", port: 8001, status: "running" as const, uptime: 620, pkg: "uv", cpu: 0.8, mem: 96,  framework: "FastAPI" },
        { id: "vt-redis",  project: "vitni-redis",  name: "redis",  cmd: "docker compose up", port: 6379, status: "running" as const, uptime: 624, pkg: "docker", cpu: 0.2, mem: 42, framework: "Redis 7" }
      ],
      sessions: 4,
      lastOpened: "3 hours ago"
    },
    {
      id: "client-orc",
      name: "Client / Orcalabs",
      desc: "Marketing freelance gig. Astro site + Sanity studio.",
      swatch: "oklch(0.66 0.19 25)",
      path: "~/code/clients/orcalabs",
      projects: ["orca-web", "orca-studio"],
      services: [
        { id: "or-web",    project: "orca-web",    name: "web",    cmd: "pnpm dev", port: 4321, status: "stopped" as const, uptime: 0, pkg: "pnpm", cpu: 0, mem: 0, framework: "Astro 4" },
        { id: "or-studio", project: "orca-studio", name: "studio", cmd: "pnpm sanity dev", port: 3333, status: "stopped" as const, uptime: 0, pkg: "pnpm", cpu: 0, mem: 0, framework: "Sanity" }
      ],
      sessions: 2,
      lastOpened: "5 days ago"
    }
  ];

  const projects = {
    "fattern-web": {
      id: "fattern-web", name: "fattern-web", workspace: "fattern",
      path: "~/code/fattern/apps/web", icon: "fw",
      framework: "Next.js 15", language: "TypeScript",
      pkg: "pnpm 9.12.1", node: "v22.6.0",
      git: { branch: "feat/pricing-revamp", clean: false, ahead: 2, behind: 0, changed: 7, last: "ad7c2 chore: bump tailwind to 4.0.4 — 14m ago" },
      scripts: [
        { name: "dev",     cmd: "next dev --turbo --port 3000",  hot: true },
        { name: "build",   cmd: "next build" },
        { name: "start",   cmd: "next start -p 3000" },
        { name: "lint",    cmd: "eslint . --fix" },
        { name: "test",    cmd: "vitest run --silent" },
        { name: "test:e2e",cmd: "playwright test" },
        { name: "format",  cmd: "prettier -w ." }
      ],
      env: [
        { k: "NEXT_PUBLIC_APP_URL", v: "http://localhost:3000" },
        { k: "DATABASE_URL",         v: "postgres://*****@localhost:5432/fattern" },
        { k: "STRIPE_PUBLIC_KEY",    v: "pk_test_•••••• 7c4a" },
        { k: "RESEND_API_KEY",       v: "re_•••••• 3b2c" }
      ],
      ports: [3000, 6006],
      deps: 142,
      dev: 38
    }
  };

  const activity = [
    { ts: "12:08", project: "fattern-web", label: "Dev server ready on localhost:3000", kind: "ok" as const },
    { ts: "12:08", project: "fattern-api", label: "Migration 0042_add_invoice_line applied (118ms)", kind: "info" as const },
    { ts: "12:07", project: "fattern-web", label: "Compiled /pricing in 412ms (4 modules)", kind: "info" as const },
    { ts: "12:07", project: "fattern-tunnel", label: "Tunnel acquiring URL…", kind: "warn" as const },
    { ts: "12:05", project: "backlayer-bench", label: "exit code 101 — bench failed (panicked at 'assert_eq!')", kind: "error" as const },
    { ts: "12:02", project: "vitni-app",    label: "HMR update [src/routes/+page.svelte]", kind: "info" as const },
    { ts: "11:58", project: "fattern-web",  label: "Type-checking complete (0 errors)", kind: "ok" as const },
    { ts: "11:54", project: "fattern-api",  label: "Webhook fattern.stripe.invoice.paid → 200 OK", kind: "info" as const }
  ];

  const sessions = [
    { id: "s-now",    title: "Pricing page revamp", when: "now",          duration: 3120, ws: "fattern",   projects: 3, services: 5, badge: "ACTIVE" },
    { id: "s-1",      title: "Stripe webhook debug", when: "Today 09:14",  duration: 4800, ws: "fattern",   projects: 2, services: 3 },
    { id: "s-2",      title: "Backlayer bench tuning", when: "Yesterday 17:02", duration: 7200, ws: "backlayer", projects: 1, services: 2 },
    { id: "s-3",      title: "Vitni report intake spike", when: "Yesterday 11:30", duration: 5400, ws: "vitni",    projects: 3, services: 3 },
    { id: "s-4",      title: "Onboarding email designs", when: "Tue 14:21",  duration: 2700, ws: "fattern",   projects: 1, services: 1 },
    { id: "s-5",      title: "Orcalabs client review",  when: "Mon 10:08",  duration: 3000, ws: "client-orc", projects: 2, services: 2 },
    { id: "s-6",      title: "Backlayer core rewrite",  when: "Sun 22:11",  duration: 9100, ws: "backlayer", projects: 2, services: 1 }
  ];

  const logSeeds: Record<string, { kind: 'ok' | 'info' | 'warn' | 'error'; msg: string }[]> = {
    "svc-web": [
      { kind: "ok",    msg: "ready - started server on 0.0.0.0:3000, url: http://localhost:3000" },
      { kind: "info",  msg: "event - compiled successfully in 612 ms (2483 modules)" },
      { kind: "info",  msg: "wait  - compiling /pricing (client and server)..." },
      { kind: "info",  msg: "event - compiled successfully in 412 ms (4 modules)" },
      { kind: "warn",  msg: "warn  - Fast Refresh had to perform a full reload due to a runtime error." },
      { kind: "info",  msg: "GET /api/plans 200 in 84ms" },
      { kind: "info",  msg: "GET /pricing 200 in 142ms" },
      { kind: "ok",    msg: "Type-checking complete. No errors found." }
    ],
    "svc-api": [
      { kind: "info",  msg: "[fastify] Server listening on http://127.0.0.1:4000" },
      { kind: "info",  msg: "[migrate] applying 0042_add_invoice_line.sql" },
      { kind: "ok",    msg: "[migrate] applied 0042_add_invoice_line (118ms)" },
      { kind: "info",  msg: "POST /webhooks/stripe 200 (paid: in_1Ow..)" },
      { kind: "info",  msg: "GET /v1/plans 200 12ms" },
      { kind: "warn",  msg: "[auth] token nearing expiry; rotate within 14 days" }
    ],
    "svc-tn": [
      { kind: "warn",  msg: "ngrok: starting tunnel session..." },
      { kind: "info",  msg: "ngrok: forwarding https://fattern-tunnel.ngrok.app -> http://localhost:3000" }
    ],
    "bl-core": [
      { kind: "info",  msg: "    Compiling backlayer-core v0.4.1 (~/code/backlayer/crates/core)" },
      { kind: "ok",    msg: "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 8.42s" },
      { kind: "info",  msg: "INFO  backlayer_core::mesh: peer joined id=node-7 addr=127.0.0.1:7702" },
      { kind: "info",  msg: "INFO  backlayer_core::mesh: gossip round complete: 12 peers, 0 drops" }
    ],
    "bl-bench": [
      { kind: "error", msg: "thread 'bench_throughput' panicked at 'assertion failed: `(left == right)`'," },
      { kind: "error", msg: "  left: `2048`," },
      { kind: "error", msg: " right: `1024`," },
      { kind: "error", msg: "note: run with `RUST_BACKTRACE=1` to see a backtrace" },
      { kind: "error", msg: "error: bench failed, to rerun pass `--bench throughput`" }
    ],
    "vt-app": [
      { kind: "info",  msg: "  VITE v5.4.10  ready in 218 ms" },
      { kind: "info",  msg: "  ➜  Local:   http://localhost:5173/" },
      { kind: "info",  msg: "  ➜  press h + enter to show help" },
      { kind: "ok",    msg: "page reload src/routes/+page.svelte" }
    ],
    "vt-worker": [
      { kind: "info",  msg: "INFO     Uvicorn running on http://127.0.0.1:8001 (Press CTRL+C to quit)" },
      { kind: "info",  msg: "INFO     Started reloader process [8312] using WatchFiles" },
      { kind: "info",  msg: "INFO     Application startup complete." }
    ]
  };

  const ports = [
    { id: "p-3000", port: 3000, svc: "svc-web",      host: "localhost", status: "running" as const,  ws: "fattern",   group: "web" },
    { id: "p-4000", port: 4000, svc: "svc-api",      host: "localhost", status: "running" as const,  ws: "fattern",   group: "api" },
    { id: "p-5432", port: 5432, svc: "svc-pg",       host: "localhost", status: "running" as const,  ws: "fattern",   group: "db" },
    { id: "p-4040", port: 4040, svc: "svc-tn",       host: "localhost", status: "starting" as const, ws: "fattern",   group: "edge" },
    { id: "p-6006", port: 6006, svc: "svc-storybook",host: "localhost", status: "stopped" as const,  ws: "fattern",   group: "web" },
    { id: "p-7700", port: 7700, svc: "bl-core",      host: "localhost", status: "running" as const,  ws: "backlayer", group: "api" },
    { id: "p-5173", port: 5173, svc: "vt-app",       host: "localhost", status: "running" as const,  ws: "vitni",     group: "web" },
    { id: "p-8001", port: 8001, svc: "vt-worker",    host: "localhost", status: "running" as const,  ws: "vitni",     group: "api" },
    { id: "p-6379", port: 6379, svc: "vt-redis",     host: "localhost", status: "running" as const,  ws: "vitni",     group: "db" }
  ];

  const portEdges = [
    { from: "p-3000", to: "p-4000" },
    { from: "p-4000", to: "p-5432" },
    { from: "p-4040", to: "p-3000" },
    { from: "p-5173", to: "p-8001" },
    { from: "p-8001", to: "p-6379" }
  ];

  return { workspaces, projects, activity, sessions, logSeeds, ports, portEdges };
})();
