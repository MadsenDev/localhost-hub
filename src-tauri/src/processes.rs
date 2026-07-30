use serde::{Deserialize, Serialize};
use ts_rs::TS;
use sysinfo::{MemoryRefreshKind, ProcessRefreshKind, RefreshKind, System};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cmd: Vec<String>,
    pub cwd: Option<String>,
    pub cpu_usage: f32,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub memory_kb: u64,
    pub status: String,
}

pub fn get_dev_processes() -> Vec<ProcessInfo> {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_all();

    let dev_names = [
        "node", "bun", "deno", "npm", "npx", "pnpm", "yarn",
        "vite", "next", "nuxt", "remix",
        "cargo", "rustc", "go",
        "python", "python3", "uvicorn", "fastapi", "flask", "django",
        "ruby", "rails",
        "postgres", "postgresql", "mysql", "redis-server", "mongod",
        "docker", "nginx", "caddy",
        "ngrok", "cloudflared",
    ];

    sys.processes()
        .values()
        .filter(|p| {
            let name = p.name().to_string_lossy().to_lowercase();
            dev_names.iter().any(|dn| name.contains(dn))
        })
        .map(|p| ProcessInfo {
            pid: p.pid().as_u32(),
            name: p.name().to_string_lossy().to_string(),
            cmd: p.cmd().iter().map(|s| s.to_string_lossy().to_string()).collect(),
            cwd: p.cwd().map(|c| c.to_string_lossy().to_string()),
            cpu_usage: p.cpu_usage(),
            memory_kb: p.memory() / 1024,
            status: format!("{:?}", p.status()),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct SystemStats {
    pub cpu_usage: f32,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub memory_used_mb: u64,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub memory_total_mb: u64,
    pub load_avg: [f64; 3],
}

pub fn get_system_stats() -> SystemStats {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(sysinfo::CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );
    sys.refresh_all();

    let load = sysinfo::System::load_average();

    SystemStats {
        cpu_usage: sys.global_cpu_usage(),
        memory_used_mb: sys.used_memory() / 1024 / 1024,
        memory_total_mb: sys.total_memory() / 1024 / 1024,
        load_avg: [load.one, load.five, load.fifteen],
    }
}
