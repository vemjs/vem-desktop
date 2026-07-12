# vem-desktop

Vem's [Tauri](https://tauri.app) desktop shell — the same canvas-native editor as
[vem.run](https://vem.run), running in a native window with real local config/cache and CLI
argument support.

## Installation

Prebuilt for macOS, Linux, and Windows on every [release](https://github.com/vemjs/vem-desktop/releases).

**Arch Linux (AUR)**

```sh
paru -S vem   # or: yay -S vem
```

**macOS (Homebrew)**

```sh
brew install --cask Xuepoo/tap/vem
```

**Windows (Scoop)**

```powershell
scoop bucket add xuepoo https://github.com/Xuepoo/scoop-bucket
scoop install xuepoo/vem
```

**NixOS / Nix**

```sh
nix run github:vemjs/vem-desktop
# or add `github:vemjs/vem-desktop` to your flake inputs and reference `packages.default`
```

`flake.nix` fetches the frontend build already published on the matching GitHub release rather than
running `bun install` inside the Nix sandbox — after cutting a new release, update `distHash` in
`flake.nix` with `nix store prefetch-file --hash-type sha256 <vem-dist.tar.gz release URL>`.

**Manual**

Download the `.deb`/`.AppImage` (Linux), `.dmg` (macOS), or `.msi` (Windows) from the
[latest release](https://github.com/vemjs/vem-desktop/releases/latest) directly.

All four channels are updated automatically by `.github/workflows/release.yml` on every `v*` tag
push — AUR via `AUR_SSH_PRIVATE_KEY`, Homebrew/Scoop by pushing to
[`Xuepoo/homebrew-tap`](https://github.com/Xuepoo/homebrew-tap) and
[`Xuepoo/scoop-bucket`](https://github.com/Xuepoo/scoop-bucket) via a `GH_PAT` secret (needed
because those repos live outside the `vemjs` org, so the default `GITHUB_TOKEN` can't push to
them).

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
  +<cmd>              Run ex command <cmd> after the first file loads
  -c <cmd>            Run an ex command after the first file loads (repeatable)
  -R                  Open read-only
  -n                  No swap file (vem never creates one — accepted for
                      script/muscle-memory compatibility, changes nothing)
  -u <path>           Use <path> instead of the default vemrc
  --clean             Skip loading the global vemrc
  --                  End of options; remaining arguments are file names
  ```

  Multiple file arguments open multiple buffers: `vem a.md b.md`.

  Everything else in `vim --help` (`-d` diff mode, `-b` binary, `-A`/`-H` Arabic/Hebrew,
  `--remote-*`, `-S` session, `-w`/`-W` script recording, …) has no vem equivalent yet and is
  intentionally left unparsed rather than silently accepted and ignored.

- **`-R` readonly**: vem's core has no per-keystroke write-protection yet. `-R` gives Vim's real
  guarantee — it won't silently overwrite your file — by refusing `:w` with `E45` instead of
  blocking every edit.
- **Silent launch**: a release build attaches no log plugin and opens no devtools — running `vem`
  from a terminal prints nothing. (A debug build via `cargo tauri dev` still logs, on purpose.)
- **Friendlier quit commands**: `:q`, `:quit`, and `:exit` all quit (real Vim only has `:q`) —
  `:quit`/`:exit` are accepted because they're what people instinctively type, on top of Vim's own
  `:q`/`:q!`/`:wq`/`:x`.

## Configuration presets

`presets/` has ready-made `vemrc.json` files — copy one to
`$XDG_CONFIG_HOME/vem/vemrc.json` (the default vemrc location), or point `-u` at it directly:

```sh
vem -u presets/hybrid-numbers.vemrc.json notes.md
```

| Preset                        | What it sets                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `vim-classic.vemrc.json`      | Vem's actual defaults, spelled out explicitly: `nonumber`, internal register only.                                                 |
| `hybrid-numbers.vemrc.json`   | Vim's popular `number`+`relativenumber` combo, and `:set clipboard=unnamed` so `y`/`d`/`p` share the OS clipboard with other apps. |
| `catppuccin-mocha.vemrc.json` | A full [Catppuccin Mocha](https://catppuccin.com) theme on top of the hybrid-numbers settings.                                     |

A vemrc is just a `VemConfig` object (see `@vemjs/core`'s `ConfigLoader`) — `theme`, `layout`,
`clipboard`, and `keybindings` are all plain JSON-serializable fields, so these presets (or your
own) are a starting point, not a fixed menu. `plugins` needs real imports and isn't
JSON-serializable — use a `.js`/`.mjs` vemrc (`-u path/to/vemrc.js`) for that.

## Known limitations

- `WorkspaceExplorer`'s built-in "Open Folder"/"Open File" buttons still use the browser File
  System Access API internally and may not work in every WebKitGTK build. Use `:e`, `:e <path>`,
  or CLI file arguments for the reliably-native path.
- Windows release builds run with `windows_subsystem = "windows"` (no console window), so
  `--version`/`--help` output isn't visible unless you keep a debug build or attach a console.
- **Linux/Wayland + NVIDIA**: WebKitGTK's DMA-BUF renderer can crash on startup ("Gdk-Message:
  Error 71 (Protocol error) dispatching to Wayland display") — an upstream WebKitGTK/NVIDIA
  explicit-sync issue, not specific to vem (see
  [Tauri's Linux graphics guide](https://v2.tauri.app/develop/debug/linux-graphics/)). When vem
  detects an NVIDIA driver (`/proc/driver/nvidia`), it sets `__NV_DISABLE_EXPLICIT_SYNC=1` and
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` itself before startup, unless you've already set either — on
  AMD/Intel this workaround is skipped entirely so you keep the faster rendering path. If it still
  crashes, check `nvidia_drm.modeset=1` is set as a kernel parameter (older NVIDIA drivers), or set
  `WEBKIT_DISABLE_COMPOSITING_MODE=1` as a last resort.

## Development

```sh
bun install
cargo tauri dev      # live-reloading native window
just install         # release build, installed as ~/.local/bin/vem
```

Requires the Rust toolchain and Tauri's platform prerequisites — see the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

`just install` builds a release bundle (`just build`, i.e. `bun run tauri build`) and copies the
resulting binary to `~/.local/bin/vem` — the crate's `[[bin]]` target is explicitly named `vem`
(Cargo would otherwise default to the package name, `vem-desktop`), so after installing, `vem` on
its own just works from any terminal. See `just verify` for the full local quality-gate run (Bun +
Rust tests, clippy, fmt, lint, format checks) mirroring CI.

## Related repositories

- [**vem**](https://github.com/vemjs/vem) — the editor monorepo (`@vemjs/core`,
  `renderer-vecto`, `lsp-client`, `plugin-api`)
- [**vem-plugins**](https://github.com/vemjs/vem-plugins) — official plugins
- [**vem-website**](https://github.com/vemjs/vem-website) — [vem.run](https://vem.run), the web
  build this shell shares its editor code with

## License

MIT
