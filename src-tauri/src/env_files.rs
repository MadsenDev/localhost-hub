use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

const MAX_ENV_FILE_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct EnvFileVariable {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub is_secret: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct EnvFileImport {
    pub path: String,
    pub variables: Vec<EnvFileVariable>,
}

pub fn import_file(path: String) -> Result<EnvFileImport, String> {
    let path = canonical_file(&path)?;
    let metadata = std::fs::metadata(&path)
        .map_err(|error| format!("Could not inspect environment file: {error}"))?;
    if metadata.len() > MAX_ENV_FILE_BYTES {
        return Err("Environment files may not exceed 1 MiB.".to_string());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|error| format!("Could not read environment file as UTF-8: {error}"))?;
    let variables = parse(&content)?;
    Ok(EnvFileImport {
        path: path.to_string_lossy().to_string(),
        variables,
    })
}

pub fn export_file(path: String, variables: Vec<EnvFileVariable>) -> Result<(), String> {
    let path = validate_export_path(&path)?;
    validate_variables(&variables)?;
    let mut content = String::from("# Exported by Localhost Hub\n");
    for variable in &variables {
        content.push_str(&variable.key);
        content.push_str("=\"");
        content.push_str(&escape_value(&variable.value));
        content.push_str("\"\n");
    }
    if content.len() as u64 > MAX_ENV_FILE_BYTES {
        return Err("Exported environment files may not exceed 1 MiB.".to_string());
    }
    write_private(&path, content.as_bytes())
}

fn canonical_file(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("Environment file is unavailable: {error}"))?;
    if !path.is_file() {
        return Err("Environment import path must be a file.".to_string());
    }
    validate_env_filename(&path)?;
    Ok(path)
}

fn validate_export_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    validate_env_filename(&path)?;
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !parent.is_dir() {
        return Err("Environment export directory does not exist.".to_string());
    }
    if path.is_dir() {
        return Err("Environment export path cannot be a directory.".to_string());
    }
    if path.exists()
        && std::fs::symlink_metadata(&path)
            .map_err(|error| format!("Could not inspect environment export path: {error}"))?
            .file_type()
            .is_symlink()
    {
        return Err("Environment exports cannot overwrite symbolic links.".to_string());
    }
    Ok(path)
}

fn validate_env_filename(path: &Path) -> Result<(), String> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Choose a valid environment filename.".to_string())?;
    if name == ".env" || name.starts_with(".env.") || name.ends_with(".env") {
        Ok(())
    } else {
        Err("Environment files must use .env, .env.*, or *.env filenames.".to_string())
    }
}

fn parse(content: &str) -> Result<Vec<EnvFileVariable>, String> {
    let mut variables = Vec::new();
    let mut seen = HashSet::new();
    let content = content.strip_prefix('\u{feff}').unwrap_or(content);
    for (index, raw_line) in content.lines().enumerate() {
        let line_number = index + 1;
        let trimmed = raw_line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let declaration = trimmed.strip_prefix("export ").unwrap_or(trimmed).trim_start();
        let (key, raw_value) = declaration
            .split_once('=')
            .ok_or_else(|| format!("Line {line_number} is missing '='."))?;
        let key = key.trim();
        validate_key(key).map_err(|error| format!("Line {line_number}: {error}"))?;
        if !seen.insert(key.to_string()) {
            return Err(format!("Line {line_number}: environment variable '{key}' is duplicated."));
        }
        variables.push(EnvFileVariable {
            key: key.to_string(),
            value: parse_value(raw_value, line_number)?,
            is_secret: looks_secret(key),
        });
    }
    Ok(variables)
}

fn parse_value(raw: &str, line_number: usize) -> Result<String, String> {
    let value = raw.trim_start();
    if let Some(quoted) = value.strip_prefix('"') {
        return parse_double_quoted(quoted, line_number);
    }
    if let Some(quoted) = value.strip_prefix('\'') {
        let Some(end) = quoted.find('\'') else {
            return Err(format!("Line {line_number}: unterminated single-quoted value."));
        };
        validate_quote_tail(&quoted[end + 1..], line_number)?;
        return Ok(quoted[..end].to_string());
    }
    let comment = value
        .char_indices()
        .find(|(index, character)| {
            *character == '#'
                && (*index == 0 || value[..*index].chars().last().is_some_and(char::is_whitespace))
        })
        .map(|(index, _)| index)
        .unwrap_or(value.len());
    Ok(value[..comment].trim_end().to_string())
}

fn parse_double_quoted(value: &str, line_number: usize) -> Result<String, String> {
    let mut output = String::new();
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            output.push(match character {
                'n' => '\n',
                'r' => '\r',
                't' => '\t',
                '\\' => '\\',
                '"' => '"',
                other => {
                    output.push('\\');
                    other
                }
            });
            escaped = false;
            continue;
        }
        match character {
            '\\' => escaped = true,
            '"' => {
                validate_quote_tail(&value[index + character.len_utf8()..], line_number)?;
                return Ok(output);
            }
            other => output.push(other),
        }
    }
    Err(format!("Line {line_number}: unterminated double-quoted value."))
}

fn validate_quote_tail(tail: &str, line_number: usize) -> Result<(), String> {
    let tail = tail.trim();
    if tail.is_empty() || tail.starts_with('#') {
        Ok(())
    } else {
        Err(format!("Line {line_number}: unexpected text after quoted value."))
    }
}

fn validate_variables(variables: &[EnvFileVariable]) -> Result<(), String> {
    let mut seen = HashSet::new();
    for variable in variables {
        validate_key(&variable.key)?;
        if variable.value.contains('\0') {
            return Err(format!("Environment variable '{}' contains a null byte.", variable.key));
        }
        if !seen.insert(variable.key.as_str()) {
            return Err(format!("Environment variable '{}' is duplicated.", variable.key));
        }
    }
    Ok(())
}

fn validate_key(key: &str) -> Result<(), String> {
    let mut characters = key.chars();
    let Some(first) = characters.next() else {
        return Err("environment variable key cannot be empty.".to_string());
    };
    if !(first.is_ascii_alphabetic() || first == '_')
        || !characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err(format!("'{key}' is not a valid dotenv variable name."));
    }
    Ok(())
}

fn looks_secret(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    ["secret", "token", "password", "passwd", "pwd", "api_key", "private_key", "auth"]
        .iter()
        .any(|hint| key.contains(hint))
        || key == "key"
        || key.ends_with("_key")
}

fn escape_value(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn write_private(path: &Path, content: &[u8]) -> Result<(), String> {
    let mut options = std::fs::OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        options.mode(0o600);
        if path.exists() {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .map_err(|error| error.to_string())?;
        }
    }
    let mut file = options
        .open(path)
        .map_err(|error| format!("Could not write environment file: {error}"))?;
    file.write_all(content)
        .map_err(|error| format!("Could not write environment file: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Could not finish environment export: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "localhost-hub-env-{}-{}-{name}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ))
    }

    #[test]
    fn parses_quotes_comments_exports_and_secret_hints_without_expansion() {
        let variables = parse(
            "\u{feff}# comment\nexport API_URL=http://localhost:3000 # local\nTOKEN='literal $VALUE'\nMESSAGE=\"hello\\nworld\"\nEMPTY=\n",
        )
        .expect("parse");
        assert_eq!(variables.len(), 4);
        assert_eq!(variables[0].value, "http://localhost:3000");
        assert_eq!(variables[1].value, "literal $VALUE");
        assert!(variables[1].is_secret);
        assert_eq!(variables[2].value, "hello\nworld");
        assert_eq!(variables[3].value, "");
    }

    #[test]
    fn rejects_invalid_duplicate_and_unterminated_declarations() {
        assert!(parse("NOT-VALID=value").unwrap_err().contains("valid dotenv"));
        assert!(parse("PORT=3000\nPORT=4000").unwrap_err().contains("duplicated"));
        assert!(parse("VALUE=\"missing").unwrap_err().contains("unterminated"));
        assert!(parse("NO_VALUE").unwrap_err().contains("missing '='"));
    }

    #[test]
    fn refuses_non_environment_filenames() {
        let path = fixture("secrets.txt");
        std::fs::write(&path, "TOKEN=private\n").expect("fixture");
        assert!(import_file(path.to_string_lossy().to_string())
            .unwrap_err()
            .contains("Environment files must use"));
        assert!(export_file(
            path.to_string_lossy().to_string(),
            vec![EnvFileVariable {
                key: "TOKEN".to_string(),
                value: "private".to_string(),
                is_secret: true,
            }],
        )
        .unwrap_err()
        .contains("Environment files must use"));
        std::fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn exports_round_trippable_private_files() {
        let path = fixture(".env");
        let variables = vec![EnvFileVariable {
            key: "MESSAGE".to_string(),
            value: "hello\n\"world\"".to_string(),
            is_secret: false,
        }];
        export_file(path.to_string_lossy().to_string(), variables.clone()).expect("export");
        let imported = import_file(path.to_string_lossy().to_string()).expect("import");
        assert_eq!(imported.variables, variables);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        }
        std::fs::remove_file(path).expect("cleanup");
    }
}
