use serde::Serialize;

/// XDG-style config/cache/data directories, always under a literal `vem`
/// segment regardless of the bundle identifier (`run.vem.desktop`) — the
/// `dirs` crate already resolves the platform-correct base (respects
/// `$XDG_CONFIG_HOME`/`$XDG_CACHE_HOME`/`$XDG_DATA_HOME` on Linux, and the
/// platform convention on macOS/Windows).
#[derive(Serialize)]
struct VemDirs {
    config: Option<String>,
    cache: Option<String>,
    data: Option<String>,
}

fn join_vem(base: Option<std::path::PathBuf>) -> Option<String> {
    base.map(|p| p.join("vem").to_string_lossy().into_owned())
}

fn vem_dirs() -> VemDirs {
    VemDirs {
        config: join_vem(dirs::config_dir()),
        cache: join_vem(dirs::cache_dir()),
        data: join_vem(dirs::data_dir()),
    }
}

#[tauri::command]
fn get_vem_dirs() -> VemDirs {
    vem_dirs()
}

/// A deliberately small, honest subset of Vim's CLI surface — only flags
/// that map to real vem behavior. `vim --help`'s full list (`-d` diffmode,
/// `-b` binary, `-A`/`-H` Arabic/Hebrew, `--remote-*`, `-S` session, `-w`/`-W`
/// script recording, …) has no equivalent in vem yet and is deliberately
/// left unparsed rather than silently accepted and ignored.
#[derive(Serialize, Default)]
struct StartupArgs {
    /// Files to open, in order.
    files: Vec<String>,
    /// `+<lnum>`: place the cursor on this line of the first file.
    line: Option<usize>,
    /// `-c <cmd>` (repeatable): ex commands run after the first file loads.
    ex_commands: Vec<String>,
    /// `-R`: open read-only.
    readonly: bool,
    /// `--clean`: skip loading the global vemrc.
    clean: bool,
    /// `-u <path>`: load this vemrc instead of the default.
    vimrc_override: Option<String>,
}

// --version/-h/--help are handled in main.rs, before the Tauri runtime (and
// any window) starts — they never reach here.

fn parse_startup_args(argv: &[String]) -> StartupArgs {
    let mut out = StartupArgs::default();
    let mut i = 0;
    let mut end_of_options = false;
    while i < argv.len() {
        let arg = argv[i].as_str();
        match arg {
            _ if end_of_options => out.files.push(arg.to_string()),
            "--" => end_of_options = true,
            "-R" => out.readonly = true,
            "-n" => {} // no swap file — vem never creates one, so this is already the default
            "--clean" => out.clean = true,
            "-c" => {
                i += 1;
                if let Some(cmd) = argv.get(i) {
                    out.ex_commands.push(cmd.clone());
                }
            }
            "-u" => {
                i += 1;
                if let Some(path) = argv.get(i) {
                    out.vimrc_override = Some(path.clone());
                }
            }
            _ if arg.len() > 1
                && arg.starts_with('+')
                && arg[1..].chars().all(|c| c.is_ascii_digit()) =>
            {
                out.line = arg[1..].parse().ok();
            }
            // `+{cmd}`: any non-numeric ex command run after the first file loads,
            // e.g. `+set nu` or `+/pattern` — same execution point as `-c`.
            _ if arg.len() > 1 && arg.starts_with('+') => {
                out.ex_commands.push(arg[1..].to_string());
            }
            _ if !arg.starts_with('-') => out.files.push(arg.to_string()),
            _ => {} // unrecognized flag: ignored, not silently mapped to real behavior
        }
        i += 1;
    }
    out
}

#[tauri::command]
fn get_startup_args() -> StartupArgs {
    // Skip argv[0] (the binary path) — everything after that is real CLI input.
    let argv: Vec<String> = std::env::args().skip(1).collect();
    parse_startup_args(&argv)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_vem_dirs, get_startup_args])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Ensure the config/cache/data dirs exist before the frontend
            // asks for them — a fresh install shouldn't need special-case
            // "not found" handling on the JS side.
            let dirs = vem_dirs();
            for path in [&dirs.config, &dirs.cache, &dirs.data]
                .into_iter()
                .flatten()
            {
                let _ = std::fs::create_dir_all(path);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(s: &[&str]) -> Vec<String> {
        s.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_files_and_line_jump() {
        let out = parse_startup_args(&args(&["+42", "notes.md"]));
        assert_eq!(out.line, Some(42));
        assert_eq!(out.files, vec!["notes.md"]);
    }

    #[test]
    fn parses_repeated_ex_commands_and_readonly() {
        let out = parse_startup_args(&args(&["-R", "-c", "set nu", "-c", "42", "a.txt"]));
        assert!(out.readonly);
        assert_eq!(out.ex_commands, vec!["set nu", "42"]);
        assert_eq!(out.files, vec!["a.txt"]);
    }

    #[test]
    fn parses_clean_and_vimrc_override() {
        let out = parse_startup_args(&args(&["--clean", "-u", "/tmp/custom.vemrc.json"]));
        assert!(out.clean);
        assert_eq!(
            out.vimrc_override,
            Some("/tmp/custom.vemrc.json".to_string())
        );
    }

    #[test]
    fn unrecognized_flags_are_ignored_not_faked() {
        let out = parse_startup_args(&args(&["-d", "a.txt", "b.txt"]));
        assert_eq!(out.files, vec!["a.txt", "b.txt"]);
    }

    #[test]
    fn parses_plus_command_form_alongside_plus_line_jump() {
        let out = parse_startup_args(&args(&["+set nu", "+42", "notes.md"]));
        assert_eq!(out.ex_commands, vec!["set nu"]);
        assert_eq!(out.line, Some(42));
        assert_eq!(out.files, vec!["notes.md"]);
    }

    #[test]
    fn parses_no_swapfile_flag_as_a_real_noop() {
        let out = parse_startup_args(&args(&["-n", "a.txt"]));
        assert_eq!(out.files, vec!["a.txt"]);
    }

    #[test]
    fn end_of_options_marker_allows_dash_prefixed_filenames() {
        let out = parse_startup_args(&args(&["--", "-weird-name.txt", "-R"]));
        assert_eq!(out.files, vec!["-weird-name.txt", "-R"]);
        assert!(!out.readonly);
    }
}
