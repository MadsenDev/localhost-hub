use serde::{Deserialize, Serialize};
use ts_rs::TS;
use std::sync::{Mutex, OnceLock};
use sysinfo::{MemoryRefreshKind, ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};

/// One process table, reused across polls.
///
/// Two reasons, and the first is a correctness bug rather than a cost:
///
/// - **sysinfo reports CPU usage as a delta between two refreshes.** A `System`
///   constructed per call has nothing to compare against, so every process came
///   back at `0.0%` — which is exactly what the interface displayed, including for
///   a `cargo` that was busy compiling at the time.
/// - Refreshing into an existing table avoids rebuilding the whole map every five
///   seconds. Measured at 9ms for 92 processes on an idle machine, and this scales
///   with the process count: a developer's machine runs several hundred.
static PROCESS_TABLE: OnceLock<Mutex<System>> = OnceLock::new();

/// One CPU and memory sampler, reused for the same reason: global CPU usage is also
/// a delta, and a single refresh of a fresh `System` reports an average since boot
/// rather than what the machine is doing now.
static RESOURCE_SAMPLER: OnceLock<Mutex<System>> = OnceLock::new();

/// Refreshes the shared process table, then reads from it.
///
/// Lock poisoning is recovered from rather than propagated: a panic elsewhere must
/// not leave the application permanently unable to list processes.
pub(crate) fn with_processes<T>(read: impl FnOnce(&System) -> T) -> T {
    let table = PROCESS_TABLE.get_or_init(|| {
        Mutex::new(System::new_with_specifics(
            RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
        ))
    });
    let mut system = table.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    // Only processes. `refresh_all` would also walk disks, networks and components,
    // none of which anything here reads.
    system.refresh_processes(ProcessesToUpdate::All, true);
    read(&system)
}

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

    with_processes(|sys| {
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
    })
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
    let sampler = RESOURCE_SAMPLER.get_or_init(|| {
        Mutex::new(System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(sysinfo::CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything()),
        ))
    });
    let mut sys = sampler
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    // Only what is read below. `refresh_all` also walked the process table, which
    // this function never looks at.
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let load = sysinfo::System::load_average();

    SystemStats {
        cpu_usage: sys.global_cpu_usage(),
        memory_used_mb: sys.used_memory() / 1024 / 1024,
        memory_total_mb: sys.total_memory() / 1024 / 1024,
        load_avg: [load.one, load.five, load.fifteen],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    /// The reason the process table is shared rather than rebuilt per call.
    ///
    /// sysinfo derives CPU usage from the difference between two refreshes, so a
    /// `System` constructed per call always reported `0.0%` for every process — the
    /// interface showed a busy dev server at zero. This asserts the delta is real by
    /// creating load and finding it.
    #[test]
    fn cpu_usage_is_measured_across_refreshes_not_reported_as_zero() {
        let busy = std::thread::spawn(|| {
            let end = Instant::now() + Duration::from_secs(3);
            let mut value: u64 = 0;
            while Instant::now() < end {
                value = value.wrapping_mul(6364136223846793005).wrapping_add(1);
            }
            std::hint::black_box(value)
        });

        // Deliberately not asserting that the very first refresh reports zero, true
        // though that is: the table is a process-wide `OnceLock`, so whether this
        // test observes the first refresh depends on which other test ran first.
        let mut seen = 0;
        for _ in 0..10 {
            std::thread::sleep(Duration::from_millis(250));
            seen = with_processes(count_busy);
            if seen > 0 {
                break;
            }
        }
        busy.join().expect("busy thread");

        assert!(
            seen > 0,
            "no process reported CPU usage across repeated refreshes, which is the \
             always-zero bug returning"
        );
    }

    fn count_busy(system: &System) -> usize {
        system
            .processes()
            .values()
            .filter(|process| process.cpu_usage() > 0.0)
            .count()
    }

    /// Guards the other half: `refresh_all` was refreshing disks, networks and
    /// components that nothing reads. This does not measure that directly, but it
    /// does assert the shared table stays usable across many refreshes, which is
    /// what makes the cheaper refresh safe to rely on.
    #[test]
    fn the_shared_table_survives_repeated_refreshes() {
        let mut counts = Vec::new();
        for _ in 0..5 {
            counts.push(with_processes(|system| system.processes().len()));
        }
        assert!(
            counts.iter().all(|count| *count > 0),
            "the process table went empty across refreshes: {counts:?}"
        );
    }
}
