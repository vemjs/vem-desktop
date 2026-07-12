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
#[cfg(target_os = "linux")]
fn apply_webkit_wayland_workaround() {
    if !std::path::Path::new("/proc/driver/nvidia").exists() {
        return;
    }
    // No performance cost per Tauri's docs — try this first.
    if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
        std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
    }
    // Costs the faster DMA-BUF rendering path, but is the documented fallback
    // when explicit-sync disabling alone isn't enough.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
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
    app_lib::run();
}
