use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LivePort {
    pub port: u16,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub protocol: String,
}

/// Scan for ports currently in use by querying ss/lsof on the host.
/// Returns only localhost-bound TCP ports.
pub fn scan_live_ports() -> Vec<LivePort> {
    // Try `ss` first (Linux), fall back to `lsof` (macOS/Linux)
    let output = Command::new("ss")
        .args(["-tlnpH"])
        .output()
        .or_else(|_| Command::new("lsof").args(["-i", "TCP", "-n", "-P", "-s", "TCP:LISTEN"]).output());

    let Ok(out) = output else {
        return vec![];
    };

    let text = String::from_utf8_lossy(&out.stdout);
    let mut ports = parse_ss_output(&text);

    // ss reports both IPv4 and IPv6 listeners for the same port — deduplicate by port,
    // preferring the entry that has pid/process info.
    ports.sort_by_key(|p| (p.port, p.pid.is_none()));
    ports.dedup_by_key(|p| p.port);
    ports
}

fn parse_ss_output(text: &str) -> Vec<LivePort> {
    let mut ports = Vec::new();

    for line in text.lines() {
        // ss -tlnpH format: State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
        // e.g.: LISTEN  0  128  0.0.0.0:3000  0.0.0.0:*  users:(("node",pid=12345,fd=23))
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }

        let addr = if parts[0] == "LISTEN" { parts[3] } else { parts[3] };
        let port = addr.rsplit(':').next().and_then(|p| p.parse::<u16>().ok());
        let Some(port) = port else { continue };

        // Skip system ports below 1024 (mostly noise for dev tools)
        if port < 1024 {
            continue;
        }

        let (pid, name) = extract_pid_name(line);

        ports.push(LivePort {
            port,
            pid,
            process_name: name,
            protocol: "tcp".to_string(),
        });
    }

    ports
}

fn extract_pid_name(line: &str) -> (Option<u32>, Option<String>) {
    // Matches: users:(("node",pid=12345,fd=23))
    if let Some(start) = line.find("users:((\"") {
        let rest = &line[start + 9..];
        let name_end = rest.find('"').unwrap_or(rest.len());
        let name = rest[..name_end].to_string();

        let pid = rest.find("pid=").and_then(|p| {
            let after = &rest[p + 4..];
            let end = after.find(',').unwrap_or(after.len());
            after[..end].parse::<u32>().ok()
        });

        return (pid, Some(name));
    }
    (None, None)
}
