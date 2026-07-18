// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// (This does mean --version/--help print nowhere on a Windows release build —
// a real console isn't attached. Not solved here; see README.)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// "Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display" on
// startup is, per Tauri's own Linux graphics debugging guide
// (https://v2.tauri.app/develop/debug/linux-graphics/), overwhelmingly an
// NVIDIA-driver problem: WebKitGTK's DMA-BUF renderer requests explicit-sync
// buffer formats the driver doesn't provide. Gate the workarounds on NVIDIA
// actually being present, per Tauri's own advice, so AMD/Intel users keep
// the faster accelerated rendering path. Must run before Tauri/GTK/WebKit
// initialize, so it's the first thing main() does.
//
// `WEBKIT_DISABLE_DMABUF_RENDERER=1` is NOT a free fix: it forces WebKit's
// slow shared-memory readback compositing path instead of zero-copy DMA-BUF,
// which is exactly what made the editor feel laggy (slow startup, high
// per-keystroke latency on h/j/k/l) even after the blank-window/crash bug it
// targets was fixed upstream in WebKitGTK. The original blank-window/Wayland
// Error-71 bug was already fixed in WebKitGTK 2.48 (per the same class of
// upstream fix GeoLibre's desktop app measured — ~60fps with DMA-BUF enabled
// vs ~46fps with it force-disabled). Query the *runtime* WebKitGTK version
// (not the build-time one baked into this binary) and only pay the slow-path
// cost on installs where the bug still exists.
#[cfg(target_os = "linux")]
fn apply_webkit_wayland_workaround() {
    if !std::path::Path::new("/proc/driver/nvidia").exists() {
        return;
    }
    // No performance cost per Tauri's docs — safe to always apply on NVIDIA.
    if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
        std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
    }

    // webkit_get_{major,minor}_version() are simple accessors returning the
    // linked library's version — safe to call before gtk_init()/any window.
    let (major, minor) = unsafe {
        (
            webkit2gtk_sys::webkit_get_major_version(),
            webkit2gtk_sys::webkit_get_minor_version(),
        )
    };
    let dmabuf_fixed_upstream = (major, minor) >= (2, 48);

    // Respect an explicit user/distributor override in either direction —
    // WebKit treats "0" as DMABUF enabled and any other value as disabled,
    // and only applies our default when the variable is unset.
    if !dmabuf_fixed_upstream && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

/// GUI editors launched from a shell detach from it (gvim, `code`, `subl`):
/// the prompt returns immediately, and Ctrl+C in that terminal can no longer
/// kill the editor — which is exactly what happened before this existed.
/// The parent re-spawns itself into a new session (`setsid`) and exits;
/// `-f`/`--foreground` keeps the attached behavior for `$EDITOR`-style
/// callers that need to wait on the process. Windows release builds are a
/// GUI-subsystem app (see the cfg_attr above) — the shell never waits on
/// them, so there is nothing to detach from.
#[cfg(unix)]
fn detach_from_terminal(argv: &[String]) {
    use std::io::IsTerminal;
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    // Already the detached child — run for real this time.
    if std::env::var_os("VEM_DETACHED").is_some() {
        return;
    }
    // Only arguments before `--` are options; after it, `-f` is a filename.
    for arg in argv {
        if arg == "--" {
            break;
        }
        if arg == "-f" || arg == "--foreground" {
            return;
        }
    }
    // No terminal attached (launched from a .desktop entry / dock):
    // nothing to detach from, and re-spawning would just waste a process.
    if !std::io::stdin().is_terminal() && !std::io::stdout().is_terminal() {
        return;
    }

    let exe = match std::env::current_exe() {
        Ok(path) => path,
        Err(_) => return, // can't locate ourselves — run attached rather than not at all
    };
    let mut cmd = Command::new(exe);
    cmd.args(argv)
        .env("VEM_DETACHED", "1")
        // stderr stays on the terminal so driver/WebKit warnings remain
        // visible at launch (the Wayland Error-71 report arrived that way).
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit());
    unsafe {
        // A new session, not just a new process group: the child leaves the
        // terminal's session entirely, so terminal-driven SIGINT/SIGHUP can
        // never reach it.
        cmd.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    if cmd.spawn().is_ok() {
        std::process::exit(0);
    }
    // Spawn failed: degrade to the old attached behavior.
}

fn main() {
    #[cfg(target_os = "linux")]
    apply_webkit_wayland_workaround();

    let argv: Vec<String> = std::env::args().skip(1).collect();
    if argv.iter().any(|a| a == "--version") {
        println!("Vem {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    if argv.iter().any(|a| a == "-h" || a == "--help") {
        print!(
            "{}",
            concat!(
                "Vem — a canvas-native modal editor\n\n",
                "Usage: vem [options] [file ..]\n\n",
                "A deliberately small, honest subset of `vim --help`: every flag below maps to\n",
                "real vem behavior. Flags with no vem equivalent (-d diff, -b binary, -o/-O\n",
                "splits, --remote-*, -S session, ...) are intentionally left unimplemented\n",
                "rather than accepted and silently ignored — see CONTRIBUTING.md. Full command\n",
                "documentation is in-editor via `:help` and `:docs`, not here.\n\n",
                "Options:\n",
                "  --version           Print version and exit\n",
                "  -h, --help          Print this help and exit\n",
                "  +<lnum>             Place the cursor on line <lnum> of the first file\n",
                "  +<cmd>              Run ex command <cmd> after the first file loads\n",
                "  -c <cmd>            Run an ex command after the first file loads (repeatable)\n",
                "  -R                  Open read-only\n",
                "  -f, --foreground    Stay attached to the launching terminal instead of\n",
                "                      detaching (for $EDITOR-style callers that wait on vem)\n",
                "  -n                  No swap file (vem never creates one — accepted for\n",
                "                      script/muscle-memory compatibility, changes nothing)\n",
                "  -u <path>           Use <path> instead of the default vemrc\n",
                "  --clean             Skip loading the global vemrc\n",
                "  --                  End of options; remaining arguments are file names\n",
                "\n",
                "Multiple file arguments open multiple buffers: `vem a.md b.md`.\n",
            )
        );
        return;
    }

    #[cfg(unix)]
    detach_from_terminal(&argv);

    app_lib::run();
}
