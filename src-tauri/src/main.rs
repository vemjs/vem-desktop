// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// (This does mean --version/--help print nowhere on a Windows release build —
// a real console isn't attached. Not solved here; see README.)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
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
                "Options:\n",
                "  --version           Print version and exit\n",
                "  -h, --help          Print this help and exit\n",
                "  +<lnum>             Place the cursor on line <lnum> of the first file\n",
                "  -c <cmd>            Run an ex command after the first file loads (repeatable)\n",
                "  -R                  Open read-only\n",
                "  -u <path>           Use <path> instead of the default vemrc\n",
                "  --clean             Skip loading the global vemrc\n",
            )
        );
        return;
    }
    app_lib::run();
}
