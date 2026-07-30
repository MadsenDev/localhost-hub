use serde::{Deserialize, Serialize};
use std::process::{Command, Output};
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LivePort {
    pub port: u16,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub protocol: String,
    pub bind_address: String,
    pub url: String,
}

/// Scan listening TCP sockets using the native command available on each
/// desktop platform. Output parsing stays separate because ss, lsof, and
/// Windows netstat do not share a format.
pub fn scan_live_ports() -> Vec<LivePort> {
    let mut ports = scan_all_live_ports();
    ports.retain(|port| port.port >= 1024);
    ports
}

pub fn find_port_conflicts(expected_ports: &[u16]) -> Vec<LivePort> {
    find_conflicts_in(expected_ports, scan_all_live_ports())
}

pub(crate) fn scan_all_live_ports() -> Vec<LivePort> {
    let mut ports = scan_platform_ports();
    enrich_process_names(&mut ports);
    ports.sort_by_key(|port| (port.port, port.pid.is_none()));
    ports.dedup_by_key(|port| port.port);
    ports
}

fn find_conflicts_in(expected_ports: &[u16], live_ports: Vec<LivePort>) -> Vec<LivePort> {
    let expected = expected_ports.iter().copied().collect::<std::collections::HashSet<_>>();
    live_ports
        .into_iter()
        .filter(|port| expected.contains(&port.port))
        .collect()
}

fn enrich_process_names(ports: &mut [LivePort]) {
    let missing = ports
        .iter()
        .filter(|port| port.pid.is_some() && port.process_name.is_none())
        .count();
    if missing == 0 {
        return;
    }
    let mut system = System::new_with_specifics(
        RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
    );
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    for port in ports {
        if port.process_name.is_none() {
            port.process_name = port
                .pid
                .and_then(|pid| system.process(Pid::from_u32(pid)))
                .map(|process| process.name().to_string_lossy().to_string());
        }
    }
}

#[cfg(target_os = "linux")]
fn scan_platform_ports() -> Vec<LivePort> {
    if let Some(output) = successful_output(Command::new("ss").args(["-tlnpH"])) {
        return parse_ss_output(&String::from_utf8_lossy(&output.stdout));
    }
    successful_output(
        Command::new("lsof").args(["-i", "TCP", "-n", "-P", "-s", "TCP:LISTEN"]),
    )
    .map(|output| parse_lsof_output(&String::from_utf8_lossy(&output.stdout)))
    .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn scan_platform_ports() -> Vec<LivePort> {
    successful_output(
        Command::new("lsof").args(["-i", "TCP", "-n", "-P", "-s", "TCP:LISTEN"]),
    )
    .map(|output| parse_lsof_output(&String::from_utf8_lossy(&output.stdout)))
    .unwrap_or_default()
}

#[cfg(windows)]
fn scan_platform_ports() -> Vec<LivePort> {
    successful_output(Command::new("netstat").args(["-ano", "-p", "tcp"]))
        .map(|output| parse_netstat_output(&String::from_utf8_lossy(&output.stdout)))
        .unwrap_or_default()
}

fn successful_output(command: &mut Command) -> Option<Output> {
    command.output().ok().filter(|output| output.status.success())
}

fn parse_ss_output(text: &str) -> Vec<LivePort> {
    text.lines()
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            let endpoint = parts.get(3)?;
            let (bind_address, port) = parse_bind_endpoint(endpoint)?;
            let (pid, process_name) = extract_ss_pid_name(line);
            Some(live_port(bind_address, port, pid, process_name))
        })
        .collect()
}

fn parse_lsof_output(text: &str) -> Vec<LivePort> {
    text.lines()
        .filter(|line| line.contains("(LISTEN)"))
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            let process_name = parts.first().map(|name| (*name).to_string());
            let pid = parts.get(1).and_then(|pid| pid.parse::<u32>().ok());
            let endpoint = parts
                .iter()
                .rev()
                .find_map(|part| parse_bind_endpoint(part).map(|parsed| (*part, parsed)))?;
            Some(live_port(
                endpoint.1.0,
                endpoint.1.1,
                pid,
                process_name,
            ))
        })
        .collect()
}

#[allow(dead_code)]
fn parse_netstat_output(text: &str) -> Vec<LivePort> {
    text.lines()
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 5
                || !parts[0].eq_ignore_ascii_case("TCP")
                || !parts[3].eq_ignore_ascii_case("LISTENING")
            {
                return None;
            }
            let (bind_address, port) = parse_bind_endpoint(parts[1])?;
            let pid = parts[4].parse::<u32>().ok();
            Some(live_port(bind_address, port, pid, None))
        })
        .collect()
}

fn live_port(
    bind_address: String,
    port: u16,
    pid: Option<u32>,
    process_name: Option<String>,
) -> LivePort {
    LivePort {
        port,
        pid,
        process_name,
        protocol: "tcp".to_string(),
        bind_address,
        url: format!("http://localhost:{port}"),
    }
}

fn parse_bind_endpoint(value: &str) -> Option<(String, u16)> {
    let cleaned = value
        .trim()
        .trim_end_matches("(LISTEN)")
        .trim_end_matches(',');
    let (host, port) = cleaned.rsplit_once(':')?;
    let port = port.parse::<u16>().ok()?;
    let host = host
        .trim_matches(|character| character == '[' || character == ']')
        .to_string();
    Some((host, port))
}

fn extract_ss_pid_name(line: &str) -> (Option<u32>, Option<String>) {
    let Some(start) = line.find("users:((\"") else {
        return (None, None);
    };
    let rest = &line[start + 9..];
    let name_end = rest.find('"').unwrap_or(rest.len());
    let name = rest[..name_end].to_string();
    let pid = rest.find("pid=").and_then(|position| {
        let after = &rest[position + 4..];
        let end = after.find(',').unwrap_or(after.len());
        after[..end].parse::<u32>().ok()
    });
    (pid, Some(name))
}

pub fn extract_local_urls(line: &str) -> Vec<String> {
    let clean = strip_ansi(line);
    let mut urls = Vec::new();
    let mut cursor = 0;

    while cursor < clean.len() {
        let remaining = &clean[cursor..];
        let http = remaining.find("http://");
        let https = remaining.find("https://");
        let offset = match (http, https) {
            (Some(left), Some(right)) => left.min(right),
            (Some(offset), None) | (None, Some(offset)) => offset,
            (None, None) => break,
        };
        let start = cursor + offset;
        let candidate = clean[start..]
            .split(|character: char| {
                character.is_whitespace()
                    || matches!(character, '"' | '\'' | '<' | '>' | '`')
            })
            .next()
            .unwrap_or_default()
            .trim_end_matches(['.', ',', ';', '!', '?', ')']);

        if let Some(url) = normalize_local_url(candidate) {
            if !urls.contains(&url) {
                urls.push(url);
            }
        }
        cursor = start + candidate.len().max(1);
    }
    urls
}

pub fn normalize_local_url(candidate: &str) -> Option<String> {
    let (scheme, remainder) = if let Some(remainder) = candidate.strip_prefix("http://") {
        ("http", remainder)
    } else if let Some(remainder) = candidate.strip_prefix("https://") {
        ("https", remainder)
    } else {
        return None;
    };

    let authority_end = remainder
        .find(['/', '?', '#'])
        .unwrap_or(remainder.len());
    let authority = &remainder[..authority_end];
    if authority.is_empty() || authority.contains('@') {
        return None;
    }

    let (host, port) = split_host_port(authority)?;
    let normalized_host = match host.to_ascii_lowercase().as_str() {
        "localhost" | "127.0.0.1" => host.to_string(),
        "::1" => "[::1]".to_string(),
        "0.0.0.0" | "::" | "*" => "localhost".to_string(),
        _ => return None,
    };
    let suffix = &remainder[authority_end..];
    Some(match port {
        Some(port) => format!("{scheme}://{normalized_host}:{port}{suffix}"),
        None => format!("{scheme}://{normalized_host}{suffix}"),
    })
}

pub fn port_from_local_url(url: &str) -> Option<u16> {
    let normalized = normalize_local_url(url)?;
    let remainder = normalized
        .strip_prefix("http://")
        .or_else(|| normalized.strip_prefix("https://"))?;
    let authority = remainder
        .split(['/', '?', '#'])
        .next()?;
    split_host_port(authority)?.1
}

fn split_host_port(authority: &str) -> Option<(&str, Option<u16>)> {
    if let Some(rest) = authority.strip_prefix('[') {
        let bracket = rest.find(']')?;
        let host = &rest[..bracket];
        let suffix = &rest[bracket + 1..];
        if suffix.is_empty() {
            return Some((host, None));
        }
        let port = suffix.strip_prefix(':')?.parse::<u16>().ok()?;
        if port == 0 {
            return None;
        }
        return Some((host, Some(port)));
    }

    match authority.rsplit_once(':') {
        Some((host, port)) if !host.contains(':') => {
            let port = port.parse::<u16>().ok()?;
            (port > 0).then_some((host, Some(port)))
        }
        Some(_) => Some((authority, None)),
        None => Some((authority, None)),
    }
}

fn strip_ansi(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut characters = value.chars().peekable();
    while let Some(character) = characters.next() {
        if character == '\u{1b}' && characters.peek() == Some(&'[') {
            characters.next();
            for ansi in characters.by_ref() {
                if ('@'..='~').contains(&ansi) {
                    break;
                }
            }
        } else {
            result.push(character);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_linux_ss_listeners() {
        let ports = parse_ss_output(
            "LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:((\"node\",pid=21842,fd=23))\n\
             LISTEN 0 128 [::]:8080 [::]:* users:((\"api\",pid=22000,fd=9))",
        );
        assert_eq!(ports.len(), 2);
        assert_eq!(ports[0].port, 5173);
        assert_eq!(ports[0].pid, Some(21842));
        assert_eq!(ports[0].process_name.as_deref(), Some("node"));
        assert_eq!(ports[1].bind_address, "::");
    }

    #[test]
    fn parses_lsof_and_windows_netstat_listeners() {
        let lsof = parse_lsof_output(
            "node 21842 user 23u IPv4 0t0 TCP 127.0.0.1:5173 (LISTEN)",
        );
        assert_eq!(lsof[0].port, 5173);
        assert_eq!(lsof[0].pid, Some(21842));

        let netstat =
            parse_netstat_output("  TCP    0.0.0.0:8080    0.0.0.0:0    LISTENING    22000");
        assert_eq!(netstat[0].port, 8080);
        assert_eq!(netstat[0].pid, Some(22000));
    }

    #[test]
    fn extracts_and_normalizes_only_local_http_urls() {
        let urls = extract_local_urls(
            "\u{1b}[32mLocal:\u{1b}[0m http://localhost:5173/ \
             Network: http://192.168.1.4:5173 docs https://example.com",
        );
        assert_eq!(urls, vec!["http://localhost:5173/"]);
        assert_eq!(
            normalize_local_url("http://0.0.0.0:8080/api"),
            Some("http://localhost:8080/api".to_string())
        );
    }

    #[test]
    fn extracts_ports_from_ipv4_and_ipv6_local_urls() {
        assert_eq!(port_from_local_url("http://127.0.0.1:3000"), Some(3000));
        assert_eq!(port_from_local_url("https://[::1]:8443/app"), Some(8443));
        assert_eq!(port_from_local_url("https://localhost"), None);
    }

    #[test]
    fn returns_only_requested_live_port_conflicts() {
        let conflicts = find_conflicts_in(
            &[5173, 8080, 5173],
            vec![
                live_port("127.0.0.1".to_string(), 5173, Some(42), Some("node".to_string())),
                live_port("0.0.0.0".to_string(), 3000, Some(43), Some("api".to_string())),
            ],
        );

        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].port, 5173);
        assert_eq!(conflicts[0].pid, Some(42));
    }
}
