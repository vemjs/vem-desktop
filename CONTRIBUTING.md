# Contributing to vem-desktop

## Process

`Issue → Branch → PR → Review → Merge`, same as every other `vemjs` repo:

1. Open an issue, unless one already covers it.
2. Branch from `main`.
3. Make the change with tests — Bun tests for `src/`, `cargo test` for `src-tauri/`.
4. Open a PR against `main`. CI (Bun typecheck/build/test/lint/format, Rust fmt/clippy/test) must
   pass.
5. A maintainer reviews and merges.

## Local development

```bash
git clone https://github.com/vemjs/vem-desktop.git
cd vem-desktop
bun install
cargo tauri dev
```

Requires the Rust toolchain and Tauri's platform prerequisites — see the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

Before opening a PR, run the full local gate:

```bash
just verify
```

## Scope

This repo is the Tauri desktop shell only — it ports `vem-website`'s editor bootstrap and shares
the same `@vemjs/*` packages. Changes to Vim motions, operators, or rendering belong in
[vem](https://github.com/vemjs/vem); changes to official plugins belong in
[vem-plugins](https://github.com/vemjs/vem-plugins). If a bug reproduces in the web build too,
please report/fix it there — this repo consumes published `@vemjs/*` versions, so a core fix
lands here only after it's released upstream.

## CLI flags

Only add a flag if it's wired to real vem behavior — see the README's CLI section and
`src-tauri/src/lib.rs`'s `parse_startup_args` for the deliberate "small, honest subset of
`vim --help`" policy. Don't accept-and-ignore a flag just to look more Vim-compatible.

## Security

Please don't file public issues for security vulnerabilities — see [SECURITY.md](SECURITY.md).
