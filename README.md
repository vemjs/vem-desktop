# vem-desktop

Vem's [Tauri](https://tauri.app) desktop shell — the same canvas-native editor as
[vem.run](https://vem.run), running in a native window with real local config/cache and CLI
argument support.

## What's different from the web build

- **Local config**: on boot, loads `$XDG_CONFIG_HOME/vem/vemrc.json` (falls back to the platform
  convention on macOS/Windows) — not just a `.vemrc` inside an opened project folder like the web
  build.
- **Local cache/data**: `$XDG_CACHE_HOME/vem` and `$XDG_DATA_HOME/vem` are created on first launch
  for future use (LSP indexes, plugin caches, …).
- **Native file I/O**: `:e` and CLI file arguments read/write through Tauri's `dialog`/`fs`
  plugins instead of the browser's File System Access API (which WebKitGTK doesn't reliably
  support).
- **CLI flags** (a deliberately small, honest subset of `vim --help` — only flags wired to real
  vem behavior):

  ```
  vem [options] [file ..]

  --version           Print version and exit
  -h, --help          Print this help and exit
  +<lnum>             Place the cursor on line <lnum> of the first file
  -c <cmd>            Run an ex command after the first file loads (repeatable)
  -R                  Open read-only
  -u <path>           Use <path> instead of the default vemrc
  --clean             Skip loading the global vemrc
  ```

  Everything else in `vim --help` (`-d` diff mode, `-b` binary, `-A`/`-H` Arabic/Hebrew,
  `--remote-*`, `-S` session, `-w`/`-W` script recording, …) has no vem equivalent yet and is
  intentionally left unparsed rather than silently accepted and ignored.

- **`-R` readonly**: vem's core has no per-keystroke write-protection yet. `-R` gives Vim's real
  guarantee — it won't silently overwrite your file — by refusing `:w` with `E45` instead of
  blocking every edit.

## Known limitations

- `WorkspaceExplorer`'s built-in "Open Folder"/"Open File" buttons still use the browser File
  System Access API internally and may not work in every WebKitGTK build. Use `:e`, `:e <path>`,
  or CLI file arguments for the reliably-native path.
- Windows release builds run with `windows_subsystem = "windows"` (no console window), so
  `--version`/`--help` output isn't visible unless you keep a debug build or attach a console.

## Development

```sh
bun install
cargo tauri dev      # live-reloading native window
cargo tauri build    # production bundle
```

Requires the Rust toolchain and Tauri's platform prerequisites — see the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

## Related repositories

- [**vem**](https://github.com/vemjs/vem) — the editor monorepo (`@vemjs/core`,
  `renderer-vecto`, `lsp-client`, `plugin-api`)
- [**vem-plugins**](https://github.com/vemjs/vem-plugins) — official plugins
- [**vem-website**](https://github.com/vemjs/vem-website) — [vem.run](https://vem.run), the web
  build this shell shares its editor code with

## License

MIT
